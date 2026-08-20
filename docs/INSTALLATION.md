# Installation and first-time setup

This guide is the operator procedure for a new Mac.

## 1. Prerequisites

Install:

- Node.js 24.x
- pnpm
- Supabase CLI
- Rekordbox

The project was validated using Node 24.19.0.

Confirm:

```bash
node -v
pnpm -v
supabase --version
```

## 2. Clone and install

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd dj-sync-agent
pnpm install
pnpm typecheck
```

Do not continue if typecheck fails.

## 3. Local environment

Copy:

```bash
cp .env.example .env
```

Set:

```text
REKORDBOX_DB_PATH
REKORDBOX_DB_KEY
REKORDBOX_CIPHER_COMPATIBILITY
SYNC_AGENT_ID
SYNC_API_URL
SYNC_API_KEY
```

Use a unique stable `SYNC_AGENT_ID` per Mac, for example:

```text
macbook-jorge-main
```

Generate a strong production `SYNC_API_KEY`. Do not reuse development credentials.

The user-space service configuration must be stored separately at:

```text
~/.config/dj-sync-agent/sync-watch.env
```

The installer expects `SYNC_AGENT_ID` and the sync credentials to be available when installing the service.

## 4. Supabase link and migrations

```bash
pnpm supabase login
pnpm supabase link --project-ref <PROJECT_REF>
pnpm supabase db push
```

For an existing remote project that was historically modified outside migrations, reconcile the migration history before pushing. Do not continue making direct production schema changes in the SQL editor once migration-based deployment is established.

## 5. Edge Functions

Deploy the functions used by the sync core:

```bash
pnpm supabase functions deploy sync-batch
pnpm supabase functions deploy sync-health
pnpm supabase functions deploy sync-snapshot
```

Configure the production secret:

```bash
pnpm supabase secrets set SYNC_API_KEY='<LONG_RANDOM_SECRET>'
```

Verify:

```bash
pnpm supabase secrets list
```

Do not print secret values into logs or commit them.

## 6. Initial backfill

Use the guarded initial-sync CLI.

Example:

```bash
SYNC_INITIAL_CONFIRM=YES \
SYNC_INITIAL_ACTION=start \
SYNC_INITIAL_MAX_BATCHES=2 \
CHANGE_BATCH_SIZE=500 \
SYNC_AGENT_ID="YOUR_DEVICE_ID" \
SYNC_API_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-batch" \
SYNC_API_KEY="YOUR_SYNC_API_KEY" \
pnpm exec tsx src/sync/initial-sync-cli.ts
```

If the run pauses, resume:

```bash
SYNC_INITIAL_CONFIRM=YES \
SYNC_INITIAL_ACTION=resume \
SYNC_INITIAL_MAX_BATCHES=10 \
CHANGE_BATCH_SIZE=500 \
SYNC_AGENT_ID="YOUR_DEVICE_ID" \
SYNC_API_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-batch" \
SYNC_API_KEY="YOUR_SYNC_API_KEY" \
pnpm exec tsx src/sync/initial-sync-cli.ts
```

The session/checkpoint files are resumable. Do not delete them during an active backfill.

## 7. Snapshot workflow

Build the snapshot:

```bash
SNAPSHOT_PAGE_SIZE=100 \
SNAPSHOT_MAX_PAGES=1000 \
pnpm exec tsx src/sync/snapshot-build-cli.ts
```

The resulting state is persisted in:

```text
reports/rekordbox-snapshot-build-state.json
reports/rekordbox-track-snapshot.ndjson
```

When the build is complete, the snapshot sync client can upload it in batches:

```bash
SYNC_SNAPSHOT_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-snapshot" \
SYNC_SNAPSHOT_PATH="reports/rekordbox-track-snapshot.ndjson" \
SYNC_SNAPSHOT_STATE_PATH="reports/rekordbox-snapshot-sync.json" \
SNAPSHOT_BUILD_STATE_PATH="reports/rekordbox-snapshot-build-state.json" \
SYNC_SNAPSHOT_BATCH_SIZE=250 \
SYNC_AGENT_ID="YOUR_DEVICE_ID" \
SYNC_API_KEY="YOUR_SYNC_API_KEY" \
pnpm exec tsx src/sync/snapshot-sync-cli.ts
```

The snapshot must reach the remote `committed` state before relying on it as the initial current-state projection.

## 8. Install automatic watch service

Export only the values required by the installer:

```bash
export SYNC_AGENT_ID="YOUR_DEVICE_ID"
export SYNC_API_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-batch"
export SYNC_API_KEY="YOUR_SYNC_API_KEY"
```

Install:

```bash
./scripts/install-sync-service.sh
```

The service should be:

```text
com.dj-sync-agent.sync-watch
```

Configuration:

```text
~/.config/dj-sync-agent/sync-watch.env
```

Expected permissions:

```text
600
```

Logs:

```text
~/Library/Logs/dj-sync-agent/
```

## 9. Verify

```bash
set -a
source "$HOME/.config/dj-sync-agent/sync-watch.env"
set +a
pnpm sync:status
```

Expected:

```text
service.state = running
serverHealthy = true
```

Then:

```bash
tail -n 50 ~/Library/Logs/dj-sync-agent/sync-watch.log
```

An idle cycle should say:

```text
No changes detected; sync run completed without pushing an empty batch
```

It should not create repetitive empty idempotent batches.

## 10. First real change test

Make one reversible change in Rekordbox.

Do not run `pnpm sync:run` manually.

Wait for the automatic service to detect and upload it. Verify:

- a new `rb_local_usn`
- the same track hash in `sync_changes` and `sync_tracks`
- the remote cursor advances
- no duplicate batch is created

## 11. Recovery test

Stop the service:

```bash
launchctl bootout gui/$(id -u)/com.dj-sync-agent.sync-watch
```

Make one change in Rekordbox.

Verify the local database has a USN greater than the remote cursor.

Start the service again:

```bash
export SYNC_AGENT_ID="YOUR_DEVICE_ID"
export SYNC_API_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-batch"
export SYNC_API_KEY="YOUR_SYNC_API_KEY"
./scripts/install-sync-service.sh
```

The watcher should discover and transmit the pending change automatically.

## 12. Done criteria

A fresh installation is complete when:

```text
typecheck                PASS
migrations               applied
functions                deployed
initial state             committed
service                   running
server health             healthy
new change                automatic
service-stop recovery     automatic
idempotency               verified
current-state mismatch    0
```
