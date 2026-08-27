# FASE 30 — Copilot Action Safety + Approval Gate

## Objetivo

Establecer una frontera formal entre propuesta, aprobación y ejecución de acciones sensibles.

## Flujo

```text
request
  ↓
preview
  ↓
approval gate
  ↓
consume approval
  ↓
execute
  ↓
audit
```

## Componentes

- `ActionPreview`
- `InMemoryApprovalGate`
- `InMemoryActionAudit`
- `DJSyncCopilotActionGate`

## Reglas

- Las acciones `write`/`review` requieren aprobación explícita.
- La aprobación queda vinculada a `deviceId`, `requestId`, `previewId` y hash de la acción.
- La aprobación tiene TTL.
- La aprobación es one-shot.
- Las acciones modificadas no pueden reutilizar una aprobación anterior.
- Un rechazo nunca se interpreta como aprobación.
- Un timeout/expiración bloquea la ejecución.
- Cada transición relevante queda auditada.
- No se almacenan API keys ni service-role secrets.
- La ejecución real sigue delegada a un executor externo.

## Supabase

No hay migraciones en esta fase.

No ejecutar:

```bash
pnpm supabase db push
```

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```
