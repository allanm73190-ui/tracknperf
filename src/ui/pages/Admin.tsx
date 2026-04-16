import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  loadAdminData,
  createConfigProfile,
  createAlgorithmVersion,
  type ConfigProfileRow,
  type AlgorithmVersionRow,
} from "../../application/usecases/adminOperations";
import type { PlanImport } from "../../domain/plan/planImport";
import { importPlanFromJsonText } from "../../application/usecases/importPlanFromJson";
import { importPlanFromCsvText } from "../../application/usecases/importPlanFromCsv";
import { importPlanFromExcelArrayBuffer } from "../../application/usecases/importPlanFromExcel";
import { persistImportedPlanWithEngineContext } from "../../application/usecases/persistImportedPlan";
import { AppShell } from "../kit/AppShell";

type Format = "excel" | "json" | "csv";
type Tab = "engine" | "import";

function guessFormat(file: File | null): Format {
  const name = file?.name?.toLowerCase() ?? "";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".csv")) return "csv";
  return "excel";
}

export default function AdminPage() {
  const { user, signOut, isConfigured } = useAuth();
  const [tab, setTab] = useState<Tab>("engine");
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
    async function run() {
      if (!user?.id) return;
      try {
        const { configProfiles: cfg, algoVersions: av } = await loadAdminData();
        if (ignore) return;
        setConfigProfiles(cfg);
        if (!selectedConfigProfileId && cfg[0]) setSelectedConfigProfileId(cfg[0].id);
        setAlgoVersions(av);
        if (!selectedAlgorithmVersionId && av[0]) setSelectedAlgorithmVersionId(av[0].id);
      } catch {
        // silent
      }
    }
    void run();
    return () => { ignore = true; };
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
          ? { from: parsed.plannedSessions[0]?.scheduledFor, to: parsed.plannedSessions[parsed.plannedSessions.length - 1]?.scheduledFor }
          : null,
    };
  }, [parsed]);

  async function onParse() {
    setMessage(null);
    setParsed(null);
    if (!file) { setMessage("Choisir un fichier."); return; }
    setBusy(true);
    try {
      const fmt = format ?? guessFormat(file);
      let result: PlanImport;
      if (fmt === "json") { result = importPlanFromJsonText(await file.text()); }
      else if (fmt === "csv") { result = importPlanFromCsvText(await file.text()); }
      else { result = importPlanFromExcelArrayBuffer(await file.arrayBuffer()); }
      setParsed(result);
      setMessage("Parsé. Vérifier l'aperçu, puis cliquer Importer.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Fichier invalide.");
    } finally { setBusy(false); }
  }

  async function onImport() {
    setMessage(null);
    if (!parsed) { setMessage("Parser d'abord."); return; }
    setBusy(true);
    try {
      const res = await persistImportedPlanWithEngineContext(parsed, {
        configProfileId: selectedConfigProfileId || null,
        algorithmVersionId: selectedAlgorithmVersionId || null,
      });
      setMessage(`Importé: plan=${res.planId}, version=${res.planVersionId}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import échoué.");
    } finally { setBusy(false); }
  }

  async function onCreateConfigProfile() {
    setBusy(true); setMessage(null);
    try {
      let cfg: unknown;
      try { cfg = JSON.parse(newConfigJson); } catch { throw new Error("JSON invalide."); }
      const row = await createConfigProfile(newConfigKey.trim(), newConfigName.trim(), cfg);
      setConfigProfiles((prev) => [row, ...prev]);
      setSelectedConfigProfileId(row.id);
      setMessage("Profil créé.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur création profil.");
    } finally { setBusy(false); }
  }

  async function onCreateAlgorithmVersion() {
    setBusy(true); setMessage(null);
    try {
      const row = await createAlgorithmVersion(newAlgoVersion.trim());
      setAlgoVersions((prev) => [row, ...prev]);
      setSelectedAlgorithmVersionId(row.id);
      setMessage("Version algo créée.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur création version.");
    } finally { setBusy(false); }
  }

  const inputStyle: React.CSSProperties = {
    border: 0, borderRadius: 8, background: "rgba(38,38,38,0.7)", color: "var(--text)",
    padding: "10px 12px", fontFamily: "var(--font-body)", width: "100%", boxSizing: "border-box",
  };

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
        <button
          onClick={() => void signOut()}
          disabled={!isConfigured || busy}
          style={{
            background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999,
            color: "#adaaaa", fontSize: 12, fontWeight: 700, padding: "6px 14px",
            cursor: "pointer", fontFamily: "var(--font-body)",
          }}
        >
          Déconnexion
        </button>
      }
    >
      {/* Ambient glows */}
      <div style={{ position: "fixed", top: -96, left: -96, width: 384, height: 384, background: "rgba(243,255,202,0.06)", filter: "blur(100px)", borderRadius: "50%", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", top: "50%", right: -96, width: 256, height: 256, background: "rgba(197,126,255,0.08)", filter: "blur(100px)", borderRadius: "50%", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, letterSpacing: "-0.03em", color: "#f3ffca", margin: 0 }}>
              CENTRE DE CONTRÔLE
            </h1>
          </div>
          <div style={{
            background: "rgba(106,11,170,0.2)", border: "1px solid rgba(197,126,255,0.15)",
            borderRadius: 999, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c57eff", display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#c57eff", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--font-headline)" }}>
              Admin Actif
            </span>
          </div>
        </div>

        {/* User info */}
        <p style={{ color: "#adaaaa", fontSize: 13, margin: 0 }}>
          Connecté : <code style={{ color: "#f3ffca" }}>{user?.email ?? user?.id ?? "inconnu"}</code>
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <button
            onClick={() => setTab("engine")}
            style={{
              padding: "12px 24px", borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: "var(--font-headline)", fontSize: 14, fontWeight: 700,
              background: tab === "engine" ? "#cafd00" : "rgba(32,31,31,0.8)",
              color: tab === "engine" ? "#0e0e0e" : "#adaaaa",
              transition: "all 0.15s",
            }}
          >
            Engine
          </button>
          <button
            onClick={() => setTab("import")}
            style={{
              padding: "10px 24px", borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: "var(--font-headline)", fontSize: 14, fontWeight: 700,
              background: tab === "import" ? "#cafd00" : "rgba(32,31,31,0.8)",
              color: tab === "import" ? "#0e0e0e" : "#adaaaa",
              transition: "all 0.15s",
            }}
          >
            Import
          </button>
        </div>

        {/* Message */}
        {message && (
          <div style={{
            background: "rgba(197,126,255,0.08)", border: "1px solid rgba(197,126,255,0.2)",
            borderRadius: 12, padding: "12px 16px", color: "#e7c5ff", fontSize: 13, whiteSpace: "pre-wrap",
          }}>
            {message}
          </div>
        )}

        {/* Engine tab */}
        {tab === "engine" && (
          <div style={{ display: "grid", gap: 16 }}>

            {/* Config profiles */}
            <div style={{ background: "#131313", borderRadius: 16, padding: 24, borderLeft: "4px solid #c57eff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 16, fontWeight: 700, margin: 0 }}>Profils de config</h3>
              </div>

              <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
                  Profil pour le prochain import
                </span>
                <select
                  value={selectedConfigProfileId}
                  onChange={(e) => setSelectedConfigProfileId(e.currentTarget.value)}
                  disabled={busy}
                  style={inputStyle}
                >
                  <option value="">(aucun)</option>
                  {configProfiles.map((c) => (
                    <option key={c.id} value={c.id}>{c.key} — {c.name}</option>
                  ))}
                </select>
              </label>

              <details>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#adaaaa", fontWeight: 700 }}>
                  + Créer un profil
                </summary>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Clé</span>
                    <input value={newConfigKey} onChange={(e) => setNewConfigKey(e.target.value)} disabled={busy} style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Nom</span>
                    <input value={newConfigName} onChange={(e) => setNewConfigName(e.target.value)} disabled={busy} style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>JSON</span>
                    <textarea
                      value={newConfigJson}
                      onChange={(e) => setNewConfigJson(e.target.value)}
                      rows={5} disabled={busy}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </label>
                  <button
                    onClick={() => void onCreateConfigProfile()} disabled={busy}
                    style={{
                      background: "linear-gradient(45deg, #6a0baa 0%, #c57eff 100%)", border: "none",
                      borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13,
                      padding: "10px 20px", cursor: "pointer", fontFamily: "var(--font-body)",
                    }}
                  >
                    Créer le profil
                  </button>
                </div>
              </details>
            </div>

            {/* Algorithm versions */}
            <div style={{ background: "#131313", borderRadius: 16, padding: 24, borderLeft: "4px solid #c57eff" }}>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Versions d'algorithme</h3>

              <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
                  Version pour le prochain import
                </span>
                <select
                  value={selectedAlgorithmVersionId}
                  onChange={(e) => setSelectedAlgorithmVersionId(e.currentTarget.value)}
                  disabled={busy}
                  style={inputStyle}
                >
                  <option value="">(aucune)</option>
                  {algoVersions.map((a) => (
                    <option key={a.id} value={a.id}>{a.version}</option>
                  ))}
                </select>
              </label>

              <details>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#adaaaa", fontWeight: 700 }}>
                  + Créer une version
                </summary>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Version</span>
                    <input value={newAlgoVersion} onChange={(e) => setNewAlgoVersion(e.target.value)} disabled={busy} style={inputStyle} />
                  </label>
                  <button
                    onClick={() => void onCreateAlgorithmVersion()} disabled={busy}
                    style={{
                      background: "linear-gradient(45deg, #6a0baa 0%, #c57eff 100%)", border: "none",
                      borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13,
                      padding: "10px 20px", cursor: "pointer", fontFamily: "var(--font-body)",
                    }}
                  >
                    Créer la version
                  </button>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* Import tab */}
        {tab === "import" && (
          <div style={{ display: "grid", gap: 16 }}>

            {/* Drop zone */}
            <div style={{
              background: "#131313", border: "2px dashed rgba(72,72,71,0.5)", borderRadius: 20,
              padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 16,
            }}>
              <div style={{ width: 64, height: 64, background: "#1a1a1a", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 28, color: "#c57eff" }}>⬆</span>
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-headline)", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
                  Fichier de plan
                </p>
                <p style={{ color: "#adaaaa", fontSize: 12, margin: 0 }}>Excel, JSON ou CSV</p>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.json,.csv"
                onChange={(e) => {
                  const f = e.currentTarget.files?.item(0) ?? null;
                  setFile(f); setFormat(guessFormat(f)); setParsed(null); setMessage(null);
                }}
                disabled={busy}
                style={{ color: "#adaaaa", fontSize: 12 }}
              />
            </div>

            {/* Format selector */}
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Format</span>
              <select value={format} onChange={(e) => setFormat(e.currentTarget.value as Format)} disabled={busy} style={inputStyle}>
                <option value="excel">Excel</option>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => void onParse()} disabled={!file || busy}
                style={{
                  background: "linear-gradient(45deg, #6a0baa 0%, #c57eff 100%)", border: "none",
                  borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13,
                  padding: "12px 22px", cursor: "pointer", fontFamily: "var(--font-body)",
                  opacity: !file || busy ? 0.5 : 1,
                }}
              >
                {busy ? "Traitement…" : "Parser & aperçu"}
              </button>
              <button
                onClick={() => void onImport()} disabled={!parsed || busy}
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10, color: parsed ? "#fff" : "#adaaaa", fontWeight: 700, fontSize: 13,
                  padding: "12px 22px", cursor: "pointer", fontFamily: "var(--font-body)",
                  opacity: !parsed || busy ? 0.5 : 1,
                }}
              >
                {busy ? "Import…" : "Importer"}
              </button>
              {parsed && (
                <span style={{
                  background: "rgba(202,253,0,0.1)", border: "1px solid rgba(202,253,0,0.2)",
                  borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#cafd00",
                }}>
                  Aperçu prêt
                </span>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div style={{ background: "#1a1a1a", borderRadius: 14, padding: 20, display: "grid", gap: 8 }}>
                <p style={{ fontFamily: "var(--font-headline)", fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>
                  {preview.planName}
                </p>
                <p style={{ color: "#adaaaa", fontSize: 13, margin: 0 }}>
                  Version {preview.version} · {preview.templates} templates · {preview.plannedSessions} séances planifiées
                </p>
                {preview.dateRange && (
                  <p style={{ color: "#adaaaa", fontSize: 13, margin: 0 }}>
                    Plage : {preview.dateRange.from} → {preview.dateRange.to}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
