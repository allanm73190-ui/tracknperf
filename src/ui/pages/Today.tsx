import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Link } from "react-router-dom";
import { getTodayOverview, type TodayOverview } from "../../application/usecases/getTodayOverview";
import { logExecutedSession } from "../../application/usecases/logExecutedSession";
import {
  computeAndPersistTodayRecommendation,
  type PersistedRecommendation,
} from "../../application/usecases/computeAndPersistTodayRecommendation";
import { flushSyncQueue } from "../../application/sync/syncClient";
import { getQueueStats } from "../../infra/offline/db";

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
    <main className="container">
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <h1>TrackNPerf</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Signed in as <code>{user?.email ?? user?.id ?? "unknown"}</code>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => void onSyncNow()} disabled={syncBusy}>
            {syncBusy ? "Syncing…" : "Sync now"}
          </button>
          <button type="button" onClick={() => void signOut()} disabled={!isConfigured}>
            Sign out
          </button>
        </div>
      </header>

      <h2 style={{ marginTop: 24 }}>Today</h2>
      {loading ? <p>Loading…</p> : null}
      {message ? (
        <p role="alert" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </p>
      ) : null}
      {syncStatus ? (
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          Sync queue: <strong>{syncStatus.pending}</strong> pending, <strong>{syncStatus.applied}</strong> applied.
        </p>
      ) : null}

      {!loading && overview ? (
        <>
          <nav style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/history">History</Link>
            <Link to="/stats">Stats</Link>
            <Link to="/admin">Admin</Link>
          </nav>

          <section style={{ marginTop: 16 }}>
            <h3>Planned</h3>
            {overview.planned.length === 0 ? (
              <p style={{ opacity: 0.8 }}>No planned session for today.</p>
            ) : (
              <ul>
                {overview.planned.map((p) => (
                  <li key={p.id}>
                    <strong>{p.templateName ?? "Session"}</strong> <span style={{ opacity: 0.8 }}>({p.scheduledFor})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: 16 }}>
            <h3>Recommended</h3>
            {!recommendation ? (
              <p style={{ opacity: 0.8 }}>No recommendation yet.</p>
            ) : (
              <>
                <p>
                  <strong>
                    {typeof (recommendation.output as { recommendedTemplateName?: unknown })
                      ?.recommendedTemplateName === "string"
                      ? String(
                          (recommendation.output as { recommendedTemplateName: unknown })
                            .recommendedTemplateName,
                        )
                      : "Recommended session"}
                  </strong>
                </p>
                <details>
                  <summary>Why?</summary>
                  <div style={{ marginTop: 8 }}>
                    <p style={{ marginTop: 0, fontWeight: 600 }}>
                      {typeof (recommendation.explanation as { summary?: unknown }) === "object" &&
                      recommendation.explanation &&
                      "summary" in (recommendation.explanation as Record<string, unknown>) &&
                      (recommendation.explanation as { summary: unknown }).summary &&
                      typeof (recommendation.explanation as { summary: unknown }).summary === "object" &&
                      "headline" in
                        ((recommendation.explanation as { summary: Record<string, unknown> }).summary ??
                          {})
                        ? String(
                            (recommendation.explanation as {
                              summary: { headline?: unknown };
                            }).summary.headline ?? "",
                          )
                        : "Explanation"}
                    </p>
                    <ol>
                      {Array.isArray(
                        (recommendation.explanation as { summary?: { reasonsTop3?: unknown } })?.summary
                          ?.reasonsTop3,
                      )
                        ? (
                            (recommendation.explanation as {
                              summary: { reasonsTop3: Array<{ text?: unknown }> };
                            }).summary.reasonsTop3 ?? []
                          )
                            .slice(0, 3)
                            .map((r, idx) => (
                              <li key={idx}>{typeof r.text === "string" ? r.text : JSON.stringify(r)}</li>
                            ))
                        : null}
                    </ol>
                    <div style={{ marginTop: 8, opacity: 0.8 }}>
                      Recommendation id: <code>{recommendation.recommendationId}</code>
                    </div>
                  </div>
                </details>
              </>
            )}
          </section>

          <section style={{ marginTop: 16 }}>
            <h3>Executed</h3>
            {overview.executed.length === 0 ? (
              <p style={{ opacity: 0.8 }}>Nothing logged yet.</p>
            ) : (
              <ul>
                {overview.executed.map((e) => (
                  <li key={e.id}>
                    <code>{e.startedAt.slice(11, 16)}</code> →{" "}
                    <code>{e.endedAt ? e.endedAt.slice(11, 16) : "—"}</code> <span style={{ opacity: 0.8 }}>({e.id})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <h3>Log session</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 520 }}>
              <label>
                Start
                <input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="HH:MM" />
              </label>
              <label>
                End
                <input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="HH:MM" />
              </label>
              <label>
                Duration (min)
                <input
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (!v) return setDurationMinutes("");
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    setDurationMinutes(Math.max(1, Math.min(24 * 60, Math.floor(n))));
                  }}
                />
              </label>
              <label>
                RPE (1-10)
                <input
                  inputMode="numeric"
                  value={rpe}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (!v) return setRpe("");
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    setRpe(Math.max(1, Math.min(10, Math.floor(n))));
                  }}
                />
              </label>
            </div>
            <label style={{ display: "block", marginTop: 12, maxWidth: 720 }}>
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </label>
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => void onLog()} disabled={busy}>
                {busy ? "Logging…" : "Log"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

