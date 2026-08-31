# FASE 33 — Production Release

> Versión adaptada al scope del proyecto: **Sin Apple Developer ID / Sin App Store / Sí GitHub Releases + Auto-Updater**.
> Actualizado: 2026-08-28.

---

## Objetivo

Llevar el Release Candidate de **Fase 32** a una build **publicada en GitHub Releases** y **auto-actualizable**. No se requiere firma ni notarización Apple. El producto final es distribuible y funcional; la primera apertura en macOS requiere un workaround de Gatekeeper (Ctrl+Clic → Abrir) o `xattr`.

---

## Baseline (entregado por Fases 31 + 32)

Artefactos ya producidos en `release/` y validados con `verify-release-artifacts.ts`:

| Artefacto | Tamaño | Status |
|---|---:|:---:|
| `DJ-Sync-Agent-0.9.4-mac-arm64.dmg` | 132,1 MB | Instalable + distribuible (no firmado) |
| `DJ-Sync-Agent-0.9.4-mac-arm64.zip` | 132,2 MB | Base para auto-updater (checksum via latest-mac.yml) |
| `DJ-Sync-Agent-0.9.4-mac-arm64.zip.blockmap` | 136 KB | Delta updates |

### Workaround Gatekeeper macOS

**No se tiene Apple Developer ID. La app no estará firmada/notarizada.** Los usuarios finales deben hacer UNA de estas dos cosas la primera vez que abran la app instalada:

**Opción A (Interfaz gráfica, recomendada para usuarios):**
1. Copiar `DJ Sync Agent.app` a `/Applications`.
2. Sobre el `.app` **Ctrl+Clic** → menú contextual → **Abrir** (no doble clic normal).
3. En el diálogo de warning, pulsar **Abrir** una segunda vez.
4. A partir de este momento, la app se abrirá siempre sin avisos.

**Opción B (Terminal, para distribuciones automatizadas o MDM):**
```bash
xattr -dr com.apple.quarantine /Applications/DJ\ Sync\ Agent.app
```

Este paso NO es necesario si ejecutas la app desde el build local (`pnpm electron`). Solo afecta al `.dmg` instalado por un tercero.

---

## Configuración actual

Fuentes: [electron-builder.yml](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/electron-builder.yml), [package.json](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/package.json#L30-L39).

### `electron-builder.yml` actual

```yaml
appId: com.djsync.agent
productName: DJ Sync Agent
artifactName: DJ-Sync-Agent-${version}-${os}-${arch}.${ext}
directories.output: release
asar: true
asarUnpack: ["**/*.node", "**/node_modules/@journeyapps/sqlcipher/**"]

mac:
  target: [dmg, zip]
  category: public.app-category.music
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.inherit.plist
  gatekeeperAssess: false         # OK: skip firmar sin Apple ID (si fuera true exigiría notarizado)

dmg:
  writeUpdateInfo: false          # PASARÁ a true para generar latest-mac.yml

publish: null                     # SE REEMPLAZARÁ por publish: github
```

### Scripts actuales

```json
"electron:package":     "pnpm electron:build && electron-builder --config electron-builder.yml --publish never",
"electron:package:mac": "pnpm electron:build && electron-builder --config electron-builder.yml --mac --publish never",
"electron:release-check": "...verify-release-artifacts.ts && git diff --check"
```

---

## Bloque 1 · Publicación en GitHub Releases

### Propósito

Subir `.dmg`, `.zip`, `.blockmap` y `latest-mac.yml` a un Release de GitHub cada vez que se empaquete una versión.

### Prerrequisitos

1. Repositorio GitHub existente con un `owner` y `repo` conocidos.
2. **GitHub Personal Access Token (PAT, classic)** con scope `repo` → `ghp_xxxxxxxxxxxxxxxxxxxx`.
3. Token secreto NO se commitea al repo; se exporta en el shell del build.

### Tareas

1. **En el build machine**, exportar variables (añadir a `~/.zshrc` o similar sin commitear):
   ```bash
   export GH_TOKEN=ghp_REEMPLAZA_ESTO_POR_TU_TOKEN
   export GITHUB_REPO_OWNER=jorgequintero              # <-- tu usuario u organización de GitHub
   export GITHUB_REPO_NAME=dj-sync-agent               # <-- nombre exacto del repo
   ```

2. **Editar [electron-builder.yml](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/electron-builder.yml)** y aplicar estos 2 cambios:
   ```yaml
   dmg:
     writeUpdateInfo: true          # Antes: false. Ahora sí → genera latest-mac.yml
   ```
   ```yaml
   publish:
     - provider: github
       owner:    ${env.GITHUB_REPO_OWNER}
       repo:     ${env.GITHUB_REPO_NAME}
       vPrefixedTagName: true       # tags: v0.9.4
       releaseType: release         # draft | prerelease | release
   ```

3. **Añadir script publish** en [package.json](file:///Users/jorgequintero/Documents/GitHub/dj-sync-agent/package.json#L35):
   ```json
   "electron:publish:mac": "pnpm electron:build && electron-builder --config electron-builder.yml --mac --publish always"
   ```

4. **Taggear y publicar versión** (ejemplo primera vez):
   ```bash
   # 1. Commitear cambios de config
   git add electron-builder.yml package.json pnpm-lock.yaml
   git commit -m "release(phase33): config github publish + auto-updater v0.9.4"

   # 2. Tag semver (IMPORTANTE: el tag DEBE coincidir con version en package.json; prefijo v)
   git tag -a v0.9.4 -m "Release v0.9.4 - Production Release (unsigned, GitHub dist)"
   git push --follow-tags origin HEAD

   # 3. Construir y PUBLICAR a GitHub Releases:
   pnpm electron:publish:mac
   ```

   → Esto:
   - Construye `release/*.dmg`, `*.zip`, `*.blockmap`.
   - Crea el Release `v0.9.4` en GitHub (nivel: `release`).
   - Sube los 4 artefactos + `latest-mac.yml` (manifest de actualización).

5. **Validar** (una vez subido):
   - Abrir URL `https://github.com/<OWNER>/<REPO>/releases/tag/v0.9.4`.
   - Deben aparecer 5 assets listados.
   - Descargar `latest-mac.yml` y confirmar que `version: 0.9.4`, `path: DJ-Sync-Agent-0.9.4-mac-arm64.zip` y que tiene un bloque `sha512: ...` (es el checksum que usa el auto-updater para integridad).

### Condición de cierre Bloque 1

```text
Release de GitHub v0.9.4 publicado con 5 assets:
  • DJ-Sync-Agent-0.9.4-mac-arm64.dmg
  • DJ-Sync-Agent-0.9.4-mac-arm64.zip
  • DJ-Sync-Agent-0.9.4-mac-arm64.zip.blockmap
  • latest-mac.yml
  • (opcional) SHA256SUMS.txt
latest-mac.yml contiene: version, path, sha512.
```

---

## Bloque 2 · Auto-Updater (electron-updater)

### Propósito

Que la app compruebe periódicamente si existe una versión nueva en `latest-mac.yml` de GitHub. Si la hay, avisa al usuario y descarga el `.zip` delta; se instala automáticamente al salir y reabrir la app.

Garantías de seguridad SIN firma Apple:
- El archivo `latest-mac.yml` se descarga por HTTPS desde `api.github.com` (canal auténtico).
- El `.zip` descargado se valida contra el campo `sha512` de `latest-mac.yml`. Si el checksum no cuadra, el auto-updater aborta la actualización.

### Tareas

1. **Añadir dependencia al proyecto**:
   ```bash
   pnpm add electron-updater
   ```

2. **Crear nuevo módulo `src/electron/auto-updater.ts`** con implementación mínima pero correcta (check a los 5 s, logs, sin IPC renderer por ahora). Se integra en `main.ts`.

3. **Editar `src/electron/main.ts`**:
   - Importar `configureAutoUpdater`.
   - Llamar a `configureAutoUpdater()` dentro de `app.whenReady().then(...)`.

4. **Comportamiento**:
   - En `dev` (`!app.isPackaged`) → skip completo.
   - En `packaged` (`release/mac-arm64/...app`) → a los 5 segundos de abrir:
     - consulta `latest-mac.yml` del Release GitHub.
     - si `latest.version > packageJson.version` → log `[updater] Nueva versión disponible: vX.Y.Z`.
     - `autoDownload = false` (se activa en próximas iteraciones si quieres descargar sin preguntar).
     - `autoInstallOnAppQuit = true` (tras descargar manualmente + salir, se instala).

### Prueba manual de auto-updater (requiere Bloque1 publicado)

1. Publica `v0.9.4` con Bloque 1.
2. Instálala desde `.dmg`.
3. Abre `/Applications/DJ Sync Agent.app` (con Ctrl+Clic la primera vez).
4. Abre DevTools (Cmd+Opt+I) → Console / View → Toggle Developer Tools.
5. Espera 5 segundos. Debes ver el log: `[updater] App al día.` (porque es igual que latest).
6. Para probar **update available**:
   - Modifica localmente `package.json → version = "0.9.3"`, rebuild package `v0.9.3` con el mismo auto-updater code, instálala (NO publiques 0.9.3 en GitHub; la latest en GH debe seguir siendo 0.9.4).
   - Abre esta build `0.9.3` → tras 5s verás `[updater] Nueva versión disponible: v0.9.4`.

### Condición de cierre Bloque 2

```text
1. Log "[updater] Skipping auto-updater in dev mode." al arrancar pnpm electron.
2. Log "[updater] App al día." en la build empaquetada con version == latest GH.
3. Log "[updater] Nueva versión disponible: v0.9.4." en build empaquetada con version < latest GH.
4. No rompen los 265 tests unitarios (auto-updater code tiene early return).
```

---

## Bloque 3 · Supabase PROD push — PREGUNTAR ANTES DE EJECUTAR

### Propósito

Cambiar backend local → PROD real en https://supabase.com/dashboard/project/<REF>.

### Tareas generales (solo ejecutar tras confirmación explícita)

1. Exportar en shell del developer:
   ```bash
   export SUPABASE_URL=https://TU-REF.supabase.co
   export SUPABASE_ANON_KEY=eyJhbGciOi... (key anónima PROD)
   ```

2. Link project + push migraciones:
   ```bash
   pnpm supabase link --project-ref TU-REF
   pnpm supabase db push
   ```

3. Deploy 12 Edge Functions PROD **CON JWT activo**:
   ```bash
   pnpm supabase functions deploy copilot-action-audit      # SIN --no-verify-jwt
   pnpm supabase functions deploy copilot-actions
   pnpm supabase functions deploy conversation-memory
   pnpm supabase functions deploy intelligence-jobs
   pnpm supabase functions deploy personalization
   pnpm supabase functions deploy reasoning
   pnpm supabase functions deploy recommendations
   pnpm supabase functions deploy semantic-memory
   pnpm supabase functions deploy sync-batch
   pnpm supabase functions deploy sync-event-dispatcher
   pnpm supabase functions deploy sync-health
   pnpm supabase functions deploy sync-snapshot
   ```

### Por qué se ejecuta después de confirmar

- Implica escribir a un proyecto PROD con datos reales (no local ni test).
- Si el proyecto Supabase PROD no existe o no está enlazado, fallaría.
- El usuario podría querer usar backend local indefinidamente.

---

## Bloque 4 · Smoke Test GUI Final (manual)

Se ejecuta **tras instalar la app desde el `.dmg` publicado en GH** (NO desde `pnpm electron`).

### Checklist 5 puntos

1. ✅ Instalación clean: borrar app anterior, montar DMG, arrastrar a Applications, **Ctrl+Clic → Abrir** la primera vez. App inicia sin crash.
2. ✅ Configuración Copilot: `~/.config/dj-sync-agent/copilot.env` presente. Chat devuelve respuestas reales del proveedor IA.
3. ✅ Now Playing: navegar Library → seleccionar track → Dashboard → tarjeta Now Playing muestra título / artista / BPM / key correctos.
4. ✅ Approve/Reject (si existe acción pending): Approval Card visible SOLO si status es `pending`. Approve → acción desaparece.
5. ✅ Audio playback: reproducir cualquier track desde Library → audio sin cortes.

---

## Condiciones de Cierre FASE 33

### Mandatorias (100% pasadas)

| # | Item | Status |
|---|---|:---:|
| 1 | Bloque 1 Publicación GH: Release `v0.9.4` con 5 assets (dmg/zip/blockmap/latest-mac.yml) | ⏳ |
| 2 | Bloque 2 Auto-updater integrado + 3 logs OK (dev skip, misma versión, nueva versión) | ⏳ |
| 3 | Bloque 4 Smoke Test GUI: 5/5 items OK en build instalada desde DMG GH | ⏳ |
| 4 | Calidad: `pnpm typecheck` exit 0 | ✅ |
| 5 | Calidad: `pnpm test` 265/265 tests pass | ✅ |
| 6 | Calidad: `pnpm electron:release-check` exit 0 (verify sin firmar) | ✅ |
| 7 | Calidad: `git diff --check` exit 0 | ✅ |

### Condicional (tras confirmación)

| # | Item | Status |
|---|---|:---:|
| 8 | Bloque 3 Supabase PROD push + 12 Edge Functions deployadas con JWT. | ⏳ Espera confirmación |

### Diferidas (opcional, Fase 34+)

- Firma/notarización Apple (requiere cuenta Apple Developer ~99 USD/año).
- Builds multi-platform (Linux AppImage, Windows NSIS).
- CI/CD GitHub Actions (tag `v*` → build + publish automático).
- Modal renderer "Hay una nueva versión / Descargar / Ahora no".
- Telemetría GDPR-friendly (PostHog / Sentry).

---

## Estado actual (antes de ejecutar la fase): **⏳ Iniciando**

Siguiente paso programado de esta Fase 33 (si autorizas):

```bash
# Bloque 1, paso 2 (archivos) + paso 3 (script)
# En electron-builder.yml activar dmg.writeUpdateInfo y publish:github
# En package.json añadir electron:publish:mac
```
