import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../infra/supabase/client";
import type { PlanImport } from "../../domain/plan/planImport";
import { importPlanFromJsonText } from "../../application/usecases/importPlanFromJson";
import { importPlanFromCsvText } from "../../application/usecases/importPlanFromCsv";
import { importPlanFromExcelArrayBuffer } from "../../application/usecases/importPlanFromExcel";
import { persistImportedPlan } from "../../application/usecases/persistImportedPlan";

type Format = "excel" | "json" | "csv";

async function isAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  if (!error && typeof data === "boolean") return data;

  // Fallback to selecting own role row (RLS allows it), in case RPC is unavailable.
  const { data: roleRow, error: roleErr } = await supabase
    .from("user_roles")
    .select("role")
    .maybeSingle();
  if (roleErr) return false;
  return roleRow?.role === "admin";
}

function guessFormat(file: File | null): Format {
  const name = file?.name?.toLowerCase() ?? "";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".csv")) return "csv";
  return "excel";
}

export default function AdminPage() {
  const { user, signOut, isConfigured } = useAuth();
  const [adminLoading, setAdminLoading] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>("excel");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [parsed, setParsed] = useState<PlanImport | null>(null);

  useEffect(() => {
    let ignore = false;
    async function run() {
      if (!supabase || !user?.id) {
        if (!ignore) {
          setAdmin(false);
          setAdminLoading(false);
        }
        return;
      }
      setAdminLoading(true);
      setAdminError(null);
      try {
        const ok = await isAdmin();
        if (!ignore) {
          setAdmin(ok);
          setAdminLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setAdmin(false);
          setAdminError(err instanceof Error ? err.message : "Could not check admin role.");
          setAdminLoading(false);
        }
      }
    }
    void run();
    return () => {
      ignore = true;
    };
  }, [user?.id]);

  const preview = useMemo(() => {
    if (!parsed) return null;
    return {
      planName: parsed.plan.name,
      version: parsed.planVersion.version,
      templates: parsed.sessionTemplates.length,
      plannedSessions: parsed.plannedSessions.length,
      dateRange:
        parsed.plannedSessions.length > 0
          ? {
              from: parsed.plannedSessions[0]?.scheduledFor,
              to: parsed.plannedSessions[parsed.plannedSessions.length - 1]?.scheduledFor,
            }
          : null,
    };
  }, [parsed]);

  async function onParse() {
    setMessage(null);
    setParsed(null);

    if (!file) {
      setMessage("Choose a file to import.");
      return;
    }

    setBusy(true);
    try {
      const inferred = guessFormat(file);
      const fmt = format ?? inferred;
      let result: PlanImport;

      if (fmt === "json") {
        const text = await file.text();
        result = importPlanFromJsonText(text);
      } else if (fmt === "csv") {
        const text = await file.text();
        result = importPlanFromCsvText(text);
      } else {
        const buf = await file.arrayBuffer();
        result = importPlanFromExcelArrayBuffer(buf);
      }

      setParsed(result);
      setMessage("Parsed successfully. Review preview, then click Import.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not parse file.");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setMessage(null);
    if (!parsed) {
      setMessage("Parse a file first.");
      return;
    }
    setBusy(true);
    try {
      const res = await persistImportedPlan(parsed);
      setMessage(`Imported: plan=${res.planId}, version=${res.planVersionId}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  if (adminLoading) {
    return (
      <main className="container">
        <h1>TrackNPerf</h1>
        <h2>Admin</h2>
        <p>Loading…</p>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="container">
        <h1>TrackNPerf</h1>
        <h2>Admin</h2>
        <p role="alert" style={{ maxWidth: 720 }}>
          You don’t have access to this page.
        </p>
        {adminError ? <pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{adminError}</pre> : null}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => window.history.back()}>
            Go back
          </button>
          <button type="button" onClick={() => void signOut()} disabled={!isConfigured}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Admin</h2>
      <p style={{ marginTop: 12 }}>
        Signed in as <code>{user?.email ?? user?.id ?? "unknown"}</code>
      </p>

      <section style={{ marginTop: 18, display: "grid", gap: 10, maxWidth: 720 }}>
        <h3 style={{ margin: 0 }}>Import plan</h3>

        <label style={{ display: "grid", gap: 6 }}>
          <span>File (Excel .xlsx, JSON, or CSV)</span>
          <input
            type="file"
            accept=".xlsx,.xls,.json,.csv"
            onChange={(e) => {
              const f = e.currentTarget.files?.item(0) ?? null;
              setFile(f);
              setFormat(guessFormat(f));
              setParsed(null);
              setMessage(null);
            }}
            disabled={busy}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.currentTarget.value as Format)} disabled={busy}>
            <option value="excel">Excel</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => void onParse()} disabled={!file || busy}>
            {busy ? "Working…" : "Parse & preview"}
          </button>
          <button type="button" onClick={() => void onImport()} disabled={!parsed || busy}>
            {busy ? "Importing…" : "Import"}
          </button>
          <button type="button" onClick={() => void signOut()} disabled={!isConfigured || busy}>
            Sign out
          </button>
        </div>

        {message ? (
          <p role="status" style={{ margin: 0 }}>
            {message}
          </p>
        ) : null}

        {preview ? (
          <pre style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.04)", padding: 12, borderRadius: 8 }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
        ) : null}
      </section>
    </main>
  );
}

