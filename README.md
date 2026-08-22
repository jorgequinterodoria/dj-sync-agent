# N8n event delivery / outbox leases

This migration is the second production layer of the n8n integration.

It adds safe concurrent event claiming and delivery state to `public.sync_events`.

## What it adds

Columns:

- `lease_until`
- `locked_by`

Functions:

- `claim_sync_events(worker_id, limit, lease_seconds)`
- `mark_sync_event_delivered(event_id, worker_id)`
- `mark_sync_event_failed(event_id, worker_id, error, retryable, max_attempts, retry_delay_seconds)`
- `requeue_sync_event(event_id)`

## Concurrency model

`claim_sync_events()`:

1. returns expired `delivering` rows to `pending`;
2. selects eligible pending events in creation order;
3. locks candidates with `FOR UPDATE SKIP LOCKED`;
4. changes them to `delivering`;
5. increments `attempts`;
6. records the worker and a lease expiration;
7. returns the claimed rows.

PostgreSQL documents `SKIP LOCKED` as appropriate for queue-like tables with multiple consumers because locked rows are skipped instead of causing consumers to wait. See the PostgreSQL SELECT documentation.

## Security model

The functions use:

```sql
security definer
set search_path = ''
```

and qualify all tables with `public.`.

Execution is revoked from `public`, `anon`, and `authenticated`, and granted only to `service_role`.

This follows Supabase's documented guidance for hardened `SECURITY DEFINER` database functions.

## Apply

From the repository root:

```bash
pnpm typecheck
pnpm supabase db push
```

Then deploy the Edge Function that will call these functions.

## Verify

```sql
select
  event_id,
  status,
  attempts,
  locked_by,
  lease_until
from public.sync_events
where status in ('pending','delivering','failed','dead_letter')
order by created_at
limit 20;
```

## Safe concurrency test

Use a test event and two isolated database sessions/workers.

Both workers call:

```text
claim_sync_events(worker_id, 1, 120)
```

The same event must never be returned to both workers while the first lease is active.

## Important

This migration does NOT send anything to n8n yet.

The next stage will be the dispatcher/Edge Function that:

1. claims events;
2. signs the HTTP request;
3. sends the webhook;
4. calls `mark_sync_event_delivered()` after a valid 2xx response;
5. calls `mark_sync_event_failed()` on a failed delivery;
6. exposes metrics/health;
7. supports graceful shutdown.
