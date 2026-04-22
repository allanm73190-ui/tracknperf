import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../kit/AppShell";
import { logExecutedSession } from "../../application/usecases/logExecutedSession";

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

function toNullableInt(v: string): number | null {
  const n = Number(v.trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export default function FreeJournalPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(() => nowIsoTime(new Date(Date.now() - 45 * 60 * 1000)));
  const [endTime, setEndTime] = useState(() => nowIsoTime(new Date()));
  const [rpe, setRpe] = useState("");
  const [painScore, setPainScore] = useState("");
  const [notes, setNotes] = useState("");

  async function onSubmit() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const today = new Date();
      const startedAt = parseLocalTimeToDate(today, startTime);
      const endedAt = parseLocalTimeToDate(today, endTime);
      if (!startedAt || !endedAt) throw new Error("Horaires invalides.");
      if (endedAt.getTime() < startedAt.getTime()) throw new Error("L’heure de fin doit être après le début.");
      const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

      await logExecutedSession({
        plannedSessionId: null,
        planId: null,
        startedAt,
        endedAt,
        payload: {
          durationMinutes,
          rpe: toNullableInt(rpe),
          painScore: toNullableInt(painScore),
          notes: notes.trim() || null,
          mood: null,
          painLocation: null,
        },
      });

      setMessage("Journal libre enregistré.");
      setTimeout(() => navigate("/today"), 400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Échec de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Journal libre"
      nav={[
        { to: "/today", label: "Aujourd'hui" },
        { to: "/history", label: "Historique" },
      ]}
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
      <div className="grid gap-4 pb-10">
        {message && (
          <div className="p-4 rounded-[1rem] bg-surface-container-highest text-sm text-on-surface-variant whitespace-pre-wrap">
            {message}
          </div>
        )}

        <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Saisie libre</div>
          <div className="grid grid-cols-2 gap-2 max-w-[420px]">
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Début</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.currentTarget.value)}
                className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                style={{ border: 0 }}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Fin</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.currentTarget.value)}
                className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                style={{ border: 0 }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-[420px]">
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">RPE</span>
              <input
                value={rpe}
                onChange={(e) => setRpe(e.currentTarget.value)}
                className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                style={{ border: 0 }}
                inputMode="numeric"
                placeholder="1-10"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Douleur</span>
              <input
                value={painScore}
                onChange={(e) => setPainScore(e.currentTarget.value)}
                className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                style={{ border: 0 }}
                inputMode="numeric"
                placeholder="0-10"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm resize-y"
              style={{ border: 0 }}
              placeholder="Contexte, sensations, commentaires..."
            />
          </label>
          <div>
            <button
              onClick={() => void onSubmit()}
              disabled={saving}
              className="px-5 py-3 rounded-full font-bold text-sm uppercase tracking-widest text-[#3a4a00] active:scale-95 transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)" }}
            >
              {saving ? "Enregistrement..." : "Valider le journal libre"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
