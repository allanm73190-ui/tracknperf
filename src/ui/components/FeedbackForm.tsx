import { useState } from "react";
import { logExecutedSession } from "../../application/usecases/logExecutedSession";
import { getTodayOverview } from "../../application/usecases/getTodayOverview";
import { computeAndPersistTodayRecommendation } from "../../application/usecases/computeAndPersistTodayRecommendation";
import { Input } from "../kit/Input";
import { Button } from "../kit/Button";

type Mood = "great" | "good" | "neutral" | "bad";

const MOODS: { value: Mood; label: string; code: string }[] = [
  { value: "great", label: "Super", code: "S+" },
  { value: "good", label: "Bien", code: "B+" },
  { value: "neutral", label: "Moyen", code: "M" },
  { value: "bad", label: "Dur", code: "D" },
];

type Props = {
  plannedSessionId: string | null;
  planId: string | null;
  onSuccess: (sessionId: string) => void;
  onCancel: () => void;
};

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

export function FeedbackForm({ plannedSessionId, planId, onSuccess, onCancel }: Props) {
  const today = new Date();
  const [startTime, setStartTime] = useState(() => nowIsoTime(new Date(Date.now() - 60 * 60 * 1000)));
  const [endTime, setEndTime] = useState(() => nowIsoTime(new Date()));
  const [rpe, setRpe] = useState(5);
  const [painScore, setPainScore] = useState(0);
  const [painLocation, setPainLocation] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const startedAt = parseLocalTimeToDate(today, startTime);
      const endedAt = parseLocalTimeToDate(today, endTime);
      if (!startedAt || !endedAt) throw new Error("Horaires invalides (format HH:MM requis).");
      if (endedAt.getTime() < startedAt.getTime()) throw new Error("L'heure de fin doit être après le début.");

      const durationMinutes = (endedAt.getTime() - startedAt.getTime()) / 60000;
      const res = await logExecutedSession({
        plannedSessionId,
        planId,
        startedAt,
        endedAt,
        payload: {
          durationMinutes,
          rpe,
          painScore,
          painLocation: painScore > 0 && painLocation.trim() ? painLocation.trim() : null,
          mood,
          notes: notes.trim() || null,
        },
      });

      // Best-effort refresh of recommendation
      try {
        const next = await getTodayOverview();
        await computeAndPersistTodayRecommendation(next);
      } catch {
        // Non-blocking
      }

      onSuccess(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {/* Times */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Début (HH:MM)" value={startTime} onChange={setStartTime} placeholder="08:30" />
        <Input label="Fin (HH:MM)" value={endTime} onChange={setEndTime} placeholder="09:30" />
      </div>

      {/* Mood selector */}
      <div className="grid gap-2">
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Ressenti global</span>
        <div className="grid grid-cols-4 gap-2">
          {MOODS.map((m) => {
            const active = mood === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(active ? null : m.value)}
                className={[
                  "flex flex-col items-center gap-1 py-3 rounded-[1rem] text-center transition-all active:scale-95",
                  active
                    ? "bg-primary-container text-[#3a4a00] font-bold"
                    : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container",
                ].join(" ")}
              >
                <span className="font-headline font-black text-sm leading-none">{m.code}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RPE slider */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Intensité perçue (RPE)</span>
          <span
            className="font-headline font-bold text-3xl leading-none tabular-nums"
            style={{ color: rpe >= 8 ? "#ff7351" : rpe >= 6 ? "#c57eff" : "#cafd00" }}
          >
            {rpe}
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={rpe}
            onChange={(e) => setRpe(Number(e.currentTarget.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #cafd00 0%, #cafd00 ${(rpe - 1) / 9 * 100}%, #262626 ${(rpe - 1) / 9 * 100}%, #262626 100%)`,
              accentColor: "#cafd00",
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">Facile</span>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">Maximal</span>
          </div>
        </div>
      </div>

      {/* Pain score slider */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Douleur</span>
          <span
            className="font-headline font-bold text-3xl leading-none tabular-nums"
            style={{ color: painScore === 0 ? "#4a5568" : painScore >= 7 ? "#ff7351" : painScore >= 4 ? "#c57eff" : "#cafd00" }}
          >
            {painScore === 0 ? "–" : painScore}
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={painScore}
            onChange={(e) => setPainScore(Number(e.currentTarget.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: painScore === 0
                ? "#262626"
                : `linear-gradient(to right, #cafd00 0%, #ff7351 ${painScore / 10 * 100}%, #262626 ${painScore / 10 * 100}%, #262626 100%)`,
              accentColor: painScore >= 7 ? "#ff7351" : "#cafd00",
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">Aucune</span>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">Intense</span>
          </div>
        </div>

        {/* Pain location — shown only if pain > 0 */}
        {painScore > 0 && (
          <Input
            label="Localisation"
            value={painLocation}
            onChange={setPainLocation}
            placeholder="ex. genou gauche, dos bas…"
          />
        )}
      </div>

      {/* Notes */}
      <label className="grid gap-2">
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Notes libres</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          rows={3}
          placeholder="Commentaires sur la séance…"
          className="rounded-[0.875rem] bg-surface-container-highest text-on-surface p-3 resize-y text-sm outline-none focus:ring-1 focus:ring-primary-container/50 placeholder:text-on-surface-variant/40"
          style={{ border: 0, fontFamily: "var(--font-body)" }}
        />
      </label>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-[0.875rem] bg-surface-container-highest text-sm text-error">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={busy}
          className="w-full py-4 rounded-[1rem] font-bold text-sm uppercase tracking-widest text-[#3a4a00] active:scale-95 transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)" }}
        >
          {busy ? "Enregistrement…" : "Valider la séance"}
        </button>
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}
