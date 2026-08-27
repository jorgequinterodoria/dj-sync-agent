import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-api-key, x-agent-id, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'upsert' | 'search';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function serverKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof parsed.default === 'string' &&
        parsed.default.trim()
      ) {
        return parsed.default.trim();
      }
      for (const value of Object.values(parsed)) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    } catch {
      // fallback below
    }
  }

  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (legacy) return legacy;
  throw new Error('SUPABASE_SERVER_SECRET_NOT_CONFIGURED');
}

function bearer(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : request.headers.get('x-api-key') ?? '';
  return token.trim();
}

function authenticate(request: Request): string {
  const expected = Deno.env.get('SYNC_API_KEY')?.trim() ?? '';
  if (!expected) throw new Error('SYNC_API_KEY_NOT_CONFIGURED');

  if (!safeEqual(bearer(request), expected)) {
    throw new Error('UNAUTHORIZED');
  }

  const deviceId = request.headers.get('x-agent-id')?.trim() ?? '';
  if (!deviceId) throw new Error('AGENT_ID_REQUIRED');
  return deviceId;
}

function vectorLiteral(values: unknown): string {
  if (!Array.isArray(values) || values.length !== 1536) {
    throw new Error('embedding_dimensions_must_be_1536');
  }

  if (
    values.some(
      (value) =>
        typeof value !== 'number' ||
        !Number.isFinite(value),
    )
  ) {
    throw new Error('embedding_values_invalid');
  }

  return `[${values.join(',')}]`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(
      { schemaVersion: 1, accepted: false, error: 'method_not_allowed' },
      405,
    );
  }

  try {
    const deviceId = authenticate(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as Action;

    if (action !== 'upsert' && action !== 'search') {
      return json(
        { schemaVersion: 1, accepted: false, error: 'invalid_action' },
        400,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) throw new Error('SUPABASE_URL_NOT_CONFIGURED');

    const supabase = createClient(supabaseUrl, serverKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (action === 'upsert') {
      const trackId =
        typeof body.trackId === 'string' ? body.trackId.trim() : '';
      const document =
        body.document && typeof body.document === 'object'
          ? body.document
          : null;
      const model =
        typeof body.embeddingModel === 'string'
          ? body.embeddingModel.trim()
          : '';

      if (!trackId) throw new Error('track_id_required');
      if (!document) throw new Error('document_required');
      if (!model) throw new Error('embedding_model_required');

      const embedding = vectorLiteral(body.embedding);
      const metadata =
        body.metadata && typeof body.metadata === 'object'
          ? body.metadata
          : {};

      const { data, error } = await supabase.rpc(
        'upsert_dj_track_semantic_memory',
        {
          p_device_id: deviceId,
          p_track_id: trackId,
          p_track_hash:
            typeof body.trackHash === 'string'
              ? body.trackHash
              : null,
          p_document_hash:
            typeof body.documentHash === 'string'
              ? body.documentHash
              : null,
          p_document: document,
          p_embedding_model: model,
          p_embedding_text: embedding,
          p_metadata: metadata,
        },
      );

      if (error) {
        console.error('upsert semantic memory failed', error);
        return json(
          {
            schemaVersion: 1,
            accepted: false,
            error: 'upsert_failed',
            detail: error.message,
          },
          500,
        );
      }

      return json({
        schemaVersion: 1,
        accepted: true,
        action,
        record: data,
      });
    }

    const embedding = vectorLiteral(body.embedding);
    const limit =
      typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? Math.max(1, Math.min(50, body.limit))
        : 10;
    const minSimilarity =
      typeof body.minSimilarity === 'number' && Number.isFinite(body.minSimilarity)
        ? Math.max(-1, Math.min(1, body.minSimilarity))
        : 0;

    const { data, error } = await supabase.rpc(
      'search_dj_track_semantic_memory',
      {
        p_device_id: deviceId,
        p_embedding_text: embedding,
        p_limit: limit,
        p_min_similarity: minSimilarity,
      },
    );

    if (error) {
      console.error('search semantic memory failed', error);
      return json(
        {
          schemaVersion: 1,
          accepted: false,
          error: 'search_failed',
          detail: error.message,
        },
        500,
      );
    }

    return json({
      schemaVersion: 1,
      accepted: true,
      action,
      records: data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : 400;

    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: message.toLowerCase(),
      },
      status,
    );
  }
});
