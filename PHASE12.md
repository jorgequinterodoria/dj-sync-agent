# PHASE 12 — Semantic Memory / Embeddings

Introduces the semantic-memory foundation above the deterministic Intelligence Engine.

## Included

- Provider-agnostic embedding contract.
- OpenAI embedding provider with HTTPS-only transport.
- Deterministic semantic document generation with SHA-256 content hashes.
- Electron-side semantic memory service.
- Supabase durable vector memory using pgvector.
- Upsert and cosine-similarity retrieval Edge Function.
- Tests for provider, document determinism, service behavior, and configuration.

## Dimension contract

The first durable vector schema is `1536` dimensions. A provider must produce exactly that dimension before persistence.
