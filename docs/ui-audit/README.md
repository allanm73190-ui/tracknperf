# UI Audit

## Source de verite

Le dossier de reference UI pour ce repository est:

- `docs/ui-reference/`

Le chemin `docs/design-system/` mentionne dans certains documents n'existe pas dans ce repository.
Toutes les revues d'alignement visuel et UX doivent donc se baser sur `docs/ui-reference/`.

## Objectif

Uniformiser les pages runtime (`src/ui/pages/`) avec les references du dossier `docs/ui-reference/`,
en respectant les tokens Kinetic Pulse declares dans `src/styles.css`.

## Garde-fous

Commande de verification UI:

```bash
npm run check:ui
```

Cette commande valide:

- absence d'emoji dans `src/ui/`
- budget d'inline styles sur `src/ui/pages/` (actuellement 500 occurrences max)
