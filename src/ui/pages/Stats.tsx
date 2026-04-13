import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../infra/supabase/client";

type Stats = {
  executedCount: number;
  totalDurationMinutes: number;
};

export default function StatsPage() {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ executedCount: 0, totalDurationMinutes: 0 });

  const sinceIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - Math.max(1, Math.min(90, days)));
    return d.toISOString();
  }, [days]);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (!supabase) {
        setMessage("Supabase is not configured.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        const { data, error } = await supabase
          .from("executed_sessions")
          .select("payload, started_at")
          .gte("started_at", sinceIso);
        if (error) throw new Error(error.message);
        if (ignore) return;

        let executedCount = 0;
        let totalDurationMinutes = 0;
        for (const r of data ?? []) {
          executedCount++;
          const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {};
          const dur = payload.durationMinutes;
          if (typeof dur === "number" && Number.isFinite(dur)) totalDurationMinutes += dur;
        }

        setStats({ executedCount, totalDurationMinutes });
      } catch (err) {
        if (!ignore) setMessage(err instanceof Error ? err.message : "Could not load stats.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => {
      ignore = true;
    };
  }, [sinceIso]);

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Stats</h2>

      <label style={{ display: "inline-grid", gap: 6 }}>
        <span>Range (days)</span>
        <select value={days} onChange={(e) => setDays(Number(e.currentTarget.value))}>
          <option value={7}>7</option>
          <option value={14}>14</option>
          <option value={30}>30</option>
          <option value={90}>90</option>
        </select>
      </label>

      {loading ? <p>Loading…</p> : null}
      {message ? (
        <p role="alert" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </p>
      ) : null}

      {!loading ? (
        <div style={{ marginTop: 12 }}>
          <p>
            <strong>{stats.executedCount}</strong> executed sessions
          </p>
          <p>
            <strong>{stats.totalDurationMinutes}</strong> total duration (min)
          </p>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={() => window.history.back()}>
          Back
        </button>
      </div>
    </main>
  );
}

