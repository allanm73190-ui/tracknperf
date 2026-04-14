# Changelog — Phase 2 : Cleanup & Architecture (E1)

**Date :** 2026-04-14
**Branch :** feature/v1
**Epic :** E1 — Nettoyage & Dette technique

---

## Suppressions (code mort)

| Fichier | Raison |
|---------|--------|
| `src/App.tsx` | Doublon de `src/app/App.tsx`. `main.tsx` importe `./app/App` — ce fichier n'était jamais utilisé. |
| `src/lib/supabase.ts` | Re-export inutile (`export { supabase } from "../infra/supabase/client"`). Aucun import vers ce chemin trouvé dans le projet. |
| `src/lib/` | Répertoire supprimé (vide après retrait de `supabase.ts`). |

## Ajouts

| Fichier | Contenu |
|---------|---------|
| `eslint.config.js` | Config ESLint 9 flat config : `@typescript-eslint/recommended`, `react-hooks`, `globals.browser + globals.es2022`. |
| `docs/changelogs/PHASE_2_CLEANUP.md` | Ce fichier. |

## Modifications

| Fichier | Changement |
|---------|------------|
| `package.json` | Ajout scripts `lint` + `type-check` ; ajout devDeps `eslint`, `@typescript-eslint/*`, `eslint-plugin-react-hooks`. |
| `README.md` | Ajout section **Architecture** documentant la structure `src/` et la règle d'or `ui/ → application/`. |
| `src/domain/engine/v1_1/computeRecommendationV1_1.ts` | Suppression du destructuring inutilisé `reasonCodes` (variable jamais consommée — E4 concern). |
| `src/ui/pages/AuthCallback.tsx` | Ajout de `navigate` dans les dépendances du `useEffect` (correction avertissement `react-hooks/exhaustive-deps`). |

## Déplacements (docs)

| Source | Destination |
|--------|-------------|
| `docs/discovery.md` | `docs/archive/discovery_initial.md` (remplacé par `docs/discovery/AUDIT_PHASE_0.md`) |

---

## Statut post-cleanup

```
npm run lint       → ✅ 0 erreurs, 0 warnings
npm run type-check → ✅ 0 erreurs
```
