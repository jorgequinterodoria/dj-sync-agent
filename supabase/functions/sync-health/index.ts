const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods":
    "GET, OPTIONS",
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
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
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

  for (
    let index = 0;
    index < a.length;
    index += 1
  ) {
    result |=
      a.charCodeAt(index) ^
      b.charCodeAt(index);
  }

  return result === 0;
}

Deno.serve(
  async (request) => {
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
      "GET"
    ) {
      return json(
        {
          ok: false,
          error:
            "method_not_allowed",
        },
        405,
      );
    }

    const configuredApiKey =
      Deno.env.get(
        "SYNC_API_KEY",
      );

    if (!configuredApiKey) {
      return json(
        {
          ok: false,
          error:
            "server_not_configured",
        },
        500,
      );
    }

    const providedKey =
      request.headers.get(
        "x-api-key",
      );

    if (
      !providedKey ||
      !timingSafeEqual(
        providedKey,
        configuredApiKey,
      )
    ) {
      return json(
        {
          ok: false,
          error:
            "unauthorized",
        },
        401,
      );
    }

    return json({
      ok: true,
      service:
        "dj-sync-api",
      version:
        "0.9.5",
      checkedAt:
        new Date().toISOString(),
      region:
        Deno.env.get(
          "SB_REGION",
        ) ?? null,
      deploymentId:
        Deno.env.get(
          "DENO_DEPLOYMENT_ID",
        ) ?? null,
    });
  },
);
