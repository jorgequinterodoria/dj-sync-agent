# Operations runbook

## Healthy state

Run:

```bash
set -a
source "$HOME/.config/dj-sync-agent/sync-watch.env"
set +a
pnpm sync:status
```

Healthy:

```text
service.state = running
serverHealthy = true
database.exists = true
lastError = null
```

## Logs

```bash
tail -f ~/Library/Logs/dj-sync-agent/sync-watch.log
```

Useful events:

- `Starting Rekordbox sync watch`
- `Starting automatic sync run`
- `Sync batch completed`
- `No changes detected; sync run completed without pushing an empty batch`
- `Automatic sync run failed`

## Restart service

```bash
launchctl bootout gui/$(id -u)/com.dj-sync-agent.sync-watch 2>/dev/null || true

export SYNC_AGENT_ID="YOUR_DEVICE_ID"
export SYNC_API_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-batch"
export SYNC_API_KEY="YOUR_SYNC_API_KEY"

./scripts/install-sync-service.sh
```

## Check LaunchAgent

```bash
launchctl print gui/$(id -u)/com.dj-sync-agent.sync-watch
```

## Check remote cursor

```bash
pnpm supabase db query --linked "
select
  device_id,
  rb_local_usn,
  cursor_id,
  updated_at
from public.sync_cursors
where device_id = 'YOUR_DEVICE_ID';
"
```

## Current-state integrity

This compares the most recent change per track against current state. Historical changes must not be compared one-by-one against the current projection because a track can legitimately have multiple historical versions.

```bash
pnpm supabase db query --linked "
with latest_changes as (
  select distinct on (device_id, track_id)
    device_id,
    track_id,
    action,
    track_hash,
    rb_local_usn,
    updated_at
  from public.sync_changes
  where device_id = 'YOUR_DEVICE_ID'
  order by device_id, track_id, rb_local_usn desc, updated_at desc
)
select count(*) as mismatches
from latest_changes c
left join public.sync_tracks t
  on t.device_id = c.device_id
 and t.track_id = c.track_id
where
  (
    c.action in ('add', 'update')
    and (
      t.track_id is null
      or c.track_hash is distinct from t.track_hash
      or c.rb_local_usn is distinct from t.rb_local_usn
    )
  )
  or (
    c.action = 'delete'
    and t.track_id is not null
  );
"
```

Expected:

```text
mismatches = 0
```

## Idempotency

```bash
pnpm supabase db query --linked "
select
  count(*) as batches,
  count(distinct message_id) as unique_messages
from public.sync_batches
where device_id = 'YOUR_DEVICE_ID';
"
```

and:

```bash
pnpm supabase db query --linked "
select
  count(*) as idempotency_rows,
  count(distinct idempotency_key) as unique_keys
from public.sync_idempotency
where device_id = 'YOUR_DEVICE_ID';
"
```

Healthy systems should have equal counts for rows and unique values.

## If sync appears stuck

1. Check `pnpm sync:status`.
2. Check the watcher log.
3. Check the local cursor file.
4. Check the remote cursor.
5. Check whether the local Rekordbox database has a greater `rb_local_usn`.
6. Check whether the lock directory is held by another sync.
7. Do not delete the cursor to "force" recovery unless the recovery procedure explicitly calls for it.
8. Prefer a service restart over state-file deletion.

## If the Mac was offline

The next watch cycle will scan forward from the persisted cursor. Because the cursor is only advanced after a successful server acknowledgement, changes discovered after a temporary outage can be retried after connectivity returns.

## Backup policy

Back up at least:

- the repository
- the Supabase database using your normal platform backup policy
- deployment configuration
- the production secret-management configuration
- the exact migration history

Never back up secrets into a public Git repository.

## Incident notes

Record:

- timestamp
- device ID
- local cursor before/after
- remote cursor
- last successful message ID
- last error
- whether Rekordbox was running
- whether the Mac had Internet connectivity
- whether a manual sync was executed
