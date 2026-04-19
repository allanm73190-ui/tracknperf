# 05 — Auth / Roles / Permissions

## Auth
- Provider: **Supabase Auth**
- Tokens: gérés via `@supabase/supabase-js`

## Pages publiques
- `/auth`
- `/auth/callback`

## Pages protégées (auth requise)
- `/onboarding`
- `/today`
- `/history`
- `/stats`
- `/session/:sessionId`
- `/admin` (en plus: admin requis)

## Onboarding (profil)
- L’utilisateur doit avoir une ligne dans `profiles` (sinon redirection vers `/onboarding`).

## Admin
- La page `/admin` est protégée par un check admin (RPC `is_admin`).
- Si non-admin:
  - UI “You don’t have access to this page.”
  - pas de redirection cachée (important UX)

## RLS (high level)
- Toutes les tables user-owned sont protégées par RLS.
- Les Edge Functions opèrent avec le **JWT user** (pas de service role).

