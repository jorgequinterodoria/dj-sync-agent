# FASE 24 — Copilot UI + Streaming

## Objetivo

Preparar la experiencia de chat de Electron sobre la frontera IPC, con estados de thinking/tool/completed/error y cancelación.

## Arquitectura

Renderer no ejecuta herramientas ni contiene secrets.

```text
Renderer
  ↓ IPC
Main
  ↓
Copilot Stream
  ↓
Copilot Agent
  ↓
Tool Registry
```

## Alcance

- UI de conversación.
- Composer multiline.
- Enter para enviar; Shift+Enter para nueva línea.
- Autoscroll.
- Estados de ejecución.
- Tool activity visible.
- Cancelación.
- Eventos serializables.
- Sin persistencia remota.

## Importante

Esta entrega contiene la capa de streaming y el componente de renderer. La conexión definitiva con `ipcMain`, `contextBridge` y el `index.html` existente debe conservar los contratos actuales del proyecto y añadirse sobre ellos, sin reemplazar el bootstrap existente.

## Supabase

No hay migraciones.
No ejecutar `pnpm supabase db push`.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```
