# Phase 31 — final checklist

Run from the root of `dj-sync-agent`:

```bash
node ./apply-phase31-final-integration.mjs
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
git --no-pager status --short
```

Expected UI after launching the packaged application:

- Dashboard opens directly into the Production DJ Workspace.
- Copilot card and composer are visible without navigating to another hidden page.
- Sync controls call the existing application lifecycle IPC.
- Library remains available.
- Audio remains available and continues to be added by `audio.ts`.
- Approval controls are only rendered for `pending` actions.

Copilot configuration for a packaged app can be placed in:

```text
~/.config/dj-sync-agent/copilot.env
```

Example:

```text
COPILOT_PROVIDER=openai
COPILOT_API_KEY=...
COPILOT_MODEL=<explicit-model>
```

The file is parsed as simple `KEY=value` data. It is not executed as a shell script. API keys never cross the preload boundary.

Phase 31 deliberately does not add real playlist/cue mutation execution. That remains in Phase 32.
