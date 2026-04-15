import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Link } from "react-router-dom";
import { AppShell } from "../kit/AppShell";
import { Button } from "../kit/Button";
import { Drawer } from "../kit/Drawer";
import { Pill } from "../kit/Pill";
import { SessionStateCard } from "../components/SessionStateCard";
import { FeedbackForm } from "../components/FeedbackForm";
import { getTodayOverview, type TodayOverview } from "../../application/usecases/getTodayOverview";
import {
  computeAndPersistTodayRecommendation,
  type PersistedRecommendation,
} from "../../application/usecases/computeAndPersistTodayRecommendation";
import { flushSyncQueue } from "../../application/sync/syncClient";
import { getQueueStats, listRecentOps, type SyncOp } from "../../infra/offline/db";

function getRecoTitle(reco: PersistedRecommendation): string {
  const out = reco.output as { recommendedTemplateName?: unknown } | null;
  if (typeof out?.recommendedTemplateName === "string") return out.recommendedTemplateName;
  return "Séance recommandée";
}

function getRecoHeadline(reco: PersistedRecommendation): string {
  const exp = reco.explanation as { summary?: { headline?: unknown } } | null;
  if (typeof exp?.summary?.headline === "string") return exp.summary.headline;
  return "";
}

function getRecoReasons(reco: PersistedRecommendation): string[] {
  const exp = reco.explanation as { summary?: { reasonsTop3?: Array<{ text?: unknown }> } } | null;
  if (!Array.isArray(exp?.summary?.reasonsTop3)) return [];
  return exp!.summary!.reasonsTop3!
    .slice(0, 3)
    .map((r) => (typeof r.text === "string" ? r.text : JSON.stringify(r)));
}

export default function TodayPage() {
  const { user, signOut, isConfigured } = useAuth();
  const [overview, setOverview] = useState<TodayOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<PersistedRecommendation | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ pending: number; applied: number } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [recentOps, setRecentOps] = useState<SyncOp[]>([]);

  const plannedCandidate = useMemo(() => overview?.planned?.[0] ?? null, [overview?.planned]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  }, []);

  async function refreshData(ignoreSignal?: { ignore: boolean }) {
    try {
      const next = await getTodayOverview();
      if (ignoreSignal?.ignore) return;
      setOverview(next);
      const reco = await computeAndPersistTodayRecommendation(next);
      if (!ignoreSignal?.ignore) setRecommendation(reco);
      const stats = await getQueueStats();
      if (!ignoreSignal?.ignore) setSyncStatus(stats);
      const recent = await listRecentOps(50);
      if (!ignoreSignal?.ignore) setRecentOps(recent);
    } catch (err) {
      if (!ignoreSignal?.ignore) {
        setMessage(err instanceof Error ? err.message : "Could not load today.");
      }
    }
  }

  useEffect(() => {
    const signal = { ignore: false };
    setLoading(true);
    setMessage(null);
    void refreshData(signal).finally(() => {
      if (!signal.ignore) setLoading(false);
    });
    return () => { signal.ignore = true; };
  }, []);

  async function onSyncNow() {
    if (syncBusy) return;
    setSyncBusy(true);
    setMessage(null);
    try {
      const res = await flushSyncQueue();
      const stats = await getQueueStats();
      setSyncStatus(stats);
      const recent = await listRecentOps(50);
      setRecentOps(recent);
      setMessage(`Sync done. Applied: ${res.applied}, failed: ${res.failed}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncBusy(false);
    }
  }

  function onFeedbackSuccess(sessionId: string) {
    setLogDrawerOpen(false);
    setMessage(`Séance enregistrée. (${sessionId})`);
    void refreshData();
  }

  return (
    <AppShell
      title="Today"
      nav={[
        { to: "/today", label: "Today" },
        { to: "/history", label: "History" },
        { to: "/stats", label: "Stats" },
        { to: "/admin", label: "Admin" },
      ]}
      rightSlot={
        <>
          {syncStatus ? (
            <Pill tone={syncStatus.pending > 0 ? "secondary" : "primary"}>
              {syncStatus.pending > 0 ? `Queued ${syncStatus.pending}` : "Synced"}
            </Pill>
          ) : (
            <Pill tone="neutral">Sync</Pill>
          )}
          <Button variant="ghost" onClick={() => setSyncDrawerOpen(true)}>Sync</Button>
          <Button variant="ghost" onClick={() => void signOut()} disabled={!isConfigured}>Sign out</Button>
        </>
      }
    >
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[10%] left-[20%] w-[40vw] h-[40vw] bg-primary-container/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[10%] w-[30vw] h-[30vw] bg-secondary/5 blur-[100px] rounded-full" />
      </div>

      {/* Date header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-headline text-lg font-bold tracking-tighter uppercase text-primary">
          {todayLabel}
        </h1>
        {user?.email && (
          <span className="text-[10px] text-on-surface-variant truncate max-w-[160px]">{user.email}</span>
        )}
      </div>

      {/* Error / status message */}
      {message && (
        <div className="mb-6 p-4 rounded-[1rem] bg-surface-container-highest text-sm text-on-surface-variant whitespace-pre-wrap">
          {message}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          <div className="rounded-[1.5rem] bg-surface-container-low h-48 animate-pulse" />
          <div className="rounded-[1rem] bg-surface-container-highest h-20 animate-pulse" />
          <div className="rounded-[1rem] bg-surface-container-highest h-20 animate-pulse" />
        </div>
      ) : overview ? (
        <div className="grid gap-4">
          {/* Recommendation hero */}
          {recommendation ? (
            <SessionStateCard
              state="recommended"
              title={getRecoTitle(recommendation)}
              subtitle={getRecoHeadline(recommendation)}
              reasons={getRecoReasons(recommendation)}
              recommendationId={recommendation.recommendationId}
              onStart={() => setLogDrawerOpen(true)}
            />
          ) : (
            <div className="rounded-[1.5rem] bg-surface-container-low p-8">
              <div className="text-on-surface-variant text-sm">Aucune recommandation pour aujourd'hui.</div>
            </div>
          )}

          {/* Planned sessions */}
          {overview.planned.length > 0 && (
            <div className="rounded-[1.5rem] bg-surface-container-low p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headline font-bold uppercase tracking-tight text-sm">Planifié</h3>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {overview.planned.length} session{overview.planned.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid gap-2">
                {overview.planned.map((p) => (
                  <SessionStateCard
                    key={p.id}
                    state="planned"
                    title={p.templateName ?? "Session"}
                    subtitle={p.scheduledFor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Executed sessions today */}
          {overview.executed.length > 0 && (
            <div className="rounded-[1.5rem] bg-surface-container-low p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headline font-bold uppercase tracking-tight text-sm">Réalisé</h3>
                <span className="text-[10px] font-bold text-primary-container uppercase tracking-widest">
                  {overview.executed.length} session{overview.executed.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid gap-2">
                {overview.executed.slice(0, 6).map((e) => (
                  <Link key={e.id} to={`/session/${e.id}`}>
                    <SessionStateCard
                      state="executed"
                      title={`${e.startedAt.slice(11, 16)} → ${e.endedAt ? e.endedAt.slice(11, 16) : "—"}`}
                      subtitle={e.id.slice(0, 8)}
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* No sessions at all */}
          {overview.planned.length === 0 && overview.executed.length === 0 && !recommendation && (
            <div className="rounded-[1.5rem] bg-surface-container-low p-8 text-center">
              <div className="text-on-surface-variant text-sm">Journée libre — aucune session planifiée.</div>
            </div>
          )}

          {/* Quick log FAB */}
          <div className="flex justify-end">
            <button
              onClick={() => setLogDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-bold text-sm uppercase tracking-widest text-[#3a4a00] active:scale-95 transition-all"
              style={{ background: "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)" }}
            >
              + Journal
            </button>
          </div>
        </div>
      ) : null}

      {/* Feedback / log session drawer */}
      <Drawer open={logDrawerOpen} title="Journal de séance" onClose={() => setLogDrawerOpen(false)}>
        <FeedbackForm
          plannedSessionId={plannedCandidate?.id ?? null}
          planId={plannedCandidate?.planId ?? null}
          onSuccess={onFeedbackSuccess}
          onCancel={() => setLogDrawerOpen(false)}
        />
      </Drawer>

      {/* Sync drawer */}
      <Drawer open={syncDrawerOpen} title="Sync details" onClose={() => setSyncDrawerOpen(false)}>
        <div className="grid gap-4">
          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="font-headline font-bold uppercase tracking-tight text-sm">Statut</span>
              {syncStatus ? (
                <Pill tone={syncStatus.pending > 0 ? "secondary" : "primary"}>
                  {syncStatus.pending > 0 ? `Queued ${syncStatus.pending}` : "Synced"}
                </Pill>
              ) : (
                <Pill tone="neutral">Unknown</Pill>
              )}
            </div>
            {syncStatus && (
              <div className="grid gap-1 text-sm text-on-surface-variant mb-4">
                <div>Pending : <strong className="text-on-surface">{syncStatus.pending}</strong></div>
                <div>Applied : <strong className="text-on-surface">{syncStatus.applied}</strong></div>
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => void onSyncNow()} disabled={syncBusy}>
                {syncBusy ? "Syncing…" : "Sync now"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void (async () => {
                    const stats = await getQueueStats();
                    const recent = await listRecentOps(50);
                    setSyncStatus(stats);
                    setRecentOps(recent);
                  })();
                }}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="font-headline font-bold uppercase tracking-tight text-sm">Queue</span>
              <span className="text-[10px] text-on-surface-variant">{recentOps.length} ops</span>
            </div>
            {recentOps.length === 0 ? (
              <div className="text-on-surface-variant text-sm">No ops yet.</div>
            ) : (
              <div className="grid gap-2">
                {recentOps.slice(0, 25).map((op) => (
                  <div key={op.opId} className="p-4 rounded-[1rem] bg-surface-container-highest">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-headline font-bold text-sm tracking-tight">
                        {op.entity} · {op.opType}
                      </span>
                      <Pill tone={op.status === "applied" ? "primary" : op.lastError ? "error" : "secondary"}>
                        {op.status === "applied" ? "Applied" : op.lastError ? "Error" : "Queued"}
                      </Pill>
                    </div>
                    <div className="text-xs text-on-surface-variant grid gap-1">
                      <div>attempts: <strong>{op.attempts}</strong></div>
                      <div>next try: <code>{op.nextAttemptAt ? new Date(op.nextAttemptAt).toISOString().slice(11, 19) : "—"}</code></div>
                      {op.lastError && <div className="text-error">lastError: <code>{op.lastError}</code></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </AppShell>
  );
}
