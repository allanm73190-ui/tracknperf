# 06 — Sync / Offline (UX + mécanique)

## Objectif UX
- L’app doit rester utilisable offline.
- Les actions offline doivent être:
  - visibles (queue),
  - fiables (retries),
  - non destructrices (idempotency).

## Outbox locale (IndexedDB)
- Store: `sync_ops` (local)
- Champs UI-relevant:
  - `status`: pending/applied
  - `attempts`
  - `lastError`
  - `nextAttemptAt`

## Flush (Today)
- Bouton “Sync now” déclenche `flushSyncQueue()`.
- L’UI affiche:
  - pending count
  - applied count

## Edge Function `/sync`
Entrée:
- batch `ops[]` (max 25)
- chaque op:
  - `opId`
  - `idempotencyKey`
  - `opType` (actuellement insert)
  - `entity`
  - `payload`

Sortie:
- `results[]` avec `status`:
  - `applied` (succès)
  - `rejected` (payload invalide / entity inconnue)
  - `error` (erreur runtime / DB)

## Idempotency (server ledger)
- Table `public.sync_ops`:
  - unique per user: `(user_id, idempotency_key)`
  - `applied_at` marque le succès
  - `result` stocke des infos minimales (ex: ids créés) après migration 0006

## Implications UI/UX (recommandées)
- Afficher une “Sync status pill” persistante (en header)
- Laisser l’utilisateur consulter les derniers erreurs (ex: drawer “Sync details”)
- Offrir un bouton “Retry now”

