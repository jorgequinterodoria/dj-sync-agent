import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-agent-id, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

function timingSafeEqual(
  a: string,
  b: string,
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

function canonicalize(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    const object = value as JsonRecord;
    const sorted: JsonRecord = {};

    for (const key of Object.keys(object).sort()) {
      sorted[key] = canonicalize(object[key]);
    }

    return sorted;
  }

  return value;
}

function canonicalJson(
  value: unknown,
): string {
  return JSON.stringify(
    canonicalize(value),
  );
}

async function sha256Hex(
  value: string,
): Promise<string> {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );

  return Array.from(
    new Uint8Array(digest),
  )
    .map((byte) =>
      byte.toString(16).padStart(2, "0"),
    )
    .join("");
}

function extractBearer(
  authorization: string | null,
): string | null {
  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7);
}

function validateEnvelopeShape(
  envelope: unknown,
): envelope is JsonRecord {
  if (
    envelope === null ||
    typeof envelope !== "object"
  ) {
    return false;
  }

  const value = envelope as JsonRecord;

  if (value.schemaVersion !== 3) {
    return false;
  }

  const message = value.message as JsonRecord | undefined;
  const cursor = value.cursor as JsonRecord | undefined;
  const counts = value.counts as JsonRecord | undefined;
  const changes = value.changes as JsonRecord | undefined;
  const integrity =
    value.integrity as JsonRecord | undefined;

  if (!message || !cursor || !counts || !changes || !integrity) {
    return false;
  }

  if (message.type !== "rekordbox.sync.batch") {
    return false;
  }

  if (
    typeof message.id !== "string" ||
    !/^[a-f0-9]{32}$/i.test(message.id)
  ) {
    return false;
  }

  if (
    typeof message.idempotencyKey !== "string" ||
    !/^[a-f0-9]{64}$/i.test(
      message.idempotencyKey,
    )
  ) {
    return false;
  }

  if (
    typeof integrity.payloadHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(
      integrity.payloadHash,
    )
  ) {
    return false;
  }

  if (
    integrity.algorithm !== "sha256" ||
    typeof cursor.hasMore !== "boolean"
  ) {
    return false;
  }

  if (
    typeof counts.scanned !== "number" ||
    typeof counts.processed !== "number" ||
    typeof changes.added === undefined ||
    typeof changes.updated === undefined ||
    typeof changes.deleted === undefined
  ) {
    return false;
  }

  if (
    !Array.isArray(changes.added) ||
    !Array.isArray(changes.updated) ||
    !Array.isArray(changes.deleted)
  ) {
    return false;
  }

  return true;
}

function semanticPayload(
  envelope: JsonRecord,
): JsonRecord {
  return {
    schemaVersion: 3,
    type: "rekordbox.sync.batch",
    cursor: envelope.cursor,
    counts: envelope.counts,
    changes: envelope.changes,
  };
}

function cursorValue(
  cursor: unknown,
): { rbLocalUsn: number; id: string } | null {
  if (
    cursor === null ||
    typeof cursor !== "object"
  ) {
    return null;
  }

  const value = cursor as JsonRecord;

  if (
    typeof value.rbLocalUsn !== "number" ||
    typeof value.id !== "string"
  ) {
    return null;
  }

  return {
    rbLocalUsn: value.rbLocalUsn,
    id: value.id,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
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

  const configuredApiKey =
    Deno.env.get("SYNC_API_KEY");

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

  const authorization =
    request.headers.get("authorization");

  const xApiKey =
    request.headers.get("x-api-key");

  const providedKey =
    extractBearer(authorization) ??
    xApiKey;

  if (
    !providedKey ||
    !timingSafeEqual(
      providedKey,
      configuredApiKey,
    )
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

  const agentId =
    request.headers.get("x-agent-id")?.trim();

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

  let envelope: unknown;

  try {
    envelope = await request.json();
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

  if (!validateEnvelopeShape(envelope)) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "invalid_envelope",
      },
      422,
    );
  }

  const semantic = semanticPayload(
    envelope,
  );

  const semanticHash =
    await sha256Hex(
      canonicalJson(semantic),
    );

  const expectedId =
    semanticHash.slice(0, 32);

  if (
    !timingSafeEqual(
      String(
        (envelope.message as JsonRecord).id,
      ),
      expectedId,
    )
  ) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "message_id_mismatch",
      },
      422,
    );
  }

  if (
    !timingSafeEqual(
      String(
        (envelope.message as JsonRecord)
          .idempotencyKey,
      ),
      semanticHash,
    )
  ) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "idempotency_key_mismatch",
      },
      422,
    );
  }

  if (
    !timingSafeEqual(
      String(
        (envelope.integrity as JsonRecord)
          .payloadHash,
      ),
      semanticHash,
    )
  ) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "payload_hash_mismatch",
      },
      422,
    );
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const secretKeysRaw =
    Deno.env.get(
      "SUPABASE_SECRET_KEYS",
    );

  const legacyServiceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  let serviceKey =
    legacyServiceRoleKey ?? null;

  if (
    !serviceKey &&
    secretKeysRaw
  ) {
    try {
      const secretKeys =
        JSON.parse(
          secretKeysRaw,
        ) as Record<string, string>;

      serviceKey =
        secretKeys.default ?? null;
    } catch {
      serviceKey = null;
    }
  }

  if (!supabaseUrl || !serviceKey) {
    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "supabase_server_key_not_configured",
      },
      500,
    );
  }

  const supabase =
    createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

  const { data, error } =
    await supabase.rpc(
      "ingest_sync_batch",
      {
        p_device_id: agentId,
        p_envelope: envelope,
      },
    );

  if (error) {
    const message =
      error.message ?? "database_error";

    if (
      message === "idempotency_conflict"
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

    if (
      message === "cursor_conflict"
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

    if (
      message === "count_invariant_failed"
    ) {
      return json(
        {
          schemaVersion: 1,
          accepted: false,
          error: message,
        },
        422,
      );
    }

    console.error(
      "ingest_sync_batch failed:",
      error,
    );

    return json(
      {
        schemaVersion: 1,
        accepted: false,
        error: "database_error",
      },
      500,
    );
  }

  return json(
    data,
    200,
  );
});
