create extension if not exists vector with schema extensions;

create table if not exists public.dj_track_semantic_memory (
  id bigint generated always as identity primary key,
  device_id text not null,
  track_id text not null,
  track_hash text,
  document_hash text not null,
  document jsonb not null,
  embedding_model text not null,
  dimensions integer not null
    check (dimensions = 1536),
  embedding extensions.vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, track_id)
);

create index if not exists idx_dj_track_semantic_memory_device
  on public.dj_track_semantic_memory (device_id, updated_at desc);

create index if not exists idx_dj_track_semantic_memory_hash
  on public.dj_track_semantic_memory (device_id, track_hash);

create index if not exists idx_dj_track_semantic_memory_embedding
  on public.dj_track_semantic_memory
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

comment on table public.dj_track_semantic_memory is
  'Durable semantic memory for deterministic DJ track representations and vector retrieval.';

create or replace function public.upsert_dj_track_semantic_memory(
  p_device_id text,
  p_track_id text,
  p_track_hash text,
  p_document_hash text,
  p_document jsonb,
  p_embedding_model text,
  p_embedding_text text,
  p_metadata jsonb
)
returns public.dj_track_semantic_memory
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.dj_track_semantic_memory;
  v_embedding extensions.vector(1536);
begin
  if nullif(trim(p_device_id), '') is null then
    raise exception 'device_id_required';
  end if;

  if nullif(trim(p_track_id), '') is null then
    raise exception 'track_id_required';
  end if;

  if nullif(trim(p_document_hash), '') is null then
    raise exception 'document_hash_required';
  end if;

  if nullif(trim(p_embedding_model), '') is null then
    raise exception 'embedding_model_required';
  end if;

  v_embedding := p_embedding_text::extensions.vector(1536);

  insert into public.dj_track_semantic_memory (
    device_id,
    track_id,
    track_hash,
    document_hash,
    document,
    embedding_model,
    dimensions,
    embedding,
    metadata,
    created_at,
    updated_at
  )
  values (
    trim(p_device_id),
    trim(p_track_id),
    nullif(trim(p_track_hash), ''),
    trim(p_document_hash),
    coalesce(p_document, '{}'::jsonb),
    trim(p_embedding_model),
    1536,
    v_embedding,
    coalesce(p_metadata, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (device_id, track_id)
  do update set
    track_hash = excluded.track_hash,
    document_hash = excluded.document_hash,
    document = excluded.document,
    embedding_model = excluded.embedding_model,
    dimensions = excluded.dimensions,
    embedding = excluded.embedding,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.search_dj_track_semantic_memory(
  p_device_id text,
  p_embedding_text text,
  p_limit integer default 10,
  p_min_similarity double precision default 0
)
returns table (
  id bigint,
  device_id text,
  track_id text,
  track_hash text,
  document_hash text,
  embedding_model text,
  dimensions integer,
  similarity double precision,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_embedding extensions.vector(1536);
  v_limit integer;
  v_min_similarity double precision;
begin
  if nullif(trim(p_device_id), '') is null then
    raise exception 'device_id_required';
  end if;

  v_embedding := p_embedding_text::extensions.vector(1536);
  v_limit := greatest(1, least(coalesce(p_limit, 10), 50));
  v_min_similarity := greatest(-1, least(coalesce(p_min_similarity, 0), 1));

  return query
  select
    m.id,
    m.device_id,
    m.track_id,
    m.track_hash,
    m.document_hash,
    m.embedding_model,
    m.dimensions,
    (1 - (m.embedding <=> v_embedding))::double precision as similarity,
    m.created_at,
    m.updated_at
  from public.dj_track_semantic_memory m
  where m.device_id = trim(p_device_id)
    and (1 - (m.embedding <=> v_embedding)) >= v_min_similarity
  order by m.embedding <=> v_embedding
  limit v_limit;
end;
$$;

revoke all on function public.upsert_dj_track_semantic_memory(
  text, text, text, text, jsonb, text, text, jsonb
) from public;

revoke all on function public.search_dj_track_semantic_memory(
  text, text, integer, double precision
) from public;
