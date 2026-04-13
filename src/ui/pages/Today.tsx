import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Link } from "react-router-dom";
import { AppShell } from "../kit/AppShell";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { Drawer } from "../kit/Drawer";
import { Input } from "../kit/Input";
import { Pill } from "../kit/Pill";
import { getTodayOverview, type TodayOverview } from "../../application/usecases/getTodayOverview";
import { logExecutedSession } from "../../application/usecases/logExecutedSession";
import {
  computeAndPersistTodayRecommendation,
  type PersistedRecommendation,
} from "../../application/usecases/computeAndPersistTodayRecommendation";
import { flushSyncQueue } from "../../application/sync/syncClient";
import { getQueueStats, listRecentOps, type SyncOp } from "../../infra/offline/db";

function nowIsoTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseLocalTimeToDate(today: Date, time: string): Date | null {
  const m = time.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date(today);
  d.setHours(h, min, 0, 0);
  return d;
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
  const [recentOps, setRecentOps] = useState<SyncOp[]>([]);

  // Log form state
  const today = useMemo(() => new Date(), []);
  const [startTime, setStartTime] = useState(() => nowIsoTime(new Date(Date.now() - 60 * 60 * 1000)));
  const [endTime, setEndTime] = useState(() => nowIsoTime(new Date()));
  const [durationMinutes, setDurationMinutes] = useState<number | "">("");
  const [rpe, setRpe] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const plannedCandidate = useMemo(() => {
    const p = overview?.planned?.[0];
    return p ?? null;
  }, [overview?.planned]);

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      setMessage(null);
      try {
        const res = await getTodayOverview();
        if (ignore) return;
        setOverview(res);
        const reco = await computeAndPersistTodayRecommendation(res);
        if (!ignore) setRecommendation(reco);
        const stats = await getQueueStats();
        if (!ignore) setSyncStatus(stats);
        const recent = await listRecentOps(50);
        if (!ignore) setRecentOps(recent);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not load today.";
        if (!ignore) setMessage(msg);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => {
      ignore = true;
    };
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
      const msg = err instanceof Error ? err.message : "Sync failed.";
      setMessage(msg);
    } finally {
      setSyncBusy(false);
    }
  }

  async function onLog() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const startedAt = parseLocalTimeToDate(today, startTime);
      const endedAt = parseLocalTimeToDate(today, endTime);
      if (!startedAt || !endedAt) throw new Error("Please provide valid start/end times.");
      const res = await logExecutedSession({
        plannedSessionId: plannedCandidate?.id ?? null,
        planId: plannedCandidate?.planId ?? null,
        startedAt,
        endedAt,
        payload: {
          durationMinutes: durationMinutes === "" ? null : durationMinutes,
          rpe: rpe === "" ? null : rpe,
          notes: notes.trim().length ? notes.trim() : null,
        },
      });

      // Refresh overview
      const next = await getTodayOverview();
      setOverview(next);
      const reco = await computeAndPersistTodayRecommendation(next);
      setRecommendation(reco);
      const stats = await getQueueStats();
      setSyncStatus(stats);
      const recent = await listRecentOps(50);
      setRecentOps(recent);
      setNotes("");
      setMessage(`Session logged. (${res.id})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not log session.";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
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
          <Button variant="ghost" onClick={() => setSyncDrawerOpen(true)}>
            Details
          </Button>
          <Button variant="ghost" onClick={() => void onSyncNow()} disabled={syncBusy}>
            {syncBusy ? "Syncing…" : "Sync now"}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} disabled={!isConfigured}>
            Sign out
          </Button>
        </>
      }
    >
      <div className="muted" style={{ marginBottom: 18 }}>
        Signed in as <code>{user?.email ?? user?.id ?? "unknown"}</code>
      </div>

      {loading ? <Card tone="low">Loading…</Card> : null}
      {message ? (
        <Card tone="highest">
          <div style={{ whiteSpace: "pre-wrap" }}>{message}</div>
        </Card>
      ) : null}

      {!loading && overview ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Card tone="low">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <h2 className="h2">What’s planned</h2>
              <span className="muted" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Today
              </span>
            </div>
            {overview.planned.length === 0 ? (
              <div className="muted">No planned session for today.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {overview.planned.map((p) => (
                  <Card key={p.id} tone="highest">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.03em" }}>
                          {p.templateName ?? "Session"}
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          Scheduled: {p.scheduledFor}
                        </div>
                      </div>
                      <Pill tone="primary">Plan</Pill>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>

          <Card tone="low">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <h2 className="h2">What to do</h2>
              <Pill tone="secondary">Why</Pill>
            </div>

            {!recommendation ? (
              <div className="muted">No recommendation yet.</div>
            ) : (
              <Card tone="highest">
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.03em" }}>
                    {typeof (recommendation.output as { recommendedTemplateName?: unknown })?.recommendedTemplateName ===
                    "string"
                      ? String((recommendation.output as { recommendedTemplateName: unknown }).recommendedTemplateName)
                      : "Recommended session"}
                  </div>

                  <div className="muted" style={{ fontSize: 13 }}>
                    {typeof (recommendation.explanation as { summary?: unknown }) === "object" &&
                    recommendation.explanation &&
                    "summary" in (recommendation.explanation as Record<string, unknown>) &&
                    (recommendation.explanation as { summary: unknown }).summary &&
                    typeof (recommendation.explanation as { summary: unknown }).summary === "object" &&
                    "headline" in ((recommendation.explanation as { summary: Record<string, unknown> }).summary ?? {})
                      ? String(
                          (
                            recommendation.explanation as {
                              summary: { headline?: unknown };
                            }
                          ).summary.headline ?? "",
                        )
                      : "Explanation"}
                  </div>

                  {Array.isArray((recommendation.explanation as { summary?: { reasonsTop3?: unknown } })?.summary?.reasonsTop3) ? (
                    <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
                      {(
                        (recommendation.explanation as { summary: { reasonsTop3: Array<{ text?: unknown }> } }).summary
                          .reasonsTop3 ?? []
                      )
                        .slice(0, 3)
                        .map((r, idx) => (
                          <li key={idx} style={{ color: "var(--text-muted)", lineHeight: 1.35 }}>
                            {typeof r.text === "string" ? r.text : JSON.stringify(r)}
                          </li>
                        ))}
                    </ol>
                  ) : null}

                  <details>
                    <summary style={{ cursor: "pointer" }}>Details</summary>
                    <div className="muted" style={{ marginTop: 10 }}>
                      Recommendation id: <code>{recommendation.recommendationId}</code>
                    </div>
                  </details>
                </div>
              </Card>
            )}
          </Card>

          <Card tone="low">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <h2 className="h2">Log a session</h2>
              <Pill tone="neutral">Journal</Pill>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <Input label="Start (HH:MM)" value={startTime} onChange={setStartTime} placeholder="08:30" />
              <Input label="End (HH:MM)" value={endTime} onChange={setEndTime} placeholder="09:30" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <Input
                label="Duration (min)"
                value={durationMinutes === "" ? "" : String(durationMinutes)}
                onChange={(v) => {
                  const raw = v.trim();
                  if (!raw) return setDurationMinutes("");
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setDurationMinutes(Math.max(1, Math.min(24 * 60, Math.floor(n))));
                }}
                placeholder="60"
              />
              <Input
                label="RPE (1-10)"
                value={rpe === "" ? "" : String(rpe)}
                onChange={(v) => {
                  const raw = v.trim();
                  if (!raw) return setRpe("");
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setRpe(Math.max(1, Math.min(10, Math.floor(n))));
                }}
                placeholder="7"
              />
            </div>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                rows={4}
                style={{
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: "rgba(38, 38, 38, 0.7)",
                  color: "var(--text)",
                  padding: 12,
                  fontFamily: "var(--font-body)",
                  resize: "vertical",
                }}
              />
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="primary" onClick={() => void onLog()} disabled={busy}>
                {busy ? "Logging…" : "Log"}
              </Button>
              <span className="muted" style={{ fontSize: 13 }}>
                {plannedCandidate?.templateName ? `Linked to: ${plannedCandidate.templateName}` : "No planned session linked."}
              </span>
            </div>
          </Card>

          <Card tone="low">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <h2 className="h2">Recent execution</h2>
              <Pill tone="neutral">{overview.executed.length} sessions</Pill>
            </div>
            {overview.executed.length === 0 ? (
              <div className="muted">Nothing logged yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {overview.executed.slice(0, 6).map((e) => (
                  <Link key={e.id} to={`/session/${e.id}`}>
                    <Card tone="highest">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.03em" }}>
                            {e.startedAt.slice(11, 16)} → {e.endedAt ? e.endedAt.slice(11, 16) : "—"}
                          </div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {e.id}
                          </div>
                        </div>
                        <Pill tone="neutral">Log</Pill>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      <Drawer open={syncDrawerOpen} title="Sync details" onClose={() => setSyncDrawerOpen(false)}>
        <Card tone="low">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <h2 className="h2">Status</h2>
            {syncStatus ? (
              <Pill tone={syncStatus.pending > 0 ? "secondary" : "primary"}>
                {syncStatus.pending > 0 ? `Queued ${syncStatus.pending}` : "Synced"}
              </Pill>
            ) : (
              <Pill tone="neutral">Unknown</Pill>
            )}
          </div>
          {syncStatus ? (
            <div className="muted" style={{ display: "grid", gap: 6 }}>
              <div>
                Pending: <strong>{syncStatus.pending}</strong>
              </div>
              <div>
                Applied: <strong>{syncStatus.applied}</strong>
              </div>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
        </Card>

        <Card tone="low">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <h2 className="h2">Queue</h2>
            <Pill tone="neutral">{recentOps.length} ops</Pill>
          </div>
          {recentOps.length === 0 ? (
            <div className="muted">No ops yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {recentOps.slice(0, 25).map((op) => (
                <Card key={op.opId} tone="highest">
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.03em" }}>
                        {op.entity} · {op.opType}
                      </div>
                      <Pill tone={op.status === "applied" ? "primary" : op.lastError ? "error" : "secondary"}>
                        {op.status === "applied" ? "Applied" : op.lastError ? "Error" : "Queued"}
                      </Pill>
                    </div>
                    <div className="muted" style={{ fontSize: 13, display: "grid", gap: 4 }}>
                      <div>
                        attempts: <strong>{op.attempts}</strong>
                      </div>
                      <div>
                        next try:{" "}
                        <code>{op.nextAttemptAt ? new Date(op.nextAttemptAt).toISOString().slice(11, 19) : "—"}</code>
                      </div>
                      {op.lastError ? (
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          lastError: <code>{op.lastError}</code>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </Drawer>
    </AppShell>
  );
}

