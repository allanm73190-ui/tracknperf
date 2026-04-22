import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../infra/supabase/client";
import { AppShell } from "../kit/AppShell";

type ProgrammeSession = {
  id: string;
  scheduledFor: string;
  templateName: string | null;
  executed: boolean;
};

function toIsoDate(d: Date): string {
  return [
    String(d.getFullYear()).padStart(4, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function formatDayLabel(iso: string): { day: string; num: string } {
  const d = new Date(iso + "T00:00:00");
  return {
    day: d.toLocaleDateString("fr-FR", { weekday: "short" }).toUpperCase(),
    num: String(d.getDate()),
  };
}

function formatMonthLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

async function loadWeek(monday: Date): Promise<ProgrammeSession[]> {
  if (!supabase) throw new Error("Supabase non configuré.");
  const start = toIsoDate(monday);
  const end = toIsoDate(addDays(monday, 6));

  const { data: plannedRows, error: pErr } = await supabase
    .from("planned_sessions")
    .select(`
      id,
      created_at,
      scheduled_for,
      session_templates:session_template_id ( name ),
      plans!inner ( active )
    `)
    .gte("scheduled_for", start)
    .lte("scheduled_for", end)
    .eq("plans.active", true)
    .order("scheduled_for", { ascending: true })
    .order("created_at", { ascending: false });

  if (pErr) throw new Error(pErr.message);

  const dedupedRows = (() => {
    const out: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const r of (plannedRows ?? []) as Array<Record<string, unknown>>) {
      const iso = String(r.scheduled_for ?? "");
      const tplObj = r.session_templates as { name?: unknown } | null | undefined;
      const tpl = typeof tplObj?.name === "string" ? tplObj.name.trim().toLowerCase() : "";
      const key = `${iso}::${tpl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  })();

  const plannedIds = dedupedRows.map((r) => String((r as { id: unknown }).id));

  let executedPlannedIds = new Set<string>();
  if (plannedIds.length > 0) {
    const { data: execRows } = await supabase
      .from("executed_sessions")
      .select("planned_session_id")
      .in("planned_session_id", plannedIds);
    executedPlannedIds = new Set(
      (execRows ?? [])
        .map((r) => (r as { planned_session_id?: unknown }).planned_session_id)
        .filter((v): v is string => typeof v === "string"),
    );
  }

  return dedupedRows.map((r) => {
    const id = String((r as { id: unknown }).id);
    const tpl = (r as { session_templates?: { name?: unknown } | null }).session_templates;
    return {
      id,
      scheduledFor: String((r as { scheduled_for: unknown }).scheduled_for),
      templateName: tpl && typeof tpl.name === "string" && tpl.name.trim() ? tpl.name : null,
      executed: executedPlannedIds.has(id),
    };
  });
}

export default function ProgrammePage() {
  const today = new Date();
  const todayIso = toIsoDate(today);
  const [monday, setMonday] = useState<Date>(() => startOfWeek(today));
  const [sessions, setSessions] = useState<ProgrammeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    loadWeek(monday)
      .then((data) => { if (!ignore) setSessions(data); })
      .catch((err) => { if (!ignore) setError(err instanceof Error ? err.message : "Erreur"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [monday]);

  const weekDays = Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(monday, i)));

  function prevWeek() { setMonday((m) => addDays(m, -7)); }
  function nextWeek() { setMonday((m) => addDays(m, 7)); }
  function goToday() { setMonday(startOfWeek(today)); }

  const sessionsByDay = new Map<string, ProgrammeSession[]>();
  for (const s of sessions) {
    const key = s.scheduledFor.slice(0, 10);
    if (!sessionsByDay.has(key)) sessionsByDay.set(key, []);
    sessionsByDay.get(key)!.push(s);
  }

  return (
    <AppShell title="Programme">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-0 right-0 w-[60vw] h-[60vw] bg-secondary/5 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: "#c57eff", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>
          Planning
        </div>
        <h1 style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: "clamp(2rem, 8vw, 3rem)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          textTransform: "uppercase",
          lineHeight: 1,
          margin: 0,
        }}>
          Programme.
        </h1>
      </div>

      {/* Week navigator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          onClick={prevWeek}
          style={{ background: "#131313", border: "none", borderRadius: 16, padding: "10px 16px", color: "#f5f5f5", cursor: "pointer", fontSize: 18, fontWeight: 700 }}
        >
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f5f5f5", textTransform: "capitalize" }}>
            {formatMonthLabel(weekDays[0]!)}
          </div>
          <button
            onClick={goToday}
            style={{ background: "none", border: "none", color: "#cafd00", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", padding: "2px 0", marginTop: 2 }}
          >
            Aujourd'hui
          </button>
        </div>
        <button
          onClick={nextWeek}
          style={{ background: "#131313", border: "none", borderRadius: 16, padding: "10px 16px", color: "#f5f5f5", cursor: "pointer", fontSize: 18, fontWeight: 700 }}
        >
          ›
        </button>
      </div>

      {/* 7-column day strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 20 }}>
        {weekDays.map((iso) => {
          const { day, num } = formatDayLabel(iso);
          const isToday = iso === todayIso;
          const hasSessions = (sessionsByDay.get(iso) ?? []).length > 0;
          return (
            <div key={iso} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? "#cafd00" : "#555", letterSpacing: "0.08em", marginBottom: 4 }}>
                {day}
              </div>
              <div style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 12,
                background: isToday ? "#cafd00" : "#131313",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: isToday ? "#0e0e0e" : "#f5f5f5", lineHeight: 1 }}>
                  {num}
                </span>
                {hasSessions && (
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: isToday ? "#0e0e0e" : "#c57eff", display: "block" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sessions list */}
      {loading && (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-[1.25rem] bg-surface-container-low h-16 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-[1rem] bg-surface-container-highest text-sm text-error">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {weekDays.map((iso) => {
            const daySessions = sessionsByDay.get(iso) ?? [];
            const { day, num } = formatDayLabel(iso);
            const isToday = iso === todayIso;

            return (
              <div key={iso}>
                {/* Day label */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: isToday ? "#cafd00" : "#444", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {day} {num}
                  </span>
                  {isToday && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#cafd00", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      — Aujourd'hui
                    </span>
                  )}
                </div>

                {daySessions.length === 0 ? (
                  <div style={{ paddingLeft: 8, fontSize: 12, color: "#2a2a2a" }}>Repos</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {daySessions.map((s) => (
                      <Link key={s.id} to={`/planned-session/${s.id}`} style={{ textDecoration: "none" }}>
                        <div style={{
                          background: s.executed ? "rgba(202,253,0,0.06)" : "#131313",
                          borderRadius: 16,
                          padding: "14px 18px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          transition: "background 120ms ease",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: s.executed ? "#cafd00" : "#c57eff",
                              flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#f5f5f5" }}>
                              {s.templateName ?? "Séance"}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {s.executed && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#cafd00", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                                RÉALISÉ
                              </span>
                            )}
                            <span style={{ color: "#333", fontSize: 16 }}>›</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#333", fontSize: 13 }}>
          Aucune séance planifiée cette semaine.
        </div>
      )}
    </AppShell>
  );
}
