import type { ReasonCodeV1_1 } from "../../domain/engine/v1_1/reasonCodes";

export const REASON_CODE_FR: Record<ReasonCodeV1_1, string> = {
  DATA_MISSING: "Données insuffisantes",
  DATA_FRESH: "Données récentes disponibles",
  DATA_DEGRADED_MODE: "Mode dégradé actif",
  FOLLOW_PLAN: "Respect du plan établi",
  NO_PLAN_TODAY: "Aucune séance prévue",
  LOAD_GUARD: "Charge hebdomadaire élevée",
  FATIGUE_HIGH: "Fatigue accumulée détectée",
  READINESS_LOW: "Disponibilité réduite",
  PAIN_ORANGE_MODIFY: "Douleur modérée: adaptation requise",
  PAIN_RED_FLAG: "Drapeau rouge douleur/sécurité",
  SLEEP_DEBT_48H: "Dette de sommeil sur 48h",
  SLEEP_CRITICAL: "Sommeil critique",
  HRV_RHR_DIVERGENCE: "Dérive HRV/RHR concordante",
  LOWER_BODY_CONFLICT: "Interférence course/salle (bas du corps)",
  KEY_SESSION_PROTECTED: "Séance clé protégée",
  LOCKED_SESSION: "Séance verrouillée",
  FORCED_DELOAD: "Deload forcé",
  WEEKLY_LOAD_CAP: "Plafond de charge hebdo appliqué",
  FORBIDDEN_ACTION_BLOCKED: "Action interdite bloquée",
  HUMAN_VALIDATION_REQUIRED: "Validation humaine requise",
  OPTIMIZE_VOLUME_DOWN: "Volume réduit (optimisation)",
  OPTIMIZE_INTENSITY_DOWN: "Intensité réduite (optimisation)",
};

export function getReasonCodeFR(code: ReasonCodeV1_1): string {
  return REASON_CODE_FR[code] ?? code;
}
