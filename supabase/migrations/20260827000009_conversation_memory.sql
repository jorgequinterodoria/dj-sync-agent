create table if not exists public.conversation_memory (
  conversation_id text primary key,
  schema_version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  summary text null,
  messages jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  constraint conversation_memory_schema_version_check
    check (schema_version = 1),
  constraint conversation_memory_messages_array_check
    check (jsonb_typeof(messages) = 'array'),
  constraint conversation_memory_constraints_array_check
    check (jsonb_typeof(constraints) = 'array'),
  constraint conversation_memory_created_at_check
    check (created_at <= updated_at)
);

create index if not exists
  conversation_memory_updated_at_idx
on public.conversation_memory (
  updated_at desc
);

alter table public.conversation_memory
  enable row level security;

comment on table public.conversation_memory is
  'Persistent session-scoped Copilot conversation state.';

comment on column public.conversation_memory.messages is
  'Bounded ordered conversation messages serialized as JSONB.';

comment on column public.conversation_memory.constraints is
  'Explicit conversation constraints serialized as JSONB.';
