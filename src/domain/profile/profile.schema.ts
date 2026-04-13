import { z } from "zod";

export const profileIdSchema = z.string().uuid();

export const saveProfileInputSchema = z.object({
  userId: profileIdSchema,
  email: z.string().email().nullable().optional(),
  displayName: z.string().trim().min(1, "Display name is required").max(80),
  avatarUrl: z.string().url().nullable().optional(),
});

export type SaveProfileInputSchema = z.infer<typeof saveProfileInputSchema>;

