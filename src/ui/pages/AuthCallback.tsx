import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession } from "../../auth/authActions";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Connexion en cours…");
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    async function run() {
      let session: Awaited<ReturnType<typeof getSession>>;
      try {
        session = await getSession();
      } catch (err) {
        if (!ignore) setMessage(err instanceof Error ? err.message : "Supabase non configuré.");
        return;
      }
      if (ignore) return;
      if (session) {
        let returnTo = "/today";
        try {
          const raw = window.sessionStorage.getItem("tnp:returnTo");
          if (raw && raw.startsWith("/")) returnTo = raw;
          window.sessionStorage.removeItem("tnp:returnTo");
        } catch {
          // Ignore if storage is blocked.
        }
        navigate(returnTo, { replace: true });
        return;
      }
      setMessage("Session introuvable. Veuillez vous reconnecter.");
    }

    void run();
    return () => {
      ignore = true;
    };
  }, [navigate]);

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Authentification</h2>
      <p>{message}</p>
    </main>
  );
}
