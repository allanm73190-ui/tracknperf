import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useIsAdmin } from "../../auth/useIsAdmin";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../kit/AppShell";
import { Button } from "../kit/Button";
import { Drawer } from "../kit/Drawer";
import { Pill } from "../kit/Pill";
import { SessionStateCard } from "../components/SessionStateCard";
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
  const navigate = useNavigate();
  const { user, signOut, isConfigured } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id ?? null);
  const [overview, setOverview] = useState<TodayOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<PersistedRecommendation | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ pending: number; applied: number } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
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
        setMessage(err instanceof Error ? err.message : "Erreur de chargement.");
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
      setMessage(`Sync effectué. Appliquées : ${res.applied}, échouées : ${res.failed}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Échec de la synchronisation.");
    } finally {
      setSyncBusy(false);
    }
  }

  function openDetailedLogging() {
    if (!plannedCandidate?.id) {
      setMessage("Aucune séance planifiée à ouvrir aujourd'hui.");
      return;
    }
    void navigate(`/planned-session/${plannedCandidate.id}`);
  }

  return (
    <AppShell
      title="Aujourd'hui"
      nav={[
        { to: "/today", label: "Aujourd'hui" },
        { to: "/history", label: "Historique" },
        { to: "/stats", label: "Stats" },
        ...(isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
      ]}
      rightSlot={
        <>
          {syncStatus ? (
            <Pill tone={syncStatus.pending > 0 ? "secondary" : "primary"}>
              {syncStatus.pending > 0 ? `En attente ${syncStatus.pending}` : "Synchronisé"}
            </Pill>
          ) : (
            <Pill tone="neutral">Sync</Pill>
          )}
          <Button variant="ghost" onClick={() => setSyncDrawerOpen(true)}>Sync</Button>
          <Button variant="ghost" onClick={() => void signOut()} disabled={!isConfigured}>Déconnexion</Button>
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
              onStart={openDetailedLogging}
            />
          ) : (
            <div className="rounded-[1.5rem] bg-surface-container-low p-8">
              <div className="text-on-surface-variant text-sm">Aucune recommandation pour aujourd'hui.</div>
            </div>
          )}

          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-headline font-bold uppercase tracking-tight text-sm">Daily check-in</h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Mettez à jour douleur, fatigue, sommeil et signaux de sécurité.
                </p>
              </div>
              <Link
                to="/daily-checkin"
                className="text-[11px] font-bold uppercase tracking-widest text-secondary"
              >
                Ouvrir →
              </Link>
            </div>
          </div>

          {/* Planned sessions */}
          {overview.planned.length > 0 && (
            <div className="rounded-[1.5rem] bg-surface-container-low p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headline font-bold uppercase tracking-tight text-sm">Planifié</h3>
                <Link to="/programme" className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                  Programme →
                </Link>
              </div>
              <div className="grid gap-2">
                {overview.planned.map((p) => (
                  <Link key={p.id} to={`/planned-session/${p.id}`}>
                    <SessionStateCard
                      state="planned"
                      title={p.templateName ?? "Séance"}
                      subtitle={p.scheduledFor}
                    />
                  </Link>
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
              <div className="text-on-surface-variant text-sm mb-4">Journée libre — aucune session planifiée.</div>
              <Link to="/programme" className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                Voir le programme →
              </Link>
            </div>
          )}

          {/* Quick log FAB */}
          <div className="flex justify-end">
            <button
              onClick={openDetailedLogging}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-bold text-sm uppercase tracking-widest text-[#3a4a00] active:scale-95 transition-all"
              style={{ background: "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)" }}
            >
              Ouvrir la séance détaillée
            </button>
          </div>
        </div>
      ) : null}

      {/* Sync drawer */}
      <Drawer open={syncDrawerOpen} title="" onClose={() => setSyncDrawerOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 8 }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-headline)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
                Détails de sync
              </h1>
              <p style={{ color: "#adaaaa", fontSize: 13, fontWeight: 500, margin: "4px 0 0" }}>Statut de la synchronisation</p>
            </div>
            <div style={{
              background: "#201f1f",
              borderRadius: 999,
              padding: "6px 14px",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: syncStatus?.pending === 0 ? "#cafd00" : "#adaaaa", textTransform: "uppercase" }}>
                {syncStatus?.pending === 0 ? "SYNCHÉ" : "LOCAL"}
              </span>
            </div>
          </div>

          {/* Offline banner — shown when there are pending ops */}
          {(syncStatus?.pending ?? 0) > 0 && (
            <div style={{
              background: "rgba(185,41,2,0.15)",
              borderRadius: 16,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "rgba(255,115,81,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff7351" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "#ff7351", letterSpacing: "-0.01em", fontSize: 14 }}>HORS LIGNE</div>
                  <div style={{ fontSize: 12, color: "#adaaaa", marginTop: 2 }}>Vérifiez votre connexion réseau</div>
                </div>
              </div>
              <button
                onClick={() => void onSyncNow()}
                disabled={syncBusy}
                style={{
                  background: "#ff7351",
                  color: "#450900",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: syncBusy ? "not-allowed" : "pointer",
                  opacity: syncBusy ? 0.6 : 1,
                }}
              >
                {syncBusy ? "…" : "RÉESSAYER"}
              </button>
            </div>
          )}

          {/* Summary grid */}
          {syncStatus && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "20px 20px" }}>
                <div style={{ fontFamily: "var(--font-headline)", fontSize: 36, fontWeight: 700, color: "#ffeea5", lineHeight: 1 }}>{syncStatus.pending}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#adaaaa", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 6 }}>EN ATTENTE</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "20px 20px" }}>
                <div style={{ fontFamily: "var(--font-headline)", fontSize: 36, fontWeight: 700, color: "#cafd00", lineHeight: 1 }}>{syncStatus.applied}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#adaaaa", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 6 }}>APPLIQUÉS</div>
              </div>
            </div>
          )}

          {/* Operations list */}
          {recentOps.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#adaaaa", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>
                Opérations Récentes
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {recentOps.slice(0, 10).map((op) => {
                  const isApplied = op.status === "applied";
                  const isError = !!op.lastError;
                  const statusLabel = isApplied ? "SYNCHÉ" : isError ? "ERREUR" : "FILE";
                  const statusColor = isApplied ? "#cafd00" : isError ? "#ff7351" : "#ffeea5";
                  const statusBg = isApplied ? "rgba(202,253,0,0.08)" : isError ? "rgba(255,115,81,0.08)" : "rgba(255,238,165,0.08)";
                  return (
                    <div key={op.opId} style={{ display: "flex", alignItems: "center", gap: 14, opacity: isApplied ? 1 : op.status === "pending" && !isError ? 0.65 : 1 }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: "#201f1f",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: 18,
                        color: statusColor,
                      }}>
                        {isApplied ? "✓" : isError ? "✕" : "↻"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {op.entity} · {op.opType}
                          </span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: statusColor,
                            background: statusBg,
                            padding: "2px 8px",
                            borderRadius: 10,
                            letterSpacing: "0.05em",
                            flexShrink: 0,
                            marginLeft: 8,
                          }}>
                            {statusLabel}
                          </span>
                        </div>
                        <p style={{ color: "#adaaaa", fontSize: 12, margin: 0 }}>
                          {op.attempts} tentative{op.attempts !== 1 ? "s" : ""}
                          {op.lastError ? ` · ${op.lastError}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Force sync CTA */}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => void onSyncNow()}
              disabled={syncBusy}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #cafd00 0%, #f3ffca 100%)",
                color: "#0e0e0e",
                border: "none",
                borderRadius: 16,
                height: 60,
                fontFamily: "var(--font-headline)",
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: "0.04em",
                cursor: syncBusy ? "not-allowed" : "pointer",
                opacity: syncBusy ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              ↻ FORCER LA SYNCHRO
            </button>
            <p style={{ textAlign: "center", fontSize: 10, color: "#adaaaa", marginTop: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
              {syncStatus ? `${syncStatus.applied} ops appliquées · ${syncStatus.pending} en attente` : "Chargement…"}
            </p>
          </div>

        </div>
      </Drawer>
    </AppShell>
  );
}
