import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-api-key, x-agent-id, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
  });
}

function required(value: string | null | undefined, name: string): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`${name}_required`);
  return normalized;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ schemaVersion: 1, accepted: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const expected = required(
      Deno.env.get('SYNC_API_KEY'),
      'sync_api_key',
    );
    const serviceRoleKey = required(
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      'service_role_key',
    );
    const auth =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    const apiKey = request.headers.get('x-api-key')?.trim() ?? '';

    if (auth !== expected || apiKey !== expected) {
      return json({ schemaVersion: 1, accepted: false, error: 'unauthorized' }, 401);
    }

    const deviceId = required(
      request.headers.get('x-agent-id'),
      'device_id',
    );
    const body = await request.json() as Record<string, unknown>;

    if (body.action !== 'save') {
      return json({ schemaVersion: 1, accepted: false, error: 'invalid_action' }, 400);
    }

    const trackId = required(
      typeof body.trackId === 'string' ? body.trackId : null,
      'track_id',
    );
    const requestText = required(
      typeof body.request === 'string' ? body.request : null,
      'request',
    );
    const result =
      body.result && typeof body.result === 'object'
        ? body.result as Record<string, unknown>
        : null;

    if (!result) throw new Error('result_required');

    const reasoningId = required(
      typeof result.reasoningId === 'string' ? result.reasoningId : null,
      'reasoning_id',
    );

    const supabase = createClient(
      required(Deno.env.get('SUPABASE_URL'), 'supabase_url'),
      serviceRoleKey,
    );

    const { data, error } = await supabase.rpc('save_dj_reasoning_run', {
      p_device_id: deviceId,
      p_track_id: trackId,
      p_reasoning_id: reasoningId,
      p_engine_version: required(
        typeof result.engineVersion === 'string' ? result.engineVersion : null,
        'engine_version',
      ),
      p_model: required(
        typeof result.model === 'string' ? result.model : null,
        'model',
      ),
      p_provider: required(
        typeof result.provider === 'string' ? result.provider : null,
        'provider',
      ),
      p_request: requestText,
      p_result: result,
    });

    if (error) throw new Error(error.message);

    return json({
      schemaVersion: 1,
      accepted: true,
      record: data,
    });
  } catch (error) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: 'reasoning_failed',
        detail: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
});
