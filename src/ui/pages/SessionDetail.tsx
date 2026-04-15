import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getExecutedSessionById, type ExecutedSessionDetail } from "../../application/usecases/getExecutedSessionById";
import { supabase } from "../../infra/supabase/client";
import type { ExplanationV1_1 } from "../../domain/engine/v1_1/types";
import { AppShell } from "../kit/AppShell";
import { Pill } from "../kit/Pill";
import { RecommendationExplanationCard } from "../components/RecommendationExplanationCard";

async function loadExplanationForSession(session: ExecutedSessionDetail): Promise<ExplanationV1_1 | null> {
  if (!supabase || !session.plannedSessionId) return null;
  const { data, error } = await supabase
    .from("recommendations")
    .select("id")
    .eq("plan_id", session.planId)
    .contains("input", { planned_session_id: session.plannedSessionId })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0 || !data[0]) return null;
  const recoId = String(data[0].id);
  const { data: expRows, error: expErr } = await supabase
    .from("recommendation_explanations")
    .select("content")
    .eq("recommendation_id", recoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (expErr || !expRows) return null;
  return expRows.content as ExplanationV1_1;
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [row, setRow] = useState<ExecutedSessionDetail | null>(null);
  const [explanation, setExplanation] = useState<ExplanationV1_1 | null>(null);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (!sessionId) {
        setMessage("Missing session id.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        const data = await getExecutedSessionById(sessionId);
        if (ignore) return;
        if (!data) {
          setRow(null);
          setMessage("Session not found (or you don't have access).");
          return;
        }
        setRow(data);
        const exp = await loadExplanationForSession(data);
        if (!ignore) setExplanation(exp);
      } catch (err) {
        if (!ignore) setMessage(err instanceof Error ? err.message : "Could not load session.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => { ignore = true; };
  }, [sessionId]);

  return (
    <AppShell
      title="Session"
      nav={[
        { to: "/today", label: "Today" },
        { to: "/history", label: "History" },
        { to: "/stats", label: "Stats" },
        { to: "/admin", label: "Admin" },
      ]}
    >
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[10%] right-[10%] w-[35vw] h-[35vw] bg-secondary/5 blur-[100px] rounded-full" />
      </div>

      {loading && (
        <div className="grid gap-4">
          <div className="rounded-[1.5rem] bg-surface-container-low h-32 animate-pulse" />
          <div className="rounded-[1.5rem] bg-surface-container-low h-48 animate-pulse" />
        </div>
      )}

      {message && (
        <div className="p-4 rounded-[1rem] bg-surface-container-highest text-sm text-on-surface-variant mb-4">
          {message}
        </div>
      )}

      {!loading && row && (
        <div className="grid gap-4">
          {/* Session header */}
          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h1 className="font-headline font-bold text-2xl tracking-tighter">Séance réalisée</h1>
              <Pill tone="primary">
                {row.startedAt.slice(11, 16)} → {row.endedAt ? row.endedAt.slice(11, 16) : "—"}
              </Pill>
            </div>
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest font-mono">
              {row.id}
            </div>

            {/* Payload summary */}
            {Object.keys(row.payload).length > 0 && (
              <div className="mt-4 grid gap-2">
                {typeof row.payload.rpe === "number" && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">RPE</span>
                    <span
                      className="font-headline font-bold text-lg tabular-nums"
                      style={{
                        color: (row.payload.rpe as number) >= 8 ? "#ff7351"
                          : (row.payload.rpe as number) >= 6 ? "#c57eff"
                          : "#cafd00",
                      }}
                    >
                      {row.payload.rpe as number}/10
                    </span>
                  </div>
                )}
                {typeof row.payload.mood === "string" && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">Ressenti</span>
                    <span className="text-sm font-bold text-on-surface capitalize">{row.payload.mood as string}</span>
                  </div>
                )}
                {typeof row.payload.painScore === "number" && (row.payload.painScore as number) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">Douleur</span>
                    <span className="text-sm font-bold text-error">
                      {row.payload.painScore as number}/10
                      {typeof row.payload.painLocation === "string" && row.payload.painLocation && (
                        <span className="font-normal text-on-surface-variant"> — {row.payload.painLocation as string}</span>
                      )}
                    </span>
                  </div>
                )}
                {typeof row.payload.notes === "string" && row.payload.notes && (
                  <div className="pt-2 text-sm text-on-surface-variant leading-relaxed">
                    {row.payload.notes as string}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recommendation explanation */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Recommandation moteur
              </span>
              <Pill tone="secondary">IA</Pill>
            </div>
            <RecommendationExplanationCard explanation={explanation} />
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <Link to="/history">
              <button className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-highest active:scale-95 transition-all">
                Historique
              </button>
            </Link>
            <Link to="/today">
              <button className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-highest active:scale-95 transition-all">
                Aujourd'hui
              </button>
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
