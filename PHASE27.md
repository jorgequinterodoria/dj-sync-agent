# FASE 27 — Inyección de Contexto en Copilot Agent

## Objetivo

Conectar `CopilotContextAssembler` con el ciclo real de `CopilotAgent` sin hacer que el agente conozca Core, Supabase, SQL, Semantic Memory o servicios concretos.

## Arquitectura

```text
CopilotAgent
    ↓
CopilotContextProvider
    ↓
CopilotContextAssembler
    ↓
Core / Intelligence / Memory
```

El agente recibe únicamente el contrato `CopilotContextProvider`.

## Inyección

El contexto se inserta como un mensaje `system` versionado:

```text
DJ_COPILOT_CONTEXT_V1
{bounded context}
END_DJ_COPILOT_CONTEXT_V1
```

La solicitud del usuario permanece como mensaje `user` separado.

## Reglas

- El Agent no accede a fuentes directamente.
- El contexto se construye antes de la primera llamada al modelo.
- El contexto conserva los límites de Fase 26.
- Los tool calls continúan pasando por `ToolRegistry`.
- No se introducen API keys ni secretos.
- No hay acceso SQL ni Supabase desde el Agent.
- Provider agnostic.

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
