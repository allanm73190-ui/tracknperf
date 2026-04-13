# 02 — Pages & Routes

## `/auth` — Auth
**But**: se connecter / créer un compte / recevoir un magic link.

**UI sections**
- Tabs/boutons de mode:
  - Email + password (sign in)
  - Sign up
  - Magic link
- Form:
  - Email (toujours)
  - Password (sauf magic link)
- CTA: Continue
- Messages: succès/erreur

**States**
- Default
- Busy (submit)
- Error message (auth error / env manquantes)

**Actions**
- Submit sign in / sign up / OTP

---

## `/auth/callback` — Auth callback
**But**: finaliser la session après redirect Supabase.

**UI**
- Texte “Completing sign-in…”
- Message d’erreur si session introuvable

**Navigation**
- Redirige vers `returnTo` stocké (sinon `/today`)

---

## `/onboarding` — Onboarding (profil)
**But**: créer le profil minimal pour accéder à l’app.

**UI**
- Form profil (selon implémentation): unités/préférences/etc.
- CTA: Save / Continue

**States**
- Loading
- Error (RLS / réseau / table absente)
- Success → redirection vers `/today` (ou returnTo)

---

## `/today` — Today (dashboard)
**But**: vue du jour (planifié + recommandé + actions).

**UI sections**
- Header:
  - “Sync now”
  - Sign out
- Bloc “Sync queue”:
  - pending / applied
- Navigation:
  - History
  - Stats
  - Admin (visible, mais l’accès est réellement protégé au niveau routing/role)
- Section “Planned”:
  - liste des séances planifiées aujourd’hui
- Section “Recommended”:
  - recommandation (output)
  - explication (headline + top reasons + détails si présents)

**States**
- Loading
- Empty planned
- No recommendation yet
- Error message (fetch / compute)

---

## `/history` — History
**But**: liste des séances exécutées sur une période.

**UI**
- Select “Range (days)” (7/14/30/90)
- Liste des executed sessions
- Chaque item link vers `/session/:sessionId`
- Bouton Back

**States**
- Loading
- Empty
- Error message

---

## `/session/:sessionId` — Session detail
**But**: voir le détail d’une séance exécutée.

**UI**
- Loading / error
- Affichage des champs de `executed_sessions` (actuellement sous forme JSON)
- Liens vers Today / History / Stats

**States**
- Missing id
- Not found / no access
- Loaded

---

## `/stats` — Stats
**But**: statistiques basiques à partir des séances exécutées.

**UI**
- Sections stats (selon implémentation actuelle)
- Bouton Back

---

## `/admin` — Admin (protégé admin)
**But**: gestion engine context + import plan.

**UI sections**
- Engine config:
  - Select config profile pour prochain import
  - Create config profile (key/name/json)
  - Select algorithm version pour prochain import
  - Create algorithm version
- Import plan:
  - Upload fichier (xlsx/json/csv)
  - Parse & preview
  - Import
- Sign out

**States**
- Not admin: écran “no access”
- Busy (parse/import/create)
- Success message / error message

---

## `*` — Not found
**UI**
- Titre
- Texte “This page doesn’t exist.”

