import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-agent-id, x-snapshot-action",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function extractBearer(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice(7);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function validateSnapshotBatch(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object") return false;
  const body = value as JsonRecord;

  if (
    body.schemaVersion !== 1 ||
    body.mode !== "snapshot" ||
    !isUuid(body.sessionId) ||
    typeof body.expectedCount !== "number" ||
    !Number.isInteger(body.expectedCount) ||
    body.expectedCount < 0 ||
    !Array.isArray(body.tracks)
  ) {
    return false;
  }

  return body.tracks.every((track) => {
    if (track === null || typeof track !== "object") return false;
    const item = track as JsonRecord;

    return (
      typeof item.id === "string" &&
      item.id.length > 0 &&
      typeof item.hash === "string" &&
      /^[a-f0-9]{64}$/i.test(item.hash) &&
      item.track !== null &&
      typeof item.track === "object"
    );
  });
}

function validateCommit(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object") return false;
  const body = value as JsonRecord;

  return (
    body.schemaVersion === 1 &&
    body.mode === "snapshot:commit" &&
    isUuid(body.sessionId)
  );
}

async function createServiceClient(): Promise<
  | { client: ReturnType<typeof createClient>; error: null }
  | { client: null; error: string }
> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let serviceKey = legacyServiceRoleKey ?? null;

  if (!serviceKey && secretKeysRaw) {
    try {
      const secretKeys = JSON.parse(secretKeysRaw) as Record<string, string>;
      serviceKey = secretKeys.default ?? null;
    } catch {
      serviceKey = null;
    }
  }

  if (!supabaseUrl || !serviceKey) {
    return {
      client: null,
      error: "supabase_server_key_not_configured",
    };
  }

  return {
    client: createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    error: null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "method_not_allowed",
      },
      405,
    );
  }

  const configuredApiKey = Deno.env.get("SYNC_API_KEY");

  if (!configuredApiKey) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "server_not_configured",
      },
      500,
    );
  }

  const providedKey =
    extractBearer(request.headers.get("authorization")) ??
    request.headers.get("x-api-key");

  if (
    !providedKey ||
    !timingSafeEqual(providedKey, configuredApiKey)
  ) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "unauthorized",
      },
      401,
    );
  }

  const agentId = request.headers
    .get("x-agent-id")
    ?.trim();

  if (!agentId) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "agent_id_required",
      },
      400,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "invalid_json",
      },
      400,
    );
  }

  const action =
    request.headers
      .get("x-snapshot-action")
      ?.trim()
      .toLowerCase() ?? "batch";

  const service = await createServiceClient();

  if (service.error) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: service.error,
      },
      500,
    );
  }

  const supabase = service.client;

  if (action === "commit") {
    if (!validateCommit(body)) {
      return json(
        {
          schemaVersion: 1,
          accepted: false,
          error: "invalid_snapshot_commit",
        },
        422,
      );
    }

    const { data, error } = await supabase.rpc(
      "commit_snapshot",
      {
        p_device_id: agentId,
        p_session_id: body.sessionId,
      },
    );

    if (error) {
      const message = error.message ?? "database_error";

      if (
        new Set([
          "snapshot_session_not_found",
          "snapshot_device_conflict",
          "snapshot_incomplete",
        ]).has(message)
      ) {
        return json(
          {
            schemaVersion: 1,
            accepted: false,
            error: message,
          },
          409,
        );
      }

      console.error("commit_snapshot failed:", error);

      return json(
        {
          schemaVersion: 1,
          accepted: false,
          error: "database_error",
        },
        500,
      );
    }

    return json(data, 200);
  }

  if (!validateSnapshotBatch(body)) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "invalid_snapshot_batch",
      },
      422,
    );
  }

  const { data, error } = await supabase.rpc(
    "ingest_snapshot_batch",
    {
      p_device_id: agentId,
      p_session_id: body.sessionId,
      p_expected_count: body.expectedCount,
      p_batch: body.tracks,
    },
  );

  if (error) {
    const message = error.message ?? "database_error";

    if (
      new Set([
        "snapshot_device_conflict",
        "snapshot_count_conflict",
        "snapshot_session_failed",
      ]).has(message)
    ) {
      return json(
        {
          schemaVersion: 1,
          accepted: false,
          error: message,
        },
        409,
      );
    }

    console.error("ingest_snapshot_batch failed:", error);

    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "database_error",
      },
      500,
    );
  }

  return json(data, 200);
});
