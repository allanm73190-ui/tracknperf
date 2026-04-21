import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getExecutedSessionById, type ExecutedSessionDetail } from "../../application/usecases/getExecutedSessionById";
import { inferSessionMode, sessionModeLabel } from "../../domain/session/sessionMode";
import { AppShell } from "../kit/AppShell";
import { Pill } from "../kit/Pill";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function getPayloadNumber(payload: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export default function SessionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [row, setRow] = useState<ExecutedSessionDetail | null>(null);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (!sessionId) {
        setMessage("Identifiant de séance manquant.");
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
          setMessage("Séance introuvable.");
          return;
        }
        setRow(data);
      } catch (err) {
        if (!ignore) setMessage(err instanceof Error ? err.message : "Impossible de charger la séance.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => {
      ignore = true;
    };
  }, [sessionId]);

  const fallbackMetrics = useMemo(() => {
    if (!row) return null;
    const payload = row.payload;
    const totalSets = typeof payload.totalSets === "number" ? payload.totalSets : null;
    const totalReps = typeof payload.totalReps === "number" ? payload.totalReps : null;
    const tonnageKg = typeof payload.tonnageKg === "number" ? payload.tonnageKg : null;
    const avgRpe = typeof payload.rpe === "number" ? payload.rpe : null;
    const durationMinutes = typeof payload.durationMinutes === "number" ? payload.durationMinutes : null;
    const runDistanceKm = typeof payload.runDistanceKm === "number" ? payload.runDistanceKm : null;
    const runLoad = typeof payload.runLoad === "number" ? payload.runLoad : null;
    const trainingLoad = typeof payload.trainingLoad === "number" ? payload.trainingLoad : null;
    const avgPaceSecPerKm = typeof payload.avgPaceSecPerKm === "number" ? payload.avgPaceSecPerKm : null;
    const elevationGainM = typeof payload.elevationGainM === "number" ? payload.elevationGainM : null;
    const avgHr = typeof payload.avgHr === "number" ? payload.avgHr : null;
    return {
      totalSets,
      totalReps,
      tonnageKg,
      avgRpe,
      durationMinutes,
      runDistanceKm,
      runLoad,
      trainingLoad,
      avgPaceSecPerKm,
      elevationGainM,
      avgHr,
    };
  }, [row]);

  const metricsPayload = useMemo(() => {
    if (!row?.metrics?.payload || typeof row.metrics.payload !== "object") return {};
    return row.metrics.payload;
  }, [row?.metrics?.payload]);

  const sessionMode = useMemo(() => {
    if (!row) return "mixed";
    return inferSessionMode({
      plannedPayload: {
        ...row.payload,
        session_mode: metricsPayload.session_mode,
      },
    });
  }, [row, metricsPayload.session_mode]);

  const durationMinutes = useMemo(() => {
    if (!row) return null;
    const fallback =
      getPayloadNumber(metricsPayload, "duration_minutes") ??
      fallbackMetrics?.durationMinutes;
    if (typeof fallback === "number") return fallback;
    if (!row.endedAt) return null;
    const ms = new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    return Math.round(ms / 60000);
  }, [row, fallbackMetrics?.durationMinutes, metricsPayload]);

  const runDistanceKm =
    getPayloadNumber(metricsPayload, "run_distance_km") ?? fallbackMetrics?.runDistanceKm ?? null;
  const runLoad =
    getPayloadNumber(metricsPayload, "run_load") ?? fallbackMetrics?.runLoad ?? null;
  const trainingLoad =
    getPayloadNumber(metricsPayload, "training_load") ?? fallbackMetrics?.trainingLoad ?? null;
  const avgPainScore =
    getPayloadNumber(metricsPayload, "avg_pain_score") ??
    getPayloadNumber(row?.payload ?? {}, "avgPainScore") ??
    null;
  const sessionPainScore =
    getPayloadNumber(metricsPayload, "session_pain_score") ??
    getPayloadNumber(row?.payload ?? {}, "sessionPainScore") ??
    null;
  const avgPaceSecPerKm =
    getPayloadNumber(metricsPayload, "avg_pace_sec_per_km") ?? fallbackMetrics?.avgPaceSecPerKm ?? null;
  const elevationGainM =
    getPayloadNumber(metricsPayload, "elevation_gain_m") ?? fallbackMetrics?.elevationGainM ?? null;
  const avgHr = getPayloadNumber(metricsPayload, "avg_hr") ?? fallbackMetrics?.avgHr ?? null;
  const showEnduranceSection =
    sessionMode === "endurance" ||
    sessionMode === "mixed" ||
    sessionMode === "recovery" ||
    runDistanceKm !== null ||
    runLoad !== null ||
    avgPaceSecPerKm !== null ||
    elevationGainM !== null ||
    avgHr !== null;

  return (
    <AppShell
      title="Séance réalisée"
      rightSlot={
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            padding: "6px 0",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Retour
        </button>
      }
    >
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[10%] right-[10%] w-[35vw] h-[35vw] bg-secondary/5 blur-[100px] rounded-full" />
      </div>

      {loading && (
        <div className="grid gap-4">
          <div className="rounded-[1.5rem] bg-surface-container-low h-32 animate-pulse" />
          <div className="rounded-[1.5rem] bg-surface-container-low h-48 animate-pulse" />
          <div className="rounded-[1.5rem] bg-surface-container-low h-48 animate-pulse" />
        </div>
      )}

      {message && (
        <div className="p-4 rounded-[1rem] bg-surface-container-highest text-sm text-on-surface-variant mb-4">
          {message}
        </div>
      )}

      {!loading && row && (
        <div className="grid gap-4 pb-8">
          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h1 className="font-headline font-black text-3xl tracking-tighter leading-none mb-2">Exécution complète</h1>
                <div className="text-sm text-on-surface-variant capitalize">{formatDateTime(row.startedAt)}</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Pill tone="secondary">{sessionModeLabel(sessionMode)}</Pill>
                <Pill tone="primary">
                  {row.startedAt.slice(11, 16)} → {row.endedAt ? row.endedAt.slice(11, 16) : "—"}
                </Pill>
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-mono break-all">
              {row.id}
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Métriques consolidées</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Sets</div>
                <div className="font-headline font-black text-2xl">
                  {row.metrics?.totalSets ?? fallbackMetrics?.totalSets ?? "—"}
                </div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Reps</div>
                <div className="font-headline font-black text-2xl">
                  {row.metrics?.totalReps ?? fallbackMetrics?.totalReps ?? "—"}
                </div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Tonnage</div>
                <div className="font-headline font-black text-2xl">
                  {round2(row.metrics?.tonnageKg ?? fallbackMetrics?.tonnageKg ?? 0)}
                </div>
                <div className="text-[10px] text-on-surface-variant">kg</div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">RPE moyen</div>
                <div className="font-headline font-black text-2xl">
                  {row.metrics?.avgRpe ?? fallbackMetrics?.avgRpe ?? "—"}
                </div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Durée</div>
                <div className="font-headline font-black text-2xl">{durationMinutes ?? "—"}</div>
                <div className="text-[10px] text-on-surface-variant">min</div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Charge totale</div>
                <div className="font-headline font-black text-2xl">{trainingLoad !== null ? round2(trainingLoad) : "—"}</div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Douleur</div>
                <div className="font-headline font-black text-2xl">
                  {avgPainScore !== null ? round2(avgPainScore) : sessionPainScore !== null ? round2(sessionPainScore) : "—"}
                </div>
                <div className="text-[10px] text-on-surface-variant">/10</div>
              </div>
            </div>
          </div>

          {showEnduranceSection && (
            <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Bloc endurance</div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-[1rem] bg-surface-container-highest p-3">
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Distance</div>
                  <div className="font-headline font-black text-2xl">
                    {runDistanceKm !== null ? round2(runDistanceKm) : "—"}
                  </div>
                  <div className="text-[10px] text-on-surface-variant">km</div>
                </div>
                <div className="rounded-[1rem] bg-surface-container-highest p-3">
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Charge course</div>
                  <div className="font-headline font-black text-2xl">{runLoad !== null ? round2(runLoad) : "—"}</div>
                </div>
                <div className="rounded-[1rem] bg-surface-container-highest p-3">
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Allure</div>
                  <div className="font-headline font-black text-2xl">
                    {avgPaceSecPerKm !== null ? round2(avgPaceSecPerKm) : "—"}
                  </div>
                  <div className="text-[10px] text-on-surface-variant">s/km</div>
                </div>
                <div className="rounded-[1rem] bg-surface-container-highest p-3">
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">D+</div>
                  <div className="font-headline font-black text-2xl">{elevationGainM !== null ? round2(elevationGainM) : "—"}</div>
                  <div className="text-[10px] text-on-surface-variant">m</div>
                </div>
                <div className="rounded-[1rem] bg-surface-container-highest p-3">
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">FC moy</div>
                  <div className="font-headline font-black text-2xl">{avgHr !== null ? round2(avgHr) : "—"}</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Détail des exercices
              </span>
              <Pill tone="secondary">{row.exercises.length} EXERCICE{row.exercises.length > 1 ? "S" : ""}</Pill>
            </div>

            {row.exercises.length === 0 ? (
              <div className="rounded-[1rem] bg-surface-container-highest p-4 text-sm text-on-surface-variant">
                {showEnduranceSection
                  ? "Aucun bloc force enregistré pour cette séance. Les métriques endurance sont affichées ci-dessus."
                  : "Aucun détail d'exercice n'a été enregistré pour cette séance."}
              </div>
            ) : (
              row.exercises.map((exercise) => (
                <div key={exercise.id} className="rounded-[1.5rem] bg-surface-container-low p-5 grid gap-3">
                  {(() => {
                    const exercisePain = getPayloadNumber(exercise.payload, "painScore", "pain_score");
                    return exercisePain !== null ? (
                      <div className="rounded-[0.9rem] bg-surface-container-highest px-3 py-2 text-xs text-on-surface-variant">
                        Douleur exercice: <span className="font-semibold text-on-surface">{round2(exercisePain)}/10</span>
                      </div>
                    ) : null;
                  })()}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">
                        Exercice {exercise.position}
                      </div>
                      <h3 className="font-headline font-black text-xl tracking-tight leading-none">{exercise.exerciseName}</h3>
                    </div>
                    <Pill tone="neutral">{exercise.sets.length} SET{exercise.sets.length > 1 ? "S" : ""}</Pill>
                  </div>

                  <div className="grid gap-2">
                    {exercise.sets.map((set) => (
                      <div key={set.id} className="rounded-[0.9rem] bg-surface-container-highest px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                            Set {set.setIndex}
                          </span>
                          <span className="text-sm text-on-surface">{set.reps ?? "—"} reps</span>
                          <span className="text-sm text-on-surface">{set.loadKg ?? "—"} kg</span>
                          <span className="text-sm text-on-surface">RPE {set.rpe ?? "—"}</span>
                          <span className="text-sm text-on-surface">RIR {set.rir ?? "—"}</span>
                          <span className="text-sm text-on-surface">Repos {set.restSeconds ?? "—"} s</span>
                          {getPayloadNumber(set.payload, "painScore", "pain_score") !== null && (
                            <span className="text-sm text-on-surface">
                              Douleur {round2(getPayloadNumber(set.payload, "painScore", "pain_score") ?? 0)}/10
                            </span>
                          )}
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{ color: set.completed ? "#cafd00" : "#ff7351" }}
                          >
                            {set.completed ? "VALIDÉ" : "NON FAIT"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {exercise.notes && (
                    <div className="rounded-[0.9rem] bg-surface-container-highest px-3 py-3 text-sm text-on-surface-variant">
                      {exercise.notes}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {typeof row.payload.notes === "string" && row.payload.notes && (
            <div className="rounded-[1rem] bg-surface-container-highest p-4 text-sm text-on-surface-variant leading-relaxed">
              {row.payload.notes}
            </div>
          )}

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
