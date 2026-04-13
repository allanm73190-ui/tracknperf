import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../infra/supabase/client";
import type { PlanImport } from "../../domain/plan/planImport";
import { importPlanFromJsonText } from "../../application/usecases/importPlanFromJson";
import { importPlanFromCsvText } from "../../application/usecases/importPlanFromCsv";
import { importPlanFromExcelArrayBuffer } from "../../application/usecases/importPlanFromExcel";
import { persistImportedPlanWithEngineContext } from "../../application/usecases/persistImportedPlan";

type Format = "excel" | "json" | "csv";

type ConfigProfileRow = { id: string; key: string; name: string };
type AlgorithmVersionRow = { id: string; version: string };

function guessFormat(file: File | null): Format {
  const name = file?.name?.toLowerCase() ?? "";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".csv")) return "csv";
  return "excel";
}

export default function AdminPage() {
  const { user, signOut, isConfigured } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>("excel");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [parsed, setParsed] = useState<PlanImport | null>(null);

  const [configProfiles, setConfigProfiles] = useState<ConfigProfileRow[]>([]);
  const [algoVersions, setAlgoVersions] = useState<AlgorithmVersionRow[]>([]);
  const [selectedConfigProfileId, setSelectedConfigProfileId] = useState<string>("");
  const [selectedAlgorithmVersionId, setSelectedAlgorithmVersionId] = useState<string>("");

  const [newConfigKey, setNewConfigKey] = useState("default");
  const [newConfigName, setNewConfigName] = useState("Default config");
  const [newConfigJson, setNewConfigJson] = useState('{"version":"v1.1-default"}');

  const [newAlgoVersion, setNewAlgoVersion] = useState("v1.1.0");

  useEffect(() => {
    let ignore = false;
    async function loadAdminData() {
      if (!supabase || !user?.id) return;
      const { data: cfg, error: cfgErr } = await supabase
        .from("config_profiles")
        .select("id, key, name")
        .order("created_at", { ascending: false });
      if (!ignore && !cfgErr && cfg) {
        const rows = cfg.map((r) => ({ id: String(r.id), key: String(r.key), name: String(r.name) }));
        setConfigProfiles(rows);
        if (!selectedConfigProfileId && rows[0]) setSelectedConfigProfileId(rows[0].id);
      }

      const { data: av, error: avErr } = await supabase
        .from("algorithm_versions")
        .select("id, version")
        .order("created_at", { ascending: false });
      if (!ignore && !avErr && av) {
        const rows = av.map((r) => ({ id: String(r.id), version: String(r.version) }));
        setAlgoVersions(rows);
        if (!selectedAlgorithmVersionId && rows[0]) setSelectedAlgorithmVersionId(rows[0].id);
      }
    }
    void loadAdminData();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const res = await persistImportedPlanWithEngineContext(parsed, {
        configProfileId: selectedConfigProfileId || null,
        algorithmVersionId: selectedAlgorithmVersionId || null,
      });
      setMessage(`Imported: plan=${res.planId}, version=${res.planVersionId}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateConfigProfile() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      let cfg: unknown;
      try {
        cfg = JSON.parse(newConfigJson);
      } catch {
        throw new Error("Config JSON is invalid.");
      }
      const { data, error } = await supabase
        .from("config_profiles")
        .insert({ key: newConfigKey.trim(), name: newConfigName.trim(), config: cfg })
        .select("id, key, name")
        .single();
      if (error) throw new Error(error.message);
      const row = { id: String(data.id), key: String(data.key), name: String(data.name) };
      setConfigProfiles((prev) => [row, ...prev]);
      setSelectedConfigProfileId(row.id);
      setMessage("Config profile created.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create config profile.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateAlgorithmVersion() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase
        .from("algorithm_versions")
        .insert({ version: newAlgoVersion.trim(), metadata: {} })
        .select("id, version")
        .single();
      if (error) throw new Error(error.message);
      const row = { id: String(data.id), version: String(data.version) };
      setAlgoVersions((prev) => [row, ...prev]);
      setSelectedAlgorithmVersionId(row.id);
      setMessage("Algorithm version created.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create algorithm version.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Admin</h2>
      <p style={{ marginTop: 12 }}>
        Signed in as <code>{user?.email ?? user?.id ?? "unknown"}</code>
      </p>

      <section style={{ marginTop: 18, display: "grid", gap: 10, maxWidth: 720 }}>
        <h3 style={{ margin: 0 }}>Engine config (V1.1)</h3>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Config profile used for next plan import</span>
          <select
            value={selectedConfigProfileId}
            onChange={(e) => setSelectedConfigProfileId(e.currentTarget.value)}
            disabled={busy}
          >
            <option value="">(none)</option>
            {configProfiles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.key} — {c.name}
              </option>
            ))}
          </select>
        </label>

        <details>
          <summary>Create config profile</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Key</span>
              <input value={newConfigKey} onChange={(e) => setNewConfigKey(e.currentTarget.value)} disabled={busy} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Name</span>
              <input value={newConfigName} onChange={(e) => setNewConfigName(e.currentTarget.value)} disabled={busy} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Config JSON</span>
              <textarea
                value={newConfigJson}
                onChange={(e) => setNewConfigJson(e.currentTarget.value)}
                rows={6}
                disabled={busy}
              />
            </label>
            <button type="button" onClick={() => void onCreateConfigProfile()} disabled={busy}>
              Create config profile
            </button>
          </div>
        </details>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Algorithm version used for next plan import</span>
          <select
            value={selectedAlgorithmVersionId}
            onChange={(e) => setSelectedAlgorithmVersionId(e.currentTarget.value)}
            disabled={busy}
          >
            <option value="">(none)</option>
            {algoVersions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.version}
              </option>
            ))}
          </select>
        </label>

        <details>
          <summary>Create algorithm version</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Version</span>
              <input
                value={newAlgoVersion}
                onChange={(e) => setNewAlgoVersion(e.currentTarget.value)}
                disabled={busy}
              />
            </label>
            <button type="button" onClick={() => void onCreateAlgorithmVersion()} disabled={busy}>
              Create algorithm version
            </button>
          </div>
        </details>
      </section>

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

