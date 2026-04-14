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

## Design System — "Hyperflux Dark / Kinetic Pulse"

### Philosophie
Anti-SaaS. Construit pour des athlètes, pas des administrateurs. Asymétrie intentionnelle, typographie éditoriale large, profondeur par superposition tonale.

### Palette (Dark-First)
- **Base** : `#0e0e0e` (background/surface)
- **Surface L1** : `#131313` | **L2** : `#262626`
- **Primary (Neon Lime)** : `#cafd00` (container) / `#f3ffca` (text)
- **Secondary (Vibrant Purple)** : `#c57eff` / `#6a0baa` (container)
- **Error** : `#ff7351`

### Typographie
- **Headlines / Données** : Space Grotesk (display-lg: 3.5rem)
- **Body / Labels** : Manrope

### Règles Critiques
- ❌ JAMAIS de bordures 1px solid — utiliser shifts tonaux, espace négatif, ou lueurs
- ❌ JAMAIS de drop shadows classiques — utiliser ambient shadows (accent teinté, blur 40-60px)
- ❌ JAMAIS de tables pour données complexes — utiliser des cards ou listes verticales de badges
- ✅ Glassmorphisme pour overlays : `rgba(44,44,44,0.6)` + `backdrop-filter: blur(20px)`
- ✅ Gradient "Aero" pour CTAs : `linear-gradient(45deg, #beee00, #f3ffca)`
- ✅ Cards : coins arrondis xl (1.5rem), pas de dividers, 24px padding vertical entre items
- ✅ Lime = Activité | Purple = Récupération

### Écrans UI de Référence
Les maquettes Stitch sont dans `/docs/ui-reference/` (HTML + screenshots). Écrans disponibles :
- `auth_connexion_inscription` / `auth_desktop` — Authentification (magic link)
- `onboarding_profil` / `onboarding_desktop` — Configuration profil athlète
- `today_dashboard` / `today_dashboard_mobile` / `today_dashboard_desktop` — Dashboard principal
- `session_details` / `session_detail_desktop` — Détail d'une séance (métriques, log)
- `journal_de_session` — Journal de séance / log d'exécution
- `d_tails_recommandation` — Explications des recommandations adaptatives
- `history` / `history_desktop` — Historique d'entraînement
- `stats_performance` / `stats_desktop` — Statistiques et tableaux de bord
- `profil_r_glages` — Profil et réglages utilisateur
- `sync_details_drawer` — Détails de synchronisation
- `acc_s_refus` — Écran d'accès refusé / erreur
- `admin_hub_mobile` / `admin_hub_desktop` — Hub d'administration
- `admin_engine_import` — Import moteur / configuration admin

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

#### Bloc Intelligence Métier (Moteur Adaptatif)
Architecture en 3 couches :

**Couche 1 — Rules Engine** : Règles déterministes, seuils, garde-fous, règles de progression/substitution/deload.

**Couche 2 — Adaptive Layer** : Apprentissage progressif du profil de réponse (tolérance volume/intensité, sensibilité conflits, profils de fatigue récurrents). Doit rester simple et contrôlé.

**Couche 3 — Optimization Layer** : Choix du meilleur ajustement local sous contraintes (bénéfice attendu vs coût fatigue vs conflit vs priorité objectifs vs sécurité).

**Fonctions du moteur** :
- `normalize_inputs` — normalisation des entrées
- `compute_load_state` — charge externe/interne
- `compute_multidimensional_fatigue` — fatigue multi-axes
- `compute_session_specific_readiness` — disponibilité spécifique
- `compute_goal_alignment` — alignement objectifs
- `compute_conflict_score` — conflits entre séances
- `compute_pain_risk` — risque douleur/surcharge
- `choose_decision_state` — décision (progresser/maintenir/réduire/substituer/différer/deload)
- `choose_progression_axis` — axe de progression (volume/intensité/densité/complexité)
- `update_next_session_parameters` — ajustement paramètres
- `substitute_session` — substitution intelligente
- `reoptimize_microcycle` — replanification
- `build_explanation` — construction de l'explication (raison principale, secondaires, priorité protégée, compromis accepté, confiance)

**Décisions possibles** : progresser, maintenir, réduire volume, réduire intensité, substituer, différer, deload local, deload global, replanifier le microcycle.

**Progression multi-leviers** : volume, intensité, densité, complexité — jamais tout à la fois sans raison.

#### Bloc Technique
- Auth Supabase (magic link + email/password, JWT, sessions)
- RLS stricte (chaque user ne voit QUE ses données, zéro accès horizontal)
- Offline-first (IndexedDB, file d'attente persistante, retry, idempotence, détection doublons)
- Sync (reprise réseau, état visible, cohérence post-sync, recalcul recommandations si nécessaire)
- Sécurité (secrets via env vars, validation stricte, journalisation, tests de non-régression sécu)

---

## Modèle de Données Principal

Entités attendues : `user`, `profile`, `priority_goals`, `constraints`, `plan`, `plan_version`, `session_template`, `planned_session`, `executed_session`, `session_blocks`, `session_feedback`, `context`, `external_metrics`, `internal_metrics`, `fatigue_snapshot`, `readiness_snapshot`, `recommendation`, `recommendation_explanation`, `engine_config`, `algorithm_version`, `sync_queue`, `audit_events`

---

## Standards de Code

### Conventions
- TypeScript strict partout (frontend ET backend)
- Composants React fonctionnels + hooks
- Nommage : camelCase (variables/fonctions), PascalCase (composants/types), SCREAMING_SNAKE (constantes)
- Fichiers : kebab-case
- Un composant = un fichier
- Imports absolus avec alias `@/`

### Tests
- **Unitaires** : fonctions métier, calculs moteur, validations, règles
- **Intégration** : DB, auth, RLS, sync, persistance recommandations
- **E2E** : inscription → connexion → plan → séance du jour → log → adaptation → explication → offline/resync → isolation des données utilisateur

### Git
- Branches : `feature/`, `fix/`, `refactor/`, `chore/`
- Commits conventionnels : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- PR obligatoire avant merge sur `main`

---

## Commandes Utiles

```bash
# Dev
npm run dev          # Frontend dev server
npm run server       # Backend dev server
npm run test         # Tests unitaires
npm run test:e2e     # Tests E2E
npm run lint         # Lint
npm run type-check   # TypeScript strict check

# DB
npx supabase db push    # Push migrations
npx supabase db reset   # Reset local DB
```

---

## Ce que l'Application N'Est PAS

- ❌ Un simple carnet de notes d'entraînement
- ❌ Un dashboard de données brut
- ❌ Une IA opaque qui change tout sans justification
- ❌ Un système corporate/SaaS générique

Elle DOIT être : lisible, robuste, configurable, explicable, maintenable, et visuellement premium (Kinetic Pulse).

---

## Documentation Requise

README, `.env.example`, discovery, ADR, doc sécurité, threat model, doc tests, roadmap, runbook, doc algorithme, doc modèle de domaine, doc configuration, doc explicabilité.
