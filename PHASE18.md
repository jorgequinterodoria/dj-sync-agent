# PHASE 18 — DJ CORE / LIBRARY SERVICE CONSOLIDATION

Adds the stable application-facing DJ Core and Library Service boundary without moving Rekordbox/SQLCipher/sync implementation yet.

## Scope

- Stable `DJTrack` domain alias over `NormalizedTrack`.
- Read-only `LibraryService` over the existing sync snapshot.
- Deterministic track search and aggregate library statistics.
- `DJCore` facade consumed later by Electron, AI tools and tests.
- No Supabase migration.
- No N8N dependency.
- No change to existing sync behavior.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

## Acceptance

All commands must succeed before commit/push.
