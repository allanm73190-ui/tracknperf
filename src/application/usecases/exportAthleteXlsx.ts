import * as XLSX from "xlsx";
import { supabase } from "../../infra/supabase/client";

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function ensureDateIso(date: string): string {
  const s = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Format de date invalide (YYYY-MM-DD).");
  return s;
}

function downloadArrayBufferAsFile(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportAthleteToXlsx(args: {
  athleteId: string;
  from: string;
  to: string;
}): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const athleteId = args.athleteId.trim();
  if (!athleteId) throw new Error("athleteId requis.");
  const from = ensureDateIso(args.from);
  const to = ensureDateIso(args.to);
  if (from > to) throw new Error("La date de début doit être antérieure à la date de fin.");

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user?.id) throw new Error("Utilisateur non authentifié.");
  const coachId = userRes.user.id;

  // Scope guard: only assigned coach (or self) can export this athlete.
  if (coachId !== athleteId) {
    const { data: assignment, error: assignmentErr } = await supabase
      .from("coach_athlete_assignments")
      .select("id")
      .eq("coach_user_id", coachId)
      .eq("athlete_user_id", athleteId)
      .eq("active", true)
      .maybeSingle();
    if (assignmentErr) throw new Error(assignmentErr.message);
    if (!assignment?.id) throw new Error("FORBIDDEN_SCOPE");
  }

  const [
    profileRes,
    plannedRes,
    executedRes,
    feedbackRes,
    checkinsRes,
    metricsRes,
    exercisesRes,
    setsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, display_name, email").eq("id", athleteId).maybeSingle(),
    supabase
      .from("planned_sessions")
      .select("id, scheduled_for, session_template_id, payload")
      .eq("user_id", athleteId)
      .gte("scheduled_for", from)
      .lte("scheduled_for", to)
      .order("scheduled_for", { ascending: true }),
    supabase
      .from("executed_sessions")
      .select("id, planned_session_id, started_at, ended_at, payload")
      .eq("user_id", athleteId)
      .gte("started_at", `${from}T00:00:00.000Z`)
      .lte("started_at", `${to}T23:59:59.999Z`)
      .order("started_at", { ascending: true }),
    supabase
      .from("session_feedback")
      .select("id, executed_session_id, rating, soreness, notes, created_at")
      .eq("user_id", athleteId)
      .order("created_at", { ascending: true }),
    supabase
      .from("daily_checkins")
      .select("id, checkin_date, pain_score, fatigue_score, readiness_score, sleep_hours, stress_score, mood_score, notes")
      .eq("user_id", athleteId)
      .gte("checkin_date", from)
      .lte("checkin_date", to)
      .order("checkin_date", { ascending: true }),
    supabase
      .from("executed_session_metrics")
      .select("executed_session_id, total_exercises, total_sets, total_reps, tonnage_kg, avg_rpe, volume_score, intensity_score, strain_score, computed_at")
      .eq("user_id", athleteId)
      .order("computed_at", { ascending: true }),
    supabase
      .from("executed_session_exercises")
      .select("id, executed_session_id, position, exercise_name_snapshot, notes")
      .eq("user_id", athleteId)
      .order("position", { ascending: true }),
    supabase
      .from("executed_session_sets")
      .select("id, executed_session_exercise_id, set_index, reps, load_kg, rpe, rir, rest_seconds, completed")
      .eq("user_id", athleteId)
      .order("set_index", { ascending: true }),
  ]);

  if (profileRes.error) throw new Error(profileRes.error.message);
  if (plannedRes.error) throw new Error(plannedRes.error.message);
  if (executedRes.error) throw new Error(executedRes.error.message);
  if (feedbackRes.error) throw new Error(feedbackRes.error.message);
  if (checkinsRes.error) throw new Error(checkinsRes.error.message);
  if (metricsRes.error) throw new Error(metricsRes.error.message);
  if (exercisesRes.error) throw new Error(exercisesRes.error.message);
  if (setsRes.error) throw new Error(setsRes.error.message);

  const workbook = XLSX.utils.book_new();

  const profile = profileRes.data;
  const profileSheet = XLSX.utils.json_to_sheet([
    {
      athlete_id: athleteId,
      display_name: asString(profile?.display_name) ?? "",
      email: asString(profile?.email) ?? "",
      export_from: from,
      export_to: to,
      exported_at: new Date().toISOString(),
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, profileSheet, "athlete");

  const plannedSheet = XLSX.utils.json_to_sheet(
    (plannedRes.data ?? []).map((row) => ({
      id: row.id,
      scheduled_for: row.scheduled_for,
      session_template_id: row.session_template_id,
      payload_json: JSON.stringify(row.payload ?? {}),
    })),
  );
  XLSX.utils.book_append_sheet(workbook, plannedSheet, "planned_sessions");

  const executedSheet = XLSX.utils.json_to_sheet(
    (executedRes.data ?? []).map((row) => ({
      id: row.id,
      planned_session_id: row.planned_session_id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      payload_json: JSON.stringify(row.payload ?? {}),
    })),
  );
  XLSX.utils.book_append_sheet(workbook, executedSheet, "executed_sessions");

  const feedbackSheet = XLSX.utils.json_to_sheet(
    (feedbackRes.data ?? []).map((row) => ({
      id: row.id,
      executed_session_id: row.executed_session_id,
      rating: row.rating,
      soreness: row.soreness,
      notes: row.notes,
      created_at: row.created_at,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, feedbackSheet, "session_feedback");

  const checkinsSheet = XLSX.utils.json_to_sheet(checkinsRes.data ?? []);
  XLSX.utils.book_append_sheet(workbook, checkinsSheet, "daily_checkins");

  const metricsSheet = XLSX.utils.json_to_sheet(metricsRes.data ?? []);
  XLSX.utils.book_append_sheet(workbook, metricsSheet, "session_metrics");

  const exercisesSheet = XLSX.utils.json_to_sheet(exercisesRes.data ?? []);
  XLSX.utils.book_append_sheet(workbook, exercisesSheet, "session_exercises");

  const setsSheet = XLSX.utils.json_to_sheet(setsRes.data ?? []);
  XLSX.utils.book_append_sheet(workbook, setsSheet, "session_sets");

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const safeName = (asString(profile?.display_name) ?? athleteId).replace(/[^\w.-]+/g, "_");
  downloadArrayBufferAsFile(buffer, `tracknperf_${safeName}_${from}_${to}.xlsx`);
}
