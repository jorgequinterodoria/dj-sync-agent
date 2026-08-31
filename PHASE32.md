# FASE 32 — Release Candidate / Packaging

## Objetivo

Convertir el build actual de Electron en artefactos de distribución reproducibles, sin introducir todavía la publicación final de Fase 33.

## Baseline

La aplicación compila actualmente a `dist`, y el entrypoint de Electron se encuentra bajo `dist/electron`. El proyecto existente usa Electron como dependencia de desarrollo y `electron:build` como paso de compilación de Electron. fileciteturn120file0L38-L43

## Packaging

Esta fase usa `electron-builder`.

Targets configurados:

- macOS: DMG + ZIP;
- Linux: AppImage;
- Windows: NSIS.

La configuración mantiene `asar` activado y desempaqueta los módulos nativos `.node` y `@journeyapps/sqlcipher`.

## macOS

Se configura Hardened Runtime y entitlements mínimos para Electron/V8.

La firma y notarización definitiva dependen de las credenciales Apple del entorno de release. No se almacenan certificados, passwords, API keys ni perfiles dentro del repositorio.

La documentación oficial de Electron indica que una aplicación distribuida fuera de la Mac App Store debe estar firmada y notarizada para evitar los bloqueos de seguridad de macOS; electron-builder soporta esta configuración mediante `mac.notarize` y las variables de autenticación correspondientes. citeturn470852search2turn470852search0

## Scripts

```bash
pnpm electron:package
pnpm electron:package:mac
pnpm electron:package:dir
pnpm electron:release-check
```

`electron:release-check` ejecuta:

```text
typecheck
tests
TypeScript build
Electron asset build
artifact verification
git diff --check
```

## No publicar

Fase 32 no ejecuta publicación automática.

`electron-builder` usa `--publish never` en los scripts normales. La publicación final pertenece a Fase 33.

## Instalación

Primero sincroniza dependencias:

```bash
pnpm install
```

El paquete `electron-builder` debe quedar instalado como `devDependency`.

## Validación local

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
pnpm electron:package:mac
```

Después:

```bash
pnpm exec tsx scripts/verify-release-artifacts.ts
git diff --check
```

El resultado esperado en macOS es tener artefactos `.dmg` y `.zip` dentro de `release/`.

## Seguridad

Nunca introducir:

```text
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_API_KEY
APPLE_API_KEY_ID
APPLE_API_ISSUER
certificados
private keys
service-role keys
API keys
```

en `package.json`, `electron-builder.yml`, entitlements ni scripts del repositorio.

electron-builder recomienda obtener las credenciales de notarización desde variables de entorno; para CI recomienda App Store Connect API keys. citeturn470852search7turn470852search0

## Límite de fase

Esta fase prepara y verifica el Release Candidate.

No incluye:

- publicación automática;
- actualización OTA;
- auto-updater;
- distribución pública;
- credenciales Apple permanentes.

Esos puntos quedan para Fase 33.

## Cierre y validación final (2026-08-28)

Ejecutado con éxito en entorno local macOS arm64:

```bash
pnpm electron:package:mac
pnpm exec tsx scripts/verify-release-artifacts.ts
```

Resultado verificado:

```json
{
  "ok": true,
  "artifacts": [
    {
      "name": "DJ-Sync-Agent-0.9.4-mac-arm64.dmg",
      "bytes": 132123670
    },
    {
      "name": "DJ-Sync-Agent-0.9.4-mac-arm64.zip",
      "bytes": 132229394
    },
    {
      "name": "DJ-Sync-Agent-0.9.4-mac-arm64.zip.blockmap",
      "bytes": 136871
    },
    {
      "name": "builder-debug.yml",
      "bytes": 848
    },
    {
      "name": "builder-effective-config.yaml",
      "bytes": 854
    }
  ]
}
```

Estado final de la fase: **COMPLETADA ✅**

Artefactos producidos en `release/`:

- Instalador `.dmg` listo para distribución.
- Paquete `.zip` + `.blockmap` listo para auto-updater en Fase 33.
- `release/mac-arm64/DJ Sync Agent.app` binario `.app` validado para smoke test.

Condiciones de cierre cumplidas:

1. ✅ `pnpm typecheck` exit 0.
2. ✅ `pnpm test` (265/265 tests pass).
3. ✅ `pnpm build` exit 0.
4. ✅ `pnpm electron:build` + 3 assets copied.
5. ✅ `pnpm electron:package:mac` produce 5 artefactos sin errores.
6. ✅ `pnpm exec tsx scripts/verify-release-artifacts.ts` retorna `ok: true`.
7. ✅ `git diff --check` exit 0.
