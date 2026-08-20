# Production release checklist

## Repository

- [ ] README reviewed
- [ ] `.env.example` contains no secrets
- [ ] `.gitignore` excludes `.env`, reports and service secrets
- [ ] no database dumps committed
- [ ] CI workflow enabled
- [ ] GitHub secret scanning/push protection enabled
- [ ] main branch protected

## Local agent

- [ ] Node.js version verified
- [ ] `pnpm install`
- [ ] `pnpm typecheck`
- [ ] Rekordbox database path verified
- [ ] SQLCipher configuration verified
- [ ] initial backfill completed
- [ ] snapshot committed where applicable
- [ ] LaunchAgent installed
- [ ] environment file mode is 600
- [ ] `pnpm sync:status` reports running/healthy

## Supabase

- [ ] project linked
- [ ] migrations reviewed
- [ ] migrations applied from `supabase/migrations`
- [ ] `sync-batch` deployed
- [ ] `sync-health` deployed
- [ ] `sync-snapshot` deployed
- [ ] production `SYNC_API_KEY` configured as Supabase secret
- [ ] no privileged Supabase key placed in the Mac client environment
- [ ] production health endpoint verified

## Functional

- [ ] one new track update arrives automatically
- [ ] `sync_changes` row created
- [ ] `sync_tracks` updated
- [ ] cursor advanced
- [ ] idle cycles do not create empty batches
- [ ] service restart recovers pending changes
- [ ] replaying an accepted batch returns `duplicate=true`
- [ ] replay does not increase batch/change/idempotency counts
- [ ] latest-change integrity query returns `mismatches = 0`

## n8n final-platform gate

- [ ] durable event/outbox implemented
- [ ] webhook authentication implemented
- [ ] replay protection implemented
- [ ] delivery retry implemented
- [ ] dead-letter handling implemented
- [ ] n8n test workflow deployed
- [ ] real Rekordbox change reaches n8n
- [ ] n8n duplicate delivery is safe
- [ ] n8n outage does not lose events
