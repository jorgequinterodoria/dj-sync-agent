const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-api-key, x-agent-id, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? '';
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return response({ schemaVersion: 1, accepted: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const expectedKey =
      Deno.env.get('SUPABASE_SECRET_KEY')?.trim() ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

    const suppliedKey =
      request.headers.get('x-api-key')?.trim() ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
      '';

    if (!suppliedKey || suppliedKey !== expectedKey) {
      return response(
        { schemaVersion: 1, accepted: false, error: 'unauthorized' },
        401,
      );
    }

    const payload = await request.json() as Record<string, unknown>;
    const action = payload.action;

    if (action !== 'save') {
      return response({ schemaVersion: 1, accepted: false, error: 'invalid_action' }, 400);
    }

    const deviceId = String(payload.deviceId ?? '').trim();
    const trackId = String(payload.trackId ?? '').trim();
    const requestText = String(payload.request ?? '').trim();
    const copilotAction = payload.copilotAction;
    const result = payload.result;

    if (!deviceId || !trackId || !requestText) {
      return response({ schemaVersion: 1, accepted: false, error: 'invalid_input' }, 400);
    }

    if (!copilotAction || typeof copilotAction !== 'object') {
      return response({ schemaVersion: 1, accepted: false, error: 'action_required' }, 400);
    }

    const actionRow = copilotAction as Record<string, unknown>;
    const actionId = String(actionRow.actionId ?? '').trim();
    const actionType = String(actionRow.type ?? '').trim();
    const risk = String(actionRow.risk ?? '').trim();
    const approved = Boolean(payload.approved);

    if (!actionId || !actionType || !risk || !result || typeof result !== 'object') {
      return response({ schemaVersion: 1, accepted: false, error: 'invalid_action_record' }, 400);
    }

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const serviceRoleKey = expectedKey;

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/save_dj_copilot_action_run`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_device_id: deviceId,
        p_track_id: trackId,
        p_action_id: actionId,
        p_action_type: actionType,
        p_risk: risk,
        p_approved: approved,
        p_request: requestText,
        p_input:
          actionRow.input && typeof actionRow.input === 'object'
            ? actionRow.input
            : {},
        p_result: result,
      }),
    });

    const rpcRaw = await rpcResponse.text();
    if (!rpcResponse.ok) {
      return response(
        {
          schemaVersion: 1,
          accepted: false,
          error: 'persistence_failed',
          detail: rpcRaw.slice(0, 1000),
        },
        500,
      );
    }

    const rows = JSON.parse(rpcRaw) as unknown;
    const record = Array.isArray(rows) ? rows[0] : rows;

    return response({
      schemaVersion: 1,
      accepted: true,
      record,
    });
  } catch (error) {
    return response(
      {
        schemaVersion: 1,
        accepted: false,
        error: 'internal_error',
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
