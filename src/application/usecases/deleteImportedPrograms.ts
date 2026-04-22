import { supabase } from "../../infra/supabase/client";

export type DeleteImportedProgramsResult = {
  deletedPlans: number;
};

function isPostgrestErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  if ("message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return null;
}

export async function deleteAllImportedPrograms(): Promise<DeleteImportedProgramsResult> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    throw new Error("Utilisateur non authentifié.");
  }
  const userId = authData.user.id;

  const { count, error: countError } = await supabase
    .from("plans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) {
    const details = isPostgrestErrorMessage(countError);
    throw new Error(details ? `Impossible de compter les plans. (${details})` : "Impossible de compter les plans.");
  }

  const { error: deleteError } = await supabase
    .from("plans")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    const details = isPostgrestErrorMessage(deleteError);
    throw new Error(details ? `Suppression impossible. (${details})` : "Suppression impossible.");
  }

  return { deletedPlans: count ?? 0 };
}

