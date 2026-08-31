# PHASE 46 — LocalConversationStorePort + ConversationMemory Adapter (default Local-First)

Fecha: 2026-08-28
Bloque: C · ENTREGA 03 (DJ Memory Local First)

## Objetivo

Integrar `ConversationMemoryStore` (interfaz ya existente `src/ai/memory/conversation-memory-types.ts`) en el store local `CopilotDbLocalStore`:

- Port `LocalConversationStorePort extends ConversationMemoryStore` (métodos load/save/delete con misma firma).
- Tabla `copilot_conversations` (copilot.db v2) con snapshot JSON packed → zero-copy rehidratar ConversationSnapshot 100% fidelity.
- Adapter `InMemoryCopilotDbStore.asConversationMemoryStore()` que retorna thin object compatible con constructor `createDJSyncConversationMemory({ store })` reemplaza InMemory standalone mock sin Supabase (Local First default).

## Tabla copilot_conversations

```sql
CREATE TABLE IF NOT EXISTS copilot_conversations (
  conversation_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_copilot_conversations_id_pk ON copilot_conversations (conversation_id);
```

## Codec helpers types.ts

`packConversationSnapshot(snapshot)` → row sin timestamps created_at/updated_at para que store gestione updated.
`unpackConversationSnapshot(row)` → retorna `ConversationSnapshot` (schemaVersion, conversationId, createdAt, updatedAt, messages[], constraints[], summary?).

JSON packing garantiza 0 fields perdidos: messages.id/role/content/createdAt, constraints.key/value/source/createdAt se preservan.

## Ports.ts

```
interface LocalConversationStorePort extends ConversationMemoryStore {}

interface CopilotDbLocalStore extends
  LocalReadModelStorePort,
  LocalAudioAnalysisStorePort,
  LocalAudioFeaturesStorePort,
  LocalIntelligenceProfileStorePort,
  LocalSyncRunStorePort,
  LocalDJHistoryStorePort,
  LocalDJPreferenceStorePort,
  LocalDJBehaviorProfileStorePort,
  LocalConversationStorePort  // extends ConversationMemoryStore
{
  asConversationMemoryStore(): ConversationMemoryStore;
}
```

## Implementación InMemoryCopilotDbStore (load/save/delete)

```
load(conversationId) → unpackConversationSnapshot(row) | null
save(snapshot)       → created_at preserva si existía / updated_at snapshot.updatedAt | isoNow
delete(conversationId)
```

**Adapter `asConversationMemoryStore()`**: thin object `{load, save, delete}` bind a store. Permite zero-change swap en runtime más adelante cuando `ConversationMemory` acepte store injection.

## Suite Tests bloque-c.test.ts

Conversations RT validado PASS:

1. Crear snapshot `{ messages[2], constraints[1], summary:null }` → `adapter.save(snapshot)`.
2. `adapter.load(id)` → `assert.deepEqual(loaded, snapshot)` exacto.
3. `adapter.delete(id)` → `load(id)` → `null`.

## Histórico completo Bloque C F43 (DJ History) tests adicionales validados

Compartidos en misma suite bloque-c.test.ts (`PHASE43+44+45+46 Bloque C codec roundtrip + store`):

- Sessions upsert + end + getSession summary tracks[3] + transitionCount=2
- appendSessionTrack order por position flags playedFull packed
- transitions: `recordTransition` 2 veces `(t1,t2)` merge incrementa freq=2 rolling avg success_score=0.675
- `getTransitionsFor(t1)` sorted by success_score desc + freq desc
- `recordRecommendationFeedback` + `listRecommendationFeedback({ acceptedOnly:true })` filtra
- listSessions orden default: ended_at / started_at desc

## Condiciones de cierre ✅ Entrega03 BloqueC COMPLETA

- [x] Ports Bloque C 4 interfaces implementados
- [x] CopilotDbLocalStore 9 ports sin errores extends TS
- [x] `InMemoryCopilotDbStore.asConversationMemoryStore()` adapter ConversationMemoryStore compatible
- [x] Conversation snapshot save → load deepEqual roundtrip
- [x] Bloque C tests creados: `schema-v2.test.ts` (4 tests) + `bloque-c.test.ts` (8 tests History/Preferences/Behavior/Conversations)
- [x] **GATES FINALES VERDES**:
  - ✅ `pnpm typecheck` exit 0
  - ✅ `pnpm exec node --import tsx --test "src/**/*.test.ts"` → tests 290, pass 290, fail 0, duration_ms ~4.2s
  - ✅ 0 regresiones Bloque B (schema v1 + originales 278 tests se incluyen en 290)

## Próximo paso Entrega04 BloqueD (Fases47-51)

Bloque D Audio Intelligence Musical: TrackAudioFeaturesV1 semver, boundary File vs Musical, heurísticas mood/structure v1, cache checksum incremental (fuera alcance Entrega03 hoy cerrada ✅).
