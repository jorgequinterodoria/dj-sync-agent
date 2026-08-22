# Dispatcher v3 — transporte simplificado

Se elimina HMAC de la primera versión de producción.

## Secretos

Solo se usan:

```text
SYNC_DISPATCHER_KEY
N8N_WEBHOOK_AUTH_KEY
N8N_WEBHOOK_URL
```

`SYNC_DISPATCHER_KEY` autentica la llamada al dispatcher.

`N8N_WEBHOOK_AUTH_KEY` autentica la llamada del dispatcher al Webhook de n8n mediante `Header Auth`.

`N8N_WEBHOOK_SECRET` deja de utilizarse.

## Headers enviados a n8n

```text
Content-Type: application/json
X-DJ-Sync-Dispatcher-Key
X-DJ-Sync-Event-Id
X-DJ-Sync-Event-Type
X-DJ-Sync-Device-Id
X-DJ-Sync-Message-Id
```

## Seguridad

El endpoint de n8n permanece protegido por HTTPS + Header Auth.

El evento conserva `eventId` estable y el outbox mantiene:

- claim/lease
- retries
- dead-letter
- estado duradero

Para la primera versión no añadimos HMAC, ya que solo existe un emisor controlado (nuestro dispatcher).

## Próxima capa

La protección contra duplicados dentro de n8n se implementará mediante persistencia duradera de `eventId`, antes del procesamiento real del evento.
