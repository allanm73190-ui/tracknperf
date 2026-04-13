import { useEffect, useState } from "react";
import { supabase } from "../infra/supabase/client";

export function useHasProfile(userId: string | null) {
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function run() {
      if (!userId || !supabase) {
        if (!ignore) {
          setHasProfile(false);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();

      if (ignore) return;

      if (error) {
        setHasProfile(false);
        setError(typeof error === "object" && error && "message" in error ? String(error.message) : null);
        setLoading(false);
        return;
      }

      setHasProfile(Boolean(data?.id));
      setLoading(false);
    }

    void run();
    return () => {
      ignore = true;
    };
  }, [userId]);

  return { loading, hasProfile, error };
}

