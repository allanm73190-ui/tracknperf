import { useEffect, useState } from "react";
import { supabase } from "../../infra/supabase/client";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    let ignore = false;

    async function run() {
      if (!supabase) {
        if (!ignore) setMessage("Supabase is not configured.");
        return;
      }

      // For most Supabase flows, the client will pick up the session automatically.
      // We keep this page so redirect URLs are stable and user-friendly.
      const { data, error } = await supabase.auth.getSession();
      if (ignore) return;
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.session) {
        window.location.replace("/");
        return;
      }
      setMessage("No session found. Please try signing in again.");
    }

    void run();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Auth callback</h2>
      <p>{message}</p>
    </main>
  );
}

