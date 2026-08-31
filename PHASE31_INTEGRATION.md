# Integración de Fase 31

## Punto de montaje

El renderer debe tener un elemento raíz, por ejemplo:

```html
<div id="app"></div>
```

y cargar:

```ts
import {
  createInitialProductionUiSnapshot,
  mountProductionUi,
} from './production-ui/index.js';
```

Ejemplo de composición:

```ts
const root =
  document.querySelector<HTMLElement>(
    '#app',
  );

if (!root) {
  throw new Error(
    'Production UI root element was not found.',
  );
}

const ui =
  mountProductionUi({
    root,
    initial:
      createInitialProductionUiSnapshot(),

    callbacks: {
      onSendMessage:
        async (message) => {
          // conectar con el contrato Copilot IPC existente
        },

      onApproveAction:
        async (actionId) => {
          // conectar con Approval IPC existente
        },

      onRejectAction:
        async (actionId) => {
          // conectar con Reject IPC existente
        },

      onStartSync:
        async () => {
          // conectar con runtimeStart existente
        },

      onStopSync:
        async () => {
          // conectar con runtimeStop existente
        },

      onRefresh:
        async () => {
          // volver a consultar ApplicationSnapshot
        },
    },
  });
```

## Estado

Cuando cambie el estado de Electron:

```ts
ui.update(snapshot);
```

No se debe acceder desde el renderer a servicios internos.

## Importante

El ejemplo anterior muestra la frontera de integración; los nombres concretos de los métodos IPC deben mapearse a los contratos existentes de la rama.

No crear endpoints nuevos si el contrato existente ya resuelve la operación.
