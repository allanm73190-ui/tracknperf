import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../infra/supabase/client";

type ExecutedRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  planId: string | null;
  payload: Record<string, unknown>;
};

function isoDate(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function HistoryPage() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<ExecutedRow[]>([]);

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
          .select("id, started_at, ended_at, plan_id, payload")
          .gte("started_at", sinceIso)
          .order("started_at", { ascending: false });
        if (error) throw new Error(error.message);
        if (ignore) return;
        setRows(
          (data ?? []).map((r) => ({
            id: String(r.id),
            startedAt: String(r.started_at),
            endedAt: r.ended_at ? String(r.ended_at) : null,
            planId: r.plan_id ? String(r.plan_id) : null,
            payload: r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {},
          })),
        );
      } catch (err) {
        if (!ignore) setMessage(err instanceof Error ? err.message : "Could not load history.");
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
      <h2>History</h2>

      <label style={{ display: "inline-grid", gap: 6 }}>
        <span>Range (days)</span>
        <select value={days} onChange={(e) => setDays(Number(e.currentTarget.value))}>
          <option value={7}>7</option>
          <option value={14}>14</option>
          <option value={30}>30</option>
          <option value={90}>90</option>
        </select>
      </label>

      <p style={{ marginTop: 12, opacity: 0.8 }}>
        Since <code>{isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000))}</code>
      </p>

      {loading ? <p>Loading…</p> : null}
      {message ? (
        <p role="alert" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </p>
      ) : null}

      {!loading && rows.length === 0 ? <p style={{ opacity: 0.8 }}>No executed sessions.</p> : null}

      {!loading && rows.length > 0 ? (
        <ul style={{ marginTop: 12 }}>
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/session/${r.id}`}>{r.startedAt.slice(0, 16).replace("T", " ")}</Link>{" "}
              <span style={{ opacity: 0.8 }}>({r.id})</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={() => window.history.back()}>
          Back
        </button>
      </div>
    </main>
  );
}

