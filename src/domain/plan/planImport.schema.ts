import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date format YYYY-MM-DD");

export const planImportSchema = z
  .object({
    plan: z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(5000).nullable().optional().default(null),
    }),
    planVersion: z.object({
      version: z.number().int().min(1),
      payload: z.record(z.string(), z.unknown()).default({}),
    }),
    sessionTemplates: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          template: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .default([]),
    plannedSessions: z
      .array(
        z.object({
          scheduledFor: isoDateSchema,
          templateName: z.string().trim().min(1).max(200).nullable().optional().default(null),
          payload: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .default([]),
  })
  .superRefine((val, ctx) => {
    const names = new Set<string>();
    for (const t of val.sessionTemplates) {
      const key = t.name.toLowerCase();
      if (names.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate session template name: ${t.name}`,
          path: ["sessionTemplates"],
        });
        break;
      }
      names.add(key);
    }
  });

export type PlanImportSchema = z.infer<typeof planImportSchema>;

