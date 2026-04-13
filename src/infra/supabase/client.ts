import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../env";

export function createSupabaseClient(): SupabaseClient | null {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
}

export const supabase = createSupabaseClient();

