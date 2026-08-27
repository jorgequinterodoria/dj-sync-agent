# Phase 14 — Copilot Action Engine

## Scope

This phase introduces a validated action layer between DJ reasoning and Electron execution.

Supported safe action types:

- `audio.analyze`
- `intelligence.refresh`
- `memory.index`
- `reasoning.run`

The action engine produces versioned, validated action envelopes. Review-required actions cannot execute without an approval token. Every executed action can be persisted as an auditable run.

## Supabase migration

This phase introduces:

`supabase/migrations/20260827000006_copilot_actions.sql`

Do not deploy the migration until local validation passes.

## Edge Function

`supabase/functions/copilot-actions`

Deploy only after the migration is successfully applied.
