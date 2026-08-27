import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, x-agent-id, x-worker-id, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JobAction =
  | "claim"
  | "execute"
  | "complete"
  | "fail";

type JsonRecord =
  Record<string, unknown>;

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
          "application/json; charset=utf-8",
      },
    },
  );
}

function safeEqual(
  a: string,
  b: string,
): boolean {
  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let index = 0;
    index < a.length;
    index += 1
  ) {
    result |=
      a.charCodeAt(index) ^
      b.charCodeAt(index);
  }

  return result ===
    0;
}

function getServerKey():
  string {
  const raw =
    Deno.env.get(
      "SUPABASE_SECRET_KEYS",
    );

  if (
    raw
  ) {
    try {
      const parsed =
        JSON.parse(
          raw,
        ) as Record<
          string,
          unknown
        >;

      if (
        typeof parsed.default ===
          "string" &&
        parsed.default.trim()
      ) {
        return parsed.default.trim();
      }

      for (
        const value of
          Object.values(
            parsed,
          )
      ) {
        if (
          typeof value ===
            "string" &&
          value.trim()
        ) {
          return value.trim();
        }
      }
    } catch {
      // Compatibility fallback.
    }
  }

  const legacy =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )?.trim();

  if (
    legacy
  ) {
    return legacy;
  }

  throw new Error(
    "SUPABASE_SERVER_SECRET_NOT_CONFIGURED",
  );
}

function extractBearer(
  authorization:
    string | null,
):
  string | null {
  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    return null;
  }

  return authorization.slice(
    7,
  );
}

function authenticate(
  request: Request,
):
  string {
  const configured =
    Deno.env.get(
      "SYNC_API_KEY",
    )?.trim();

  if (
    !configured
  ) {
    throw new Error(
      "SYNC_API_KEY_NOT_CONFIGURED",
    );
  }

  const supplied =
    extractBearer(
      request.headers.get(
        "authorization",
      ),
    ) ??
    request.headers
      .get(
        "x-api-key",
      )
      ?.trim() ??
    "";

  if (
    !supplied ||
    !safeEqual(
      supplied,
      configured,
    )
  ) {
    throw new Error(
      "UNAUTHORIZED",
    );
  }

  const agentId =
    request.headers
      .get(
        "x-agent-id",
      )
      ?.trim();

  if (
    !agentId
  ) {
    throw new Error(
      "AGENT_ID_REQUIRED",
    );
  }

  return agentId;
}

function requiredString(
  value: unknown,
  name: string,
):
  string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${name}_REQUIRED`,
    );
  }

  return value.trim();
}

function integerValue(
  value: unknown,
  name: string,
  fallback: number,
):
  number {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }

  if (
    typeof value !==
      "number" ||
    !Number.isInteger(
      value,
    )
  ) {
    throw new Error(
      `${name}_INVALID`,
    );
  }

  return value;
}

Deno.serve(
  async (
    request,
  ) => {
    if (
      request.method ===
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
      request.method !==
      "POST"
    ) {
      return json(
        {
          schemaVersion: 1,
          accepted: false,
          error:
            "method_not_allowed",
        },
        405,
      );
    }

    try {
      const agentId =
        authenticate(
          request,
        );

      const body =
        (await request.json()) as
          JsonRecord;

      const action =
        body.action;

      if (
        action !==
          "claim" &&
        action !==
          "execute" &&
        action !==
          "complete" &&
        action !==
          "fail"
      ) {
        return json(
          {
            schemaVersion: 1,
            accepted: false,
            error:
              "invalid_action",
          },
          400,
        );
      }

      const supabaseUrl =
        Deno.env.get(
          "SUPABASE_URL",
        );

      if (
        !supabaseUrl
      ) {
        throw new Error(
          "SUPABASE_URL_NOT_CONFIGURED",
        );
      }

      const supabase =
        createClient(
          supabaseUrl,
          getServerKey(),
          {
            auth: {
              persistSession:
                false,

              autoRefreshToken:
                false,
            },
          },
        );

      if (
        action ===
        "claim"
      ) {
        const workerId =
          requiredString(
            body.workerId,
            "workerId",
          );

        const limit =
          integerValue(
            body.limit,
            "limit",
            10,
          );

        const leaseSeconds =
          integerValue(
            body.leaseSeconds,
            "leaseSeconds",
            120,
          );

        const {
          data,
          error,
        } =
          await supabase.rpc(
            "claim_intelligence_jobs",
            {
              p_device_id:
                agentId,

              p_worker_id:
                workerId,

              p_limit:
                limit,

              p_lease_seconds:
                leaseSeconds,
            },
          );

        if (
          error
        ) {
          console.error(
            "claim_intelligence_jobs failed:",
            error,
          );

          return json(
            {
              schemaVersion: 1,
              accepted: false,
              error:
                "claim_failed",
              detail:
                error.message,
            },
            500,
          );
        }

        return json({
          schemaVersion: 1,
          accepted: true,
          action,
          deviceId:
            agentId,
          workerId,
          jobs:
            data ??
            [],
        });
      }

      const jobId =
        Number(
          body.jobId,
        );

      if (
        !Number.isSafeInteger(
          jobId,
        ) ||
        jobId < 1
      ) {
        return json(
          {
            schemaVersion: 1,
            accepted: false,
            error:
              "job_id_invalid",
          },
          400,
        );
      }

      const workerId =
        requiredString(
          body.workerId,
          "workerId",
        );

      /*
       * execute now owns the complete server-side
       * transaction:
       *
       * validate lease
       * → apply business projection
       * → mark completed
       */
      if (
        action ===
        "execute"
      ) {
        const {
          data,
          error,
        } =
          await supabase.rpc(
            "execute_intelligence_job",
            {
              p_job_id:
                jobId,

              p_worker_id:
                workerId,

              p_output:
                body.output ?? null,
            },
          );

        if (
          error
        ) {
          const detail =
            error.message ??
            "execute_failed";

          const stale =
            detail.startsWith(
              "stale_intelligence_job:",
            );

          return json(
            {
              schemaVersion: 1,

              accepted:
                false,

              error:
                stale
                  ? "stale_job"
                  : "execute_failed",

              detail,

              job:
                data ??
                null,
            },
            stale
              ? 409
              : 500,
          );
        }

        return json({
          schemaVersion: 1,
          accepted: true,
          action,
          job:
            data,
        });
      }

      /*
       * Kept as a compatibility endpoint for non-atomic
       * infrastructure callers. The desktop Intelligence
       * engine must use execute instead.
       */
      if (
        action ===
        "complete"
      ) {
        const {
          data,
          error,
        } =
          await supabase.rpc(
            "complete_intelligence_job",
            {
              p_job_id:
                jobId,

              p_worker_id:
                workerId,
            },
          );

        if (
          error
        ) {
          return json(
            {
              schemaVersion: 1,
              accepted: false,
              error:
                "complete_failed",
              detail:
                error.message,
            },
            409,
          );
        }

        return json({
          schemaVersion: 1,
          accepted: true,
          action,
          job:
            data,
        });
      }

      const errorMessage =
        requiredString(
          body.error,
          "error",
        );

      const retryable =
        body.retryable !==
        false;

      const maxAttempts =
        integerValue(
          body.maxAttempts,
          "maxAttempts",
          10,
        );

      const retryDelaySeconds =
        integerValue(
          body.retryDelaySeconds,
          "retryDelaySeconds",
          30,
        );

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "fail_intelligence_job",
          {
            p_job_id:
              jobId,

            p_worker_id:
              workerId,

            p_error:
              errorMessage,

            p_retryable:
              retryable,

            p_max_attempts:
              maxAttempts,

            p_retry_delay_seconds:
              retryDelaySeconds,
          },
        );

      if (
        error
      ) {
        return json(
          {
            schemaVersion: 1,
            accepted: false,
            error:
              "fail_failed",
            detail:
              error.message,
          },
          409,
        );
      }

      return json({
        schemaVersion: 1,
        accepted: true,
        action,
        job:
          data,
      });
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const status =
        message ===
        "UNAUTHORIZED"
          ? 401
          : 400;

      return json(
        {
          schemaVersion: 1,
          accepted: false,
          error:
            message.toLowerCase(),
        },
        status,
      );
    }
  },
);