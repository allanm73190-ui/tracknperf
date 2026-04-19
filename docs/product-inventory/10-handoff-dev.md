# 10 — Handoff Dev (Spec)

## Objectif
Rendre le redesign implémentable sans ambiguïtés.

## Tokens (CSS variables)
Source: `src/styles.css`
- Background/surfaces: `--bg`, `--surface-low`, `--surface-highest`
- Text: `--text`, `--text-muted`
- Accents: `--primary`, `--primary-container`, `--secondary`, `--secondary-container`, `--error`
- Radius: `--radius-*`
- Shadows/glows: `--shadow-ambient-*`, `--ring`
- Spacing: `--space-*`

## Composants (UI kit)
Dossier: `src/ui/kit/`
- `AppShell`: topbar + nav + main container
- `Card`: conteneur tonal (`low` / `highest`)
- `Button`: `primary` / `ghost`
- `Input`: label + input stylé
- `Pill`: `neutral` / `primary` / `secondary` / `error`

## Règles d’usage
- Pas de `1px border` comme dividers (préférer tonal layering + spacing)
- Préférer:
  - 1 action primaire par card
  - 1–3 éléments max “above the fold”
- Toujours séparer:
  - **What** (headline / action)
  - **Why** (texte muted / reasons)

## Responsive
- Mobile-first:
  - `AppShell.main` centré, largeur max 1040px
  - Grids: `repeat(2, ...)` doivent passer en 1 colonne < ~720px si nécessaire
- Touch targets:
  - boutons/pills min 40px hauteur

## Accessibilité
- Focus visible: `:focus-visible` (ring lime)
- Contraste:
  - texte muted doit rester lisible sur surfaces
- Feedback:
  - erreurs en panel (Card highest) avec message clair

## États
Chaque action async:
- désactive le CTA
- change le label (`Working…`, `Syncing…`, etc.)
- affiche le résultat (message)

