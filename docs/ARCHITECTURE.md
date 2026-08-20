# Architecture

## Local component

The macOS agent reads Rekordbox in read-only mode. It uses:

- a persistent cursor
- deterministic normalization/hashing
- batched change extraction
- a retrying HTTP client
- a macOS LaunchAgent
- filesystem events plus a polling fallback

The watcher currently supports:

```text
SYNC_WATCH_DEBOUNCE_MS  default 1500
SYNC_WATCH_RUN_ON_START default true
SYNC_WATCH_DRAIN        default false
CHANGE_BATCH_SIZE       default 500
SYNC_MAX_BATCHES        default 20
SYNC_TIMEOUT_MS         default 20000
SYNC_MAX_RETRIES        default 4
SYNC_RETRY_BASE_MS      default 1000
SYNC_WATCH_POLL_MS      default 5000
```

These defaults and supported ranges are defined in the current watcher implementation.

## Cursor contract

A cursor is:

```json
{
  "rbLocalUsn": 1501919,
  "id": "223530529"
}
```

Both fields are part of cursor identity.

The local cursor is only persisted after the server acknowledges the corresponding envelope.

## Envelope

The sync envelope is canonicalized and hashed. Message identity and idempotency are derived from the semantic payload.

The server validates:

- schema version
- message type
- message ID
- idempotency key
- payload hash
- cursor consistency
- count invariants

## Remote storage

The current production sync schema contains:

- `sync_devices`
- `sync_batches`
- `sync_changes`
- `sync_tracks`
- `sync_cursors`
- `sync_idempotency`

`sync_changes` is historical.

`sync_tracks` is the current-state projection.

`sync_cursors` is the server-side checkpoint.

## Atomic projection

For each accepted change:

```text
sync_changes
      +
sync_tracks
      +
sync_cursors
```

are handled transactionally by the ingestion function.

For `add` and `update`, `sync_tracks` is upserted.

For `delete`, the current-state row is removed.

## Snapshot

Snapshot initialization creates a full current-state dataset independently from the incremental cursor. The snapshot session is staged and committed only after all expected rows are received.

## Watcher

Chokidar watches the Rekordbox database and its SQLite companion files. A 5-second polling fallback ensures that the agent does not depend exclusively on filesystem events.

Polling is deliberately cheap: when no changes exist, the agent exits the cycle without creating an empty network batch.

## n8n future layer

The final platform layer should not make n8n the source of truth.

Recommended:

```text
Rekordbox
   ↓
Supabase sync state
   ↓
persistent event/outbox
   ↓
secure dispatcher
   ↓
n8n
```

This means n8n automation failure cannot corrupt the current synchronization state.

## Failure model

### Local database unavailable

The watch cycle records a warning and waits for the next trigger/poll.

### Lock busy

The watcher retries later rather than racing another sync process.

### Network failure

Retryable transport/server errors use exponential backoff.

### Server accepts but response is replayed

The next identical submission is handled idempotently by the server.

### Service stopped

The next service start scans from the persisted cursor.

### n8n unavailable

Future event delivery should remain pending in a persistent outbox, not disappear.
