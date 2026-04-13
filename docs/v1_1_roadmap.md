---
title: "TrackNPerf — V1.1 Roadmap (compléter la vision V1)"
date: 2026-04-13
status: draft
---

## Constat
La V1 actuelle est une **foundation end-to-end** (auth/profil/import/today/log/offline/sync/reco baseline).
La V1.1 vise à **coller à l’ambition initiale** (moteur 3 couches + config/versioning branchés + écrans manquants + sync multi-entités).

## Objectifs V1.1 (priorisés)
1) **Moteur adaptatif réel (3 couches)**: rules + adaptive + optimization + explainability riche (signaux/règles/data quality).
2) **Config/versioning branchés**: `config_profiles` + `algorithm_versions` réellement utilisés, figés par `plan_version`.
3) **UI flows manquants**: Today complet (planned/reco/executed diff), détail séance, historique, stats basiques.
4) **Sync complet**: étendre `/sync` à `session_feedback`, `context_snapshots`, metrics, recommendations recalcul serveur.

## Sprint A — “Engine real + contracts”
- Ajouter modèles domain manquants (fatigue/readiness/inputQuality, signals, decision state).
- Implémenter modules “contractuels” de `docs/algorithm.md` en version V1 pragmatic:
  - `normalize_inputs`, `compute_load_state`, `compute_fatigue_state`, `compute_readiness`, `build_explanation`
- Rules catalog minimal (hard stops, conservative default, load guard).
- Tests “golden cases” déterministes + partial data.

## Sprint B — “Config/versioning + plan_version binding”
- Charger la config depuis `config_profiles` (admin-managed), sélectionner via `plan_version`.
- Utiliser `algorithm_versions` (string version) et persister provenance.
- Admin UI: sélectionner “active algorithm version” + “active config profile” (immuables) pour une plan_version.

## Sprint C — “UI missing screens”
- `SessionDetail`: planned vs recommended vs executed + diff structuré.
- `History`: filtre semaine/période, liste sessions exécutées + agrégats simples.
- `Stats`: volume/durée, adhérence (planned vs executed), tendance.

## Sprint D — “Sync expansion + server recalc”
- Étendre `/sync` à plusieurs entités (ops type/entity).
- Validation stricte par schéma par op.
- En fin de sync: recalcul serveur des recommandations (source of truth) sur les changements d’exécuté/feedback.

## Definition of Done (V1.1)
- Reco: 3 couches + explainability (top3 + détails), stable/déterministe.
- Config/versioning: visible et auditables (id + version) sur chaque reco.
- UI: détail séance + historique + stats livrés.
- Sync: multi-entités + recalcul serveur + idempotence testée.

