import { z } from "zod";

export const executedSessionPayloadSchema = z.object({
  durationMinutes: z.number().int().min(1).max(24 * 60).nullable().optional().default(null),
  rpe: z.number().int().min(1).max(10).nullable().optional().default(null),
  notes: z.string().trim().max(10_000).nullable().optional().default(null),
});

export type ExecutedSessionPayload = z.infer<typeof executedSessionPayloadSchema>;

