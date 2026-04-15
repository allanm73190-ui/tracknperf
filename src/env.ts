import { z } from "zod";

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  VITE_APP_VERSION: z.string().optional(),
});

export const env = schema.parse(import.meta.env);

