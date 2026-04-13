import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../infra/supabase/client";
import { AppShell } from "../kit/AppShell";
import { Card } from "../kit/Card";
import { Pill } from "../kit/Pill";

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
    <AppShell
      title="Stats"
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
          <h2 className="h2">Performance snapshot</h2>
          <Pill tone="secondary">Range</Pill>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
          <Pill tone="neutral">Since {new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}</Pill>
        </div>
      </Card>

      {loading ? <Card tone="low">Loading…</Card> : null}
      {message ? (
        <Card tone="highest">
          <div style={{ whiteSpace: "pre-wrap" }}>{message}</div>
        </Card>
      ) : null}

      {!loading ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Card tone="low">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h2 className="h2">What</h2>
              <Pill tone="primary">Sessions</Pill>
            </div>
            <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.04em", fontSize: 44 }}>
              {stats.executedCount}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              executed sessions in the last {days} days
            </div>
          </Card>

          <Card tone="low">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h2 className="h2">What</h2>
              <Pill tone="secondary">Time</Pill>
            </div>
            <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.04em", fontSize: 44 }}>
              {stats.totalDurationMinutes}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              total minutes (from logged payloads)
            </div>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}

