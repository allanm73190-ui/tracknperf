# Routes vs UI Reference

| Route | Page runtime | Reference principale | Statut |
|---|---|---|---|
| `/auth` | `src/ui/pages/Auth.tsx` | `docs/ui-reference/auth_connexion_inscription/` + `docs/ui-reference/auth_desktop/` | Partiel |
| `/onboarding` | `src/ui/pages/Onboarding.tsx` | `docs/ui-reference/onboarding_profil/` + `docs/ui-reference/onboarding_desktop/` | Partiel |
| `/today` | `src/ui/pages/Today.tsx` | `docs/ui-reference/today_dashboard_mobile/` + `docs/ui-reference/today_dashboard_desktop/` | Partiel |
| `/history` | `src/ui/pages/History.tsx` | `docs/ui-reference/history/` + `docs/ui-reference/history_desktop/` | Partiel |
| `/stats` | `src/ui/pages/Stats.tsx` | `docs/ui-reference/stats_performance/` + `docs/ui-reference/stats_desktop/` | Partiel |
| `/session/:sessionId` | `src/ui/pages/SessionDetail.tsx` | `docs/ui-reference/journal_de_session/` + `docs/ui-reference/session_detail_desktop/` | Partiel |
| `/planned-session/:sessionId` | `src/ui/pages/PlannedSessionDetail.tsx` | `docs/ui-reference/session_details/` | Partiel |
| `/settings` | `src/ui/pages/Settings.tsx` | `docs/ui-reference/profil_r_glages/` | Partiel |
| `/admin` | `src/ui/pages/Admin.tsx` | `docs/ui-reference/admin_engine_import/` + `docs/ui-reference/admin_hub_desktop/` + `docs/ui-reference/admin_hub_mobile/` | Partiel |
| `/import-plan` | `src/ui/pages/ImportPlan.tsx` | `docs/ui-reference/admin_engine_import/` | Partiel |
| `/daily-checkin` | `src/ui/pages/DailyCheckin.tsx` | `docs/ui-reference/journal_de_session/` | A completer |
| `/programme` | `src/ui/pages/Programme.tsx` | `docs/ui-reference/today_dashboard/` (structure planning associee) | A completer |
| `/coach` | `src/ui/pages/CoachHub.tsx` | N/A (pas de reference dediee dans `docs/ui-reference`) | Sans reference |
| `/coach/session/:sessionId` | `src/ui/pages/CoachSessionEdit.tsx` | N/A (pas de reference dediee dans `docs/ui-reference`) | Sans reference |
| `/journal-libre` | `src/ui/pages/FreeJournal.tsx` | N/A (pas de reference dediee dans `docs/ui-reference`) | Sans reference |
| `/access-denied` (composant) | `src/ui/pages/AccessDenied.tsx` | `docs/ui-reference/acc_s_refus/` | Partiel |
| `/recommendation` (composant) | `src/ui/pages/RecommendationDetail.tsx` | `docs/ui-reference/d_tails_recommandation/` | Partiel |

## Chantiers prioritaires

1. Aligner `/admin` et `/import-plan` autour du meme flux d'import.
2. Stabiliser `/today` (CTA, hierarchie, notifications, drawer sync).
3. Harmoniser `/access-denied` et `/recommendation` avec references dediees.
4. Documenter des references UX pour les routes coach (`/coach*`, `/journal-libre`).

