# Phase 15 — Recommendations / Set Intelligence

## Scope

This phase adds a deterministic recommendation and set-intelligence layer above the existing Intelligence, Semantic Memory, Reasoning and Copilot Action layers.

The recommendation pipeline is:

Candidate Generation → Hard Constraints → Musical Scoring → History Scoring → Ranking

The engine does not invent unavailable musical signals. Missing signals receive neutral scoring rather than fabricated values.

Supported recommendation inputs include:

- BPM and BPM delta
- Camelot-style key compatibility when keys are available
- energy continuity when energy is available
- genre matching and allow/deny genre constraints
- semantic similarity
- rating and play-count engagement
- recent artist / recently played exclusions
- deterministic tie-breaking by track id

Set intelligence reports BPM range, energy curve, genre coverage, artist diversity, repeated artists and warnings.

## Supabase migration

This phase introduces:

`supabase/migrations/20260827000007_recommendations_set_intelligence.sql`

Do not deploy the migration until local validation passes.

## Edge Function

`supabase/functions/recommendations`

Deploy only after the migration is successfully applied.
