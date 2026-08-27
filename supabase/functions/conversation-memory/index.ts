import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Snapshot = {
  schemaVersion: 1;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  messages: unknown[];
  constraints: unknown[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
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

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function validateConversationId(
  value: unknown,
): string {
  if (typeof value !== "string") {
    throw new Error(
      "conversationId is required.",
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      "conversationId is required.",
    );
  }

  if (normalized.length > 200) {
    throw new Error(
      "conversationId is too long.",
    );
  }

  return normalized;
}

function validateSnapshot(
  value: unknown,
): Snapshot {
  if (
    !value ||
    typeof value !== "object"
  ) {
    throw new Error(
      "snapshot is required.",
    );
  }

  const snapshot =
    value as Record<string, unknown>;

  if (
    snapshot.schemaVersion !== 1 ||
    typeof snapshot.conversationId !==
      "string" ||
    typeof snapshot.createdAt !==
      "string" ||
    typeof snapshot.updatedAt !==
      "string" ||
    !Array.isArray(snapshot.messages) ||
    !Array.isArray(snapshot.constraints)
  ) {
    throw new Error(
      "Invalid conversation memory snapshot.",
    );
  }

  const conversationId =
    validateConversationId(
      snapshot.conversationId,
    );

  return {
    schemaVersion: 1,
    conversationId,
    createdAt:
      snapshot.createdAt as string,
    updatedAt:
      snapshot.updatedAt as string,
    summary:
      typeof snapshot.summary ===
        "string"
        ? snapshot.summary
        : null,
    messages:
      snapshot.messages,
    constraints:
      snapshot.constraints,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const body =
      (await req.json()) as Record<
        string,
        unknown
      >;

    const operation = body.operation;

    if (
      operation === "load"
    ) {
      const conversationId =
        validateConversationId(
          body.conversationId,
        );

      const result =
        await supabase
          .from(
            "conversation_memory",
          )
          .select(
            "conversation_id, schema_version, created_at, updated_at, summary, messages, constraints",
          )
          .eq(
            "conversation_id",
            conversationId,
          )
          .maybeSingle();

      if (result.error) {
        return json(
          {
            ok: false,
            error: result.error.message,
          },
          500,
        );
      }

      if (!result.data) {
        return json({
          ok: true,
          snapshot: null,
        });
      }

      return json({
        ok: true,
        snapshot: {
          schemaVersion:
            result.data
              .schema_version,
          conversationId:
            result.data
              .conversation_id,
          createdAt:
            result.data.created_at,
          updatedAt:
            result.data.updated_at,
          summary:
            result.data.summary,
          messages:
            result.data.messages,
          constraints:
            result.data.constraints,
        },
      });
    }

    if (
      operation === "save"
    ) {
      const snapshot =
        validateSnapshot(
          body.snapshot,
        );

      const result =
        await supabase
          .from(
            "conversation_memory",
          )
          .upsert(
            {
              conversation_id:
                snapshot.conversationId,
              schema_version:
                snapshot.schemaVersion,
              created_at:
                snapshot.createdAt,
              updated_at:
                snapshot.updatedAt,
              summary:
                snapshot.summary,
              messages:
                snapshot.messages,
              constraints:
                snapshot.constraints,
            },
            {
              onConflict:
                "conversation_id",
            },
          );

      if (result.error) {
        return json(
          {
            ok: false,
            error: result.error.message,
          },
          500,
        );
      }

      return json({
        ok: true,
      });
    }

    if (
      operation === "delete"
    ) {
      const conversationId =
        validateConversationId(
          body.conversationId,
        );

      const result =
        await supabase
          .from(
            "conversation_memory",
          )
          .delete()
          .eq(
            "conversation_id",
            conversationId,
          );

      if (result.error) {
        return json(
          {
            ok: false,
            error: result.error.message,
          },
          500,
        );
      }

      return json({
        ok: true,
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
