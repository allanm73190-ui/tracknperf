import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlannedSessionById,
  type PlannedSessionDetail,
  type PlannedSessionTemplateExercise,
} from "../../application/usecases/getPlannedSessionById";
import { logExecutedSessionDetailed } from "../../application/usecases/logExecutedSessionDetailed";
import { getTodayOverview } from "../../application/usecases/getTodayOverview";
import { computeAndPersistTodayRecommendation } from "../../application/usecases/computeAndPersistTodayRecommendation";
import { AppShell } from "../kit/AppShell";

type SetDraft = {
  setIndex: number;
  reps: string;
  loadKg: string;
  rpe: string;
  rir: string;
  restSeconds: string;
  completed: boolean;
};

type ExerciseDraft = {
  localId: string;
  sessionTemplateExerciseId: string | null;
  position: number;
  exerciseName: string;
  seriesRaw: string | null;
  repsRaw: string | null;
  loadRaw: string | null;
  tempoRaw: string | null;
  restRaw: string | null;
  rirRaw: string | null;
  coachNotes: string | null;
  notes: string;
  sets: SetDraft[];
};

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function nowIsoTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseLocalTimeToDate(today: Date, time: string): Date | null {
  const m = time.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date(today);
  d.setHours(h, min, 0, 0);
  return d;
}

function estimateSetCount(exercise: PlannedSessionTemplateExercise): number {
  const source = [exercise.seriesRaw, exercise.repsRaw].filter(Boolean).join(" ");
  if (!source) return 3;

  const plusNumbers = Array.from(source.matchAll(/\b(\d+)\b/g)).map((m) => Number(m[1]));
  if (plusNumbers.length > 1) {
    const sum = plusNumbers.reduce((acc, n) => acc + n, 0);
    return Math.max(1, Math.min(8, sum));
  }
  if (plusNumbers.length === 1) {
    return Math.max(1, Math.min(8, plusNumbers[0] ?? 3));
  }
  return 3;
}

function makeInitialSets(count: number): SetDraft[] {
  const safeCount = Math.max(1, Math.min(8, count));
  return Array.from({ length: safeCount }, (_, idx) => ({
    setIndex: idx + 1,
    reps: "",
    loadKg: "",
    rpe: "",
    rir: "",
    restSeconds: "",
    completed: true,
  }));
}

function toNullableNumber(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toNullableInteger(input: string): number | null {
  const n = toNullableNumber(input);
  if (n === null) return null;
  const rounded = Math.round(n);
  return Number.isFinite(rounded) ? rounded : null;
}

function computeLiveMetrics(exercises: ExerciseDraft[]): {
  totalSets: number;
  totalReps: number;
  tonnageKg: number;
  avgRpe: number | null;
} {
  let totalSets = 0;
  let totalReps = 0;
  let tonnageKg = 0;
  let rpeSum = 0;
  let rpeCount = 0;

  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (!set.completed) continue;
      totalSets += 1;
      const reps = toNullableInteger(set.reps);
      const loadKg = toNullableNumber(set.loadKg);
      const rpe = toNullableNumber(set.rpe);
      if (reps !== null && reps > 0) {
        totalReps += reps;
        if (loadKg !== null && loadKg > 0) {
          tonnageKg += reps * loadKg;
        }
      }
      if (rpe !== null) {
        rpeSum += rpe;
        rpeCount += 1;
      }
    }
  }

  return {
    totalSets,
    totalReps,
    tonnageKg: Math.round(tonnageKg * 100) / 100,
    avgRpe: rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 100) / 100 : null,
  };
}

function fromTemplateExercises(templateExercises: PlannedSessionTemplateExercise[]): ExerciseDraft[] {
  const sorted = templateExercises
    .slice()
    .sort((a, b) => a.position - b.position);
  return sorted.map((exercise) => ({
    localId: crypto.randomUUID(),
    sessionTemplateExerciseId: exercise.id,
    position: exercise.position,
    exerciseName: exercise.exerciseName,
    seriesRaw: exercise.seriesRaw,
    repsRaw: exercise.repsRaw,
    loadRaw: exercise.loadRaw,
    tempoRaw: exercise.tempoRaw,
    restRaw: exercise.restRaw,
    rirRaw: exercise.rirRaw,
    coachNotes: exercise.coachNotes,
    notes: "",
    sets: makeInitialSets(estimateSetCount(exercise)),
  }));
}

export default function PlannedSessionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<PlannedSessionDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(() => nowIsoTime(new Date(Date.now() - 60 * 60 * 1000)));
  const [endTime, setEndTime] = useState(() => nowIsoTime(new Date()));
  const [globalNotes, setGlobalNotes] = useState("");
  const [draftExercises, setDraftExercises] = useState<ExerciseDraft[]>([]);
  const [loggedId, setLoggedId] = useState<string | null>(null);

  const liveMetrics = useMemo(() => computeLiveMetrics(draftExercises), [draftExercises]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!sessionId) {
        setMessage("Identifiant manquant.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        const data = await getPlannedSessionById(sessionId);
        if (ignore) return;
        if (!data) {
          setMessage("Séance introuvable.");
          setSession(null);
          setDraftExercises([]);
          return;
        }
        setSession(data);
        setDraftExercises(fromTemplateExercises(data.templateExercises));
      } catch (err) {
        if (!ignore) {
          setMessage(err instanceof Error ? err.message : "Erreur de chargement.");
          setSession(null);
          setDraftExercises([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [sessionId]);

  function updateExerciseNotes(localId: string, notes: string) {
    setDraftExercises((prev) => prev.map((ex) => (ex.localId === localId ? { ...ex, notes } : ex)));
  }

  function updateSetField(localId: string, setIndex: number, field: keyof SetDraft, value: string | boolean) {
    setDraftExercises((prev) =>
      prev.map((ex) => {
        if (ex.localId !== localId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((set) => {
            if (set.setIndex !== setIndex) return set;
            return {
              ...set,
              [field]: value,
            } as SetDraft;
          }),
        };
      }),
    );
  }

  function addSet(localId: string) {
    setDraftExercises((prev) =>
      prev.map((ex) => {
        if (ex.localId !== localId) return ex;
        const nextIndex = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1]!.setIndex + 1 : 1;
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              setIndex: nextIndex,
              reps: "",
              loadKg: "",
              rpe: "",
              rir: "",
              restSeconds: "",
              completed: true,
            },
          ],
        };
      }),
    );
  }

  function removeSet(localId: string, setIndex: number) {
    setDraftExercises((prev) =>
      prev.map((ex) => {
        if (ex.localId !== localId) return ex;
        const filtered = ex.sets.filter((set) => set.setIndex !== setIndex);
        const reIndexed = filtered.map((set, idx) => ({ ...set, setIndex: idx + 1 }));
        return {
          ...ex,
          sets: reIndexed.length > 0 ? reIndexed : makeInitialSets(1),
        };
      }),
    );
  }

  async function onSubmit() {
    if (!session || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const today = new Date();
      const startedAt = parseLocalTimeToDate(today, startTime);
      const endedAt = parseLocalTimeToDate(today, endTime);
      if (!startedAt || !endedAt) throw new Error("Horaires invalides (format HH:MM requis).");
      if (endedAt.getTime() < startedAt.getTime()) throw new Error("L'heure de fin doit être après le début.");

      const payloadExercises = draftExercises.map((ex) => ({
        sessionTemplateExerciseId: ex.sessionTemplateExerciseId,
        position: ex.position,
        exerciseName: ex.exerciseName,
        notes: ex.notes.trim() || null,
        sets: ex.sets.map((set) => ({
          setIndex: set.setIndex,
          reps: toNullableInteger(set.reps),
          loadKg: toNullableNumber(set.loadKg),
          rpe: toNullableNumber(set.rpe),
          rir: toNullableNumber(set.rir),
          restSeconds: toNullableInteger(set.restSeconds),
          completed: set.completed,
        })),
      }));

      const res = await logExecutedSessionDetailed({
        plannedSessionId: session.id,
        planId: session.planId,
        startedAt,
        endedAt,
        notes: globalNotes.trim() || null,
        exercises: payloadExercises,
      });

      setLoggedId(res.id);

      try {
        const next = await getTodayOverview();
        await computeAndPersistTodayRecommendation(next);
      } catch {
        // Non bloquant
      }

      setMessage("Séance enregistrée avec le détail complet (exercices, séries, charges).\nLes métriques ont été calculées et synchronisées.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Séance planifiée"
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
          }}
        >
          ← Retour
        </button>
      }
    >
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[5%] left-[8%] w-[45vw] h-[45vw] bg-primary-container/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[10%] w-[35vw] h-[35vw] bg-secondary/5 blur-[100px] rounded-full" />
      </div>

      {loading && (
        <div className="grid gap-4">
          <div className="rounded-[1.5rem] bg-surface-container-low h-36 animate-pulse" />
          <div className="rounded-[1.5rem] bg-surface-container-low h-72 animate-pulse" />
        </div>
      )}

      {!loading && message && (
        <div className="p-4 rounded-[1rem] bg-surface-container-highest text-sm text-on-surface-variant mb-4 whitespace-pre-wrap">
          {message}
        </div>
      )}

      {!loading && session && (
        <div className="grid gap-4 pb-12">
          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Planifié</div>
            <h1 style={{ fontFamily: "var(--font-headline)" }} className="text-3xl font-black tracking-tighter leading-none mb-2">
              {session.templateName ?? "Séance"}
            </h1>
            <div className="text-sm text-on-surface-variant capitalize">{formatDate(session.scheduledFor)}</div>
          </div>

          <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Métriques en direct</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Sets</div>
                <div className="font-headline font-black text-2xl">{liveMetrics.totalSets}</div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Reps</div>
                <div className="font-headline font-black text-2xl">{liveMetrics.totalReps}</div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Tonnage</div>
                <div className="font-headline font-black text-2xl">{liveMetrics.tonnageKg}</div>
                <div className="text-[10px] text-on-surface-variant">kg</div>
              </div>
              <div className="rounded-[1rem] bg-surface-container-highest p-3">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">RPE moyen</div>
                <div className="font-headline font-black text-2xl">{liveMetrics.avgRpe ?? "—"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2">
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Début</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.currentTarget.value)}
                  className="rounded-[0.875rem] bg-surface-container-highest text-on-surface p-3 text-sm"
                  style={{ border: 0 }}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Fin</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.currentTarget.value)}
                  className="rounded-[0.875rem] bg-surface-container-highest text-on-surface p-3 text-sm"
                  style={{ border: 0 }}
                />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Notes de séance</span>
              <textarea
                value={globalNotes}
                onChange={(e) => setGlobalNotes(e.currentTarget.value)}
                rows={2}
                className="rounded-[0.875rem] bg-surface-container-highest text-on-surface p-3 text-sm resize-y"
                style={{ border: 0 }}
                placeholder="Ressenti global, contexte, ajustements..."
              />
            </label>
          </div>

          <div className="grid gap-4">
            {draftExercises.map((exercise) => (
              <div key={exercise.localId} className="rounded-[1.5rem] bg-surface-container-low p-5 grid gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">
                      Exercice {exercise.position}
                    </div>
                    <h3 style={{ fontFamily: "var(--font-headline)" }} className="text-xl font-black tracking-tight">
                      {exercise.exerciseName}
                    </h3>
                    <div className="text-xs text-on-surface-variant mt-2 grid gap-1">
                      <div>Séries prévues: {exercise.seriesRaw ?? "—"}</div>
                      <div>Reps cibles: {exercise.repsRaw ?? "—"}</div>
                      <div>Charge cible: {exercise.loadRaw ?? "—"}</div>
                      <div>Tempo: {exercise.tempoRaw ?? "—"} · Repos: {exercise.restRaw ?? "—"} · RIR: {exercise.rirRaw ?? "—"}</div>
                    </div>
                    {exercise.coachNotes && (
                      <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">{exercise.coachNotes}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  {exercise.sets.map((set) => (
                    <div key={set.setIndex} className="rounded-[0.9rem] bg-surface-container-highest p-3 grid gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                          Set {set.setIndex}
                        </span>
                        <button
                          onClick={() => removeSet(exercise.localId, set.setIndex)}
                          className="text-[10px] uppercase tracking-widest text-on-surface-variant"
                          type="button"
                        >
                          Retirer
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <label className="grid gap-1">
                          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">Reps</span>
                          <input
                            value={set.reps}
                            onChange={(e) => updateSetField(exercise.localId, set.setIndex, "reps", e.currentTarget.value)}
                            className="rounded-[0.625rem] bg-surface-container text-on-surface px-2 py-1.5 text-sm"
                            style={{ border: 0 }}
                            inputMode="numeric"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">Charge (kg)</span>
                          <input
                            value={set.loadKg}
                            onChange={(e) => updateSetField(exercise.localId, set.setIndex, "loadKg", e.currentTarget.value)}
                            className="rounded-[0.625rem] bg-surface-container text-on-surface px-2 py-1.5 text-sm"
                            style={{ border: 0 }}
                            inputMode="decimal"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">RPE</span>
                          <input
                            value={set.rpe}
                            onChange={(e) => updateSetField(exercise.localId, set.setIndex, "rpe", e.currentTarget.value)}
                            className="rounded-[0.625rem] bg-surface-container text-on-surface px-2 py-1.5 text-sm"
                            style={{ border: 0 }}
                            inputMode="decimal"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">RIR</span>
                          <input
                            value={set.rir}
                            onChange={(e) => updateSetField(exercise.localId, set.setIndex, "rir", e.currentTarget.value)}
                            className="rounded-[0.625rem] bg-surface-container text-on-surface px-2 py-1.5 text-sm"
                            style={{ border: 0 }}
                            inputMode="decimal"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">Repos (s)</span>
                          <input
                            value={set.restSeconds}
                            onChange={(e) => updateSetField(exercise.localId, set.setIndex, "restSeconds", e.currentTarget.value)}
                            className="rounded-[0.625rem] bg-surface-container text-on-surface px-2 py-1.5 text-sm"
                            style={{ border: 0 }}
                            inputMode="numeric"
                          />
                        </label>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                        <input
                          type="checkbox"
                          checked={set.completed}
                          onChange={(e) => updateSetField(exercise.localId, set.setIndex, "completed", e.currentTarget.checked)}
                        />
                        Set validé
                      </label>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => addSet(exercise.localId)}
                    className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-highest text-on-surface-variant active:scale-95"
                  >
                    Ajouter un set
                  </button>
                  <label className="grid gap-1 flex-1">
                    <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Notes exercice</span>
                    <input
                      value={exercise.notes}
                      onChange={(e) => updateExerciseNotes(exercise.localId, e.currentTarget.value)}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                      style={{ border: 0 }}
                      placeholder="Technique, douleur, adaptation..."
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={saving || draftExercises.length === 0}
            className="w-full py-4 rounded-[1rem] font-bold text-sm uppercase tracking-widest text-[#3a4a00] active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)" }}
          >
            {saving ? "Enregistrement..." : "Valider la séance détaillée"}
          </button>

          {loggedId && (
            <div className="rounded-[1rem] bg-surface-container-highest p-4 text-sm text-on-surface-variant">
              ID exécution: {loggedId}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
