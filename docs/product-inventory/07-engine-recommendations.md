# 07 — Engine / Recommendations / Explainability

## Objectif
Produire une recommandation **déterministe**, **configurable**, **versionnée**, avec une explication affichable (non “IA opaque”).

## Entrées (conceptuelles)
- Plan du jour (planned session)
- Historique (executed sessions)
- Feedback / contexte (si présent)
- Config profile + algorithm version (liés au plan_version)

## Sorties (UI)
### Recommendation (résumé)
- décision (ex: maintain/reduce/rest, etc.)
- patch proposé (volume/intensité/substitution)
- reason codes
- `algorithmVersion`
- `configVersion`

### Explanation (affichage)
- **Summary**:
  - headline (1 phrase)
  - top 3 reasons (lisibles)
- **Details** (optionnel, caché par défaut):
  - signals contributions
  - rules fired
  - data quality (missing fields)
  - tradeoffs / protected priority

## Implications UI/UX
- Dans Today:
  - “Recommended” doit montrer le “quoi faire” immédiatement
  - puis “Pourquoi” avec 3 raisons max
  - puis un bouton “Voir détails”
- En cas de données manquantes:
  - afficher un badge “Data missing” ou un message de prudence

