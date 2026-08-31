# FASE 22 — Conversation Memory

## Objetivo

Separar memoria conversacional de Music Memory y proporcionar un contrato session-scoped preparado para conectarse al Copilot Agent.

## Características

- Snapshot versionado.
- Historial acotado.
- Orden determinista.
- Resumen independiente.
- Constraints explícitos.
- Store desacoplado.
- Sin dependencia de provider.
- Sin secretos.
- Sin dependencia de Supabase en el contrato.
- Sin mezcla con semantic memory.

## Nota

La implementación local en memoria es deliberada. La persistencia concreta de producción se conectará mediante `ConversationMemoryStore` en una fase posterior.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

No hay migraciones de Supabase en esta fase.
