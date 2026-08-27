# FASE 31 — Action Preview UI + Human-in-the-Loop

## Objetivo

Llevar el Approval Gate a una frontera usable desde Electron: el Copilot puede mostrar una acción propuesta, pero la ejecución queda bloqueada hasta una aprobación humana explícita.

## Flujo

```text
Copilot
  ↓
ActionPreview
  ↓
UI
  ↓
Approve / Reject
  ↓
Approval Gate
  ↓
Execute
  ↓
Audit
```

## Componentes

- IPC contracts for prepare/approve/reject/execute.
- `CopilotActionIpc`.
- `DJSyncCopilotActionController`.
- Action Card renderer.
- CSS para preview y estados.

## Seguridad

- El renderer no recibe API keys ni service-role secrets.
- El renderer no ejecuta el executor.
- Approval sigue vinculada al preview, action hash, deviceId y requestId.
- La UI deshabilita aprobación/rechazo cuando el estado ya no es `pending`.
- La ejecución requiere un approval token válido.
- Los errores se convierten en estados estructurados recuperables.
- No se añaden migraciones.

## Supabase

No ejecutar:

```bash
pnpm supabase db push
```

No hay Edge Function nueva.

## Nota de integración

La estructura se añade como frontera independiente. La conexión final con el `contextBridge`/bootstrap existente debe hacerse sobre los canales públicos ya existentes del proyecto, sin reemplazar `main.ts` o el renderer actual.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```
