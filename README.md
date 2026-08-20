# DJ Sync Agent

Reliable macOS synchronization between Rekordbox and a remote Supabase backend.

The current production-ready scope is the **Rekordbox → Supabase synchronization core**. It is designed for a Mac that is online while Rekordbox is being used and includes persistent cursors, incremental synchronization, idempotency, snapshot ingestion, automatic macOS service execution, retry handling, and recovery after service restarts.

> **Important:** The n8n integration is the next platform layer. The repository should not be described as "fully n8n-integrated" until the event-dispatch/webhook layer and its end-to-end tests are implemented.

## What this project does

- Reads the Rekordbox SQLCipher database in read-only mode.
- Extracts normalized track metadata and related files/cues/playlists.
- Performs a full initial backfill.
- Builds and uploads a complete snapshot.
- Detects incremental Rekordbox changes using `rb_local_usn` plus the cursor ID.
- Sends signed/canonicalized sync envelopes to Supabase Edge Functions.
- Stores accepted batches, change history, current track state, cursors, and idempotency keys remotely.
- Applies `add` / `update` / `delete` changes to the current `sync_tracks` projection in the same transaction as the change history.
- Runs automatically through a macOS LaunchAgent.
- Uses Chokidar plus polling fallback for Rekordbox database activity.
- Persists the local cursor so changes survive restarts.
- Retries retryable HTTP/network failures with exponential backoff.
- Avoids sending empty batches when no changes exist.
- Recovers changes that happened while the service was stopped.
- Exposes a health/status command for operators.

## Verified production behavior

The current implementation has been validated against a real Rekordbox database with:

- 33,653 active tracks in the snapshot.
- 33,653 unique track IDs in the remote current-state table.
- Pagination verification with 68,213 scanned rows and zero duplicate IDs.
- Incremental changes applied to `sync_changes`, `sync_tracks`, and `sync_cursors`.
- Recovery after the macOS service was stopped while a new Rekordbox change was created.
- Repeat submission of an already accepted batch returned `accepted=true` and `duplicate=true` without increasing the batch/change/idempotency counts.
- Empty polling cycles no longer send empty envelopes to the API.

## Architecture

```text
                macOS
     ┌──────────────────────────┐
     │        Rekordbox         │
     │      master.db           │
     └────────────┬─────────────┘
                  │
                  ▼
     ┌──────────────────────────┐
     │     DJ Sync Agent         │
     │                          │
     │ extractor / normalizer   │
     │ cursor / change processor │
     │ watcher + polling        │
     │ retry / idempotency      │
     └────────────┬─────────────┘
                  │ HTTPS
                  ▼
     ┌──────────────────────────┐
     │ Supabase Edge Functions   │
     │ sync-batch / snapshot /  │
     │ sync-health               │
     └────────────┬─────────────┘
                  │
         ┌────────┼─────────┐
         ▼        ▼         ▼
  sync_batches sync_changes sync_tracks
                  │
                  ▼
             sync_cursors
```

The local cursor is the authoritative checkpoint for what the Mac has successfully acknowledged as delivered. Remote cursor advancement occurs only after the server accepts the batch.

## Requirements

Recommended/validated environment for this project:

- macOS
- Node.js 24.x
- pnpm
- Rekordbox installed and its database accessible to the current macOS user
- Supabase CLI
- A Supabase project with the Edge Functions and migrations deployed
- Internet connectivity while Rekordbox is in active use

The current project was validated with Node `24.19.0`.

## Quick start for a new Mac

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd dj-sync-agent
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

Start from:

```bash
cp .env.example .env
```

Edit the values for the local Mac and production Supabase project.

Never commit `.env`.

### 4. Verify the project

```bash
pnpm typecheck
```

### 5. Configure Supabase

Log in and link the repository:

```bash
pnpm supabase login
pnpm supabase link --project-ref <YOUR_PROJECT_REF>
```

Apply migrations:

```bash
pnpm supabase db push
```

Deploy the Edge Functions used by the current sync core:

```bash
pnpm supabase functions deploy sync-batch
pnpm supabase functions deploy sync-health
pnpm supabase functions deploy sync-snapshot
```

Set the production secret used by the Edge Functions:

```bash
pnpm supabase secrets set SYNC_API_KEY='<LONG_RANDOM_PRODUCTION_SECRET>'
```

Do not place Supabase secret/service-role credentials in the Mac's client-side `.env` unless a command explicitly requires them. Supabase recommends keeping production secrets in its secrets management and never committing `.env` files. See the official Supabase secret-management guidance.

### 6. First initialization

The project contains a guarded initial backfill flow. Follow the exact command documented in `docs/INSTALLATION.md`.

The initial backfill is intentionally resumable. A paused run can be resumed using the persisted session and checkpoint.

### 7. Build the complete snapshot when required

The snapshot pipeline can build the current active track state into NDJSON and upload it in batches. The snapshot workflow is independent from the normal incremental cursor and should be used when initializing a new remote current-state dataset.

See `docs/INSTALLATION.md`.

### 8. Install the automatic macOS service

Set the required shell variables:

```bash
export SYNC_AGENT_ID="macbook-<stable-id>"
export SYNC_API_URL="https://<PROJECT_REF>.supabase.co/functions/v1/sync-batch"
export SYNC_API_KEY="<PRODUCTION_SECRET>"
```

Then:

```bash
./scripts/install-sync-service.sh
```

The installer creates/uses the user configuration at:

```text
~/.config/dj-sync-agent/sync-watch.env
```

The production environment file must remain private and should have mode `600`.

Logs are written under:

```text
~/Library/Logs/dj-sync-agent/
```

### 9. Verify automatic operation

Load the same environment used by the service:

```bash
set -a
source "$HOME/.config/dj-sync-agent/sync-watch.env"
set +a

pnpm sync:status
```

A healthy installation should report:

```text
service.state   = running
serverHealthy   = true
```

Do not treat an old `reports/rekordbox-sync-status.json` as proof that the LaunchAgent is running; the `service` section and server health must be checked.

## Service management

Stop:

```bash
launchctl bootout gui/$(id -u)/com.dj-sync-agent.sync-watch 2>/dev/null || true
```

Start/reinstall:

```bash
./scripts/install-sync-service.sh
```

Inspect:

```bash
launchctl print gui/$(id -u)/com.dj-sync-agent.sync-watch
```

Watch logs:

```bash
tail -f ~/Library/Logs/dj-sync-agent/sync-watch.log
```

## Common verification commands

Typecheck:

```bash
pnpm typecheck
```

Status:

```bash
set -a
source "$HOME/.config/dj-sync-agent/sync-watch.env"
set +a
pnpm sync:status
```

Remote track count:

```bash
pnpm supabase db query --linked "
select
  count(*) as tracks,
  count(distinct track_id) as unique_tracks
from public.sync_tracks
where device_id = 'YOUR_DEVICE_ID';
"
```

Remote cursor:

```bash
pnpm supabase db query --linked "
select
  rb_local_usn,
  cursor_id,
  updated_at
from public.sync_cursors
where device_id = 'YOUR_DEVICE_ID';
"
```

## Security

Never commit:

- `SYNC_API_KEY`
- `REKORDBOX_DB_KEY`
- Supabase service-role/secret keys
- `.env`
- `~/.config/dj-sync-agent/sync-watch.env`
- private certificates
- local database dumps

Production Edge Function secrets belong in Supabase secret management. The Edge Function must keep privileged Supabase secret keys server-side only.

Before publishing to GitHub, run the secret scan described in `docs/GITHUB-PUBLISH.md`.

## n8n integration

The final platform architecture is intended to add:

```text
Supabase
   ↓
persistent event record
   ↓
secure event dispatcher
   ↓
n8n webhook
   ↓
automation workflows
```

The n8n layer should use:

- persistent event IDs
- event type/version
- HMAC signature or equivalent request authentication
- replay protection
- idempotent workflow handling
- retry/dead-letter handling
- current-state lookup from Supabase rather than sending unnecessarily large track payloads

See `docs/N8N-INTEGRATION.md`.

## Production release policy

Do not declare a release "production" until:

1. `pnpm typecheck` passes.
2. Supabase migrations are reviewed and deployed from migration files.
3. Edge Functions are deployed from source.
4. Production secrets are configured in Supabase.
5. `.env` and secret files are excluded from Git.
6. A clean macOS installation has completed the documented setup.
7. The LaunchAgent survives restart and starts automatically.
8. A new Rekordbox change is observed without manually running `pnpm sync:run`.
9. A change made while the service is stopped is recovered automatically after restart.
10. Replaying an accepted batch returns `duplicate=true` without creating new rows.
11. Current-state integrity checks report zero mismatches.
12. The n8n event pipeline is implemented and tested before marketing the whole project as "n8n-integrated".

## License

Add the license you choose before publishing the public repository.
