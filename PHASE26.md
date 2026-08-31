# FASE 26 — Set Builder + Set Analysis

## Objetivo

Completar la capacidad de preparar sets a partir de tracks existentes, manteniendo el resultado determinista, acotado y explicable.

## Implementación

- `SetBuilder` determinista;
- hard constraints de BPM, energía, artistas, géneros, tracks excluidos y recientes;
- selección armónica basada en la lógica Camelot existente;
- roles de set;
- transiciones y scores;
- curva de energía únicamente con señales disponibles;
- warnings explícitos;
- adapter desde `NormalizedTrack` sin inventar energía u otros datos ausentes;
- herramientas AI `set.build` y `set.analyze`;
- servicio runtime como frontera.

## Regla crítica

Nunca se inventan tracks, energía, tonalidad u otras señales que no estén disponibles.

## Supabase

No hay cambios de base de datos en esta fase.
