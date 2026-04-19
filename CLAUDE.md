# CLAUDE.md — Track'n'Perf (Système de Pilotage d'Entraînement Hybride)

## Vision Produit

Track'n'Perf est une **PWA de pilotage d'entraînement pour athlètes hybrides** (force + endurance). Ce n'est PAS un simple tracker. L'application planifie, exécute, suit, analyse et **adapte** l'entraînement via un moteur décisionnel explicable.

**Phrase résumé** : Une application qui permet à un athlète hybride de planifier, exécuter, suivre, analyser et adapter son entraînement de manière sécurisée, expliquée, synchronisée et évolutive.

---

## Stack Technique

| Couche | Technologie |
|--------|------------|
| Frontend | React 19 + Vite, TypeScript, Tailwind CSS |
| Backend | Node.js / Express.js |
| Base de données | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Auth | Supabase Auth (magic link + email/password), JWT |
| Hébergement | Railway (prévu) |
| PWA | Service Worker, IndexedDB (offline), Background Sync |

---

## Design System — Kinetic Pulse

> **Source de vérité complète : `/docs/design-system/`**
>
> - `README.md` — Guide complet (couleurs, typo, voix, layout, motion, iconographie)
> - `colors_and_type.css` — Tous les tokens CSS
> - `SKILL.md` — Instructions pour les agents
> - `ui_kits/mobile/` — Kit UI mobile avec composants React de référence
> - `ui_kits/desktop/` — Kit UI desktop
> - `preview/` — Previews de chaque élément du design system
> - `assets/` — Logo, icônes, textures

### Règles Non-Négociables (résumé — détails dans README.md)
- Dark-first `#0e0e0e`. Lime `#cafd00` = activité. Purple `#c57eff` = récupération. Orange `#ff7351` = alertes uniquement.
- Space Grotesk (headlines/données) + Manrope (body/labels)
- ❌ Pas de bordures 1px, pas de drop shadows, pas de tables, pas d'emoji
- ✅ Tonal layering, glassmorphisme, gradient Aero, coins 24px, ambient glows
- Voix : français narratif + anglais ALL-CAPS pour labels tactiques (SYNCED, ELITE, etc.)
- Press = `active:scale-95`. Hover = opacity lift. Pas de bounces.

---

## Architecture Fonctionnelle

### Les 3 États de la Donnée (FONDAMENTAL)
Toute donnée d'entraînement existe en 3 états distincts, toujours :
1. **Planifié** — ce que le plan initial prévoit
2. **Recommandé** — ce que le moteur adaptatif estime pertinent aujourd'hui
3. **Réalisé** — ce que l'athlète a réellement fait

Cette distinction est une **contrainte de conception obligatoire** sur toute l'application.

### Blocs Fonctionnels

#### Bloc Utilisateur
- Compte (inscription, connexion, session)
- Profil sportif (niveau, sports, contraintes, expérience, structure hebdo)
- Onboarding (recueil des données de base pour configurer le moteur)
- Paramètres (thème, unités, préférences, tolérance, affichage, sync, export)

#### Bloc Entraînement
- Plans (création, import, modification, organisation semaines/blocs, versioning)
- Templates de séances (force, hypertrophie, endurance, mixte, récup, variantes)
- Vue "Aujourd'hui" (séance du jour, recommandation, prévu initial, ajustements)
- Détail séance (objectif, blocs, consignes, paramètres cibles, log d'exécution)
- Log d'exécution (volume, intensité, charge, RPE, fatigue, douleur, notes)
- Historique (par jour, semaine, bloc — écarts prévu/réalisé)
- Statistiques (charge, régularité, adhérence, répartition, tendances)
- Export (CSV, JSON — données, historique, plan, logs)

#### Bloc Intelligence Métier (Moteur Adaptatif) — ✅ TERMINÉ (Wave 3)
Architecture en 3 couches :

**Couche 1 — Rules Engine** : Règles déterministes, seuils, garde-fous.
**Couche 2 — Adaptive Layer** : Apprentissage du profil de réponse.
**Couche 3 — Optimization Layer** : Meilleur ajustement sous contraintes.

Fonctions implémentées et testées :
- `computeFatigueSnapshot` ✅
- `computeReadinessSnapshot` ✅
- `ExplanationV1_1` (types + builder) ✅
- `computeRecommendationV1_1` ✅
- `loadEngineContext` + feedback Supabase ✅
- `computeAndPersistTodayRecommendation` ✅
- Tests deload (4 scénarios) ✅
- Tests invariants ExplanationV1_1 ✅
- Tests intégration ✅

**NE PAS MODIFIER le moteur sauf bug avéré.**

#### Bloc Technique
- Auth Supabase (magic link + email/password, JWT, sessions) ✅
- RLS stricte ✅
- Offline-first (à compléter — Wave 5)
- Sync (à compléter — Wave 5)
- Sécurité (CSP, env vars, validation) ✅

---

## Modèle de Données Principal

Entités : `user`, `profile`, `priority_goals`, `constraints`, `plan`, `plan_version`, `session_template`, `planned_session`, `executed_session`, `session_blocks`, `session_feedback`, `context`, `external_metrics`, `internal_metrics`, `fatigue_snapshot`, `readiness_snapshot`, `recommendation`, `recommendation_explanation`, `engine_config`, `algorithm_version`, `sync_queue`, `audit_events`

---

## Standards de Code

### Conventions
- TypeScript strict partout
- Composants React fonctionnels + hooks
- Nommage : camelCase (variables), PascalCase (composants/types), SCREAMING_SNAKE (constantes)
- Fichiers : kebab-case
- Un composant = un fichier
- Imports absolus avec alias `@/`

### Langue de l'Application
- **Français** pour tout le contenu utilisateur
- **Anglais ALL-CAPS** uniquement pour les labels tactiques (SYNCED, LIVE_FEED, ELITE, RECOVERY)
- Vouvoiement ou impératif — jamais de tutoiement
- Pas d'emoji, jamais

### Tests
- Unitaires : fonctions métier, calculs moteur
- Intégration : DB, auth, RLS
- E2E : parcours utilisateur critiques

### Git
- Commits conventionnels : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- PR avant merge sur `main`

---

## Ce que l'Application N'Est PAS

- ❌ Un simple carnet de notes
- ❌ Un dashboard de données brut
- ❌ Une IA opaque
- ❌ Un système corporate/SaaS générique

Elle DOIT être : lisible, robuste, explicable, et visuellement premium (Kinetic Pulse).
