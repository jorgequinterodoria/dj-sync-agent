# FASE 65 — Producto completo + Release Production

## Objetivo

Cerrar la productización sobre la arquitectura existente y dejar una ruta reproducible de validación para distribución.

## Alcance

- Dashboard con métricas reales desde `workspace:aggregate-stats`.
- Estados iniciales de UI sin métricas ficticias.
- Validación determinista de artefactos de producción.
- Release check único mediante `production:check`.
- Compatibilidad con el packaging existente de Electron.
- Sin cambios al Core, Recommendation Engine, Live Core ni límites de seguridad.
- Sin publicación automática de credenciales o secretos.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
pnpm exec tsx scripts/verify-release-artifacts.ts
git diff --check
```

Atajo equivalente:

```bash
pnpm production:check
```

## Criterio de cierre

La fase queda cerrada únicamente cuando todos los comandos anteriores terminan con código 0 y la aplicación empaquetada supera el smoke test manual:

1. instalación limpia;
2. arranque;
3. biblioteca;
4. reproducción;
5. recomendaciones;
6. Set Builder;
7. Live/Now Playing;
8. Copilot;
9. Settings;
10. cierre y reapertura conservando `copilot.db`;
11. generación de artefactos de release.

## Seguridad

- No se introducen secretos en el repositorio.
- `master.db` continúa fuera del flujo de escritura directa.
- El renderer mantiene acceso exclusivamente mediante preload/IPC.
- El updater continúa deshabilitado en desarrollo.

## Estado

**Entrega preparada — pendiente de validación local final.**
