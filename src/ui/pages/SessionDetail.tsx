import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../infra/supabase/client";

type ExecutedSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  plannedSessionId: string | null;
  planId: string | null;
  payload: Record<string, unknown>;
};

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [row, setRow] = useState<ExecutedSession | null>(null);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (!supabase) {
        setMessage("Supabase is not configured.");
        setLoading(false);
        return;
      }
      if (!sessionId) {
        setMessage("Missing session id.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        const { data, error } = await supabase
          .from("executed_sessions")
          .select("id, started_at, ended_at, planned_session_id, plan_id, payload")
          .eq("id", sessionId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (ignore) return;
        if (!data) {
          setRow(null);
          setMessage("Session not found (or you don't have access).");
          return;
        }
        setRow({
          id: String(data.id),
          startedAt: String(data.started_at),
          endedAt: data.ended_at ? String(data.ended_at) : null,
          plannedSessionId: data.planned_session_id ? String(data.planned_session_id) : null,
          planId: data.plan_id ? String(data.plan_id) : null,
          payload: data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {},
        });
      } catch (err) {
        if (!ignore) setMessage(err instanceof Error ? err.message : "Could not load session.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => {
      ignore = true;
    };
  }, [sessionId]);

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Session detail</h2>

      {loading ? <p>Loading…</p> : null}
      {message ? (
        <p role="alert" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </p>
      ) : null}

      {!loading && row ? (
        <pre style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.04)", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(row, null, 2)}
        </pre>
      ) : null}

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link to="/today">Today</Link>
        <Link to="/history">History</Link>
        <Link to="/stats">Stats</Link>
      </div>
    </main>
  );
}

