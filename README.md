# TrackNPerf (V1)

Training Operating System (hybrid athlete) — V1 foundation.

## Prérequis
- Node.js (idéalement **LTS < 24** si tu veux activer la génération PWA)
- Un projet Supabase (Auth + Postgres + RLS)
- (Optionnel) Supabase CLI

## Setup local
1) Installer les dépendances

```bash
npm install
```

2) Configurer l’environnement

Copie `.env.example` → `.env` et remplis:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3) Lancer en dev

```bash
npm run dev
```

## Supabase (DB)
Les migrations SQL sont dans `supabase/migrations/`.

### Appliquer les migrations
Selon ton workflow Supabase:
- via Supabase CLI (local)
- ou via Supabase Dashboard (SQL Editor) en appliquant les fichiers dans l’ordre

## Supabase Edge Function `/sync`
La fonction est dans `supabase/functions/sync`.

### Déploiement
Avec Supabase CLI (exemple):

```bash
supabase functions deploy sync
```

### Sécurité
- La function **n’utilise pas** `SUPABASE_SERVICE_ROLE_KEY` (pas de bypass RLS)
- Elle s’appuie sur le JWT utilisateur (`Authorization`) et sur les politiques RLS existantes

## Tests
Unit tests:

```bash
npm test
```

Build:

```bash
npm run build
```

### Régression RLS (SQL)
Script: `supabase/tests/rls_regression.sql`

Exemple (local Supabase Postgres):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_regression.sql
```

## Notes PWA (Node 24)
La génération du service worker est **désactivée** sur Node 24+ (instabilité workbox/terser).

- Pour forcer l’arrêt: `PWA_DISABLE=true`
- Pour réactiver: utilise Node LTS (<24) ou une version corrigée de l’outillage

