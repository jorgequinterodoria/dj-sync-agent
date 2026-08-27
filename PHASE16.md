# FASE 16 — LEARNING / PERSONALIZATION

## Scope

Build a deterministic personalization engine from durable behavioral events.

Inputs:
- plays
- skips
- accepted/rejected recommendations
- ratings
- set selections

Outputs:
- preferred genres
- avoided genres
- preferred BPM range
- preferred energy range
- preferred keys
- preferred artists
- avoided artists
- confidence per signal
- evidence counts

The engine is provider-agnostic and does not depend on N8N or an LLM.

## Supabase migration

20260827000008_learning_personalization.sql

Do not apply until local validation is green.
