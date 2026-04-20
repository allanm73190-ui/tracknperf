import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useIsAdmin } from "../../auth/useIsAdmin";
import { AppShell } from "../kit/AppShell";
import { Button } from "../kit/Button";
import { getDailyCheckinByDate, upsertDailyCheckin } from "../../application/usecases/dailyCheckin";
import { getTodayOverview } from "../../application/usecases/getTodayOverview";
import { computeAndPersistTodayRecommendation } from "../../application/usecases/computeAndPersistTodayRecommendation";

function toIsoDate(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toInputNumber(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toInputScore(v: number | null | undefined): string {
  if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 10) return String(Math.round(v));
  return "5";
}

function parseNullableNumber(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseNullableInteger(v: string): number | null {
  const n = parseNullableNumber(v);
  if (n === null) return null;
  return Math.round(n);
}

export default function DailyCheckinPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id ?? null);

  const [checkinDate, setCheckinDate] = useState(() => toIsoDate(new Date()));
  const [painScore, setPainScore] = useState("5");
  const [fatigueScore, setFatigueScore] = useState("5");
  const [readinessScore, setReadinessScore] = useState("5");
  const [sleepHours, setSleepHours] = useState("");
  const [sleepQualityScore, setSleepQualityScore] = useState("5");
  const [sorenessScore, setSorenessScore] = useState("5");
  const [stressScore, setStressScore] = useState("5");
  const [moodScore, setMoodScore] = useState("5");
  const [availableTimeTodayMin, setAvailableTimeTodayMin] = useState("");
  const [degradedModeDays, setDegradedModeDays] = useState("");
  const [hrvBelowBaselineDays, setHrvBelowBaselineDays] = useState("");
  const [rhrDeltaBpm, setRhrDeltaBpm] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function resetFormToDefaults() {
    setPainScore("5");
    setFatigueScore("5");
    setReadinessScore("5");
    setSleepHours("");
    setSleepQualityScore("5");
    setSorenessScore("5");
    setStressScore("5");
    setMoodScore("5");
    setAvailableTimeTodayMin("");
    setDegradedModeDays("");
    setHrvBelowBaselineDays("");
    setRhrDeltaBpm("");
    setNotes("");
  }

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setMessage(null);
      try {
        const row = await getDailyCheckinByDate(checkinDate);
        if (ignore) return;
        if (!row) {
          resetFormToDefaults();
          return;
        }
        setPainScore(toInputScore(row.painScore));
        setFatigueScore(toInputScore(row.fatigueScore));
        setReadinessScore(toInputScore(row.readinessScore));
        setSleepHours(toInputNumber(row.sleepHours));
        setSleepQualityScore(toInputScore(row.sleepQualityScore));
        setSorenessScore(toInputScore(row.sorenessScore));
        setStressScore(toInputScore(row.stressScore));
        setMoodScore(toInputScore(row.moodScore));
        setAvailableTimeTodayMin(toInputNumber(row.availableTimeTodayMin));
        setDegradedModeDays(toInputNumber(row.degradedModeDays));
        setHrvBelowBaselineDays(toInputNumber(row.hrvBelowBaselineDays));
        setRhrDeltaBpm(toInputNumber(row.rhrDeltaBpm));
        setNotes(row.notes ?? "");
      } catch (err) {
        if (!ignore) {
          setMessage(err instanceof Error ? err.message : "Impossible de charger le check-in.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [checkinDate]);

  async function onSubmit() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const row = await upsertDailyCheckin({
        checkinDate,
        painScore: parseNullableNumber(painScore),
        fatigueScore: parseNullableNumber(fatigueScore),
        readinessScore: parseNullableNumber(readinessScore),
        sleepHours: parseNullableNumber(sleepHours),
        sleepQualityScore: parseNullableNumber(sleepQualityScore),
        sorenessScore: parseNullableNumber(sorenessScore),
        stressScore: parseNullableNumber(stressScore),
        moodScore: parseNullableNumber(moodScore),
        availableTimeTodayMin: parseNullableInteger(availableTimeTodayMin),
        degradedModeDays: parseNullableInteger(degradedModeDays),
        hrvBelowBaselineDays: parseNullableInteger(hrvBelowBaselineDays),
        rhrDeltaBpm: parseNullableNumber(rhrDeltaBpm),
        notes: notes.trim() || null,
      });

      setMessage(
        row.pendingSync
          ? "Check-in enregistré localement. Synchronisation en attente."
          : "Check-in enregistré et synchronisé.",
      );

      try {
        const overview = await getTodayOverview();
        await computeAndPersistTodayRecommendation(overview);
      } catch {
        // Non bloquant: le check-in reste sauvegardé.
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible d'enregistrer le check-in.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Daily check-in"
      nav={[
        { to: "/today", label: "Aujourd'hui" },
        { to: "/history", label: "Historique" },
        { to: "/stats", label: "Stats" },
        ...(isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
      ]}
      rightSlot={<Link to="/today" className="text-[11px] uppercase tracking-widest text-secondary font-bold">Retour</Link>}
    >
      <div className="rounded-[1.5rem] bg-surface-container-low p-6 md:p-8 grid gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-headline text-base font-bold uppercase tracking-tight">État du jour</h2>
          <input
            type="date"
            value={checkinDate}
            onChange={(e) => setCheckinDate(e.currentTarget.value)}
            className="rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface"
          />
        </div>

        {message ? (
          <div className="rounded-[1rem] bg-surface-container-high p-3 text-sm text-on-surface-variant whitespace-pre-wrap">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[1rem] bg-surface-container-high h-32 animate-pulse" />
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ScoreSlider label="Douleur (1-10)" value={painScore} onChange={setPainScore} />
              <ScoreSlider label="Fatigue (1-10)" value={fatigueScore} onChange={setFatigueScore} />
              <ScoreSlider label="Readiness (1-10)" value={readinessScore} onChange={setReadinessScore} />
              <Field label="Sommeil (h)" value={sleepHours} onChange={setSleepHours} />
              <ScoreSlider label="Qualité sommeil (1-10)" value={sleepQualityScore} onChange={setSleepQualityScore} />
              <ScoreSlider label="Courbatures (1-10)" value={sorenessScore} onChange={setSorenessScore} />
              <ScoreSlider label="Stress (1-10)" value={stressScore} onChange={setStressScore} />
              <ScoreSlider label="Humeur (1-10)" value={moodScore} onChange={setMoodScore} />
              <Field label="Temps dispo (min)" value={availableTimeTodayMin} onChange={setAvailableTimeTodayMin} />
              <Field label="Mode dégradé (jours)" value={degradedModeDays} onChange={setDegradedModeDays} />
              <Field label="HRV sous baseline (jours)" value={hrvBelowBaselineDays} onChange={setHrvBelowBaselineDays} />
              <Field label="Delta RHR (bpm)" value={rhrDeltaBpm} onChange={setRhrDeltaBpm} />
            </div>

            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                rows={4}
                className="rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface"
                placeholder="Contexte libre du jour"
              />
            </label>

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => void onSubmit()} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer le check-in"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field(props: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">{props.label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        className="rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface"
      />
    </label>
  );
}

function ScoreSlider(props: { label: string; value: string; onChange: (next: string) => void }) {
  const parsed = Number(props.value);
  const safeValue = Number.isFinite(parsed) && parsed >= 1 && parsed <= 10 ? Math.round(parsed) : 5;
  return (
    <label className="grid gap-2 rounded-xl bg-surface-container-high px-3 py-2">
      <span className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">{props.label}</span>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={safeValue}
          onChange={(e) => props.onChange(e.currentTarget.value)}
          className="w-full accent-lime-300"
        />
        <span className="min-w-[2ch] text-sm font-bold text-on-surface">{safeValue}</span>
      </div>
    </label>
  );
}
