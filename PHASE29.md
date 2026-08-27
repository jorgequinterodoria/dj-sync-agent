# FASE 29 — Copilot Planner + Multi-Step Execution

## Objetivo

Evolucionar el ToolPlan de Fase 28 hacia planificación y ejecución multi-step con validación, estado persistente durante el ciclo y replanificación controlada.

## Componentes

- `CopilotPlanner`
- `validateToolPlan`
- `ExecutionState`
- `DJSyncCopilotPlanner`

## Guardrails

- `maxSteps`
- `maxToolCalls`
- `maxReplans`
- `maxAttemptsPerStep`

## Replanning

Si un step falla, los resultados completados se conservan en `ExecutionState` y el proveedor opcional de replanning puede generar un nuevo plan.

## Seguridad

- Las herramientas continúan ejecutándose exclusivamente mediante `ToolRegistry`.
- Read/write/review permanecen separados.
- Las herramientas desconocidas se rechazan.
- Los planes con dependencias inválidas o ciclos se rechazan.
- Las acciones write/review requieren aprobación explícita durante validación.
- No hay acceso directo a Supabase ni SQL.
- No se incorporan secrets al planner.

## Supabase

No hay migraciones.
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
