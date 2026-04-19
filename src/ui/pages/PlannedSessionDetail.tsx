import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPlannedSessionById, type PlannedSessionDetail } from "../../application/usecases/getPlannedSessionById";
import { AppShell } from "../kit/AppShell";
import { FeedbackForm } from "../components/FeedbackForm";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default function PlannedSessionDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<PlannedSessionDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const [loggedId, setLoggedId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!sessionId) {
        setMessage("Identifiant manquant.");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getPlannedSessionById(sessionId);
        if (ignore) return;
        if (!data) {
          setMessage("Séance introuvable.");
        } else {
          setSession(data);
        }
      } catch (err) {
        if (!ignore) setMessage(err instanceof Error ? err.message : "Erreur de chargement.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => { ignore = true; };
  }, [sessionId]);

  function onLogSuccess(id: string) {
    setLogged(true);
    setLoggedId(id);
  }

  return (
    <AppShell
      title="Séance"
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
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[5%] left-[10%] w-[50vw] h-[50vw] bg-primary-container/5 blur-[120px] rounded-full" />
      </div>

      {loading && (
        <div className="grid gap-4">
          <div className="rounded-[1.5rem] bg-surface-container-low h-36 animate-pulse" />
          <div className="rounded-[1.5rem] bg-surface-container-low h-64 animate-pulse" />
        </div>
      )}

      {message && (
        <div className="p-4 rounded-[1rem] bg-surface-container-highest text-sm text-on-surface-variant mb-4">
          {message}
        </div>
      )}

      {!loading && session && !logged && (
        <div className="grid gap-4">
          {/* Session header card */}
          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            {/* Eyebrow */}
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
              Planifié
            </div>
            <h1
              style={{ fontFamily: "var(--font-headline)" }}
              className="text-3xl font-black tracking-tighter leading-none mb-1"
            >
              {session.templateName ?? "Séance"}
            </h1>
            <div className="text-sm text-on-surface-variant capitalize mt-1">
              {formatDate(session.scheduledFor)}
            </div>
            {session.templateDescription && (
              <p className="mt-4 text-sm text-on-surface-variant leading-relaxed">
                {session.templateDescription}
              </p>
            )}
          </div>

          {/* Log form */}
          <div className="rounded-[1.5rem] bg-surface-container-low p-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">
              Journal de séance
            </div>
            <FeedbackForm
              plannedSessionId={session.id}
              planId={session.planId}
              onSuccess={onLogSuccess}
              onCancel={() => navigate(-1)}
            />
          </div>
        </div>
      )}

      {!loading && logged && (
        <div className="grid gap-4">
          <div className="rounded-[1.5rem] bg-surface-container-low p-8 text-center">
            <div
              style={{ fontFamily: "var(--font-headline)", color: "var(--color-primary-container)" }}
              className="text-4xl font-black tracking-tighter mb-2"
            >
              Séance enregistrée
            </div>
            <div className="text-sm text-on-surface-variant mb-6">
              {loggedId ? `ID : ${loggedId.slice(0, 8)}` : ""}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate("/today")}
                className="px-5 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-highest text-on-surface-variant active:scale-95 transition-all"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => navigate("/history")}
                className="px-5 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest bg-surface-container-highest text-on-surface-variant active:scale-95 transition-all"
              >
                Historique
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
