# Phase 11 — AI Provider Layer

## Scope

This phase adds a provider-neutral AI boundary owned by the Electron/Node side of the application.

Supported providers:

- OpenAI
- Anthropic
- OpenAI-compatible endpoints

The renderer never receives provider secrets.

## Design

```text
Electron main/runtime
        |
        v
DJSyncAIService
        |
        v
AIProvider interface
   /          |          \
OpenAI    Anthropic   OpenAI-compatible
        |
        v
Future Intelligence Engine / Copilot
```

No LLM call is made automatically by startup or by the current Intelligence Engine. This phase only establishes the secure, typed provider boundary.
