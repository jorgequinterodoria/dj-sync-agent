# FASE 30 — Performance / Reliability / Recovery

## Objetivo

Introducir una frontera de resiliencia reutilizable para las operaciones del sistema sin acoplarla a Supabase, Electron o un proveedor de IA.

## Capacidades

### Retry

- exponential backoff;
- upper delay bound;
- configurable jitter;
- retryable error policy;
- attempt count;
- cancellation-safe waiting.

### Circuit Breaker

Estados:

```text
closed → open → half-open → closed
```

Protege contra cascadas de fallos y llamadas repetidas a una dependencia inestable.

### Idempotency

Evita ejecutar dos veces la misma operación lógica cuando el mismo idempotency key ya tiene un resultado completado.

### Recovery Journal

Permite guardar:

```text
started
checkpoint
completed
failed
cancelled
```

por `requestId`, conservando orden de secuencia.

La interfaz está preparada para sustituir el store en memoria por almacenamiento persistente sin cambiar al consumidor.

### Bounded Concurrency

Las operaciones batch pueden limitar el número de tareas simultáneas y conservar el orden de los resultados.

### Runtime Facade

`createDJSyncReliability()` combina:

```text
retry
+
circuit breaker
+
bounded concurrency
+
idempotency store
+
recovery journal
```

## No incluye

Esta fase no introduce todavía:

- migración Supabase;
- Edge Function;
- cambios de esquema remoto;
- secretos nuevos;
- ejecución automática de acciones DJ.

Las mutations continúan protegidas por el Approval Gate de las fases anteriores.

## Validación

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
git diff --check
```

No ejecutar `pnpm supabase db push` para esta entrega.
