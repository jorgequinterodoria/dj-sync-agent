# FASE 26 — Copilot Context Assembly

## Objetivo

Construir un contexto acotado y determinista para el Copilot sin volcar toda la biblioteca, historial o memoria semántica al modelo.

## Fuentes

- Conversation Memory
- Current Track
- Library candidates
- History
- Intelligence
- Personalization
- Semantic Memory

## Preservación de fronteras

Esta fase únicamente ensambla datos ya obtenidos. No ejecuta tools, no accede directamente a Supabase y no contiene secretos.

## Budget

```text
maxMessages
maxCandidates
maxHistory
maxMemoryResults
maxContextChars
```

Las fuentes se recortan de manera determinista y el resultado registra qué fuentes fueron truncadas.

## Provider independence

El contexto no depende de OpenAI, Anthropic ni ningún provider concreto.

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
