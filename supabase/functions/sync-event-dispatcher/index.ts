import { createClient } from "npm:@supabase/supabase-js@2";

const JSON_HEADERS = { "content-type": "application/json" };

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function getServerKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (typeof parsed.default === "string" && parsed.default.trim()) {
        return parsed.default.trim();
      }

      for (const value of Object.values(parsed)) {
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    } catch {
      // Compatibility fallback below.
    }
  }

  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;

  throw new Error("SUPABASE_SERVER_SECRET_NOT_CONFIGURED");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

function integerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = Deno.env.get(name)?.trim();

  if (!raw) return fallback;

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name}_OUT_OF_RANGE`);
  }

  return value;
}

function retryDelaySeconds(attempt: number, baseSeconds: number): number {
  return Math.min(
    baseSeconds * 2 ** Math.max(0, attempt - 1),
    3600,
  );
}

type SyncEvent = {
  event_id: string;
  schema_version: number;
  device_id: string;
  message_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  rb_local_usn: number | null;
  cursor_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
};

function buildTransport(event: SyncEvent): Record<string, unknown> {
  const innerData =
    event.payload.data &&
    typeof event.payload.data === "object"
      ? event.payload.data
      : {};

  return {
    schemaVersion: 1,
    eventId: event.event_id,
    eventType: event.event_type,
    occurredAt: event.occurred_at,
    deviceId: event.device_id,
    messageId: event.message_id,
    cursor: {
      rbLocalUsn: event.rb_local_usn,
      id: event.cursor_id,
    },
    data: innerData,
  };
}

Deno.serve(async (req) => {
  const requestId =
    Deno.env.get("SB_EXECUTION_ID") ?? crypto.randomUUID();

  if (req.method !== "POST") {
    return json(
      {
        accepted: false,
        error: "method_not_allowed",
        requestId,
      },
      405,
    );
  }

  try {
    const dispatcherKey = requiredEnv("SYNC_DISPATCHER_KEY");

    const suppliedKey =
      req.headers.get("x-dispatcher-key")?.trim() ?? "";

    if (!suppliedKey || !safeEqual(suppliedKey, dispatcherKey)) {
      return json(
        {
          accepted: false,
          error: "unauthorized",
          requestId,
        },
        401,
      );
    }

    const n8nAuthKey = requiredEnv("N8N_WEBHOOK_AUTH_KEY");
    const webhookUrl = requiredEnv("N8N_WEBHOOK_URL");

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      getServerKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const batchSize = integerEnv(
      "SYNC_EVENT_DISPATCH_BATCH_SIZE",
      10,
      1,
      50,
    );

    const leaseSeconds = integerEnv(
      "SYNC_EVENT_DISPATCH_LEASE_SECONDS",
      120,
      30,
      900,
    );

    const maxAttempts = integerEnv(
      "SYNC_EVENT_DISPATCH_MAX_ATTEMPTS",
      10,
      1,
      100,
    );

    const retryBaseSeconds = integerEnv(
      "SYNC_EVENT_DISPATCH_RETRY_BASE_SECONDS",
      5,
      1,
      300,
    );

    const workerId =
      `${requestId}:${crypto.randomUUID()}`;

    const claim = await supabase.rpc("claim_sync_events", {
      p_worker_id: workerId,
      p_limit: batchSize,
      p_lease_seconds: leaseSeconds,
    });

    if (claim.error) {
      console.error(
        JSON.stringify({
          level: "error",
          requestId,
          stage: "claim",
          error: claim.error.message,
        }),
      );

      return json(
        {
          accepted: false,
          error: "claim_failed",
          requestId,
        },
        500,
      );
    }

    const events = (claim.data ?? []) as SyncEvent[];

    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const event of events) {
      const body = JSON.stringify(buildTransport(event));

      let webhookResponse: Response;
      let responseText = "";

      try {
        webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-dj-sync-dispatcher-key": n8nAuthKey,
            "x-dj-sync-event-id": event.event_id,
            "x-dj-sync-event-type": event.event_type,
            "x-dj-sync-device-id": event.device_id,
            "x-dj-sync-message-id": event.message_id,
          },
          body,
        });

        responseText = (await webhookResponse.text()).slice(0, 4000);
      } catch (error) {
        webhookResponse = new Response(null, { status: 599 });
        responseText =
          error instanceof Error ? error.message : String(error);
      }

      if (
        webhookResponse.status >= 200 &&
        webhookResponse.status < 300
      ) {
        const marked = await supabase.rpc(
          "mark_sync_event_delivered",
          {
            p_event_id: event.event_id,
            p_worker_id: workerId,
          },
        );

        if (marked.error) {
          console.error(
            JSON.stringify({
              level: "error",
              requestId,
              eventId: event.event_id,
              stage: "mark_delivered",
              error: marked.error.message,
            }),
          );

          failed += 1;
        } else {
          delivered += 1;
        }

        continue;
      }

      const retryable =
        webhookResponse.status === 408 ||
        webhookResponse.status === 425 ||
        webhookResponse.status === 429 ||
        webhookResponse.status === 599 ||
        webhookResponse.status >= 500;

      const marked = await supabase.rpc(
        "mark_sync_event_failed",
        {
          p_event_id: event.event_id,
          p_worker_id: workerId,
          p_error:
            `n8n_http_${webhookResponse.status}: ${responseText}`,
          p_retryable: retryable,
          p_max_attempts: maxAttempts,
          p_retry_delay_seconds: retryDelaySeconds(
            event.attempts,
            retryBaseSeconds,
          ),
        },
      );

      if (marked.error) {
        console.error(
          JSON.stringify({
            level: "error",
            requestId,
            eventId: event.event_id,
            stage: "mark_failed",
            error: marked.error.message,
          }),
        );
      }

      failed += 1;

      if (!retryable || event.attempts >= maxAttempts) {
        deadLettered += 1;
      }
    }

    return json({
      schemaVersion: 1,
      accepted: true,
      requestId,
      workerId,
      claimed: events.length,
      delivered,
      failed,
      deadLettered,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        error: message,
      }),
    );

    return json(
      {
        accepted: false,
        error: message,
        requestId,
      },
      500,
    );
  }
});
