# FASE 28 — Tool-Driven Copilot

## Objetivo

Añadir una capa determinista de selección, planificación y reutilización de resultados de tools sin acoplar el Agent a Core o Supabase.

## Componentes

- `ToolSelectionPolicy`
- `ToolPlan`
- `ToolResultMemory`
- `DJSyncToolOrchestrator`

## Reglas

- Read tools están permitidas por defecto.
- Write/review requieren una política explícita.
- Tools desconocidas quedan bloqueadas.
- Los planes tienen IDs únicos.
- Las dependencias solo pueden apuntar a pasos anteriores.
- Resultados idénticos pueden reutilizarse dentro del contexto del orquestador.
- No se ejecutan tools directamente desde el modelo.
- Toda ejecución sigue pasando por `ToolRegistry`.
- No hay acceso SQL/Supabase desde esta capa.

## Supabase

No hay migraciones.
No ejecutar `pnpm supabase db push`.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```
