# GitHub publishing procedure

The repository owner should execute these steps locally.

## 1. Confirm no secrets

```bash
git status
git diff
```

Search:

```bash
git grep -n -E 'dev-secret-|SYNC_API_KEY=|REKORDBOX_DB_KEY=|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY'
```

Do not push if real secrets appear.

## 2. Add safe configuration files

The repository should include:

```text
.env.example
docs/
.github/workflows/ci.yml
.gitignore
README.md
```

Do not include:

```text
.env
~/.config/dj-sync-agent/sync-watch.env
reports/
local database copies
production exports
```

## 3. Add and commit

```bash
git add README.md .env.example .gitignore docs .github
git add src supabase scripts package.json pnpm-lock.yaml
git status
git commit -m "prepare production sync core"
```

## 4. Create GitHub repository

Create an empty repository. Do not let GitHub generate a second README or license if the repository already contains those files.

## 5. Push

```bash
git remote add origin <YOUR_REPOSITORY_URL>
git branch -M main
git push -u origin main
```

## 6. Enable repository protections

Recommended:

- private repository during beta
- secret scanning/push protection
- required CI checks on `main`
- pull requests for changes
- protected `main`
- no force pushes to `main`

## 7. Release tag

After production verification:

```bash
git tag -a v1.0.0 -m "production sync core"
git push origin v1.0.0
```

Do not use `v1.0.0` for the full n8n platform until the n8n event layer is also production-tested.
