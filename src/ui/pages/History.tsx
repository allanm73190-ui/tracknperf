import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getExecutedSessionHistory, type ExecutedSessionRow } from "../../application/usecases/getExecutedSessions";
import { AppShell } from "../kit/AppShell";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { Pill } from "../kit/Pill";

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
  const [rows, setRows] = useState<ExecutedSessionRow[]>([]);

  const sinceIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - Math.max(1, Math.min(90, days)));
    return d.toISOString();
  }, [days]);

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      setMessage(null);
      try {
        const data = await getExecutedSessionHistory(sinceIso);
        if (ignore) return;
        setRows(data);
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
    <AppShell
      title="History"
      nav={[
        { to: "/today", label: "Today" },
        { to: "/history", label: "History" },
        { to: "/stats", label: "Stats" },
        { to: "/admin", label: "Admin" },
      ]}
      rightSlot={<Pill tone="neutral">{days}d</Pill>}
    >
      <Card tone="low">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h2 className="h2">Recent sessions</h2>
          <span className="muted" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Since {isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000))}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Pill tone="secondary">Range</Pill>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.currentTarget.value))}
            style={{
              border: 0,
              borderRadius: "var(--radius-md)",
              background: "rgba(38, 38, 38, 0.7)",
              color: "var(--text)",
              padding: "10px 12px",
              fontFamily: "var(--font-body)",
            }}
          >
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
          </select>
          <Pill tone="neutral">{rows.length} sessions</Pill>
        </div>
      </Card>

      {loading ? <Card tone="low">Loading…</Card> : null}
      {message ? (
        <Card tone="highest">
          <div style={{ whiteSpace: "pre-wrap" }}>{message}</div>
        </Card>
      ) : null}

      {!loading && rows.length === 0 ? <Card tone="low">No executed sessions in this range.</Card> : null}

      {!loading && rows.length > 0 ? (
        <Card tone="low">
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((r) => (
              <Link key={r.id} to={`/session/${r.id}`}>
                <Card tone="highest">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.03em" }}>
                        {r.startedAt.slice(0, 16).replace("T", " ")}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {r.id}
                      </div>
                    </div>
                    <Pill tone="neutral">Open</Pill>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={() => window.history.back()}>
          Back
        </Button>
      </div>
    </AppShell>
  );
}
