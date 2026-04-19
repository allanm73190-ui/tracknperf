# 04 — Data Model (UI-relevant)

> Ce document n’est pas une spec DB exhaustive: il liste les **entités utiles pour l’UI**.

## Identité
- `auth.users` (Supabase): identité auth
- `profiles`: profil utilisateur (onboarding)
- `user_roles`: rôle (user/admin)

## Planification
- `plans`: plan “racine”
- `plan_versions`: version immuable (porte le contexte engine)
  - `config_profile_id`
  - `algorithm_version_id`
- `session_templates`: templates de séances
- `planned_sessions`: séances planifiées (date + template)

## Exécution
- `executed_sessions`:
  - lien optionnel `planned_session_id`
  - `started_at`, `ended_at`
  - `payload` (détails exécutés)
- `session_feedback` (si utilisé):
  - feedback subjectif (RPE, notes, etc.)
- `context_snapshots`:
  - contexte du jour (si utilisé)

## Recommandations
- `recommendations`:
  - `input` (json)
  - `output` (json)
  - `algorithm_version_id`, `config_profile_id`
- `recommendation_explanations`:
  - `content` (json) = explication structurée (headline + top reasons + meta)

## Configuration / Versioning
- `config_profiles`:
  - `key`, `name`
  - `config` (json)
- `algorithm_versions`:
  - `version`
  - `metadata` (json)

## Sync
- `sync_ops`:
  - ledger idempotency (par user)
  - `idempotency_key`, `payload`, `applied_at`, `result` (après migration 0006)

