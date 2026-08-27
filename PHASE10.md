# DJ Sync Agent — Phase 10

## Intelligence Engine

This delivery adds a deterministic, versioned Intelligence Engine that runs in Electron and produces a structured track intelligence profile from Rekordbox metadata, analysis state, and available audio features.

### Added
- `src/intelligence/intelligence-engine.ts`
- `src/intelligence/intelligence-engine.test.ts`
- `supabase/migrations/20260827000003_intelligence_engine_profile.sql`

### Updated
- `src/runtime/dj-sync-intelligence.ts`
- `src/runtime/dj-sync-intelligence.test.ts`
- `src/runtime/dj-sync-job-runtime.ts`
- `src/jobs/job-types.ts`
- `src/jobs/job-repository.ts`
- `src/jobs/job-engine.ts`
- `src/jobs/job-engine.test.ts`
- `src/jobs/job-handlers.ts`
- `src/jobs/supabase-job-repository.ts`
- `supabase/functions/intelligence-jobs/index.ts`

### Design
The engine is deterministic and does not invent unavailable musical signals. Optional audio signals are only surfaced when corresponding persisted feature keys exist.

The computed profile is returned by the intelligence IPC snapshot and can also be persisted by the atomic Intelligence job execution RPC.

### Validation to run in the project
```bash
pnpm typecheck && \
pnpm test && \
pnpm build && \
pnpm electron:build && \
git diff --check
```

### Supabase
After local validation:
```bash
pnpm supabase db push
pnpm supabase functions deploy intelligence-jobs --no-verify-jwt
```
