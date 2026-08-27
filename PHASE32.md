# FASE 32 — Copilot Actions Reales + Audit Trail

## Objetivo

Conectar el Approval Gate con acciones concretas del dominio DJ y añadir un audit trail persistente y no sensible.

## Acciones soportadas

- `playlist.add`
- `playlist.remove`
- `playlist.create`
- `cue.create`
- `cue.remove`

Las operaciones reciben primero una acción validada por `validateDJAction`.

## Flujo

```text
AI Action
  ↓
Validate
  ↓
Action Preview
  ↓
Approval Gate
  ↓
Consume approval
  ↓
Real Action Executor
  ↓
Core Domain
  ↓
Audit
```

## Seguridad

- Ninguna acción sensible ejecuta directamente desde el renderer.
- La aprobación continúa siendo obligatoria.
- El executor solo acepta `ValidatedDJAction`.
- No se almacenan tokens, API keys ni service-role secrets.
- La tabla de auditoría tiene RLS habilitado.
- El audit record contiene metadata de ejecución, no credenciales.

## Supabase

Esta fase introduce:

```text
supabase/migrations/20260827000010_copilot_action_audit.sql
supabase/functions/copilot-action-audit/index.ts
```

No ejecutar `db push` hasta completar:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

Una vez verificado localmente, se puede aplicar:

```bash
pnpm supabase db push
```

y después:

```bash
pnpm supabase functions deploy copilot-action-audit --no-verify-jwt
```

## Nota

La integración con los repositorios reales de Playlist/Cue debe conectarse en el composition root existente. Esta entrega no reemplaza el bootstrap actual de Electron.
