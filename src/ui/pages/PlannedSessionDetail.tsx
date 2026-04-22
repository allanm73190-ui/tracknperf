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
import { inferSessionMode, sessionModeLabel, type SessionMode } from "../../domain/session/sessionMode";

type ExerciseDraft = {
  localId: string;
  plannedSessionItemLiveId: string | null;
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
  completedSeries: string;
  completedReps: string;
  completedRpe: string;
  painScore: string;
};

type EnduranceDraft = {
  durationMinutes: string;
  distanceKm: string;
  elevationGainM: string;
  avgHr: string;
  rpe: string;
  notes: string;
};

type PlannedEnduranceTargets = {
  durationMinutes: string;
  distanceKm: string;
  elevationGainM: string;
  rpe: string;
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

function toNullablePainScore(input: string): number | null {
  const n = toNullableNumber(input);
  if (n === null) return null;
  if (n < 0 || n > 10) return null;
  return n;
}

function toInputNumber(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return "";
}

function pickNumberFromText(text: string, regex: RegExp): string | null {
  const m = text.match(regex);
  if (!m?.[1]) return null;
  const n = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 100) / 100);
}

function inferLegacyEnduranceTargets(
  session: PlannedSessionDetail | null,
  exercises: ExerciseDraft[],
): PlannedEnduranceTargets {
  const payload = session?.payload ?? {};
  const fromPayloadDuration = toInputNumber(payload.durationMinutes);
  const fromPayloadDistance = toInputNumber(payload.distanceKm ?? payload.runDistanceKm);
  const fromPayloadElevation = toInputNumber(payload.elevationGainM);
  const fromPayloadRpe = toInputNumber(payload.rpe);

  const textCandidates = [
    typeof payload.text === "string" ? payload.text : "",
    ...exercises.map((ex) => ex.coachNotes ?? ""),
    ...exercises.map((ex) => ex.repsRaw ?? ""),
    ...exercises.map((ex) => ex.seriesRaw ?? ""),
  ]
    .filter((s) => s.trim().length > 0)
    .join(" \n ");

  const durationFromHours = (() => {
    const m = textCandidates.match(/(\d{1,2})\s*h(?:\s*(\d{1,2}))?/i);
    if (!m?.[1]) return null;
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    return String(h * 60 + min);
  })();
  const durationFromMinutes = pickNumberFromText(textCandidates, /(\d{2,3})\s*min/i);
  const distanceFromText = pickNumberFromText(textCandidates, /(\d+(?:[.,]\d+)?)\s*km/i);
  const elevationFromText =
    pickNumberFromText(textCandidates, /d\+\s*(\d+(?:[.,]\d+)?)/i) ??
    pickNumberFromText(textCandidates, /(\d+(?:[.,]\d+)?)\s*m\s*(?:de\s*)?d\+/i);
  const rpeFromText = pickNumberFromText(textCandidates, /rpe\s*([0-9]+(?:[.,][0-9]+)?)/i);

  return {
    durationMinutes: fromPayloadDuration || durationFromHours || durationFromMinutes || "",
    distanceKm: fromPayloadDistance || distanceFromText || "",
    elevationGainM: fromPayloadElevation || elevationFromText || "",
    rpe: fromPayloadRpe || rpeFromText || "",
  };
}

function computeDurationMinutesFromTimes(startTime: string, endTime: string): number | null {
  const today = new Date();
  const start = parseLocalTimeToDate(today, startTime);
  const end = parseLocalTimeToDate(today, endTime);
  if (!start || !end) return null;
  const delta = end.getTime() - start.getTime();
  if (!Number.isFinite(delta) || delta < 0) return null;
  return Math.round(delta / 60000);
}

function computeLiveMetrics(args: {
  exercises: ExerciseDraft[];
  endurance: EnduranceDraft;
  durationFromTimes: number | null;
  sessionPainScore: string;
}): {
  totalSets: number;
  totalReps: number;
  tonnageKg: number;
  avgRpe: number | null;
  avgPainScore: number | null;
  durationMinutes: number | null;
  runDistanceKm: number | null;
  runLoad: number | null;
  avgPaceSecPerKm: number | null;
  trainingLoad: number;
} {
  let totalSets = 0;
  let totalReps = 0;
  let tonnageKg = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  const painValues: number[] = [];

  const sessionPain = toNullableNumber(args.sessionPainScore);
  if (sessionPain !== null && sessionPain >= 0 && sessionPain <= 10) {
    painValues.push(sessionPain);
  }

  for (const ex of args.exercises) {
    const exercisePain = toNullableNumber(ex.painScore);
    if (exercisePain !== null && exercisePain >= 0 && exercisePain <= 10) {
      painValues.push(exercisePain);
    }
    const completedSeries = toNullableInteger(ex.completedSeries);
    const safeSeriesCount = completedSeries !== null && completedSeries > 0 ? Math.min(30, completedSeries) : 0;
    const reps = toNullableInteger(ex.completedReps);
    const rpe = toNullableNumber(ex.completedRpe);

    totalSets += safeSeriesCount;
    if (safeSeriesCount > 0 && reps !== null && reps > 0) {
      totalReps += reps * safeSeriesCount;
    }
    if (safeSeriesCount > 0 && rpe !== null) {
      rpeSum += rpe * safeSeriesCount;
      rpeCount += safeSeriesCount;
    }
  }

  const avgRpeStrength = rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 100) / 100 : null;
  const distanceKm = toNullableNumber(args.endurance.distanceKm);
  const explicitDuration = toNullableInteger(args.endurance.durationMinutes);
  const durationMinutes = explicitDuration ?? args.durationFromTimes;
  const enduranceRpe = toNullableNumber(args.endurance.rpe);
  const runLoad = durationMinutes !== null && enduranceRpe !== null ? Math.round(durationMinutes * enduranceRpe * 100) / 100 : null;
  const avgPaceSecPerKm =
    durationMinutes !== null && distanceKm !== null && distanceKm > 0
      ? Math.round((durationMinutes * 60 / distanceKm) * 100) / 100
      : null;
  const avgRpe = enduranceRpe ?? avgRpeStrength;
  const avgPainScore =
    painValues.length > 0 ? Math.round((painValues.reduce((acc, value) => acc + value, 0) / painValues.length) * 100) / 100 : null;
  const trainingLoad = Math.round(((runLoad ?? 0) + tonnageKg / 100) * 100) / 100;

  return {
    totalSets,
    totalReps,
    tonnageKg: Math.round(tonnageKg * 100) / 100,
    avgRpe,
    avgPainScore,
    durationMinutes,
    runDistanceKm: distanceKm,
    runLoad,
    avgPaceSecPerKm,
    trainingLoad,
  };
}

function fromTemplateExercises(templateExercises: PlannedSessionTemplateExercise[]): ExerciseDraft[] {
  const sorted = templateExercises
    .slice()
    .sort((a, b) => a.position - b.position);
  return sorted.map((exercise) => ({
    localId: crypto.randomUUID(),
    plannedSessionItemLiveId: exercise.plannedSessionItemLiveId,
    sessionTemplateExerciseId: exercise.sessionTemplateExerciseId,
    position: exercise.position,
    exerciseName: exercise.exerciseName,
    seriesRaw: exercise.seriesRaw,
    repsRaw: exercise.repsRaw,
    loadRaw: exercise.loadRaw,
    tempoRaw: exercise.tempoRaw,
    restRaw: exercise.restRaw,
    rirRaw: exercise.rirRaw,
    coachNotes: exercise.coachNotes,
    completedSeries: String(estimateSetCount(exercise)),
    completedReps: "",
    completedRpe: "",
    painScore: "",
  }));
}

function makeManualExercise(position: number): ExerciseDraft {
  return {
    localId: crypto.randomUUID(),
    plannedSessionItemLiveId: null,
    sessionTemplateExerciseId: null,
    position,
    exerciseName: "",
    seriesRaw: null,
    repsRaw: null,
    loadRaw: null,
    tempoRaw: null,
    restRaw: null,
    rirRaw: null,
    coachNotes: null,
    completedSeries: "3",
    completedReps: "",
    completedRpe: "",
    painScore: "",
  };
}

function resolveSessionMode(session: PlannedSessionDetail | null): SessionMode {
  if (!session) return "mixed";
  return inferSessionMode({
    plannedPayload: session.payload,
    templatePayload: session.templatePayload,
    templateName: session.templateName,
  });
}

function makeInitialEnduranceDraft(session: PlannedSessionDetail | null): EnduranceDraft {
  if (!session) {
    return {
      durationMinutes: "",
      distanceKm: "",
      elevationGainM: "",
      avgHr: "",
      rpe: "",
      notes: "",
    };
  }
  const payload = session.payload ?? {};
  const endurancePayload =
    payload.endurance && typeof payload.endurance === "object"
      ? (payload.endurance as Record<string, unknown>)
      : {};

  return {
    durationMinutes: toInputNumber(endurancePayload.durationMinutes ?? payload.durationMinutes),
    distanceKm: toInputNumber(endurancePayload.distanceKm ?? payload.runDistanceKm),
    elevationGainM: toInputNumber(endurancePayload.elevationGainM ?? payload.elevationGainM),
    avgHr: toInputNumber(endurancePayload.avgHr ?? payload.avgHr),
    rpe: toInputNumber(endurancePayload.rpe ?? payload.rpe),
    notes:
      typeof endurancePayload.notes === "string" && endurancePayload.notes.trim().length > 0
        ? endurancePayload.notes.trim()
        : "",
  };
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
  const [sessionPainScore, setSessionPainScore] = useState("");
  const [globalNotes, setGlobalNotes] = useState("");
  const [draftExercises, setDraftExercises] = useState<ExerciseDraft[]>([]);
  const [enduranceDraft, setEnduranceDraft] = useState<EnduranceDraft>(makeInitialEnduranceDraft(null));
  const [loggedId, setLoggedId] = useState<string | null>(null);

  const sessionMode = useMemo(() => resolveSessionMode(session), [session]);
  const durationFromTimes = useMemo(() => computeDurationMinutesFromTimes(startTime, endTime), [startTime, endTime]);

  const liveMetrics = useMemo(
    () => computeLiveMetrics({ exercises: draftExercises, endurance: enduranceDraft, durationFromTimes, sessionPainScore }),
    [draftExercises, enduranceDraft, durationFromTimes, sessionPainScore],
  );
  const plannedEnduranceTargets = useMemo(
    () => inferLegacyEnduranceTargets(session, draftExercises),
    [session, draftExercises],
  );
  const safeSessionPainScore = useMemo(() => {
    const parsed = toNullableNumber(sessionPainScore);
    if (parsed === null) return 0;
    return Math.max(0, Math.min(10, Math.round(parsed)));
  }, [sessionPainScore]);

  const isStrengthLikeMode = sessionMode === "strength" || sessionMode === "mixed";
  const showEndurancePanel = sessionMode === "endurance" || sessionMode === "mixed" || sessionMode === "recovery";
  const showExercisePanel = isStrengthLikeMode || draftExercises.length > 0;
  const requiresStrengthDetails = isStrengthLikeMode;

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
          setEnduranceDraft(makeInitialEnduranceDraft(null));
          setSessionPainScore("");
          return;
        }
        const nextMode = inferSessionMode({
          plannedPayload: data.payload,
          templatePayload: data.templatePayload,
          templateName: data.templateName,
        });
        const importedExercises = fromTemplateExercises(data.templateExercises);
        setSession(data);
        const shouldSeedManualExercise = importedExercises.length === 0 && (nextMode === "strength" || nextMode === "mixed");
        const nextExercises = shouldSeedManualExercise ? [makeManualExercise(1)] : importedExercises;
        setDraftExercises(nextExercises);
        const inferredEndurance = inferLegacyEnduranceTargets(data, importedExercises);
        const initialEndurance = makeInitialEnduranceDraft(data);
        setEnduranceDraft({
          durationMinutes: initialEndurance.durationMinutes || inferredEndurance.durationMinutes,
          distanceKm: initialEndurance.distanceKm || inferredEndurance.distanceKm,
          elevationGainM: initialEndurance.elevationGainM || inferredEndurance.elevationGainM,
          avgHr: initialEndurance.avgHr,
          rpe: initialEndurance.rpe || inferredEndurance.rpe,
          notes: initialEndurance.notes,
        });
        setSessionPainScore(toInputNumber(data.payload?.sessionPainScore ?? data.payload?.painScore));
      } catch (err) {
        if (!ignore) {
          setMessage(err instanceof Error ? err.message : "Erreur de chargement.");
          setSession(null);
          setDraftExercises([]);
          setEnduranceDraft(makeInitialEnduranceDraft(null));
          setSessionPainScore("");
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

  function updateExerciseName(localId: string, exerciseName: string) {
    setDraftExercises((prev) => prev.map((ex) => (ex.localId === localId ? { ...ex, exerciseName } : ex)));
  }

  function updateExerciseCompletedSeries(localId: string, completedSeries: string) {
    setDraftExercises((prev) => prev.map((ex) => (ex.localId === localId ? { ...ex, completedSeries } : ex)));
  }

  function updateExerciseCompletedReps(localId: string, completedReps: string) {
    setDraftExercises((prev) => prev.map((ex) => (ex.localId === localId ? { ...ex, completedReps } : ex)));
  }

  function updateExerciseCompletedRpe(localId: string, completedRpe: string) {
    setDraftExercises((prev) => prev.map((ex) => (ex.localId === localId ? { ...ex, completedRpe } : ex)));
  }

  function updateExercisePain(localId: string, painScore: string) {
    setDraftExercises((prev) => prev.map((ex) => (ex.localId === localId ? { ...ex, painScore } : ex)));
  }

  function updateEnduranceField(field: keyof EnduranceDraft, value: string) {
    setEnduranceDraft((prev) => ({ ...prev, [field]: value }));
  }

  function addExercise() {
    setDraftExercises((prev) => {
      const next = [...prev, makeManualExercise(prev.length + 1)];
      return next.map((ex, idx) => ({ ...ex, position: idx + 1 }));
    });
  }

  function removeExercise(localId: string) {
    setDraftExercises((prev) => {
      const filtered = prev.filter((ex) => ex.localId !== localId);
      const next = filtered.length > 0 ? filtered : [makeManualExercise(1)];
      return next.map((ex, idx) => ({ ...ex, position: idx + 1 }));
    });
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

      if (requiresStrengthDetails && draftExercises.length === 0) {
        throw new Error("Une séance force requiert au moins un exercice détaillé.");
      }

      if (requiresStrengthDetails) {
        for (const ex of draftExercises) {
          const series = toNullableInteger(ex.completedSeries);
          if (series === null || series < 1) {
            throw new Error(`Exercice "${ex.exerciseName || `#${ex.position}`}": renseignez au moins 1 série.`);
          }
        }
      }

      const payloadExercises = draftExercises.map((ex, idx) => {
        const seriesCountRaw = toNullableInteger(ex.completedSeries);
        const seriesCount = seriesCountRaw !== null && seriesCountRaw > 0 ? Math.min(30, seriesCountRaw) : 0;
        const reps = toNullableInteger(ex.completedReps);
        const rpe = toNullableNumber(ex.completedRpe);
        return {
          plannedSessionItemLiveId: ex.plannedSessionItemLiveId,
          sessionTemplateExerciseId: ex.sessionTemplateExerciseId,
          position: idx + 1,
          exerciseName: ex.exerciseName.trim() || `Exercice ${idx + 1}`,
          notes: null,
          payload: {
            painScore: toNullablePainScore(ex.painScore),
          },
          sets: Array.from({ length: seriesCount }, (_, setIdx) => ({
            setIndex: setIdx + 1,
            reps,
            loadKg: null,
            rpe,
            rir: null,
            restSeconds: null,
            completed: true,
            payload: {},
          })),
        };
      });

      const res = await logExecutedSessionDetailed({
        plannedSessionId: session.id,
        planId: session.planId,
        startedAt,
        endedAt,
        sessionMode,
        notes: globalNotes.trim() || null,
        sessionPainScore: toNullableNumber(sessionPainScore),
        exercises: payloadExercises,
        enduranceMetrics: {
          durationMinutes: toNullableInteger(enduranceDraft.durationMinutes) ?? durationFromTimes,
          distanceKm: toNullableNumber(enduranceDraft.distanceKm),
          elevationGainM: toNullableNumber(enduranceDraft.elevationGainM),
          avgHr: toNullableNumber(enduranceDraft.avgHr),
          rpe: toNullableNumber(enduranceDraft.rpe),
          notes: enduranceDraft.notes.trim() || null,
        },
      });

      setLoggedId(res.id);

      try {
        const next = await getTodayOverview();
        await computeAndPersistTodayRecommendation(next);
      } catch {
        // Non bloquant
      }

      setMessage(
        "Séance enregistrée avec détail complet et métriques multi-mode (charge, volume, intensité, strain).",
      );
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
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Planifié</div>
              <div className="text-[10px] px-3 py-1 rounded-full bg-surface-container-highest text-secondary font-bold tracking-widest">
                {sessionModeLabel(sessionMode)}
              </div>
            </div>
            <h1 style={{ fontFamily: "var(--font-headline)" }} className="text-3xl font-black tracking-tighter leading-none mb-2">
              {session.templateName ?? "Séance"}
            </h1>
            <div className="text-sm text-on-surface-variant capitalize">{formatDate(session.scheduledFor)}</div>
          </div>

          <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Plan prescrit
            </div>
            {showEndurancePanel && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Durée cible" value={plannedEnduranceTargets.durationMinutes || "—"} unit="min" />
                <MetricCard label="Distance cible" value={plannedEnduranceTargets.distanceKm || "—"} unit="km" />
                <MetricCard label="D+ cible" value={plannedEnduranceTargets.elevationGainM || "—"} unit="m" />
                <MetricCard label="RPE cible" value={plannedEnduranceTargets.rpe || "—"} />
              </div>
            )}
            {draftExercises.length === 0 ? (
              <div className="rounded-[1rem] bg-surface-container-highest p-4 text-sm text-on-surface-variant">
                Aucun détail d'exercice n'a été retrouvé pour cette séance.
              </div>
            ) : (
              <div className="rounded-[1rem] bg-surface-container-highest p-4 grid gap-2">
                <div className="text-sm font-semibold text-on-surface">
                  {draftExercises.length} exercice{draftExercises.length > 1 ? "s" : ""} planifié{draftExercises.length > 1 ? "s" : ""}
                </div>
                <div className="text-xs text-on-surface-variant">
                  {draftExercises
                    .slice(0, 3)
                    .map((exercise) => exercise.exerciseName || `Exercice ${exercise.position}`)
                    .join(" · ")}
                  {draftExercises.length > 3 ? ` · +${draftExercises.length - 3} autres` : ""}
                </div>
                <div className="text-xs text-on-surface-variant">
                  Le détail est à renseigner dans la section « Exécution détaillée » ci-dessous.
                </div>
              </div>
            )}
          </div>

          {showExercisePanel && (
            <div className="grid gap-4">
              <div className="text-[10px] px-3 py-1 rounded-full bg-surface-container-highest text-secondary font-bold tracking-widest uppercase justify-self-start">
                Exécution détaillée
              </div>
              {draftExercises.map((exercise) => (
                <div key={exercise.localId} className="rounded-[1.2rem] bg-surface-container-low p-4 grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                        Exercice {exercise.position}
                      </div>
                      <input
                        value={exercise.exerciseName}
                        onChange={(e) => updateExerciseName(exercise.localId, e.currentTarget.value)}
                        className="mt-1 rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm w-full"
                        style={{ border: 0 }}
                        placeholder={`Exercice ${exercise.position}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExercise(exercise.localId)}
                      className="text-[10px] uppercase tracking-widest text-on-surface-variant px-2 py-1 rounded-full bg-surface-container-highest active:scale-95"
                    >
                      Retirer
                    </button>
                  </div>

                  <div className="text-xs text-on-surface-variant">
                    Programme: {exercise.seriesRaw ?? "—"} séries · {exercise.repsRaw ?? "—"} reps
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Field
                      label="Séries faites"
                      value={exercise.completedSeries}
                      onChange={(v) => updateExerciseCompletedSeries(exercise.localId, v)}
                      inputMode="numeric"
                    />
                    <Field
                      label="Reps / série"
                      value={exercise.completedReps}
                      onChange={(v) => updateExerciseCompletedReps(exercise.localId, v)}
                      inputMode="numeric"
                    />
                    <Field
                      label="RPE"
                      value={exercise.completedRpe}
                      onChange={(v) => updateExerciseCompletedRpe(exercise.localId, v)}
                      inputMode="decimal"
                    />
                    <Field
                      label="Douleur (0-10)"
                      value={exercise.painScore}
                      onChange={(v) => updateExercisePain(exercise.localId, v)}
                      inputMode="decimal"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addExercise}
                className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-highest text-on-surface-variant active:scale-95 justify-self-start"
              >
                Ajouter un exercice
              </button>
            </div>
          )}

          <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Métriques en direct</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <MetricCard label="Durée" value={liveMetrics.durationMinutes ?? "—"} unit="min" />
              <MetricCard label="RPE moyen" value={liveMetrics.avgRpe ?? "—"} />
              <MetricCard label="Douleur moy" value={liveMetrics.avgPainScore ?? "—"} unit="/10" />
              {sessionMode !== "endurance" && sessionMode !== "rest" && (
                <>
                  <MetricCard label="Sets" value={liveMetrics.totalSets} />
                  <MetricCard label="Reps" value={liveMetrics.totalReps} />
                  <MetricCard label="Tonnage" value={liveMetrics.tonnageKg} unit="kg" />
                </>
              )}
              {showEndurancePanel && (
                <>
                  <MetricCard label="Distance" value={liveMetrics.runDistanceKm ?? "—"} unit="km" />
                  <MetricCard label="Charge course" value={liveMetrics.runLoad ?? "—"} />
                  <MetricCard label="Allure" value={liveMetrics.avgPaceSecPerKm ?? "—"} unit="s/km" />
                </>
              )}
              <MetricCard label="Charge totale" value={liveMetrics.trainingLoad} />
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
            <label className="grid gap-2 max-w-[240px]">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Douleur séance (0-10)</span>
              <div className="rounded-[0.875rem] bg-surface-container-highest px-3 py-2 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={safeSessionPainScore}
                  onChange={(e) => setSessionPainScore(e.currentTarget.value)}
                  className="w-full accent-lime-300"
                />
                <span className="text-sm font-bold text-on-surface min-w-[2ch]">{safeSessionPainScore}</span>
              </div>
            </label>
          </div>

          {showEndurancePanel && (
            <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Bloc endurance</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Field label="Durée (min)" value={enduranceDraft.durationMinutes} onChange={(v) => updateEnduranceField("durationMinutes", v)} inputMode="numeric" />
                <Field label="Distance (km)" value={enduranceDraft.distanceKm} onChange={(v) => updateEnduranceField("distanceKm", v)} inputMode="decimal" />
                <Field label="D+ (m)" value={enduranceDraft.elevationGainM} onChange={(v) => updateEnduranceField("elevationGainM", v)} inputMode="numeric" />
                <Field label="FC moy" value={enduranceDraft.avgHr} onChange={(v) => updateEnduranceField("avgHr", v)} inputMode="numeric" />
                <Field label="RPE" value={enduranceDraft.rpe} onChange={(v) => updateEnduranceField("rpe", v)} inputMode="decimal" />
              </div>
              <label className="grid gap-1">
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Notes endurance</span>
                <input
                  value={enduranceDraft.notes}
                  onChange={(e) => updateEnduranceField("notes", e.currentTarget.value)}
                  className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                  style={{ border: 0 }}
                  placeholder="Allure, météo, sensations..."
                />
              </label>
            </div>
          )}

          {sessionMode === "rest" && (
            <div className="rounded-[1rem] bg-surface-container-highest p-4 text-sm text-on-surface-variant">
              Journée de repos: vous pouvez valider cette entrée avec un commentaire pour alimenter le suivi moteur.
            </div>
          )}

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={saving}
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

function MetricCard(props: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-[1rem] bg-surface-container-highest p-3">
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">{props.label}</div>
      <div className="font-headline font-black text-2xl">{props.value}</div>
      {props.unit ? <div className="text-[10px] text-on-surface-variant">{props.unit}</div> : null}
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (next: string) => void; inputMode: "numeric" | "decimal" }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        className="rounded-[0.625rem] bg-surface-container text-on-surface px-2 py-1.5 text-sm"
        style={{ border: 0 }}
        inputMode={props.inputMode}
      />
    </label>
  );
}
