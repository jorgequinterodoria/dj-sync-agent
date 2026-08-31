# PHASE 44 — PreferenceStorePort · Explícitas/Implícitas + DJPreferenceWeight rollup

Fecha: 2026-08-28
Bloque: C · ENTREGA 03 (DJ Memory Local First)

## Objetivo

Implementar `LocalDJPreferenceStorePort` con preferencias explícitas (like/dislike/exclude) e implícitas (eventos weighted positive/negative) con rollup determinista por value/dimension: totalWeight + lastOccurrence. InMemory adapter + codec + tests.

## Contrato ports.ts

Métodos expuestos:

```
recordExplicit(input: ExplicitPreferenceInput, now?) → Promise<preference_id:number>
recordImplicit(evidence: ImplicitPreferenceEvidence, now?) → Promise<number>
listValues({deviceId, dimension, kind?}) → {value, kind, totalWeight, lastOccurrence}[]
isExcluded({deviceId, dimension, value}) → Promise<boolean>
removeExplicit({deviceId, dimension, value, kind}) → Promise<void>
```

Tipos inputs (`ExplicitPreferenceInput` / `ImplicitPreferenceEvidence`) definidos en ports.ts.

## Codec & Value Normalization

File: `src/core/local-store/codec.ts`

Funciones nuevas exportadas desde el barrel `index.ts`:

| Función | Propósito |
|---|---|
| `toDJPreferenceRowExplicit(input, now?)` | Convierte input → fila `dj_preferences`; kind preferred/avoided/excluded; source explicit/system; weight signed; **normaliza value** |
| `toDJPreferenceRowImplicit(evidence, now?)` | Implícita: positive? (kind=preferred +weight) : (kind=avoided -weight); source implicit; normaliza value |
| `normalizePreferenceValue(value, dimension)` | genre/artist/label/key/track_exclusion → `NFC.trim().toLocaleLowerCase()`; resto trim |

## Implementación InMemory

`InMemoryCopilotDbStore` en `in-memory-store.ts`:
- Bucket `preferences: DJPreferenceRow[]` + autoincrement `nextPreferenceId`
- `listValues` → Map agrupación key=value; totalWeight suma; lastOccurrence max(occurred_at)
- `isExcluded` → busca más reciente `row.kind === 'excluded'` (prioridad sobre preferred/avoided); usa `normalizePreferenceValue` para keys lookup
- `removeExplicit` → solo elimina filas donde `source IN ('explicit','system')`; value normalized

## Tests (suite bloque-c.test.ts)

Escenarios validados PASS:

1. **recordExplicit + recordImplicit + listValues rollup**: value="Techno" / "Techno" / "House" → genres list devuelve "techno" totalWeight=5 (3 explícito + 2 implícito positivo), "house" avoided. Orden sort = (weight desc, lastOccurrence desc, value asc).
2. **isExcluded excluded vs non-excluded**: `artist=ARTIST_FORBIDDEN` excluded → true. `genre=Techno` → false.
3. **removeExplicit**: elimina fila `genre:Techno:preferred` explicit (source=explicit). Nuevo list totalWeight Techno = 2 (implicit). No borra implícitos.

## Condiciones de cierre ✅

- [x] 9 ports Bloque C en `CopilotDbLocalStore` extends sin errores
- [x] Codecs `toDJPreferenceRowExplicit/Implicit` + `normalizePreferenceValue` export
- [x] InMemory implementa los 5 métodos Preferences con semántica correcta
- [x] Value normalization cross-method (record/list/isExcluded/remove same key canonical)
- [x] 3 subtests preferences PASS en bloque-c.test.ts
- [x] Gates: pnpm typecheck exit 0 · tests 290/290 PASS

## Propiedades semánticas garantizadas

- Explicit exclusion tiene precedencia máxima sobre cualquier preferred/avoided (validación isExcluded)
- Implícitos se acumulan; positive siempre suma weight >0 al tipo preferred; negative siempre suma weight negativo al avoided
- `listValues` no requiere argumento kind; si `kind` se filtra solo se retiene tipo especificado
- `removeExplicit` idempotente: no hay row no-op; solo borra sources de usuario/sistema
