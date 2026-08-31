# FASE 29 — Security / Secrets / Permissions Hardening

## Objetivo

Cerrar las superficies de seguridad del Copilot y de la auditoría antes de entrar en reliability/performance.

## Seguridad local

- SHA-256 estable para action identity;
- tokens de aprobación de 256 bits mediante CSPRNG;
- comparación de tokens sin early-exit por contenido;
- token no expuesto mientras la aprobación está `pending`;
- token retirado después de `consume`;
- expiración validada también en `approve`;
- binding por deviceId/requestId/previewId/action hash;
- replay protection one-shot;
- read-only / interactive permissions;
- allow-list / deny-list de tools;
- redacción de secretos en audit metadata.

## Supabase hardening

Nueva migración:

`20260827000011_copilot_action_audit_hardening.sql`

- revoca acceso de `anon` y `authenticated` a la tabla/secuencia;
- mantiene el audit surface append-only para la aplicación;
- limita el tamaño de errores y metadata.

La Edge Function ahora:

- acepta únicamente POST;
- limita el tamaño del body;
- rechaza metadata con nombres de campos sensibles;
- limita metadata a 16 KiB;
- limita errores a 4000 caracteres;
- usa `SUPABASE_SERVICE_ROLE_KEY` únicamente en el runtime de Edge Function.

## Despliegue seguro

La función debe desplegarse **sin** `--no-verify-jwt`.

Después de validar localmente:

```bash
pnpm supabase db push
pnpm supabase functions deploy copilot-action-audit
```

No usar:

```bash
pnpm supabase functions deploy copilot-action-audit --no-verify-jwt
```

## Restricción

No introducir secrets en renderer, ToolPlan, prompts, audit records o respuestas del Copilot.
