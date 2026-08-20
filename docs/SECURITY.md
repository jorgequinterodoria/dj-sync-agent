# Security

## Secrets

Never commit:

- `SYNC_API_KEY`
- `REKORDBOX_DB_KEY`
- Supabase secret keys
- Supabase service-role keys
- production `.env` files
- private certificates

Supabase's current guidance is to keep secrets in project secret management and never commit `.env` files.

## Local Mac permissions

The service environment contains sensitive credentials and should be:

```text
chmod 600 ~/.config/dj-sync-agent/sync-watch.env
```

The installer already enforces restrictive permissions for the generated environment file.

## API boundary

The sync Edge Function should accept the dedicated sync secret, not a privileged Supabase database key from the Mac client.

The function itself uses server-side Supabase credentials to call privileged RPCs.

## Rotation

Rotate:

1. the sync API secret
2. any server-side privileged key if exposed
3. n8n webhook signing secrets

Do not rotate a secret by committing a replacement value into Git.

## GitHub

Before the first push:

```bash
git status
git diff -- . ':!.lock'
git grep -n -E 'dev-secret-|SERVICE_ROLE|SUPABASE_SECRET|SYNC_API_KEY=|REKORDBOX_DB_KEY=' -- . ':!docs'
```

If any real production secret is found, stop and remove it before pushing.

Also enable GitHub secret scanning/push protection where available.

## Supabase

Keep database schema changes in migrations. Once a migration-based production workflow is established, do not make direct production schema changes from the Dashboard without capturing them into migration history.

## n8n

The future webhook integration must use request authentication, timestamp validation, replay protection, and event-id idempotency.

Do not place a privileged Supabase service key into an n8n workflow unless the workflow requires it and the credential is stored in n8n's credential system.
