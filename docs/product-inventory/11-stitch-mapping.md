# 11 — Mapping Stitch Pack ↔ App

Objectif: relier les dossiers “Stitch” (screens) aux routes réelles et aux states à designer.

## Stitch zip: dossiers principaux observés

- `today_dashboard_desktop`, `today_dashboard_mobile`
  - Route: `/today`
  - States: loading, empty planned, no reco, with reco, error, offline/sync queued

- `auth_desktop` (+ éventuels `auth_connexion_inscription`)
  - Route: `/auth`
  - States: default, busy, error, success (magic link / signup)

- `onboarding_desktop` (+ `onboarding_profil`)
  - Route: `/onboarding`
  - States: default, busy, error, success

- `history_desktop` (+ `history`)
  - Route: `/history`
  - States: loading, empty, list, error

- `session_detail_desktop` (+ `session_details`)
  - Route: `/session/:sessionId`
  - States: loading, not found/no access, loaded

- `stats_desktop` (+ `stats_performance`)
  - Route: `/stats`
  - States: loading, empty (0), data, error

- `admin_hub_desktop`, `admin_hub_mobile` (+ `admin_engine_import`)
  - Route: `/admin`
  - States: busy, success, error, empty config lists, import preview/no preview

- `sync_details_drawer`
  - Surface: drawer/modal depuis `/today` (ou page dédiée si souhaité)
  - States: synced, queued, failed (last error), retry

- `acc_s_refus`
  - Route: `/admin` (non-admin)

## Routes non couvertes explicitement
- `/auth/callback` (écran simple “completing sign-in…”)
- `*` Not Found

