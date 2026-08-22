# Dispatcher → n8n

The dispatcher is a short-lived Supabase Edge Function. It claims pending `sync_events`, signs the transport payload with HMAC-SHA256, sends it to n8n, and marks delivery state.

Supabase documents Edge Functions as suitable for webhooks/integrations and recommends keeping server secrets in the Edge Function environment. citeturn370951search1turn370951search0

## Required production secrets

Set these in Supabase:

```text
N8N_WEBHOOK_URL
N8N_WEBHOOK_SECRET
SYNC_DISPATCHER_KEY
```

The dispatcher also uses the server-side Supabase secret key already provided to Edge Functions (`SUPABASE_SECRET_KEYS` on current projects, with legacy service-role compatibility in the code). citeturn370951search0turn370951search2

## Deployment

```bash
pnpm supabase functions deploy sync-event-dispatcher
```

## Manual invocation

```bash
curl -i -X POST   "https://<PROJECT_REF>.supabase.co/functions/v1/sync-event-dispatcher"   -H "x-dispatcher-key: <SYNC_DISPATCHER_KEY>"   -H "content-type: application/json"   --data '{}'
```

## Scheduling

Use Supabase Cron + `pg_net` to call the dispatcher periodically. Supabase documents this pattern and recommends Vault for securely storing the invocation secret. citeturn719757search0turn719757search2

For a first production setup, run every 30 seconds. The dispatcher is intentionally short-lived and processes a bounded batch.

## HMAC

The exact signed string is:

```text
timestamp + "." + rawBody
```

Algorithm:

```text
HMAC-SHA256
```

Header:

```text
X-DJ-Sync-Signature: sha256=<hex>
X-DJ-Sync-Timestamp: <unix-seconds>
```

Other headers:

```text
X-DJ-Sync-Event-Id
X-DJ-Sync-Event-Type
X-DJ-Sync-Device-Id
X-DJ-Sync-Message-Id
```

The n8n workflow must verify the signature against the **raw request body** and reject stale timestamps.

## Transport body

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventType": "track.updated",
  "occurredAt": "2026-08-20T19:33:35Z",
  "deviceId": "macbook-air-jorge-1",
  "messageId": "...",
  "cursor": {
    "rbLocalUsn": 1501923,
    "id": "210523823"
  },
  "data": {
    "trackId": "210523823",
    "trackHash": "..."
  }
}
```

The current event producer already records the event ID and metadata; the dispatcher turns it into a stable transport contract.

## Delivery rules

2xx => `delivered`

Retryable:

- 408
- 425
- 429
- 5xx
- transport failure

Anything else is treated as permanent and becomes `dead_letter`.

Retry delay is exponential with a one-hour maximum.

