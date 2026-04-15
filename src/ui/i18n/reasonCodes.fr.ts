import type { ReasonCodeV1_1 } from "../../domain/engine/v1_1/reasonCodes";

export const REASON_CODE_FR: Record<ReasonCodeV1_1, string> = {
  DATA_MISSING: "Données insuffisantes",
  DATA_FRESH: "Données récentes disponibles",
  FOLLOW_PLAN: "Respect du plan établi",
  NO_PLAN_TODAY: "Aucune séance prévue",
  LOAD_GUARD: "Charge hebdomadaire élevée",
  FATIGUE_HIGH: "Fatigue accumulée détectée",
  READINESS_LOW: "Disponibilité réduite",
  OPTIMIZE_VOLUME_DOWN: "Volume réduit (optimisation)",
  OPTIMIZE_INTENSITY_DOWN: "Intensité réduite (optimisation)",
};

export function getReasonCodeFR(code: ReasonCodeV1_1): string {
  return REASON_CODE_FR[code] ?? code;
}
