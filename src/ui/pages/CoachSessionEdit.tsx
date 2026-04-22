import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../kit/AppShell";
import { getPlannedSessionById, type PlannedSessionDetail } from "../../application/usecases/getPlannedSessionById";
import {
  coachAddLiveItem,
  coachListConflicts,
  coachRemoveLiveItem,
  coachResolveConflict,
  coachUpdateLiveItem,
  getPlannedSessionChangeTimeline,
  type CoachConflict,
  type PlannedSessionChangeTimelineRow,
  CoachApiError,
} from "../../application/usecases/coach";

type LiveItemDraft = {
  id: string;
  version: number | null;
  exerciseName: string;
  seriesRaw: string;
  repsRaw: string;
  loadRaw: string;
  tempoRaw: string;
  restRaw: string;
  rirRaw: string;
  coachNotes: string;
};

function toDraft(session: PlannedSessionDetail | null): LiveItemDraft[] {
  if (!session) return [];
  return session.templateExercises.map((item) => ({
    id: item.id,
    version: item.version,
    exerciseName: item.exerciseName,
    seriesRaw: item.seriesRaw ?? "",
    repsRaw: item.repsRaw ?? "",
    loadRaw: item.loadRaw ?? "",
    tempoRaw: item.tempoRaw ?? "",
    restRaw: item.restRaw ?? "",
    rirRaw: item.rirRaw ?? "",
    coachNotes: item.coachNotes ?? "",
  }));
}

export default function CoachSessionEditPage() {
  const navigate = useNavigate();
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [session, setSession] = useState<PlannedSessionDetail | null>(null);
  const [drafts, setDrafts] = useState<LiveItemDraft[]>([]);
  const [timeline, setTimeline] = useState<PlannedSessionChangeTimelineRow[]>([]);
  const [conflicts, setConflicts] = useState<CoachConflict[]>([]);
  const [newItemName, setNewItemName] = useState("");

  const athleteId = useMemo(() => session?.userId ?? null, [session?.userId]);

  const refreshSession = useCallback(async () => {
    if (!sessionId) return;
    const detail = await getPlannedSessionById(sessionId);
    setSession(detail);
    setDrafts(toDraft(detail));
  }, [sessionId]);

  const refreshTimeline = useCallback(async () => {
    if (!sessionId) return;
    const rows = await getPlannedSessionChangeTimeline(sessionId);
    setTimeline(rows);
  }, [sessionId]);

  const refreshConflicts = useCallback(async () => {
    if (!athleteId) return;
    const rows = await coachListConflicts(athleteId);
    setConflicts(rows.filter((c) => c.entity === "planned_session_items_live"));
  }, [athleteId]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!sessionId) {
        setMessage("Identifiant de séance manquant.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        await refreshSession();
        await refreshTimeline();
      } catch (error) {
        if (!ignore) setMessage(error instanceof Error ? error.message : "Impossible de charger la séance coach.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [sessionId, refreshSession, refreshTimeline]);

  useEffect(() => {
    if (!athleteId) return;
    void refreshConflicts();
  }, [athleteId, refreshConflicts]);

  function updateDraft(id: string, patch: Partial<LiveItemDraft>) {
    setDrafts((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function onSaveItem(item: LiveItemDraft) {
    if (item.version === null || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await coachUpdateLiveItem({
        liveItemId: item.id,
        expectedVersion: item.version,
        patch: {
          exercise_name: item.exerciseName,
          series_raw: item.seriesRaw || null,
          reps_raw: item.repsRaw || null,
          load_raw: item.loadRaw || null,
          tempo_raw: item.tempoRaw || null,
          rest_raw: item.restRaw || null,
          rir_raw: item.rirRaw || null,
          coach_notes: item.coachNotes || null,
        },
      });
      await refreshSession();
      await refreshTimeline();
      if (athleteId) await refreshConflicts();
      setMessage("Modification coach enregistrée.");
    } catch (error) {
      if (error instanceof CoachApiError) {
        if (error.code === "ITEM_REALIZED_LOCKED") {
          setMessage("403 ITEM_REALIZED_LOCKED: cet item est déjà réalisé, modification coach refusée.");
        } else if (error.code === "VERSION_CONFLICT") {
          setMessage("409 VERSION_CONFLICT: conflit détecté, choisissez une résolution.");
          if (athleteId) await refreshConflicts();
        } else if (error.code === "FORBIDDEN_SCOPE") {
          setMessage("403 FORBIDDEN_SCOPE: cet athlète n’est pas dans votre scope.");
        } else {
          setMessage(`${error.code}${error.detail ? `: ${error.detail}` : ""}`);
        }
      } else {
        setMessage(error instanceof Error ? error.message : "Échec de la sauvegarde coach.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onRemoveItem(item: LiveItemDraft) {
    if (item.version === null || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await coachRemoveLiveItem({ liveItemId: item.id, expectedVersion: item.version });
      await refreshSession();
      await refreshTimeline();
      if (athleteId) await refreshConflicts();
      setMessage("Exercice retiré.");
    } catch (error) {
      if (error instanceof CoachApiError && error.code === "ITEM_REALIZED_LOCKED") {
        setMessage("403 ITEM_REALIZED_LOCKED: retrait refusé car item déjà réalisé.");
      } else if (error instanceof CoachApiError && error.code === "VERSION_CONFLICT") {
        setMessage("409 VERSION_CONFLICT: conflit détecté, choisissez une résolution.");
        if (athleteId) await refreshConflicts();
      } else if (error instanceof CoachApiError && error.code === "FORBIDDEN_SCOPE") {
        setMessage("403 FORBIDDEN_SCOPE: cet athlète n’est pas dans votre scope.");
      } else {
        setMessage(error instanceof Error ? error.message : "Échec du retrait.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onAddItem() {
    if (!sessionId || !newItemName.trim() || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await coachAddLiveItem({
        plannedSessionId: sessionId,
        item: { exercise_name: newItemName.trim() },
      });
      setNewItemName("");
      await refreshSession();
      await refreshTimeline();
      setMessage("Exercice ajouté.");
    } catch (error) {
      if (error instanceof CoachApiError && error.code === "FORBIDDEN_SCOPE") {
        setMessage("403 FORBIDDEN_SCOPE: ajout refusé hors scope coach.");
      } else {
        setMessage(error instanceof Error ? error.message : "Échec de l’ajout.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onResolveConflict(conflictId: string, resolution: "local" | "server") {
    setSaving(true);
    setMessage(null);
    try {
      await coachResolveConflict({ conflictId, resolution });
      await refreshSession();
      await refreshTimeline();
      if (athleteId) await refreshConflicts();
      setMessage(`Conflit résolu côté ${resolution === "local" ? "local" : "serveur"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Échec de la résolution de conflit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Coach Edit"
      nav={[
        { to: "/today", label: "Aujourd'hui" },
        { to: "/coach", label: "Coach" },
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

        {loading ? (
          <div className="rounded-[1.5rem] bg-surface-container-low p-6 text-sm text-on-surface-variant">Chargement…</div>
        ) : null}

        {!loading && session ? (
          <>
            <div className="rounded-[1.5rem] bg-surface-container-low p-6">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Séance coach</div>
              <div className="font-headline font-black text-2xl tracking-tight mt-2">
                {session.templateName ?? "Séance planifiée"}
              </div>
              <div className="text-xs text-on-surface-variant mt-1">
                {new Date(`${session.scheduledFor}T00:00:00`).toLocaleDateString("fr-FR")} · athlète {session.userId}
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Ajouter un exercice</div>
              <div className="flex gap-2">
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.currentTarget.value)}
                  placeholder="Nom de l'exercice"
                  className="flex-1 rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                  style={{ border: 0 }}
                />
                <button
                  onClick={() => void onAddItem()}
                  disabled={saving || !newItemName.trim()}
                  className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-highest text-on-surface-variant active:scale-95 disabled:opacity-50"
                >
                  Ajouter
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {drafts.map((item) => (
                <div key={item.id} className="rounded-[1.2rem] bg-surface-container-low p-4 grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-on-surface-variant">version {item.version ?? "—"}</div>
                    <button
                      onClick={() => void onRemoveItem(item)}
                      disabled={saving || item.version === null}
                      className="text-[10px] uppercase tracking-widest text-on-surface-variant"
                    >
                      Retirer
                    </button>
                  </div>

                  <div className="grid md:grid-cols-4 gap-2">
                    <input
                      value={item.exerciseName}
                      onChange={(e) => updateDraft(item.id, { exerciseName: e.currentTarget.value })}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm md:col-span-2"
                      style={{ border: 0 }}
                      placeholder="Exercice"
                    />
                    <input
                      value={item.seriesRaw}
                      onChange={(e) => updateDraft(item.id, { seriesRaw: e.currentTarget.value })}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                      style={{ border: 0 }}
                      placeholder="Séries"
                    />
                    <input
                      value={item.repsRaw}
                      onChange={(e) => updateDraft(item.id, { repsRaw: e.currentTarget.value })}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                      style={{ border: 0 }}
                      placeholder="Reps"
                    />
                    <input
                      value={item.loadRaw}
                      onChange={(e) => updateDraft(item.id, { loadRaw: e.currentTarget.value })}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                      style={{ border: 0 }}
                      placeholder="Charge"
                    />
                    <input
                      value={item.tempoRaw}
                      onChange={(e) => updateDraft(item.id, { tempoRaw: e.currentTarget.value })}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                      style={{ border: 0 }}
                      placeholder="Tempo"
                    />
                    <input
                      value={item.restRaw}
                      onChange={(e) => updateDraft(item.id, { restRaw: e.currentTarget.value })}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                      style={{ border: 0 }}
                      placeholder="Repos"
                    />
                    <input
                      value={item.rirRaw}
                      onChange={(e) => updateDraft(item.id, { rirRaw: e.currentTarget.value })}
                      className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm"
                      style={{ border: 0 }}
                      placeholder="RIR"
                    />
                  </div>

                  <textarea
                    value={item.coachNotes}
                    onChange={(e) => updateDraft(item.id, { coachNotes: e.currentTarget.value })}
                    rows={2}
                    className="rounded-[0.75rem] bg-surface-container-highest text-on-surface px-3 py-2 text-sm resize-y"
                    style={{ border: 0 }}
                    placeholder="Notes coach"
                  />

                  <div>
                    <button
                      onClick={() => void onSaveItem(item)}
                      disabled={saving || item.version === null}
                      className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-highest text-secondary active:scale-95 disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Conflits synchronisation</div>
              {conflicts.length === 0 ? (
                <div className="text-sm text-on-surface-variant">Aucun conflit en attente.</div>
              ) : (
                <div className="grid gap-2">
                  {conflicts.map((conflict) => (
                    <div key={conflict.id} className="rounded-[0.9rem] bg-surface-container-highest p-3">
                      <div className="text-xs text-on-surface-variant">Conflit {conflict.id}</div>
                      <div className="text-xs text-on-surface-variant">
                        Version locale {conflict.localVersion ?? "—"} vs serveur {conflict.serverVersion ?? "—"}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => void onResolveConflict(conflict.id, "local")}
                          disabled={saving}
                          className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-lowest text-secondary disabled:opacity-50"
                        >
                          Garder local
                        </button>
                        <button
                          onClick={() => void onResolveConflict(conflict.id, "server")}
                          disabled={saving}
                          className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-lowest text-on-surface-variant disabled:opacity-50"
                        >
                          Garder serveur
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Timeline audit</div>
              {timeline.length === 0 ? (
                <div className="text-sm text-on-surface-variant">Aucune modification coach sur cette séance.</div>
              ) : (
                <div className="grid gap-2">
                  {timeline.map((entry) => (
                    <div key={entry.id} className="rounded-[0.9rem] bg-surface-container-highest p-3">
                      <div className="text-sm font-semibold text-on-surface">
                        {entry.changeType.toUpperCase()} · {new Date(entry.changedAt).toLocaleString("fr-FR")}
                      </div>
                      <div className="text-xs text-on-surface-variant">
                        Auteur: {entry.changedByName ?? entry.changedBy ?? "Système"}
                      </div>
                      <div className="text-xs text-on-surface-variant">
                        Champs: {entry.fieldsChanged.length > 0 ? entry.fieldsChanged.join(", ") : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
