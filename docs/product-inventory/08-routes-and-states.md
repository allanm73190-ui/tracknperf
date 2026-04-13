# 08 — Routes & States (Spec)

Objectif: fournir une **spécification UX** claire (routes, gating, états) pour que design + dev restent alignés.

## Routing (source de vérité)

### Public
- `/auth`
  - modes: signIn / signUp / magicLink
- `/auth/callback`

### Auth required
- `/onboarding` (profil)
- `/today`
- `/history`
- `/stats`
- `/session/:sessionId`

### Auth + Admin required
- `/admin`

### Catch-all
- `*` → Not Found

## Gating (règles)
- **Non connecté**:
  - tentative d’accès à n’importe quelle page protégée → redirection `/auth`
  - on conserve `returnTo` pour revenir après login
- **Connecté sans profil**:
  - tentative d’accès à `/today`, `/history`, `/stats`, `/session/:id`, `/admin` → redirection `/onboarding`
  - après onboarding, retour vers `returnTo` ou `/today`
- **Connecté non-admin**:
  - accès `/admin` → écran “no access” (pas de redirect silencieux)

## États UX communs (pattern)
Tous les écrans doivent prévoir:
- **Loading** (skeleton/card)
- **Error** (panel lisible + action “retry” si pertinent)
- **Empty** (message + guidance)
- **Busy** (CTA disabled + label “Working…”)

## États par page

### `/auth`
- default
- busy (submit)
- error (auth failed / invalid password / rate limit)
- success (magic link sent / signup requires confirm)
- misconfig (supabase env manquantes)

### `/auth/callback`
- completing
- error (no session)
- success (redirect)

### `/onboarding`
- default
- busy (saving)
- error (RLS/DB)
- success (redirect)

### `/today`
- loading (overview + reco)
- error (overview fail / reco fail)
- empty planned
- no recommendation yet
- with recommendation (headline + top 3 reasons)
- offline:
  - sync queue visible
  - bouton sync peut échouer → message

### `/history`
- loading
- error
- empty
- list (cards cliquables)

### `/session/:id`
- loading
- missing id
- not found / no access
- loaded

### `/stats`
- loading
- error
- empty (0 sessions)
- data

### `/admin`
- busy (parse/import/create)
- error (parse/import/create)
- success (messages)
- empty config lists (none)
- import preview ready / none

