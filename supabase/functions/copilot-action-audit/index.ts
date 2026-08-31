import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

const MAX_BODY_BYTES = 64 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;

const SECRET_KEY_PATTERN =
  /(api[-_ ]?key|authorization|access[-_ ]?token|refresh[-_ ]?token|approval[-_ ]?token|password|passwd|secret|service[-_ ]?role|private[-_ ]?key|client[-_ ]?secret|credential|cookie|session)/i;

const STATUSES = new Set([
  "requested",
  "previewed",
  "approved",
  "rejected",
  "executed",
  "failed",
  "expired",
]);

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
    Deno.env
      .get(name)
      ?.trim() ??
    "";

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
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return value.trim();
}

function hasSecretKey(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some(
      (item) =>
        hasSecretKey(item),
    );
  }

  if (
    typeof value !==
      "object" ||
    value === null
  ) {
    return false;
  }

  return Object.entries(
    value as Record<
      string,
      unknown
    >,
  ).some(
    ([key, nested]) =>
      SECRET_KEY_PATTERN.test(
        key,
      ) ||
      hasSecretKey(nested),
  );
}

function metadataBytes(
  value: unknown,
): number {
  return new TextEncoder()
    .encode(
      JSON.stringify(value),
    )
    .byteLength;
}

function validateMetadata(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    hasSecretKey(value)
  ) {
    throw new Error(
      "Sensitive metadata fields are not permitted.",
    );
  }

  if (
    metadataBytes(value) >
    MAX_METADATA_BYTES
  ) {
    throw new Error(
      "resultMetadata exceeds the allowed size.",
    );
  }

  return value;
}

async function authenticate(
  req: Request,
): Promise<{
  readonly supabase: ReturnType<
    typeof createClient
  >;
  readonly userId: string;
}> {
  const authorization =
    req.headers.get(
      "authorization",
    );

  if (
    authorization === null
  ) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error:
          "Authorization required.",
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "content-type":
            "application/json",
        },
      },
    );
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  if (!match) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error:
          "Invalid authorization header.",
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "content-type":
            "application/json",
        },
      },
    );
  }

  const token =
    match[1]?.trim();

  if (!token) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error:
          "Bearer token is required.",
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "content-type":
            "application/json",
        },
      },
    );
  }

  const supabase =
    createClient(
      requiredEnv(
        "SUPABASE_URL",
      ),
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

  const {
    data,
    error,
  } =
    await supabase.auth.getUser(
      token,
    );

  if (
    error ||
    !data.user
  ) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error:
          "Unauthorized.",
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "content-type":
            "application/json",
        },
      },
    );
  }

  return {
    supabase,
    userId:
      data.user.id,
  };
}

function contentLengthBytes(
  req: Request,
): number {
  const raw =
    req.headers.get(
      "content-length",
    );

  if (raw === null) {
    return 0;
  }

  const value =
    Number(raw);

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return Math.trunc(
    value,
  );
}

Deno.serve(
  async (
    req: Request,
  ): Promise<Response> => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        },
      );
    }

    if (
      req.method !==
      "POST"
    ) {
      return json(
        {
          ok: false,
          error:
            "Method not allowed.",
        },
        405,
      );
    }

    if (
      contentLengthBytes(
        req,
      ) >
      MAX_BODY_BYTES
    ) {
      return json(
        {
          ok: false,
          error:
            "Request body is too large.",
        },
        413,
      );
    }

    try {
      const raw =
        await req.text();

      const rawBytes =
        new TextEncoder()
          .encode(raw)
          .byteLength;

      if (
        rawBytes >
        MAX_BODY_BYTES
      ) {
        return json(
          {
            ok: false,
            error:
              "Request body is too large.",
          },
          413,
        );
      }

      if (!raw.trim()) {
        return json(
          {
            ok: false,
            error:
              "Request body is required.",
          },
          400,
        );
      }

      let body: Record<
        string,
        unknown
      >;

      try {
        const parsed =
          JSON.parse(
            raw,
          );

        if (
          typeof parsed !==
            "object" ||
          parsed === null ||
          Array.isArray(
            parsed,
          )
        ) {
          return json(
            {
              ok: false,
              error:
                "Request body must be a JSON object.",
            },
            400,
          );
        }

        body =
          parsed as Record<
            string,
            unknown
          >;
      } catch {
        return json(
          {
            ok: false,
            error:
              "Request body must contain valid JSON.",
          },
          400,
        );
      }

      const {
        supabase,
        userId,
      } =
        await authenticate(
          req,
        );

      const operation =
        requiredString(
          body.operation,
          "operation",
        );

      if (
        operation ===
        "append"
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
          !STATUSES.has(
            status,
          )
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

        const approvalId =
          typeof body.approvalId ===
          "string"
            ? body.approvalId.trim()
            : null;

        const errorMessage =
          typeof body.error ===
          "string"
            ? body.error.slice(
                0,
                4000,
              )
            : null;

        const resultMetadata =
          validateMetadata(
            body.resultMetadata,
          );

        const insertPayload = {
          action_id:
            actionId,
          approval_id:
            approvalId,
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
            errorMessage,
          result_metadata:
            resultMetadata,
          actor_user_id:
            userId,
        };

        const {
          error,
        } =
          await supabase
            .from(
              "copilot_action_audit",
            )
            .insert(
              insertPayload,
            );

        if (
          error
        ) {
          return json(
            {
              ok: false,
              error:
                error.message,
            },
            500,
          );
        }

        return json({
          ok: true,
        });
      }

      if (
        operation ===
        "list"
      ) {
        const deviceId =
          requiredString(
            body.deviceId,
            "deviceId",
          );

        const requestedLimit =
          typeof body.limit ===
          "number"
            ? body.limit
            : 50;

        const limit =
          Math.max(
            1,
            Math.min(
              100,
              Math.trunc(
                requestedLimit,
              ),
            ),
          );

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "copilot_action_audit",
            )
            .select(
              [
                "action_id",
                "approval_id",
                "device_id",
                "request_id",
                "action_type",
                "action_hash",
                "status",
                "timestamp",
                "error",
                "result_metadata",
              ].join(", "),
            )
            .eq(
              "actor_user_id",
              userId,
            )
            .eq(
              "device_id",
              deviceId,
            )
            .order(
              "timestamp",
              {
                ascending:
                  false,
              },
            )
            .limit(
              limit,
            );

        if (
          error
        ) {
          return json(
            {
              ok: false,
              error:
                error.message,
            },
            500,
          );
        }

        return json({
          ok: true,
          items:
            data ??
            [],
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
    } catch (
      error
    ) {
      if (
        error instanceof
        Response
      ) {
        return error;
      }

      return json(
        {
          ok: false,
          error:
            error instanceof
            Error
              ? error.message
              : String(error),
        },
        400,
      );
    }
  },
);