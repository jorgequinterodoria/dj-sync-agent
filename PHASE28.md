# FASE 28 — End-to-End Autonomous Copilot

## Objetivo

Cerrar el flujo operativo real entre contexto, planificación, ejecución de lectura y acciones controladas por aprobación.

## Flujo

```text
request
  ↓
context
  ↓
planner
  ↓
read tools
  ↓
write/review/execute action
  ↓
approval boundary
  ↓
real action
  ↓
resume remaining plan
  ↓
completed
```

## Garantías

- Read tools se ejecutan automáticamente.
- Write/review/execute no se ejecutan automáticamente.
- Un pending action se conserva con su preview y approval exactos.
- Resume reutiliza la misma aprobación y no crea una segunda aprobación.
- Se conservan resultados ya completados.
- Replan limitado por `maxReplans`.
- `AbortSignal` cancela el ciclo.
- `requestId` no puede ejecutarse dos veces simultáneamente en la misma instancia.
