# 01 — App Overview

## Produit
**TrackNPerf** est une PWA “Training Operating System” pour athlètes hybrides.

## Objectif utilisateur
- Importer / disposer d’un **plan** (séances planifiées)
- Exécuter des séances → enregistrer l’exécution
- Obtenir une **recommandation** (moteur adaptatif déterministe) et une **explication**
- Sync offline-first via une outbox (IndexedDB) + Edge Function

## Navigation (macro)
- Auth → Onboarding → Today (dashboard)
- Pages secondaires: History, Stats, Admin, Session detail

## Rôles
- **User authentifié**: accès Today/History/Stats/Session detail
- **Admin**: accès `Admin` (config engine + import plan)

## États globaux importants (UI)
- **Non connecté** → page Auth
- **Connecté sans profil** → Onboarding
- **Connecté avec profil** → App (Today)
- **Non-admin sur `/admin`** → écran “no access”
- **Supabase non configuré** (env manquantes) → messages d’erreur dans les pages

## Principes UI/UX à respecter
- **Offline-first**: informer l’utilisateur quand une action est en file d’attente (sync queue)
- **Explainability**: afficher d’abord une explication courte (top 3 reasons) puis détail à la demande
- **Sécurité**: pas d’actions admin visibles pour non-admin

