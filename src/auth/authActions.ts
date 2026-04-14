import { supabase } from "../infra/supabase/client";

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function authSignUp(email: string, password: string, emailRedirectTo: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
  if (error) throw error;
}

export async function authSignIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function authSignInWithOtp(email: string, emailRedirectTo: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
  if (error) throw error;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabase);
}
