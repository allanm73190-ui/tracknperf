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
  const [painScore, setPainScore] = useState("");
  const [fatigueScore, setFatigueScore] = useState("");
  const [readinessScore, setReadinessScore] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [sleepQualityScore, setSleepQualityScore] = useState("");
  const [sorenessScore, setSorenessScore] = useState("");
  const [stressScore, setStressScore] = useState("");
  const [moodScore, setMoodScore] = useState("");
  const [availableTimeTodayMin, setAvailableTimeTodayMin] = useState("");
  const [degradedModeDays, setDegradedModeDays] = useState("");
  const [hrvBelowBaselineDays, setHrvBelowBaselineDays] = useState("");
  const [rhrDeltaBpm, setRhrDeltaBpm] = useState("");
  const [painRedFlag, setPainRedFlag] = useState(false);
  const [illnessFlag, setIllnessFlag] = useState(false);
  const [neurologicalSymptomsFlag, setNeurologicalSymptomsFlag] = useState(false);
  const [limpFlag, setLimpFlag] = useState(false);
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setMessage(null);
      try {
        const row = await getDailyCheckinByDate(checkinDate);
        if (!row || ignore) return;
        setPainScore(toInputNumber(row.painScore));
        setFatigueScore(toInputNumber(row.fatigueScore));
        setReadinessScore(toInputNumber(row.readinessScore));
        setSleepHours(toInputNumber(row.sleepHours));
        setSleepQualityScore(toInputNumber(row.sleepQualityScore));
        setSorenessScore(toInputNumber(row.sorenessScore));
        setStressScore(toInputNumber(row.stressScore));
        setMoodScore(toInputNumber(row.moodScore));
        setAvailableTimeTodayMin(toInputNumber(row.availableTimeTodayMin));
        setDegradedModeDays(toInputNumber(row.degradedModeDays));
        setHrvBelowBaselineDays(toInputNumber(row.hrvBelowBaselineDays));
        setRhrDeltaBpm(toInputNumber(row.rhrDeltaBpm));
        setPainRedFlag(row.painRedFlag);
        setIllnessFlag(row.illnessFlag);
        setNeurologicalSymptomsFlag(row.neurologicalSymptomsFlag);
        setLimpFlag(row.limpFlag);
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
        painRedFlag,
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
        illnessFlag,
        neurologicalSymptomsFlag,
        limpFlag,
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
              <Field label="Douleur (0-10)" value={painScore} onChange={setPainScore} />
              <Field label="Fatigue (0-10)" value={fatigueScore} onChange={setFatigueScore} />
              <Field label="Readiness (0-10)" value={readinessScore} onChange={setReadinessScore} />
              <Field label="Sommeil (h)" value={sleepHours} onChange={setSleepHours} />
              <Field label="Qualité sommeil (0-10)" value={sleepQualityScore} onChange={setSleepQualityScore} />
              <Field label="Courbatures (0-10)" value={sorenessScore} onChange={setSorenessScore} />
              <Field label="Stress (0-10)" value={stressScore} onChange={setStressScore} />
              <Field label="Humeur (0-10)" value={moodScore} onChange={setMoodScore} />
              <Field label="Temps dispo (min)" value={availableTimeTodayMin} onChange={setAvailableTimeTodayMin} />
              <Field label="Mode dégradé (jours)" value={degradedModeDays} onChange={setDegradedModeDays} />
              <Field label="HRV sous baseline (jours)" value={hrvBelowBaselineDays} onChange={setHrvBelowBaselineDays} />
              <Field label="Delta RHR (bpm)" value={rhrDeltaBpm} onChange={setRhrDeltaBpm} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Toggle label="Douleur rouge" checked={painRedFlag} onChange={setPainRedFlag} />
              <Toggle label="Maladie" checked={illnessFlag} onChange={setIllnessFlag} />
              <Toggle label="Symptômes neurologiques" checked={neurologicalSymptomsFlag} onChange={setNeurologicalSymptomsFlag} />
              <Toggle label="Boiterie" checked={limpFlag} onChange={setLimpFlag} />
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

function Toggle(props: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="rounded-xl bg-surface-container-high px-3 py-2 flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
    </label>
  );
}
