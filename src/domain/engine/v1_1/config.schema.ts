import { z } from "zod";

export const engineConfigV1_1Schema = z.object({
  version: z.string().min(1).max(100),
  policies: z
    .object({
      conservativeByDefault: z.boolean().default(true),
      maxDegradedDays: z.number().int().min(0).max(30).default(7),
      requireHumanValidationForStrongChanges: z.boolean().default(true),
    })
    .default({
      conservativeByDefault: true,
      maxDegradedDays: 7,
      requireHumanValidationForStrongChanges: true,
    }),
  thresholds: z
    .object({
      loadGuardLast7dMaxCount: z.number().int().min(0).max(100).default(6),
      fatigueHighThreshold: z.number().min(0).max(1).default(0.75),
      readinessLowThreshold: z.number().min(0).max(1).default(0.4),
      painOrangeThreshold: z.number().min(0).max(10).default(3),
      painRedThreshold: z.number().min(0).max(10).default(6),
      fatigueSelfReduceThreshold: z.number().min(0).max(10).default(7),
      fatigueSelfRestThreshold: z.number().min(0).max(10).default(9),
      readinessSelfReduceThreshold: z.number().min(0).max(10).default(4),
      readinessSelfRestThreshold: z.number().min(0).max(10).default(2),
      sleepHardMinHours: z.number().min(0).max(24).default(6),
      sleepDebt2dHours: z.number().min(0).max(24).default(7),
      sleepCriticalHours: z.number().min(0).max(24).default(5),
      hrvLowDaysThreshold: z.number().int().min(0).max(7).default(2),
      rhrHighDeltaBpm: z.number().min(0).max(50).default(5),
      maxWeeklyLoadVariationPct: z.number().min(0).max(1).default(0.15),
      lowerBodyHighStressMaxBeginner: z.number().int().min(1).max(7).default(2),
      lowerBodyHighStressMaxIntermediate: z.number().int().min(1).max(7).default(3),
      lowerBodyHighStressMaxAdvanced: z.number().int().min(1).max(7).default(3),
    })
    .default({
      loadGuardLast7dMaxCount: 6,
      fatigueHighThreshold: 0.75,
      readinessLowThreshold: 0.4,
      painOrangeThreshold: 3,
      painRedThreshold: 6,
      fatigueSelfReduceThreshold: 7,
      fatigueSelfRestThreshold: 9,
      readinessSelfReduceThreshold: 4,
      readinessSelfRestThreshold: 2,
      sleepHardMinHours: 6,
      sleepDebt2dHours: 7,
      sleepCriticalHours: 5,
      hrvLowDaysThreshold: 2,
      rhrHighDeltaBpm: 5,
      maxWeeklyLoadVariationPct: 0.15,
      lowerBodyHighStressMaxBeginner: 2,
      lowerBodyHighStressMaxIntermediate: 3,
      lowerBodyHighStressMaxAdvanced: 3,
    }),
  optimization: z
    .object({
      maxVolumeReductionPct: z.number().min(0).max(1).default(0.3),
      maxVolumeIncreasePct: z.number().min(0).max(1).default(0.1),
      maxIntensityReductionPct: z.number().min(0).max(1).default(0.15),
      maxIntensityIncreasePct: z.number().min(0).max(1).default(0.05),
      painOrangeVolumeReductionMinPct: z.number().min(0).max(1).default(0.3),
      painOrangeVolumeReductionMaxPct: z.number().min(0).max(1).default(0.5),
      maxMajorLeversPerSession: z.number().int().min(1).max(5).default(2),
    })
    .default({
      maxVolumeReductionPct: 0.3,
      maxVolumeIncreasePct: 0.1,
      maxIntensityReductionPct: 0.15,
      maxIntensityIncreasePct: 0.05,
      painOrangeVolumeReductionMinPct: 0.3,
      painOrangeVolumeReductionMaxPct: 0.5,
      maxMajorLeversPerSession: 2,
    }),
});

export type EngineConfigV1_1Schema = z.infer<typeof engineConfigV1_1Schema>;

export function defaultEngineConfigV1_1(): EngineConfigV1_1Schema {
  return engineConfigV1_1Schema.parse({ version: "v1.1-default" });
}
