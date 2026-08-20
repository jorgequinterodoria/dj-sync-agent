# n8n integration plan

This document defines the target interface for the final platform layer. It is intentionally marked as a design contract until the dispatcher and n8n workflow are implemented and tested end-to-end.

## Goal

Turn accepted sync changes into durable events that n8n can consume without becoming the system of record.

## Target flow

```text
Rekordbox
  ↓
sync-batch
  ↓
sync_changes + sync_tracks
  ↓
sync_events / outbox
  ↓
dispatcher
  ↓ HTTPS
n8n Webhook
  ↓
workflow
```

## Event envelope

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventType": "track.updated",
  "occurredAt": "2026-08-20T17:30:00.000Z",
  "deviceId": "macbook-main",
  "cursor": {
    "rbLocalUsn": 1502000,
    "id": "..."
  },
  "data": {
    "trackId": "..."
  },
  "delivery": {
    "attempt": 1,
    "idempotencyKey": "..."
  }
}
```

## Event types

Initial:

```text
track.added
track.updated
track.deleted
```

Future:

```text
playlist.updated
cue.updated
rating.updated
metadata.updated
```

## Security

Recommended request headers:

```text
X-Event-Id
X-Event-Type
X-Device-Id
X-Timestamp
X-Signature
```

The signature should be computed over a canonical representation such as:

```text
timestamp + "." + rawBody
```

n8n must reject:

- missing signatures
- invalid signatures
- timestamps outside the allowed replay window
- duplicate `eventId` values that have already been processed

## Delivery state

The outbox should retain:

```text
pending
delivering
delivered
failed
dead_letter
```

and track:

- attempts
- next attempt time
- last error
- delivered time

## Payload size

Prefer sending:

```json
{
  "trackId": "..."
}
```

and let the n8n workflow fetch current state from Supabase.

Do not send huge track/file arrays in every event unless the specific workflow needs them.

## First n8n workflow

```text
Webhook
  ↓
Verify signature
  ↓
Validate event schema
  ↓
Check eventId
  ↓
Fetch current track
  ↓
Business workflow
  ↓
Record success
```

## Production gate

Do not call the entire system "n8n-integrated production" until all of the following work:

- event creation is transactional with sync ingestion
- dispatcher retries
- n8n verifies authentication
- duplicate event delivery is idempotent
- n8n outage does not lose events
- dead-letter events can be inspected/replayed
- one real Rekordbox change reaches one real n8n workflow end-to-end
