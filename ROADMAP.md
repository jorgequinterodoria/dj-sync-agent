# ROADMAP — DJ Sync Agent v0.9.4

Hoja de ruta completa con estado por fase. Actualizado: **2026-08-28**.

## Estado global

| Progreso | Fases completadas | Próxima fase |
|---|---|---|
| **~95% (32/33 fases · Fase33 en curso)** | Fases 10–32 cerradas | **FASE 33 — Bloque 3 Supabase + Smoke Test** |

Artefacto actual verificado:
```json
{
  "version": "0.9.4",
  "channel": "release-candidate",
  "target": "mac-arm64",
  "verify_ok": true,
  "artifacts": [
    "DJ-Sync-Agent-0.9.4-mac-arm64.dmg",
    "DJ-Sync-Agent-0.9.4-mac-arm64.zip",
    "DJ-Sync-Agent-0.9.4-mac-arm64.zip.blockmap"
  ]
}
```

## Todas las fases

| # | Nombre | Documento | Estado | Última actualización |
|---|---|---|:---:|---|
| 10 | Base inicial / Estructura | [PHASE10.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE10.md) | ✅ Completa | — |
| 11 | Infraestructura Core | [PHASE11.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE11.md) | ✅ Completa | — |
| 12 | Library Domain | [PHASE12.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE12.md) | ✅ Completa | — |
| 13 | Rekordbox Extractor | [PHASE13.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE13.md) | ✅ Completa | — |
| 14 | Persistencia Supabase V1 | [PHASE14.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE14.md) | ✅ Completa | — |
| 15 | Sync Engine (Atómico) | [PHASE15.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE15.md) | ✅ Completa | — |
| 16 | Electron Shell inicial | [PHASE16.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE16.md) | ✅ Completa | — |
| 17 | Renderer Legacy UI | [PHASE17.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE17.md) | ✅ Completa | — |
| 18 | Config / Secrets / IPC Safety | [PHASE18.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE18.md) | ✅ Completa | — |
| — | — | — | — | — |
| 22 | Audio Analysis | [PHASE22.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE22.md) | ✅ Completa | — |
| 23 | Playlist / Cue Core | [PHASE23.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE23.md) | ✅ Completa | — |
| 24 | Audio Library + Player | [PHASE24.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE24.md) | ✅ Completa | — |
| 25 | Recommendations | [PHASE25.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE25.md) | ✅ Completa | — |
| 26 | Set Builder + Boundary | [PHASE26.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE26.md) | ✅ Completa | 2026-08-27 |
| 27 | Context Injection | [PHASE27.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE27.md) | ✅ Completa | 2026-08-27 |
| 28 | Autonomous Copilot E2E | [PHASE28.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE28.md) | ✅ Completa | 2026-08-27 |
| 29 | Security Hardening | [PHASE29.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE29.md) | ✅ Completa | 2026-08-27 |
| 30 | Reliability + Quality | [PHASE30.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE30.md) | ✅ Completa | 2026-08-27 |
| 31 | Integración UI Real + Gaps 31-A/B/C/D | [PHASE31_COMPLETE.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE31_COMPLETE.md) | ✅ Completa | **2026-08-28** |
| 32 | Release Candidate / Packaging | [PHASE32.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE32.md) | ✅ Completa | **2026-08-28** |
| **33** | **Production Release** | [PHASE33.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE33.md) | **🟡 En progreso** | **2026-08-28** |

## Detalle FASE 33 — Production Release (en curso)

Bloques funcionales:

| # | Bloque | Estado | Código implementado |
|---|---|:---:|---|
| 1 | **Publicación en GitHub Releases** | 🟢 **Configurado** | ✅ [electron-builder.yml#L41-L66](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/electron-builder.yml#L41-L66)<br>✅ `dmg.writeUpdateInfo: true` (genera `latest-mac.yml`)<br>✅ `publish: github` (vars env `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME`) |
| | | | ✅ [package.json#L35](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/package.json#L35) añadido script `electron:publish:mac` |
| | | | 📋 Pasos para publicar (primera vez):<br> 1. `export GH_TOKEN=ghp_xxx; GITHUB_REPO_OWNER=jorgequintero; GITHUB_REPO_NAME=dj-sync-agent`<br> 2. `git add -A && git commit -m "release v0.9.4"`<br> 3. `git tag -a v0.9.4 -m "Release v0.9.4"` · `git push --follow-tags`<br> 4. `pnpm electron:publish:mac` |
| 2 | **Auto-updater (electron-updater)** | 🟢 **Implementado** | ✅ [package.json#L45](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/package.json#L45) dep `electron-updater@^6.3.9` |
| | | | ✅ [src/electron/auto-updater.ts](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/electron/auto-updater.ts) **NUEVO**: `configureAutoUpdater()` · skip en dev · check a 5s · logs pino · `autoInstallOnAppQuit` · sin descarga automática |
| | | | ✅ [main.ts#L59-L61](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/electron/main.ts#L59-L61) import + [main.ts#L302-L306](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/src/electron/main.ts#L302-L306) llamada tras `createMainWindow()` |
| 3 | **Supabase PROD push** | ⏳ Espera confirmación | ¿Tienes project-ref PROD listo? Hacer `supabase link --project-ref XXX` + `db push` + deploy 12 functions SIN --no-verify-jwt |
| 4 | **Smoke Test GUI** | ⏳ Pendiente de package publicado | 5 items: Install clean · Copilot config OK · Now Playing · Approval flow · Audio playback |

### Workaround Gatekeeper macOS (sin Apple Developer ID)

Como no hay cuenta Apple Developer, la build **no está firmada/notarizada**. Primera apertura:
- **Ctrl+Clic** sobre `.app` → **Abrir** → confirmar 2 veces
- O en terminal: `xattr -dr com.apple.quarantine /Applications/DJ\ Sync\ Agent.app`

## Detalle de cierre últimas fases

### ✅ FASE 31 — Integración UI Real (2026-08-28)

Condiciones de cierre 100% pasadas:

- Gap 31-A · Now Playing via CustomEvent
- Gap 31-B · IPC getPending + mapeo `ProductionActionPreview`
- Gap 31-C · Null-safety renderer legacy (sin warnings en DevTools)
- Gap 31-D · Approve/Reject binding preview.id ↔ approvalId (resuelto internamente en controller)
- Quality gates: `pnpm typecheck` OK · 265/265 tests OK · `pnpm build` OK · `electron:build` OK · `git diff --check` OK.

### ✅ FASE 32 — Release Candidate (2026-08-28)

Condiciones de cierre 100% pasadas:

```bash
pnpm electron:package:mac
pnpm exec tsx scripts/verify-release-artifacts.ts  # → ok: true
```

Artefactos en `release/`:

| Artefacto | Tamaño | Uso |
|---|---:|---|
| `DJ-Sync-Agent-0.9.4-mac-arm64.dmg` | 132,1 MB | Instalador usuarios finales |
| `DJ-Sync-Agent-0.9.4-mac-arm64.zip` | 132,2 MB | Auto-updater (Squirrel) |
| `DJ-Sync-Agent-0.9.4-mac-arm64.zip.blockmap` | 136 KB | Delta updates |

### ⏳ FASE 33 — Production Release

Bloques funcionales a definir en [PHASE33.md](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/PHASE33.md):

1. **Firma y Notarización Apple** — credenciales App Store Connect (`APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, keyfile).
2. **Publicación de artefactos** — GitHub Releases vía `electron-builder --publish always`.
3. **Auto-updater** — integración `electron-updater` (provider generic/GitHub).
4. **Supabase PROD push** — migraciones audit + edge functions copilot-action-audit sin `--no-verify-jwt`.
5. **Smoke test final** — instalación DMG firmado + flujo GUI completo.

## Calidad garantizada (último benchmark 2026-08-28)

| Medida | Valor |
|---|---:|
| Tests pass | **265 / 265** |
| Cobertura aproximada | ≥ 80% |
| TypeScript noEmit | 0 errores |
| `git diff --check` | 0 whitespace issues |
| Build reproducibilidad | `tsc -p tsconfig.build.json` determinista |
