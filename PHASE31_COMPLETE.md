# Fase 31 — integración final

La entrega anterior de Fase 31 construyó la Production UI, pero el entrypoint real de Electron seguía montando el renderer legado. Esta entrega corrige esa frontera.

## Qué queda integrado

- `Dashboard` monta `Production UI` por defecto.
- `Library` y `Audio` se conservan sin reemplazar su infraestructura existente.
- El renderer recibe el `ProductionUiSnapshot` mediante `application.subscribe()`.
- Start / Stop / Refresh usan el Application IPC existente.
- Copilot cruza el `preload` únicamente por IPC, nunca desde el renderer hacia providers o secretos.
- El chat conserva conversación por `conversationId` y limita el historial en main.
- Action Preview solo se renderiza para acciones `pending`.
- Approve / Reject convierten el `preview.id` de la UI en la operación de aprobación correspondiente en main.
- No se implementa ejecución real de mutaciones; eso permanece reservado para Fase 32.

## Configuración de Copilot

El backend de chat usa el provider de IA ya existente del proyecto. Puede configurarse mediante variables de entorno:

```text
COPILOT_PROVIDER=openai
COPILOT_API_KEY=...
COPILOT_MODEL=<modelo explícito>
```

También se aceptan `anthropic`, `openai-compatible`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` y las claves estándar de OpenAI/Anthropic como fallback.

Para una aplicación lanzada desde Finder, puede usarse un archivo local sin ejecutar comandos shell:

`~/.config/dj-sync-agent/copilot.env`

con el mismo formato `KEY=value`. Solo se leen las claves de Copilot permitidas; el renderer no recibe la clave API.

## Aplicación

Desde la raíz del repo:

```bash
node ./apply-phase31-final-integration.mjs
```

El script es idempotente: si una parte ya está aplicada, no la duplica.

## Validación obligatoria

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

Después de empaquetar, abrir la aplicación debe mostrar el `DJ Sync Intelligent DJ Workspace` en Dashboard, con Copilot visible, y conservar Library y Audio.
