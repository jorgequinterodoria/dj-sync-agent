# FASE 25 — Persistencia real de conversaciones

## Objetivo

Conectar Conversation Memory con una persistencia remota de Supabase sin mezclarla con Semantic/Music Memory.

## Componentes

- `ConversationMemoryStore`: frontera de persistencia.
- `SupabaseConversationMemoryStore`: adapter HTTP hacia la Edge Function.
- `DJSyncConversationService`: fachada de runtime.
- `conversation-memory` Edge Function.
- `conversation_memory` table.

## Seguridad

- La tabla tiene RLS habilitado.
- La Edge Function utiliza service role únicamente en el entorno server-side.
- No se envían API keys al renderer.
- `conversationId` se valida y se acota.
- Solo se aceptan snapshots de schema version 1.
- Se utiliza upsert por `conversation_id`.

## Importante

Esta fase introduce por primera vez la migración:

`supabase/migrations/20260827000009_conversation_memory.sql`

### Antes del deploy

Ejecutar:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

Después de que todo esté verde:

```bash
pnpm supabase db push
```

y luego:

```bash
pnpm supabase functions deploy conversation-memory --no-verify-jwt
```
