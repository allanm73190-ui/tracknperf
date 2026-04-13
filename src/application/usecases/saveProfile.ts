import { supabase } from "../../infra/supabase/client";
import type { ProfileRow, SaveProfileInput } from "../../domain/profile/profile";
import { saveProfileInputSchema } from "../../domain/profile/profile.schema";

export async function saveProfile(input: SaveProfileInput): Promise<ProfileRow> {
  const parsed = saveProfileInputSchema.parse({
    userId: input.userId,
    email: input.email ?? null,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
  });

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: parsed.userId,
        email: parsed.email ?? null,
        display_name: parsed.displayName,
        avatar_url: parsed.avatarUrl ?? null,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as ProfileRow;
}

