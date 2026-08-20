# Command reference

The exact command names below reflect the workflow validated during the production sync-core build.

## Verification

```bash
pnpm typecheck
pnpm sync:status
```

## Initial backfill

```bash
pnpm exec tsx src/sync/initial-sync-cli.ts
```

Use the guarded environment variables:

```text
SYNC_INITIAL_CONFIRM=YES
SYNC_INITIAL_ACTION=start|resume
SYNC_INITIAL_MAX_BATCHES=<number>
```

## Incremental run

```bash
pnpm sync:run
```

Useful runtime overrides:

```text
CHANGE_BATCH_SIZE
SYNC_MAX_BATCHES
SYNC_TIMEOUT_MS
SYNC_MAX_RETRIES
SYNC_RETRY_BASE_MS
```

## Automatic watch service

```bash
pnpm sync:status
./scripts/install-sync-service.sh
```

Service label:

```text
com.dj-sync-agent.sync-watch
```

## Snapshot build

```bash
pnpm exec tsx src/sync/snapshot-build-cli.ts
```

## Snapshot sync

```bash
pnpm exec tsx src/sync/snapshot-sync-cli.ts
```

## Pagination verification

```bash
CHANGE_BATCH_SIZE=500 pnpm verify:pagination
```

## Supabase

```bash
pnpm supabase db push
pnpm supabase functions deploy sync-batch
pnpm supabase functions deploy sync-health
pnpm supabase functions deploy sync-snapshot
```
