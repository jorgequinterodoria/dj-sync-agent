# FASE 31 — Production UI / UX

## Objetivo

Crear una superficie de producción para Electron que haga visible el estado real del sistema sin exponer infraestructura ni secretos en el renderer.

## Incluye

- shell de aplicación;
- estado de conexión;
- estado de sincronización;
- Now Playing;
- Copilot;
- historial de mensajes;
- composer con teclado;
- Action Preview;
- Approve / Reject;
- activity timeline;
- estados vacíos;
- errores visibles;
- diseño responsive;
- soporte para `prefers-reduced-motion`;
- etiquetas accesibles;
- escaping de contenido dinámico;
- límites visuales para actividad;
- separación explícita entre modelo de UI y callbacks IPC.

## Boundary

El renderer recibe un `ProductionUiSnapshot` y callbacks. No conoce:

- Supabase;
- SQLCipher;
- API keys;
- service-role keys;
- providers de IA;
- repositorios;
- ejecutores del Core.

La aplicación debe conectar estos callbacks a los contratos IPC ya existentes.

## Integración

El entrypoint del renderer existente debe:

1. localizar el root visual;
2. crear `ProductionUiCallbacks`;
3. montar `mountProductionUi(...)`;
4. alimentar `handle.update(snapshot)` cuando cambie el estado.

La Fase 31 no reemplaza el IPC existente ni crea un segundo backend.

## Seguridad UI

El contenido dinámico se escapa antes de insertarse en HTML. La UI de aprobación solo se muestra cuando existe `pendingAction`.

La lógica de autorización continúa en main/runtime; el renderer solamente comunica la intención mediante callbacks.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

No hay migración Supabase asociada a esta fase.
No ejecutar `pnpm supabase db push`.
