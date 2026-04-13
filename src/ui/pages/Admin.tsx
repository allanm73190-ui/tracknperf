import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../infra/supabase/client";
import type { PlanImport } from "../../domain/plan/planImport";
import { importPlanFromJsonText } from "../../application/usecases/importPlanFromJson";
import { importPlanFromCsvText } from "../../application/usecases/importPlanFromCsv";
import { importPlanFromExcelArrayBuffer } from "../../application/usecases/importPlanFromExcel";
import { persistImportedPlanWithEngineContext } from "../../application/usecases/persistImportedPlan";
import { AppShell } from "../kit/AppShell";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { Input } from "../kit/Input";
import { Pill } from "../kit/Pill";

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
    <AppShell
      title="Admin"
      nav={[
        { to: "/today", label: "Today" },
        { to: "/history", label: "History" },
        { to: "/stats", label: "Stats" },
        { to: "/admin", label: "Admin" },
      ]}
      rightSlot={
        <>
          <Pill tone="secondary">Engine</Pill>
          <Button variant="ghost" onClick={() => void signOut()} disabled={!isConfigured || busy}>
            Sign out
          </Button>
        </>
      }
    >
      <div className="muted" style={{ marginBottom: 18 }}>
        Signed in as <code>{user?.email ?? user?.id ?? "unknown"}</code>
      </div>

      {message ? (
        <Card tone="highest">
          <div style={{ whiteSpace: "pre-wrap" }}>{message}</div>
        </Card>
      ) : null}

      <div style={{ display: "grid", gap: 14 }}>
        <Card tone="low">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 className="h2">Engine context</h2>
            <Pill tone="neutral">V1.1</Pill>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                Config profile for next import
              </span>
              <select
                value={selectedConfigProfileId}
                onChange={(e) => setSelectedConfigProfileId(e.currentTarget.value)}
                disabled={busy}
                style={{
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: "rgba(38, 38, 38, 0.7)",
                  color: "var(--text)",
                  padding: "12px 12px",
                  fontFamily: "var(--font-body)",
                }}
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
              <summary style={{ cursor: "pointer" }}>Create config profile</summary>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <Input label="Key" value={newConfigKey} onChange={setNewConfigKey} disabled={busy} />
                <Input label="Name" value={newConfigName} onChange={setNewConfigName} disabled={busy} />
                <label style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                    Config JSON
                  </span>
                  <textarea
                    value={newConfigJson}
                    onChange={(e) => setNewConfigJson(e.currentTarget.value)}
                    rows={6}
                    disabled={busy}
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
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button variant="primary" onClick={() => void onCreateConfigProfile()} disabled={busy}>
                    Create config profile
                  </Button>
                  <Pill tone="neutral">Stored in config_profiles</Pill>
                </div>
              </div>
            </details>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                Algorithm version for next import
              </span>
              <select
                value={selectedAlgorithmVersionId}
                onChange={(e) => setSelectedAlgorithmVersionId(e.currentTarget.value)}
                disabled={busy}
                style={{
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: "rgba(38, 38, 38, 0.7)",
                  color: "var(--text)",
                  padding: "12px 12px",
                  fontFamily: "var(--font-body)",
                }}
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
              <summary style={{ cursor: "pointer" }}>Create algorithm version</summary>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <Input label="Version" value={newAlgoVersion} onChange={setNewAlgoVersion} disabled={busy} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button variant="primary" onClick={() => void onCreateAlgorithmVersion()} disabled={busy}>
                    Create algorithm version
                  </Button>
                  <Pill tone="neutral">Stored in algorithm_versions</Pill>
                </div>
              </div>
            </details>
          </div>
        </Card>

        <Card tone="low">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 className="h2">Import a plan</h2>
            <Pill tone="primary">What</Pill>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                Plan file (Excel / JSON / CSV)
              </span>
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

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                Format
              </span>
              <select
                value={format}
                onChange={(e) => setFormat(e.currentTarget.value as Format)}
                disabled={busy}
                style={{
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: "rgba(38, 38, 38, 0.7)",
                  color: "var(--text)",
                  padding: "12px 12px",
                  fontFamily: "var(--font-body)",
                }}
              >
                <option value="excel">Excel</option>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="primary" onClick={() => void onParse()} disabled={!file || busy}>
                {busy ? "Working…" : "Parse & preview"}
              </Button>
              <Button variant="ghost" onClick={() => void onImport()} disabled={!parsed || busy}>
                {busy ? "Importing…" : "Import"}
              </Button>
              {parsed ? <Pill tone="secondary">Preview ready</Pill> : <Pill tone="neutral">No preview</Pill>}
            </div>

            {preview ? (
              <Card tone="highest">
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, letterSpacing: "-0.03em" }}>
                    {preview.planName}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Version {preview.version} · {preview.templates} templates · {preview.plannedSessions} planned sessions
                  </div>
                  {preview.dateRange ? (
                    <div className="muted" style={{ fontSize: 13 }}>
                      Range: {preview.dateRange.from} → {preview.dateRange.to}
                    </div>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

