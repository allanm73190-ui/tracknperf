import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../infra/supabase/client";
import { AppShell } from "../kit/AppShell";
import { Card } from "../kit/Card";
import { Pill } from "../kit/Pill";

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
    <AppShell
      title="Session"
      nav={[
        { to: "/today", label: "Today" },
        { to: "/history", label: "History" },
        { to: "/stats", label: "Stats" },
        { to: "/admin", label: "Admin" },
      ]}
      rightSlot={sessionId ? <Pill tone="neutral">ID</Pill> : <Pill tone="error">Missing ID</Pill>}
    >
      {loading ? <Card tone="low">Loading…</Card> : null}
      {message ? (
        <Card tone="highest">
          <div style={{ whiteSpace: "pre-wrap" }}>{message}</div>
        </Card>
      ) : null}

      {!loading && row ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Card tone="low">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h2 className="h2">What happened</h2>
              <Pill tone="primary">
                {row.startedAt.slice(11, 16)} → {row.endedAt ? row.endedAt.slice(11, 16) : "—"}
              </Pill>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {row.id}
            </div>
          </Card>

          <Card tone="low">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h2 className="h2">Context</h2>
              <Pill tone="secondary">Why</Pill>
            </div>
            <div className="muted" style={{ fontSize: 13, display: "grid", gap: 6 }}>
              <div>
                planId: <code>{row.planId ?? "—"}</code>
              </div>
              <div>
                plannedSessionId: <code>{row.plannedSessionId ?? "—"}</code>
              </div>
            </div>
          </Card>

          <Card tone="low">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h2 className="h2">Payload</h2>
              <Pill tone="neutral">JSON</Pill>
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                background: "rgba(38, 38, 38, 0.5)",
                padding: 12,
                borderRadius: "var(--radius-lg)",
                color: "var(--text)",
                overflowX: "auto",
              }}
            >
              {JSON.stringify(row.payload, null, 2)}
            </pre>
          </Card>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/history">
              <Pill tone="neutral">Back to history</Pill>
            </Link>
            <Link to="/today">
              <Pill tone="neutral">Today</Pill>
            </Link>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

