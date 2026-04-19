import { supabase } from "./client";
import type { FatigueSnapshot } from "../../domain/engine/fatigue/computeFatigueSnapshot";
import type { ReadinessSnapshot } from "../../domain/engine/readiness/computeReadinessSnapshot";

export async function saveLatestFatigueSnapshot(userId: string, snapshot: FatigueSnapshot): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("fatigue_snapshots").insert({
    user_id: userId,
    captured_at: snapshot.computedAt,
    score: snapshot.score,
    dimensions: snapshot.dimensions,
    data_quality_score: snapshot.dataQualityScore,
    algorithm_version: snapshot.algorithmVersion,
    payload: {},
  });
  if (error) throw new Error(error.message);
}

export async function getLatestFatigueSnapshot(userId: string): Promise<FatigueSnapshot | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("fatigue_snapshots")
    .select("score, dimensions, data_quality_score, algorithm_version, captured_at")
    .eq("user_id", userId)
    .not("score", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.score === null) return null;
  return {
    score: Number(data.score),
    dimensions: (data.dimensions as { general: number }) ?? { general: Number(data.score) },
    dataQualityScore: data.data_quality_score !== null ? Number(data.data_quality_score) : 0.5,
    algorithmVersion: String(data.algorithm_version ?? "unknown"),
    computedAt: String(data.captured_at),
  };
}

export async function saveLatestReadinessSnapshot(userId: string, snapshot: ReadinessSnapshot): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("readiness_snapshots").insert({
    user_id: userId,
    captured_at: snapshot.computedAt,
    score: snapshot.score,
    limiting_factor: snapshot.limitingFactor,
    algorithm_version: snapshot.algorithmVersion,
    payload: {},
  });
  if (error) throw new Error(error.message);
}

export async function getLatestReadinessSnapshot(userId: string): Promise<ReadinessSnapshot | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("readiness_snapshots")
    .select("score, limiting_factor, algorithm_version, captured_at")
    .eq("user_id", userId)
    .not("score", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.score === null) return null;
  return {
    score: Number(data.score),
    limitingFactor: (data.limiting_factor as "none" | "fatigue" | "data") ?? "none",
    algorithmVersion: String(data.algorithm_version ?? "unknown"),
    computedAt: String(data.captured_at),
  };
}
