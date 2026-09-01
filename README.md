# DJ Sync Agent / DJ Copilot

## 1. Propósito

Aplicación local para macOS que sincroniza una biblioteca de Rekordbox, mantiene un read model local persistente y expone capacidades de inteligencia, recomendaciones, construcción de sets, contexto Live y Copilot mediante una aplicación Electron.

**Fuente de verdad técnica de este repositorio:** este archivo. Los documentos históricos de fases se eliminaron deliberadamente para evitar que un agente futuro siga instrucciones obsoletas.

## 2. Reglas no negociables

1. `copilot.db` es la persistencia local principal de la aplicación.
2. La implementación SQLite oficial es `node:sqlite` / `DatabaseSync` (Node 24), no `better-sqlite3`.
3. `master.db` de Rekordbox se trata como fuente externa y se lee en modo solo lectura.
4. Nunca escribir SQL directamente en `master.db`.
5. Operaciones de escritura sobre Rekordbox pasan por `RekordboxWritePort`, Approval Gate y un adapter seguro.
6. El LLM no reemplaza al Recommendation Engine ni al Set Builder.
7. El agente solo puede usar herramientas de su allow-list explícita.
8. Las restricciones duras de recomendación tienen prioridad sobre personalización.
9. No crear un segundo Core, Recommendation Engine, Set Builder, Copilot Agent o sistema de persistencia para resolver una feature.
10. Toda feature nueva debe incluir tests y conservar los contratos/ports existentes.
11. Antes de cerrar una fase: `pnpm typecheck`, `pnpm test`, `pnpm electron:build` deben pasar.
12. No eliminar ni modificar un contrato público sin añadir una migración/test que justifique el cambio.

## 3. Arquitectura completa

```text
                 ┌─────────────────────────────┐
                 │          Rekordbox           │
                 │ master.db / filesystem       │
                 └──────────────┬──────────────┘
                                │ READ ONLY
              ┌─────────────────▼──────────────────┐
              │ Extractor / Change Scanner / Sync  │
              │ cursor · batch · recovery · watch  │
              └─────────────────┬──────────────────┘
                                │
                         ┌──────▼──────┐
                         │ copilot.db  │
                         │ node:sqlite │
                         └──────┬──────┘
                                │
                    ┌───────────▼───────────┐
                    │       DJ Core         │
                    │ library/history/etc.  │
                    └───────┬───────┬──────┘
                            │       │
              ┌─────────────┘       └────────────────┐
              ▼                                      ▼
      Audio Intelligence                    DJ Intelligence V2
              │                                      │
              └──────────────────┬───────────────────┘
                                 ▼
                    Recommendation Engine
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                             ▼
             Set Builder                  Personalization V2
                  │                             │
                  └──────────────┬──────────────┘
                                 ▼
                       Copilot / Runtime
                                 │
                ┌────────────────┼─────────────────┐
                ▼                ▼                 ▼
             Electron        Pro DJ Link       Safe Actions
                │                │                 │
                ▼                ▼                 ▼
              UI / IPC       LiveDJContext     Approval/Export
```

## 4. Capas y responsabilidades

### `src/sync/`
Sincronización incremental, cursor, change batches, snapshots, watcher, recovery y transporte. No contiene lógica de recomendación ni UI.

### `src/rekordbox/`
Lectura/extracción de Rekordbox y frontera segura de escritura/exportación. `master.db` no se modifica directamente.

### `src/core/`
Dominio estable de la aplicación: tracks, playlists, cues, history, local store y Live context. Los consumers deben depender de ports cuando exista un port.

### `src/core/local-store/`
Persistencia local. `SQLiteCopilotDbStore` es el adapter de producción; `InMemoryCopilotDbStore` se conserva para tests/escenarios deterministas.

### `src/core/live/`
`NowPlayingSourcePort`, `ProDjLinkNowPlayingSource`, fallback manual, `LiveDJContextService`, energía y recomendaciones Live.

**Estado Live:** Pro DJ Link es la fuente primaria; el fallback manual permite desarrollo y ausencia de hardware. La integración primaria no debe convertirse en dependencia de `master.db`.

### `src/audio/`
Verificación de assets, análisis de archivo, persistencia de audio y heurísticas/inteligencia musical V1/V2.

### `src/intelligence/`
Perfiles de inteligencia, semantic documents, retrieval y providers de embeddings.

### `src/recommendations/`
Recommendation Engine determinista, compatibilidad de key, scoring y Set Builder adapters. Las hard constraints deben seguir siendo autoritativas.

### `src/personalization/`
Personalización V2. Es un overlay de ranking, no una sustitución de constraints. Un perfil inexistente/vacío debe producir comportamiento neutral.

### `src/ai/`
Provider abstraction, embeddings, context assembly, planner, tools, Copilot Agent y policy. El Agent razona/orquesta; las operaciones de dominio siguen en servicios deterministas.

### `src/runtime/`
Composición de servicios de aplicación, orchestration, repositories y boundaries que conectan Core con Electron/AI.

### `src/electron/`
Main process, preload, IPC, renderer, UI, audio playback, updater y release checks. El renderer nunca accede directamente a filesystem/DB privilegiados.

### `src/security/`
Permissions, secret redaction y secure approvals.

### `src/reliability/`
Retry, bounded concurrency, circuit breaker, idempotency y recovery journal.

## 5. Persistencia

### `copilot.db`
Se crea bajo `app.getPath('userData')/copilot.db` en Electron.

El store aplica las migraciones antes de usarse. La versión/esquema está definido por `src/core/local-store/schema.ts` y las migraciones correspondientes.

Persisten, entre otros:

- normalized tracks
- playlists / entries
- cues
- sessions / session tracks
- transitions
- recommendation feedback
- explicit preferences
- behavior profiles
- conversations
- audio analysis/features
- DJ track profiles
- sync runs

### Regla de evolución

Nunca cambies una tabla existente de forma destructiva. Añade migración versionada y test de upgrade/round-trip.

## 6. IPC

Los canales están centralizados en `src/electron/ipc/channels.ts`.

Los contratos están en `src/electron/ipc/contracts.ts`.

`src/electron/preload.cts` es la única superficie expuesta al renderer.

Flujo correcto:

```text
Renderer
  ↓
preload
  ↓
IPC channel
  ↓
ipcMain handler
  ↓
Application service / Core
  ↓
Store / external adapter
```

No introducir acceso directo del renderer a Node APIs.

## 7. Copilot Agent

Allow-list actual:

```text
library.search
library.get_track
recommend.next
recommend.set_slot
set.build
set.analyze
audio.analyze
history.last_session
live_context.get
settings.list
```

La policy se define en `src/ai/agent/copilot-tool-policy.ts` y debe permanecer cerrada por defecto.

Una nueva tool requiere:

1. contrato tipado;
2. implementación;
3. registro;
4. allow-list/policy explícita;
5. tests de permitido y rechazado;
6. análisis de riesgo;
7. si escribe, Approval Gate.

## 8. Rekordbox / Pro DJ Link

### Lectura

`src/core/live/pro-dj-link-now-playing.ts` implementa decodificación y transporte UDP para Pro DJ Link.

Puertos usados:

```text
50000  discovery/announce
50001  beat/position
50002  status
```

El estado se considera stale después del intervalo configurado.

### Fuente Live

`HybridNowPlayingSource` selecciona:

```text
fresh Pro DJ Link state
        ↓
       use

sin estado hardware fresco
        ↓
manual fallback
```

Esto permite que la aplicación funcione sin hardware sin degradar la frontera de producción.

### Escritura

Nunca escribir `master.db` desde Agent, renderer o SQL directo. Las mutaciones deben pasar por:

```text
Agent/action
    ↓
validation
    ↓
preview
    ↓
explicit approval
    ↓
one-shot token
    ↓
RekordboxWritePort
    ↓
safe adapter / export
```

## 9. Audio playback

El renderer usa `src/electron/renderer/audio-playback.ts` como boundary de reproducción. La selección de un track debe conservar simultáneamente:

- actualización de UI;
- resolución de archivo local permitido;
- carga del audio;
- play/pause;
- progreso/duración;
- sincronización del estado Now Playing cuando corresponda.

No mover reproducción al main process salvo que exista una necesidad concreta de seguridad/codec.

## 10. Recommendation Engine

Orden conceptual obligatorio:

```text
Hard constraints
      ↓
Candidate generation
      ↓
Deterministic scoring
      ↓
Personalization
      ↓
Ranking
      ↓
Explanation
```

Personalization nunca puede reintroducir un track excluido por una hard constraint.

## 11. Set Builder

`src/recommendations/set-builder.ts` es la implementación de dominio. `src/runtime/dj-sync-set-builder-service.ts` es la capa de aplicación.

La UI debe llamar al servicio mediante IPC; no duplicar el algoritmo en `renderer.ts`.

## 12. Live Mode

Componentes:

```text
NowPlayingSource
      ↓
LiveDJContextService
      ↓
Live recommendation
      ↓
energy curve / deviation
      ↓
UI
```

`LiveDJContextService` conserva el estado de sesión y debe ser el punto de agregación de contexto Live.

## 13. Seguridad

- `contextIsolation: true`.
- `nodeIntegration: false`.
- Preload como bridge explícito.
- secrets fuera del renderer cuando sea posible.
- redaction antes de logs/audit.
- writes protegidos por approval.
- no ejecutar SQL arbitrario proveniente del LLM.

## 14. Sincronización

Cursor:

```json
{
  "rbLocalUsn": 1501919,
  "id": "223530529"
}
```

El cursor solo avanza después de que la operación correspondiente haya sido aceptada.

El sync debe permanecer idempotente y resistente a:

- lock busy;
- network failure;
- replay;
- restart;
- watcher duplicado;
- cambios durante una ejecución.

## 15. Testing

Los tests usan Node test runner + `tsx` y están colocados junto al módulo correspondiente.

Comandos oficiales:

```bash
pnpm typecheck
pnpm test
pnpm electron:build
```

Release/local final check:

```bash
pnpm final:check
```

`final:check` ejecuta typecheck, suite, build, Electron build, release artifact verification y `git diff --check`.

### Regla para nuevas features

Una feature no está terminada si solo compila. Debe tener tests que cubran:

- happy path;
- invalid input;
- boundary/error path;
- persistencia cuando aplique;
- seguridad/policy cuando aplique;
- integración con el port existente cuando aplique.

## 16. Release

`electron-builder.yml` define:

- macOS DMG + ZIP;
- Windows NSIS;
- Linux AppImage;
- hardened runtime en macOS;
- updater GitHub;
- unpack de módulos nativos necesarios.

`src/electron/auto-updater.ts` no descarga automáticamente la actualización; la instalación queda preparada para el cierre de la aplicación.

`src/electron/production-release.ts` y `scripts/verify-release-artifacts.ts` validan artefactos no vacíos y outputs mínimos.

Una release publicada requiere además validación manual de instalación limpia y actualización real; un build local exitoso no equivale a haber probado el ciclo de distribución publicado.

## 17. Workflow obligatorio para un agente futuro

### Antes de modificar

```text
1. Leer este README completo.
2. Buscar el port/interface existente más cercano.
3. Buscar consumers y tests existentes.
4. Identificar el adapter correcto.
5. Comprobar si la funcionalidad ya existe antes de crear otra.
6. Revisar seguridad y persistencia.
```

### Durante la implementación

```text
Port/interface existente
        ↓
implementación/adaptador
        ↓
servicio existente
        ↓
IPC si es UI
        ↓
test junto al módulo
```

### Nunca hacer

```text
❌ duplicar un servicio existente
❌ crear un segundo store
❌ escribir master.db directamente
❌ poner lógica de dominio compleja en renderer
❌ permitir tools LLM por defecto
❌ saltarse Approval para writes
❌ reemplazar hard constraints con ML/personalización
❌ borrar migraciones existentes
❌ modificar contratos sin tests
❌ considerar build = feature terminada
```

## 18. Estado consolidado del proyecto

Las capacidades principales de las fases históricas están consolidadas en el código actual:

```text
Sync / Rekordbox extraction             ✓
Local persistent SQLite                ✓
DJ Core                                ✓
DJ Memory                              ✓
Audio Intelligence V1                  ✓
Musical Intelligence V2                ✓
Recommendation Engine                  ✓
Set Builder                            ✓
Semantic Retrieval                     ✓
Personalization V2                     ✓
Copilot Agent                           ✓
Tool allow-list                         ✓
Approval / Security                     ✓
Pro DJ Link parser                      ✓
Now Playing                             ✓
Live DJ Context                         ✓
Live recommendations                    ✓
Product UI                              ✓
Audio playback                          ✓
Rekordbox XML export                    ✓
Safe write boundary                     ✓
Electron production build               ✓
Updater infrastructure                  ✓
```

## 19. Estado de consolidación final

La última consolidación del proyecto debe tratar los siguientes puntos como validación, no como nuevas arquitecturas:

- Pro DJ Link lifecycle real con hardware.
- E2E Electron → IPC → SQLite → restart → IPC.
- smoke test de instalación limpia en macOS.
- ciclo de actualización sobre una release publicada.
- validación física de CDJ/PRO DJ LINK.

Estos escenarios requieren entorno externo/hardware y no pueden certificarse únicamente mediante unit tests locales.

## 20. Próximas features

No existe otra fase arquitectónica obligatoria después de esta consolidación. Cualquier feature futura debe integrarse sobre los ports y servicios actuales.

Para cada nueva feature, documentar en el PR/commit:

```text
Objetivo
Port/servicio reutilizado
Archivos modificados
Tests añadidos
Persistencia/migración (si aplica)
Riesgo de seguridad
Impacto en IPC (si aplica)
Comandos de validación
```

Si una propuesta exige crear una segunda implementación de una capacidad existente, detenerse y justificar explícitamente por qué el port/adapter actual no es suficiente.

## 21. Comandos útiles

```bash
pnpm dev
pnpm inspect
pnpm inspect:tracks
pnpm verify:relationships
pnpm sync:run
pnpm sync:watch
pnpm sync:status
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
pnpm electron:package:mac
pnpm electron:release-check
pnpm final:check
```

## 22. Versionado y cambios

No usar documentos de fases históricos como instrucciones de implementación. El código, los contratos/tests y este README son la referencia actual.

Cuando una nueva feature cambie una garantía arquitectónica, actualizar este README en el mismo cambio y añadir tests que hagan explícita la nueva garantía.
