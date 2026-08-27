# FASE 23 — Copilot Chat en Electron

## Objetivo

Exponer el Copilot Agent mediante una frontera de runtime e IPC segura para la aplicación Electron.

## Reglas

- El renderer no recibe API keys.
- El renderer no ejecuta tools.
- Main/Runtime delega al `CopilotAgent`.
- Los tool calls siguen pasando por `ToolRegistry`.
- Las sesiones identifican explícitamente su `conversationId`.
- Las operaciones aceptan `AbortSignal` para cancelación.
- El contrato IPC mantiene datos serializables.
- CSP y aislamiento de Electron permanecen bajo control del main process.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

No hay migraciones Supabase en esta fase.
