import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
const SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '').trim();

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function auth(req: Request): void {
  const expected = Deno.env.get('SYNC_API_KEY')?.trim() ?? '';
  if (!expected) throw new Error('server_secret_not_configured');
  const supplied = req.headers.get('x-api-key')?.trim() || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!supplied || supplied !== expected) throw new Error('unauthorized');
}

Deno.serve(async (req) => {
  try {
    auth(req);
    if (req.method !== 'POST') return json(405, { schemaVersion: 1, accepted: false, error: 'method_not_allowed' });
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(500, { schemaVersion: 1, accepted: false, error: 'supabase_not_configured' });
    const body = await req.json() as Record<string, unknown>;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const request = typeof body.request === 'string' ? body.request.trim() : '';
    if (!deviceId || !request) return json(400, { schemaVersion: 1, accepted: false, error: 'invalid_input' });

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    if (body.action === 'save_recommendation') {
      const result = body.result && typeof body.result === 'object' ? body.result as Record<string, unknown> : null;
      if (!result) return json(400, { schemaVersion: 1, accepted: false, error: 'recommendation_result_required' });
      const { data, error } = await client.from('dj_recommendation_runs').insert({
        device_id: deviceId,
        current_track_id: typeof body.currentTrackId === 'string' ? body.currentTrackId : null,
        request,
        recommendation_id: typeof result.recommendationId === 'string' ? result.recommendationId : null,
        result,
      }).select('id').single();
      if (error) return json(500, { schemaVersion: 1, accepted: false, error: 'persist_failed', detail: error.message });
      return json(200, { schemaVersion: 1, accepted: true, record: data });
    }

    if (body.action === 'save_set_intelligence') {
      const result = body.result && typeof body.result === 'object' ? body.result as Record<string, unknown> : null;
      if (!result) return json(400, { schemaVersion: 1, accepted: false, error: 'set_result_required' });
      const { data, error } = await client.from('dj_set_intelligence_runs').insert({
        device_id: deviceId,
        request,
        set_id: typeof result.setId === 'string' ? result.setId : null,
        result,
      }).select('id').single();
      if (error) return json(500, { schemaVersion: 1, accepted: false, error: 'persist_failed', detail: error.message });
      return json(200, { schemaVersion: 1, accepted: true, record: data });
    }

    return json(400, { schemaVersion: 1, accepted: false, error: 'invalid_action' });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') return json(401, { schemaVersion: 1, accepted: false, error: 'unauthorized' });
    return json(500, { schemaVersion: 1, accepted: false, error: 'server_error', detail: error instanceof Error ? error.message : String(error) });
  }
});
