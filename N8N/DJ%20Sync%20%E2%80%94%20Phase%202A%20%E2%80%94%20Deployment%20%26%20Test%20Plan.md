# DJ Sync — Fase 2A
## Intelligence Foundation — Deployment y pruebas

### Objetivo
Extender el Event Receiver validado sin cambiar su semántica de fiabilidad:
- duplicate
- retry
- superseded
- failed
- track.updated
- track.added preparado
- track.deleted
- audit
- change log
- mark processed

La nueva capa solo añade **encolado durable de trabajos de inteligencia** antes de marcar el evento como procesado.

### Archivos
- `DJ Sync — Event Receiver — PHASE 2A.json`
- `DJ Sync — Phase 2A — Intelligence Jobs.sql`

### 1. Base de datos
Ejecutar el SQL de `DJ Sync — Phase 2A — Intelligence Jobs.sql` sobre el proyecto Supabase vinculado.

La tabla creada es `public.dj_intelligence_jobs`.

Estados soportados:
- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`

### 2. Importación n8n
Importar `DJ Sync — Event Receiver — PHASE 2A.json` como workflow separado.
El workflow se entrega `active=false` para evitar sustituir producción durante la validación.

Después de importarlo:
- conservar la credencial Postgres `Supabase DJ Sync — PostgreSQL`;
- conservar la credencial `DJ Sync Dispatcher Auth`;
- revisar que el webhook/path siga siendo `dj-sync`;
- activar solamente después de las pruebas.

### 3. Cambios funcionales
#### track.updated / track.added
Ahora la rama es:

`Detect Track Changes -> Save Track Audit -> Log Track Changes -> Build Intelligence Jobs -> Save Change Log -> Enqueue Intelligence Jobs -> Mark Event Processed -> Respond`

#### jobs creados
1. `track.intelligence.refresh`
   - se crea para la primera captura de una pista;
   - también cuando cambia metadata o características técnicas relevantes: title, artist, album, genre, key, remixer, bpm, length, bitrate o sampleRate.

2. `track.preference.update`
   - se crea cuando cambia `rating` o `playCount`.

3. `track.intelligence.retire`
   - se crea para `track.deleted`.

Un evento puede generar más de un job.

### 4. Prueba A — cambio semántico
Cambiar rating de una pista real.

Esperado:
- receipt `processed`;
- change log con `rating`;
- al menos un job `track.preference.update` con `status=pending`;
- si el mismo evento modifica también un campo de inteligencia, puede existir además `track.intelligence.refresh`.

Consulta:
```sql
select id, job_key, job_type, status, event_id, track_id, rb_local_usn, attempts, created_at
from public.dj_intelligence_jobs
order by created_at desc
limit 10;
```

### 5. Prueba B — sin cambios semánticos
Enviar un `track.updated` con el mismo estado ya auditado.

Esperado:
- receipt `processed`;
- `changedFields=[]`;
- `n8n_track_change_log`: 0 filas nuevas;
- `dj_intelligence_jobs`: 0 jobs nuevos para ese evento;
- `Mark Event Processed` debe ejecutarse igualmente.

### 6. Prueba C — primera captura de una pista
Primera auditoría de una pista.

Esperado:
- `hasPrevious=false`;
- `track.intelligence.refresh` en estado `pending`;
- `processed` solamente después de que el job quede persistido.

### 7. Prueba D — track.deleted
Cuando exista un `track.deleted` real, debe terminar:

`Get Deleted Track State -> Normalize Track Deleted -> Save Deleted Track Audit -> Build Deleted Intelligence Job -> Enqueue Deleted Intelligence Job -> Mark Event Processed -> Respond`

Esperado:
- 1 snapshot de auditoría;
- 1 job `track.intelligence.retire`;
- receipt `processed`.

### 8. Prueba E — duplicate
Reenviar un eventId ya procesado.

Esperado:
- `duplicate=true`;
- ningún job adicional;
- `attempts` no cambia.

### 9. Prueba F — superseded
Enviar un evento antiguo para una pista que ya tiene un USN posterior.

Esperado:
- `superseded=true`;
- no se crea job;
- no se crea auditoría.

### 10. Prueba G — fallo de cola
Si `dj_intelligence_jobs` no existe o la inserción falla, el evento **no debe** marcarse como `processed`.
Debe quedarse recuperable mediante el mecanismo de retry.

### 11. Criterio de cierre de Fase 2A
La fase se considera terminada cuando todas las pruebas A-G pasan y:
- no existen eventos nuevos en `processing` sin una razón explícita;
- cada evento procesado que requiere inteligencia deja un job durable;
- los duplicados no duplican jobs;
- los superseded no crean jobs;
- los eventos sin cambios no crean jobs;
- `track.deleted` termina correctamente cuando exista un evento real.
