# Phase 13 — DJ Reasoning Engine

## Delivery

Adds a provider-agnostic structured DJ reasoning core above the Intelligence Engine and Semantic Memory layers.

The engine:

- accepts track intelligence plus semantic-memory context;
- constructs a deterministic reasoning prompt;
- requires structured JSON output;
- validates and clamps model output;
- produces versioned reasoning results;
- optionally persists reasoning history through Supabase.

No N8N dependency is introduced.

## Supabase migration

New migration:

`20260827000005_dj_reasoning.sql`

**Do not run `pnpm supabase db push` until the local validation is green.**

## Supabase function

`supabase/functions/reasoning`

Authentication uses the existing `SYNC_API_KEY` secret, while the function uses the Supabase service-role key internally for the protected RPC.
