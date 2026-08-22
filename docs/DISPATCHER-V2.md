# Dispatcher v2 → n8n

The dispatcher is a short-lived Supabase Edge Function.

## Two independent secrets

### 1. `SYNC_DISPATCHER_KEY`

Protects the **dispatcher invocation endpoint**.

It is sent by the scheduler/worker as:

```http
X-Dispatcher-Key: ...
```

### 2. `N8N_WEBHOOK_AUTH_KEY`

Protects the **n8n Webhook** using n8n's `Header Auth`.

The dispatcher sends:

```http
X-DJ-Sync-Dispatcher-Key: ...
```

Configure the n8n Header Auth credential with:

```text
Header Name:
X-DJ-Sync-Dispatcher-Key

Value:
same value as N8N_WEBHOOK_AUTH_KEY
```

### 3. `N8N_WEBHOOK_SECRET`

This is separate again. It signs each event:

```text
HMAC-SHA256(
  N8N_WEBHOOK_SECRET,
  timestamp + "." + rawBody
)
```

Header:

```http
X-DJ-Sync-Timestamp: <unix seconds>
X-DJ-Sync-Signature: sha256=<hex>
```

This separation means compromise of one secret does not automatically expose the other trust boundary.

## Required Supabase secrets

Set:

```text
SYNC_DISPATCHER_KEY=<scheduler-to-dispatcher secret>
N8N_WEBHOOK_URL=https://n8n.157.137.228.106.sslip.io/webhook/dj-sync
N8N_WEBHOOK_AUTH_KEY=<n8n Header Auth secret>
N8N_WEBHOOK_SECRET=<HMAC secret>
```

Supabase Edge Functions receive `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` automatically in hosted environments; the latter is privileged and must remain server-side. citeturn790735search2

Deploy:

```bash
pnpm supabase functions deploy sync-event-dispatcher
```

Supabase's production deployment flow uses the CLI to deploy individual Edge Functions. citeturn790735search0

## n8n

Webhook:

```text
Method: POST
Path: dj-sync
Authentication: Header Auth
Credential:
  Header Name: X-DJ-Sync-Dispatcher-Key
  Value: N8N_WEBHOOK_AUTH_KEY
```

Production URL:

```text
https://n8n.157.137.228.106.sslip.io/webhook/dj-sync
```

## Next layer

After the Header Auth path is proven, add the HMAC verification workflow and replay protection.

The n8n instance should reject timestamps outside a small replay window and treat `eventId` as the idempotency key.

