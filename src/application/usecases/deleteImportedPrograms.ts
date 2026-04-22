import { supabase } from "../../infra/supabase/client";

export type DeleteImportedProgramsResult = {
  deletedPlannedSessions: number;
  deletedTemplates: number;
  deactivatedPlans: number;
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

  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("id, active")
    .eq("user_id", userId);
  if (plansError) {
    const details = isPostgrestErrorMessage(plansError);
    throw new Error(details ? `Impossible de charger les plans. (${details})` : "Impossible de charger les plans.");
  }

  const planRows = (plans ?? []) as Array<{ id: string; active?: boolean | null }>;
  const planIds = planRows.map((p) => String(p.id));
  if (planIds.length === 0) {
    return {
      deletedPlannedSessions: 0,
      deletedTemplates: 0,
      deactivatedPlans: 0,
      deletedPlans: 0,
    };
  }

  const activePlanIds = planRows
    .filter((p) => p.active === true)
    .map((p) => String(p.id));

  const { data: planVersions, error: planVersionsError } = await supabase
    .from("plan_versions")
    .select("id, plan_id")
    .eq("user_id", userId)
    .in("plan_id", planIds);
  if (planVersionsError) {
    const details = isPostgrestErrorMessage(planVersionsError);
    throw new Error(details ? `Impossible de charger les versions de plan. (${details})` : "Impossible de charger les versions de plan.");
  }
  const planVersionIds = ((planVersions ?? []) as Array<{ id: string }>).map((pv) => String(pv.id));

  const { count: plannedSessionsCount, error: plannedSessionsCountError } = await supabase
    .from("planned_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("plan_id", planIds);
  if (plannedSessionsCountError) {
    const details = isPostgrestErrorMessage(plannedSessionsCountError);
    throw new Error(
      details
        ? `Impossible de compter les séances planifiées. (${details})`
        : "Impossible de compter les séances planifiées.",
    );
  }

  const { error: plannedSessionsDeleteError } = await supabase
    .from("planned_sessions")
    .delete()
    .eq("user_id", userId)
    .in("plan_id", planIds);
  if (plannedSessionsDeleteError) {
    const details = isPostgrestErrorMessage(plannedSessionsDeleteError);
    throw new Error(
      details
        ? `Suppression impossible des séances planifiées. (${details})`
        : "Suppression impossible des séances planifiées.",
    );
  }

  let deletedTemplates = 0;
  if (planVersionIds.length > 0) {
    const { count: templatesCount, error: templatesCountError } = await supabase
      .from("session_templates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("plan_version_id", planVersionIds);
    if (templatesCountError) {
      const details = isPostgrestErrorMessage(templatesCountError);
      throw new Error(details ? `Impossible de compter les templates. (${details})` : "Impossible de compter les templates.");
    }

    const { error: templatesDeleteError } = await supabase
      .from("session_templates")
      .delete()
      .eq("user_id", userId)
      .in("plan_version_id", planVersionIds);
    if (templatesDeleteError) {
      const details = isPostgrestErrorMessage(templatesDeleteError);
      throw new Error(details ? `Suppression impossible des templates. (${details})` : "Suppression impossible des templates.");
    }
    deletedTemplates = templatesCount ?? 0;
  }

  if (activePlanIds.length > 0) {
    const { error: deactivateError } = await supabase
      .from("plans")
      .update({ active: false })
      .eq("user_id", userId)
      .in("id", activePlanIds);
    if (deactivateError) {
      const details = isPostgrestErrorMessage(deactivateError);
      throw new Error(details ? `Désactivation impossible des plans. (${details})` : "Désactivation impossible des plans.");
    }
  }

  // Alias de compatibilité utilisé côté UI.
  const deactivatedPlans = activePlanIds.length;
  return {
    deletedPlannedSessions: plannedSessionsCount ?? 0,
    deletedTemplates,
    deactivatedPlans,
    deletedPlans: deactivatedPlans,
  };
}
