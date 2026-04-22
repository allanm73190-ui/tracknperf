import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../kit/AppShell";
import { Button } from "../kit/Button";
import { getAthletePlannedSessions, getCoachRoster, type CoachAthlete, type CoachPlannedSession } from "../../application/usecases/coach";
import { exportAthleteToXlsx } from "../../application/usecases/exportAthleteXlsx";

function toIsoDate(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

export default function CoachHubPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [roster, setRoster] = useState<CoachAthlete[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [plannedSessions, setPlannedSessions] = useState<CoachPlannedSession[]>([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [from, setFrom] = useState(() => toIsoDate(addDays(new Date(), -30)));
  const [to, setTo] = useState(() => toIsoDate(new Date()));

  const selectedAthlete = useMemo(
    () => roster.find((a) => a.athleteId === selectedAthleteId) ?? null,
    [roster, selectedAthleteId],
  );

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setMessage(null);
      try {
        const athletes = await getCoachRoster();
        if (ignore) return;
        setRoster(athletes);
        const first = athletes[0]?.athleteId ?? null;
        setSelectedAthleteId(first);
      } catch (error) {
        if (!ignore) setMessage(error instanceof Error ? error.message : "Impossible de charger le roster coach.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadSessions() {
      if (!selectedAthleteId) {
        setPlannedSessions([]);
        return;
      }
      try {
        const sessions = await getAthletePlannedSessions({
          athleteId: selectedAthleteId,
          from: toIsoDate(new Date()),
          to: toIsoDate(addDays(new Date(), 30)),
        });
        if (!ignore) setPlannedSessions(sessions);
      } catch (error) {
        if (!ignore) setMessage(error instanceof Error ? error.message : "Impossible de charger les séances.");
      }
    }
    void loadSessions();
    return () => {
      ignore = true;
    };
  }, [selectedAthleteId]);

  async function onExport() {
    if (!selectedAthleteId || exportBusy) return;
    setExportBusy(true);
    setMessage(null);
    try {
      await exportAthleteToXlsx({ athleteId: selectedAthleteId, from, to });
      setMessage("Export Excel généré pour l’athlète sélectionné.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Échec de l’export.";
      if (msg.includes("FORBIDDEN_SCOPE")) {
        setMessage("FORBIDDEN_SCOPE: accès export refusé pour cet athlète.");
      } else {
        setMessage(msg);
      }
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <AppShell
      title="Coach Hub"
      nav={[
        { to: "/today", label: "Aujourd'hui" },
        { to: "/coach", label: "Coach" },
        { to: "/history", label: "Historique" },
        { to: "/stats", label: "Stats" },
      ]}
    >
      <div className="grid gap-4 pb-8">
        {message && (
          <div className="p-4 rounded-[1rem] bg-surface-container-highest text-sm text-on-surface-variant whitespace-pre-wrap">
            {message}
          </div>
        )}

        <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Roster coach</div>
          {loading ? (
            <div className="text-sm text-on-surface-variant">Chargement…</div>
          ) : roster.length === 0 ? (
            <div className="text-sm text-on-surface-variant">Aucun athlète assigné.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-2">
              {roster.map((athlete) => {
                const active = selectedAthleteId === athlete.athleteId;
                return (
                  <button
                    type="button"
                    key={athlete.athleteId}
                    onClick={() => setSelectedAthleteId(athlete.athleteId)}
                    className={`text-left rounded-[1rem] p-3 ${active ? "bg-surface-container-highest" : "bg-surface-container-lowest"}`}
                  >
                    <div className="text-sm font-semibold text-on-surface">
                      {athlete.displayName ?? athlete.email ?? athlete.athleteId}
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      Assigné le {new Date(athlete.assignedAt).toLocaleDateString("fr-FR")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Export Excel</div>
              <div className="text-xs text-on-surface-variant mt-1">
                Export strictement limité à l’athlète sélectionné.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-[420px]">
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Du</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.currentTarget.value)}
                className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                style={{ border: 0 }}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Au</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.currentTarget.value)}
                className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                style={{ border: 0 }}
              />
            </label>
          </div>
          <div>
            <Button onClick={() => void onExport()} disabled={!selectedAthleteId || exportBusy}>
              {exportBusy ? "Export..." : "Exporter en .xlsx"}
            </Button>
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Séances à éditer</div>
          {selectedAthlete ? (
            <div className="text-xs text-on-surface-variant">
              Athlète: {selectedAthlete.displayName ?? selectedAthlete.email ?? selectedAthlete.athleteId}
            </div>
          ) : null}
          {plannedSessions.length === 0 ? (
            <div className="text-sm text-on-surface-variant">Aucune séance planifiée à venir sur 30 jours.</div>
          ) : (
            <div className="grid gap-2">
              {plannedSessions.map((session) => (
                <Link
                  key={session.id}
                  to={`/coach/session/${session.id}`}
                  className="rounded-[1rem] bg-surface-container-highest p-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-semibold text-on-surface">
                      {session.templateName ?? "Séance planifiée"}
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      {new Date(`${session.scheduledFor}T00:00:00`).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-secondary font-bold">Éditer →</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
