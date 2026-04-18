import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../infra/supabase/client";
import { AppShell } from "../kit/AppShell";

// ── Types ────────────────────────────────────────────────────────────────────

type FilterPeriod = "week" | "month" | "3months";

type PlannedRow = {
  id: string;
  scheduledFor: string;
  templateName: string | null;
};

type ExecutedRow = {
  id: string;
  startedAt: string;
  plannedSessionId: string | null;
  rpe: number | null;
};

type MergedEntry =
  | { kind: "executed"; id: string; date: string; templateName: string | null; rpe: number | null }
  | { kind: "missed"; id: string; date: string; templateName: string | null }
  | { kind: "planned"; id: string; date: string; templateName: string | null };

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadHistory(sinceIso: string): Promise<{ planned: PlannedRow[]; executed: ExecutedRow[] }> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const [pvRes, exRes] = await Promise.all([
    supabase
      .from("planned_sessions")
      .select("id, scheduled_for, session_templates!session_template_id(name)")
      .gte("scheduled_for", sinceIso.slice(0, 10))
      .order("scheduled_for", { ascending: false }),
    supabase
      .from("executed_sessions")
      .select("id, started_at, planned_session_id, payload")
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false }),
  ]);

  if (pvRes.error) throw new Error(pvRes.error.message);
  if (exRes.error) throw new Error(exRes.error.message);

  const planned: PlannedRow[] = (pvRes.data ?? []).map((r) => {
    const tpl = (r.session_templates as unknown) as { name: string } | null;
    return {
      id: String(r.id),
      scheduledFor: String(r.scheduled_for),
      templateName: tpl?.name ?? null,
    };
  });

  const executed: ExecutedRow[] = (exRes.data ?? []).map((r) => {
    const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {};
    const rpe = typeof payload.rpe === "number" ? payload.rpe : null;
    return {
      id: String(r.id),
      startedAt: String(r.started_at),
      plannedSessionId: r.planned_session_id ? String(r.planned_session_id) : null,
      rpe,
    };
  });

  return { planned, executed };
}

// ── Merge logic ───────────────────────────────────────────────────────────────

function mergeEntries(
  planned: PlannedRow[],
  executed: ExecutedRow[],
  todayIso: string,
): MergedEntry[] {
  const executedByPlannedId = new Map<string, ExecutedRow>();
  const orphanExecuted: ExecutedRow[] = [];

  for (const ex of executed) {
    if (ex.plannedSessionId) {
      executedByPlannedId.set(ex.plannedSessionId, ex);
    } else {
      orphanExecuted.push(ex);
    }
  }

  const entries: MergedEntry[] = [];

  for (const ps of planned) {
    const ex = executedByPlannedId.get(ps.id);
    if (ex) {
      entries.push({ kind: "executed", id: ex.id, date: ps.scheduledFor, templateName: ps.templateName, rpe: ex.rpe });
    } else if (ps.scheduledFor < todayIso) {
      entries.push({ kind: "missed", id: ps.id, date: ps.scheduledFor, templateName: ps.templateName });
    } else {
      entries.push({ kind: "planned", id: ps.id, date: ps.scheduledFor, templateName: ps.templateName });
    }
  }

  for (const ex of orphanExecuted) {
    entries.push({ kind: "executed", id: ex.id, date: ex.startedAt.slice(0, 10), templateName: null, rpe: ex.rpe });
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entries;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sinceIsoFromPeriod(period: FilterPeriod): string {
  const d = new Date();
  if (period === "week") d.setDate(d.getDate() - 7);
  else if (period === "month") d.setDate(d.getDate() - 30);
  else d.setDate(d.getDate() - 90);
  return d.toISOString();
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function rpeColor(rpe: number): string {
  if (rpe >= 8) return "#ff7351";
  if (rpe >= 6) return "#c57eff";
  return "#cafd00";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 72,
            borderRadius: 16,
            background: "linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.4s infinite",
            opacity: 1 - i * 0.12,
          }}
        />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

const STATUS_CONFIG = {
  executed: { label: "RÉALISÉ", bg: "rgba(202,253,0,0.10)", color: "#cafd00" },
  missed:   { label: "MANQUÉ",  bg: "rgba(255,115,81,0.10)", color: "#ff7351" },
  planned:  { label: "PRÉVU",   bg: "rgba(197,126,255,0.10)", color: "#c57eff" },
} as const;

function StatusPill({ kind }: { kind: MergedEntry["kind"] }) {
  const cfg = STATUS_CONFIG[kind];
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 900,
      letterSpacing: "0.08em",
      padding: "4px 10px",
      borderRadius: 999,
      background: cfg.bg,
      color: cfg.color,
      textTransform: "uppercase" as const,
      whiteSpace: "nowrap" as const,
    }}>
      {cfg.label}
    </span>
  );
}

function SessionCard({ entry }: { entry: MergedEntry }) {
  const isClickable = entry.kind === "executed";

  const inner = (
    <div style={{
      background: entry.kind === "missed" ? "rgba(255,255,255,0.02)" : "#131313",
      borderRadius: 16,
      padding: "16px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      opacity: entry.kind === "missed" ? 0.55 : 1,
      cursor: isClickable ? "pointer" : "default",
      transition: "opacity 150ms ease",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#adaaaa",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}>
          {formatDate(entry.date)}
        </div>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: entry.kind === "missed" ? "#888" : "#f5f5f5",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          {entry.templateName ?? (entry.kind === "executed" ? "Séance libre" : "Séance")}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {entry.kind === "executed" && entry.rpe !== null && (
          <span style={{
            fontSize: 11,
            fontWeight: 900,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.05)",
            color: rpeColor(entry.rpe),
            letterSpacing: "0.04em",
          }}>
            RPE {entry.rpe}
          </span>
        )}
        <StatusPill kind={entry.kind} />
        {isClickable && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
    </div>
  );

  if (isClickable) {
    return (
      <Link to={`/session/${entry.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}

// ── Period filter options ─────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: FilterPeriod; label: string }[] = [
  { value: "week", label: "7 JOURS" },
  { value: "month", label: "30 JOURS" },
  { value: "3months", label: "90 JOURS" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [period, setPeriod] = useState<FilterPeriod>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlannedRow[]>([]);
  const [executed, setExecuted] = useState<ExecutedRow[]>([]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    loadHistory(sinceIsoFromPeriod("3months"))
      .then(({ planned: p, executed: e }) => {
        if (!ignore) { setPlanned(p); setExecuted(e); }
      })
      .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Erreur"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const sinceFilter = useMemo(() => sinceIsoFromPeriod(period), [period]);

  const entries = useMemo(() => {
    const today = todayIso();
    const filteredPlanned = planned.filter((p) => p.scheduledFor >= sinceFilter.slice(0, 10));
    const filteredExecuted = executed.filter((e) => e.startedAt >= sinceFilter);
    return mergeEntries(filteredPlanned, filteredExecuted, today);
  }, [planned, executed, sinceFilter]);

  const executedCount = entries.filter((e) => e.kind === "executed").length;
  const missedCount = entries.filter((e) => e.kind === "missed").length;

  return (
    <AppShell title="Historique">
      <div style={{ padding: "28px 20px 0" }}>
        {/* Editorial header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase" as const,
            color: "#c57eff",
            fontFamily: "Space Grotesk, sans-serif",
            marginBottom: 6,
          }}>
            Archives de performance
          </div>
          <h1 style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: "clamp(2.2rem, 8vw, 3.5rem)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 0.95,
            margin: 0,
            textTransform: "uppercase" as const,
          }}>
            Historique.
          </h1>
        </div>

        {/* Period filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, overflowX: "auto" as const }}>
          {PERIOD_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.06em",
                fontFamily: "Space Grotesk, sans-serif",
                whiteSpace: "nowrap" as const,
                transition: "background 150ms ease, color 150ms ease",
                background: period === value ? "#6a0baa" : "#1e1e1e",
                color: period === value ? "#e6c3ff" : "#666",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats summary */}
        {!loading && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
            <div style={{ background: "rgba(202,253,0,0.07)", borderRadius: 16, padding: "16px 18px" }}>
              <div style={{
                fontSize: 28,
                fontWeight: 900,
                color: "#cafd00",
                fontFamily: "Space Grotesk, sans-serif",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}>
                {executedCount}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 4, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
                Réalisées
              </div>
            </div>
            <div style={{ background: "rgba(255,115,81,0.07)", borderRadius: 16, padding: "16px 18px" }}>
              <div style={{
                fontSize: 28,
                fontWeight: 900,
                color: "#ff7351",
                fontFamily: "Space Grotesk, sans-serif",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}>
                {missedCount}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 4, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
                Manquées
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session list */}
      <div style={{ padding: "0 20px 20px" }}>
        {loading && <HistorySkeleton />}

        {error && (
          <div style={{
            padding: "16px 20px",
            borderRadius: 14,
            background: "rgba(255,115,81,0.10)",
            color: "#ff7351",
            fontSize: 13,
            fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={{ textAlign: "center" as const, padding: "64px 20px", color: "#444" }}>
            <div style={{
              fontSize: 36,
              fontFamily: "Space Grotesk, sans-serif",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              marginBottom: 8,
            }}>
              Vide.
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              Aucune séance sur cette période
            </div>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map((entry) => (
              <SessionCard key={entry.kind + entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
