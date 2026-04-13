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

  if (error) {
    const msg = "Could not save profile. Please try again.";
    const details =
      typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : null;
    throw new Error(details ? `${msg} (${details})` : msg);
  }

  if (!data || typeof data !== "object" || typeof (data as { id?: unknown }).id !== "string") {
    throw new Error("Unexpected profile response from server.");
  }

  return data as ProfileRow;
}

