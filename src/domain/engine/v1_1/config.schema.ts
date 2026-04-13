import { z } from "zod";

export const engineConfigV1_1Schema = z.object({
  version: z.string().min(1).max(100),
  policies: z
    .object({
      conservativeByDefault: z.boolean().default(true),
    })
    .default({ conservativeByDefault: true }),
  thresholds: z
    .object({
      loadGuardLast7dMaxCount: z.number().int().min(0).max(100).default(6),
      fatigueHighThreshold: z.number().min(0).max(1).default(0.75),
      readinessLowThreshold: z.number().min(0).max(1).default(0.4),
    })
    .default({ loadGuardLast7dMaxCount: 6, fatigueHighThreshold: 0.75, readinessLowThreshold: 0.4 }),
  optimization: z
    .object({
      maxVolumeReductionPct: z.number().min(0).max(1).default(0.3),
      maxIntensityReductionPct: z.number().min(0).max(1).default(0.15),
    })
    .default({ maxVolumeReductionPct: 0.3, maxIntensityReductionPct: 0.15 }),
});

export type EngineConfigV1_1Schema = z.infer<typeof engineConfigV1_1Schema>;

export function defaultEngineConfigV1_1(): EngineConfigV1_1Schema {
  return engineConfigV1_1Schema.parse({ version: "v1.1-default" });
}

