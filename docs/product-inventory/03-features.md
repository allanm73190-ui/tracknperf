# 03 — Features (fonctionnelles)

## Auth & session
- Sign in email/password
- Sign up
- Magic link
- Callback redirect + `returnTo`
- Sign out

## Onboarding (profil)
- Création/validation d’un profil minimal (bloquant l’accès si absent)

## Plan import (Admin)
- Import via:
  - Excel (`.xlsx`)
  - JSON
  - CSV
- Étapes:
  - Parse & preview
  - Persist (plan + plan_version + templates + planned sessions)
- Lors de l’import, association:
  - `plan_versions.config_profile_id` (optionnel)
  - `plan_versions.algorithm_version_id` (optionnel)

## Engine configuration (Admin)
- Créer un **Config Profile** (key, name, config json)
- Créer une **Algorithm Version** (version, metadata)
- Sélectionner lesquels utiliser pour le prochain import

## Today
- Affiche:
  - séances planifiées du jour
  - recommandation du jour (output + explication)
  - état de la sync queue

## History
- Liste des séances exécutées sur une période (7/14/30/90j)
- Accès au détail de séance exécutée

## Stats
- Statistiques basiques (à partir de l’historique exécuté)

## Offline-first sync
- Outbox locale IndexedDB:
  - opérations `insert` (ex: executed_sessions)
  - retry/backoff
- Bouton “Sync now” (Today) qui flush la queue
- Edge Function Supabase `/sync` qui applique les opérations avec JWT user (RLS)

