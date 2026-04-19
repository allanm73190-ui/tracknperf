export const reasonCodes = {
  FOLLOW_PLAN: "FOLLOW_PLAN",
  NO_PLAN_TODAY: "NO_PLAN_TODAY",
  DATA_MISSING: "DATA_MISSING",
  CONSERVATIVE_DEFAULT: "CONSERVATIVE_DEFAULT",
} as const;

export type ReasonCode = (typeof reasonCodes)[keyof typeof reasonCodes];

