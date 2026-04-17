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

function getExerciseCount(template: Record<string, unknown>): number {
  const items = template.items;
  if (Array.isArray(items)) return items.length;
  return 0;
}

export default function AdminPage() {
  const { user, signOut, isConfigured } = useAuth();
  const [tab, setTab] = useState<Tab>("import");
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>("excel");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");
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
    const templatePreviews = parsed.sessionTemplates.map((t) => ({
      name: t.name,
      exerciseCount: getExerciseCount(t.template),
    }));
    return {
      planName: parsed.plan.name,
      version: parsed.planVersion.version,
      templates: templatePreviews,
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
    if (!file) { setMessage("Choisir un fichier."); setMessageType("error"); return; }
    setBusy(true);
    try {
      const fmt = format ?? guessFormat(file);
      let result: PlanImport;
      if (fmt === "json") { result = importPlanFromJsonText(await file.text()); }
      else if (fmt === "csv") { result = importPlanFromCsvText(await file.text()); }
      else { result = importPlanFromExcelArrayBuffer(await file.arrayBuffer()); }
      setParsed(result);
      setMessage("Aperçu prêt — vérifiez les séances-types ci-dessous, puis cliquez Importer.");
      setMessageType("info");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Fichier invalide.");
      setMessageType("error");
    } finally { setBusy(false); }
  }

  async function onImport() {
    setMessage(null);
    if (!parsed) { setMessage("Parser d'abord."); setMessageType("error"); return; }
    setBusy(true);
    try {
      await persistImportedPlanWithEngineContext(parsed, {
        configProfileId: selectedConfigProfileId || null,
        algorithmVersionId: selectedAlgorithmVersionId || null,
      });
      const names = parsed.sessionTemplates.map((t) => t.name).join(", ");
      setMessage(`✓ ${parsed.sessionTemplates.length} séance(s)-type importée(s) : ${names}`);
      setMessageType("success");
      setParsed(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import échoué.");
      setMessageType("error");
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
      setMessage("Profil créé."); setMessageType("success");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur création profil."); setMessageType("error");
    } finally { setBusy(false); }
  }

  async function onCreateAlgorithmVersion() {
    setBusy(true); setMessage(null);
    try {
      const row = await createAlgorithmVersion(newAlgoVersion.trim());
      setAlgoVersions((prev) => [row, ...prev]);
      setSelectedAlgorithmVersionId(row.id);
      setMessage("Version créée."); setMessageType("success");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur création version."); setMessageType("error");
    } finally { setBusy(false); }
  }

  const inputStyle: React.CSSProperties = {
    border: 0, borderRadius: 8, background: "rgba(38,38,38,0.7)", color: "var(--text)",
    padding: "10px 12px", fontFamily: "var(--font-body)", width: "100%", boxSizing: "border-box",
  };

  const msgColors = {
    info:    { bg: "rgba(202,253,0,0.06)",   border: "rgba(202,253,0,0.2)",   color: "#cafd00" },
    success: { bg: "rgba(202,253,0,0.1)",    border: "rgba(202,253,0,0.3)",   color: "#cafd00" },
    error:   { bg: "rgba(255,80,80,0.08)",   border: "rgba(255,80,80,0.25)",  color: "#ff8080" },
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
          <h1 style={{ fontFamily: "var(--font-headline)", fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 900, letterSpacing: "-0.03em", color: "#f3ffca", margin: 0 }}>
            CENTRE DE CONTRÔLE
          </h1>
          <div style={{
            background: "rgba(106,11,170,0.2)", border: "1px solid rgba(197,126,255,0.15)",
            borderRadius: 999, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c57eff", display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#c57eff", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--font-headline)" }}>
              {user?.email ?? user?.id ?? "Admin"}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          {(["import", "engine"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: tab === t ? "12px 24px" : "10px 24px",
                borderRadius: 12, border: "none", cursor: "pointer",
                fontFamily: "var(--font-headline)", fontSize: 14, fontWeight: 700,
                background: tab === t ? "#cafd00" : "rgba(32,31,31,0.8)",
                color: tab === t ? "#0e0e0e" : "#adaaaa",
                transition: "all 0.15s",
              }}
            >
              {t === "import" ? "Import" : "Moteur"}
            </button>
          ))}
        </div>

        {/* Message */}
        {message && (
          <div style={{
            background: msgColors[messageType].bg,
            border: `1px solid ${msgColors[messageType].border}`,
            borderRadius: 12, padding: "12px 16px",
            color: msgColors[messageType].color,
            fontSize: 13, whiteSpace: "pre-wrap",
          }}>
            {message}
          </div>
        )}

        {/* Import tab */}
        {tab === "import" && (
          <div style={{ display: "grid", gap: 16 }}>

            {/* Drop zone */}
            <div style={{
              background: "#131313", border: "2px dashed rgba(72,72,71,0.5)", borderRadius: 20,
              padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 14,
            }}>
              <div style={{ width: 56, height: 56, background: "#1a1a1a", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 24, color: "#c57eff" }}>⬆</span>
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-headline)", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
                  Fichier de plan
                </p>
                <p style={{ color: "#adaaaa", fontSize: 12, margin: 0 }}>
                  Excel (.xlsx) · JSON · CSV — planning ou template programme
                </p>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.json,.csv"
                onChange={(e) => {
                  const input = e.target as HTMLInputElement;
                  const f = input.files?.item(0) ?? null;
                  setFile(f); setFormat(guessFormat(f)); setParsed(null); setMessage(null);
                }}
                disabled={busy}
                style={{ color: "#adaaaa", fontSize: 12 }}
              />
            </div>

            {/* Format selector */}
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Format détecté</span>
              <select value={format} onChange={(e) => setFormat(e.currentTarget.value as Format)} disabled={busy} style={inputStyle}>
                <option value="excel">Excel</option>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            {/* Engine context (collapsed by default) */}
            <details style={{ background: "#131313", borderRadius: 14, padding: "14px 18px" }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "#adaaaa", fontWeight: 700, userSelect: "none" }}>
                Contexte moteur (optionnel)
              </summary>
              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
                    Profil de config
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
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
                    Version algorithme
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
              </div>
            </details>

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
                {busy ? "Analyse…" : "Parser & aperçu"}
              </button>
              <button
                onClick={() => void onImport()} disabled={!parsed || busy}
                style={{
                  background: parsed ? "#cafd00" : "rgba(255,255,255,0.06)",
                  border: parsed ? "none" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  color: parsed ? "#0e0e0e" : "#adaaaa",
                  fontWeight: 700, fontSize: 13,
                  padding: "12px 22px", cursor: parsed ? "pointer" : "default",
                  fontFamily: "var(--font-body)",
                  opacity: !parsed || busy ? 0.5 : 1,
                }}
              >
                {busy ? "Import…" : "Importer dans l'app"}
              </button>
            </div>

            {/* Preview */}
            {preview && (
              <div style={{ background: "#131313", borderRadius: 16, padding: 20, display: "grid", gap: 16 }}>
                <div>
                  <p style={{ fontFamily: "var(--font-headline)", fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 4px", color: "#f3ffca" }}>
                    {preview.planName}
                  </p>
                  <p style={{ color: "#adaaaa", fontSize: 12, margin: 0 }}>
                    Version {preview.version}
                    {preview.plannedSessions > 0 && ` · ${preview.plannedSessions} séances planifiées`}
                    {preview.dateRange && ` · du ${preview.dateRange.from} au ${preview.dateRange.to}`}
                  </p>
                </div>

                {/* Template list */}
                <div style={{ display: "grid", gap: 8 }}>
                  <p style={{ fontSize: 11, color: "#adaaaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                    {preview.templates.length} séance(s)-type détectée(s)
                  </p>
                  {preview.templates.map((t) => (
                    <div key={t.name} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px",
                    }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</span>
                      {t.exerciseCount > 0 && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "#cafd00",
                          background: "rgba(202,253,0,0.1)", borderRadius: 999, padding: "3px 10px",
                        }}>
                          {t.exerciseCount} exercice{t.exerciseCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Engine / Moteur tab */}
        {tab === "engine" && (
          <div style={{ display: "grid", gap: 20 }}>

            <p style={{ color: "#adaaaa", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              Ces paramètres avancés permettent de contrôler comment l'algorithme de recommandation
              calcule les charges et les récupérations. Vous n'avez généralement pas besoin
              de les modifier.
            </p>

            {/* Config profiles */}
            <div style={{ background: "#131313", borderRadius: 16, padding: 24, borderLeft: "4px solid #c57eff" }}>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "#f3ffca" }}>
                Profils de configuration
              </h3>
              <p style={{ color: "#adaaaa", fontSize: 12, margin: "0 0 16px", lineHeight: 1.6 }}>
                Un profil regroupe les paramètres de l'algorithme (seuils de fatigue, coefficients…).
                Sélectionnez celui à associer au prochain import.
              </p>

              <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
                  Profil actif
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
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#adaaaa", fontWeight: 700, userSelect: "none" }}>
                  + Créer un profil
                </summary>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Clé (identifiant court)</span>
                    <input value={newConfigKey} onChange={(e) => setNewConfigKey(e.target.value)} disabled={busy} style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Nom affiché</span>
                    <input value={newConfigName} onChange={(e) => setNewConfigName(e.target.value)} disabled={busy} style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Paramètres (JSON)</span>
                    <textarea
                      value={newConfigJson}
                      onChange={(e) => setNewConfigJson(e.target.value)}
                      rows={4} disabled={busy}
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
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
            <div style={{ background: "#131313", borderRadius: 16, padding: 24, borderLeft: "4px solid rgba(197,126,255,0.4)" }}>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "#f3ffca" }}>
                Versions d'algorithme
              </h3>
              <p style={{ color: "#adaaaa", fontSize: 12, margin: "0 0 16px", lineHeight: 1.6 }}>
                Chaque version correspond à une itération de la logique de calcul.
                Garder la version la plus récente sauf en cas de test A/B.
              </p>

              <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
                  Version active
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
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#adaaaa", fontWeight: 700, userSelect: "none" }}>
                  + Créer une version
                </summary>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Numéro de version (ex: v1.2.0)</span>
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
      </div>
    </AppShell>
  );
}
