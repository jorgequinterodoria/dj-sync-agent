import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
        "content-type":
          "application/json",
      },
    },
  );
}

function requiredEnv(
  name: string,
): string {
  const value =
    Deno.env.get(name)
      ?.trim() ?? "";

  if (!value) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return value;
}

function requiredString(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return value.trim();
}

const statuses = new Set([
  "requested",
  "previewed",
  "approved",
  "rejected",
  "executed",
  "failed",
  "expired",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const supabase =
      createClient(
        requiredEnv("SUPABASE_URL"),
        requiredEnv(
          "SUPABASE_SERVICE_ROLE_KEY",
        ),
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    const body =
      (await req.json()) as Record<
        string,
        unknown
      >;

    const operation =
      body.operation;

    if (
      operation === "append"
    ) {
      const actionId =
        requiredString(
          body.actionId,
          "actionId",
        );

      const deviceId =
        requiredString(
          body.deviceId,
          "deviceId",
        );

      const requestId =
        requiredString(
          body.requestId,
          "requestId",
        );

      const actionType =
        requiredString(
          body.actionType,
          "actionType",
        );

      const actionHash =
        requiredString(
          body.actionHash,
          "actionHash",
        );

      const status =
        requiredString(
          body.status,
          "status",
        );

      if (
        !statuses.has(status)
      ) {
        throw new Error(
          "Invalid audit status.",
        );
      }

      const timestamp =
        requiredString(
          body.timestamp,
          "timestamp",
        );

      const { error } =
        await supabase
          .from(
            "copilot_action_audit",
          )
          .insert({
            action_id:
              actionId,
            approval_id:
              typeof body.approvalId ===
              "string"
                ? body.approvalId.trim()
                : null,
            device_id:
              deviceId,
            request_id:
              requestId,
            action_type:
              actionType,
            action_hash:
              actionHash,
            status,
            timestamp,
            error:
              typeof body.error ===
              "string"
                ? body.error
                : null,
            result_metadata:
              body.resultMetadata ??
              null,
          });

      if (error) {
        return json(
          {
            ok: false,
            error: error.message,
          },
          500,
        );
      }

      return json({
        ok: true,
      });
    }

    if (
      operation === "list"
    ) {
      const deviceId =
        requiredString(
          body.deviceId,
          "deviceId",
        );

      const rawLimit =
        typeof body.limit ===
        "number"
          ? body.limit
          : 50;

      const limit = Math.max(
        1,
        Math.min(
          100,
          Math.trunc(
            rawLimit,
          ),
        ),
      );

      const result =
        await supabase
          .from(
            "copilot_action_audit",
          )
          .select(
            "action_id, approval_id, device_id, request_id, action_type, action_hash, status, timestamp, error, result_metadata",
          )
          .eq(
            "device_id",
            deviceId,
          )
          .order(
            "timestamp",
            {
              ascending: false,
            },
          )
          .limit(limit);

      if (result.error) {
        return json(
          {
            ok: false,
            error:
              result.error.message,
          },
          500,
        );
      }

      return json({
        ok: true,
        items:
          result.data,
      });
    }

    return json(
      {
        ok: false,
        error:
          "Unsupported operation.",
      },
      400,
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      400,
    );
  }
});
