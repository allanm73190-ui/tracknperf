import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { importPlanFromCsvText } from "../../application/usecases/importPlanFromCsv";
import { importPlanFromExcelArrayBuffer } from "../../application/usecases/importPlanFromExcel";
import { importPlanFromJsonText } from "../../application/usecases/importPlanFromJson";
import { persistImportedPlan } from "../../application/usecases/persistImportedPlan";
import type { PlanImport } from "../../domain/plan/planImport";

type ParsedSession = {
  scheduledFor: string;
  templateName: string | null;
  payload: Record<string, unknown>;
};

type Step = "upload" | "preview" | "confirm";

export default function ImportPlanPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [planImport, setPlanImport] = useState<PlanImport | null>(null);
  const [sessions, setSessions] = useState<ParsedSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["date", "template_name", "notes"],
      ["2026-05-12", "Force A", "Semaine 1"],
      ["2026-05-13", "Cardio Z2", "Zone 2 — 45min"],
      ["2026-05-15", "Force B", "Semaine 1"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Programme");
    wb.Props = { Title: "Mon Plan d'Entraînement" };
    XLSX.writeFile(wb, "template-import-plan.xlsx");
  }

  async function handleFile(file: File) {
    setParseError(null);
    const name = file.name.toLowerCase();
    try {
      let parsed: PlanImport;
      if (name.endsWith(".csv")) {
        const text = await file.text();
        parsed = importPlanFromCsvText(text);
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        parsed = importPlanFromExcelArrayBuffer(buf);
      } else if (name.endsWith(".json")) {
        const text = await file.text();
        parsed = importPlanFromJsonText(text);
      } else {
        setParseError("Format non supporté. Utilisez CSV, Excel (.xlsx) ou JSON.");
        return;
      }
      setPlanImport(parsed);
      setSessions(parsed.plannedSessions.map((s) => ({ ...s })));
      setStep("preview");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Erreur de parsing inconnue.");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function updateSession(idx: number, field: "scheduledFor" | "templateName", value: string) {
    setSessions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, [field]: value || null };
      return next;
    });
  }

  function removeSession(idx: number) {
    setSessions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onConfirm() {
    if (!planImport || sessions.length === 0) return;
    setBusy(true);
    setImportError(null);
    try {
      const payload: PlanImport = {
        ...planImport,
        plannedSessions: sessions,
      };
      await persistImportedPlan(payload);
      navigate("/today", { state: { importSuccess: true } });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Erreur lors de l'import.");
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#0e0e0e", color: "#f5f5f5", fontFamily: "Manrope, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "24px 20px 0" }}>
        <button
          onClick={() => (step === "upload" ? navigate(-1) : setStep("upload"))}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: "14px",
            cursor: "pointer",
            padding: "0 0 16px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← {step === "upload" ? "Retour" : "Recommencer"}
        </button>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 700, margin: "0 0 4px" }}>
          Importer un plan
        </h1>
        <p style={{ color: "#888", fontSize: "13px", margin: "0 0 28px" }}>
          {step === "upload" && "CSV, Excel ou JSON"}
          {step === "preview" && `${sessions.length} séance${sessions.length > 1 ? "s" : ""} détectée${sessions.length > 1 ? "s" : ""} — vérifiez avant d'importer`}
          {step === "confirm" && "Prêt à importer"}
        </p>
      </div>

      {/* Steps indicator */}
      <div style={{ padding: "0 20px 24px", display: "flex", gap: 8, alignItems: "center" }}>
        {(["upload", "preview", "confirm"] as Step[]).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: step === s ? "#cafd00" : (["upload","preview","confirm"].indexOf(step) > i ? "#3a3a00" : "#262626"),
              color: step === s ? "#0e0e0e" : (["upload","preview","confirm"].indexOf(step) > i ? "#cafd00" : "#888"),
              fontSize: "11px", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {i + 1}
            </div>
            {i < 2 && <div style={{ width: 24, height: 1, background: "#262626" }} />}
          </div>
        ))}
      </div>

      <div style={{ padding: "0 20px 40px" }}>
        {/* STEP 1: Upload */}
        {step === "upload" && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "#cafd00" : "#333"}`,
                borderRadius: 16,
                padding: "48px 20px",
                textAlign: "center",
                cursor: "pointer",
                background: dragging ? "rgba(202,253,0,0.04)" : "#131313",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
              <p style={{ fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>
                Glissez un fichier ici
              </p>
              <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
                ou cliquez pour sélectionner — CSV, Excel (.xlsx), JSON
              </p>
            </div>
            <div style={{ textAlign: "center" }}>
              <button
                onClick={downloadTemplate}
                style={{
                  background: "transparent",
                  color: "#888",
                  fontSize: 13,
                  textDecoration: "underline",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 12,
                  padding: 8,
                }}
              >
                Télécharger le modèle (.xlsx)
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              style={{ display: "none" }}
              onChange={onFileChange}
            />
            {parseError && (
              <div style={{
                marginTop: 16, padding: "12px 16px", borderRadius: 10,
                background: "rgba(255,115,81,0.12)", color: "#ff7351",
                fontSize: 13,
              }}>
                {parseError}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Preview */}
        {step === "preview" && planImport && (
          <div>
            {/* Plan info */}
            <div style={{ background: "#131313", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Nom du plan</div>
              <div style={{ fontWeight: 600 }}>{planImport.plan.name}</div>
              {planImport.plan.description && (
                <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>{planImport.plan.description}</div>
              )}
            </div>

            {/* Sessions list */}
            {sessions.length === 0 ? (
              <div style={{ textAlign: "center", color: "#888", padding: "32px 0" }}>
                Aucune séance à importer
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sessions.map((s, idx) => (
                  <div key={idx} style={{
                    background: "#131313", borderRadius: 12, padding: "14px 16px",
                    display: "flex", gap: 12, alignItems: "flex-start",
                  }}>
                    <div style={{
                      minWidth: 32, height: 32, borderRadius: 8,
                      background: "#1e1e1e", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 11, color: "#888", fontWeight: 600,
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        type="date"
                        value={s.scheduledFor}
                        onChange={(e) => updateSession(idx, "scheduledFor", e.target.value)}
                        style={{
                          background: "#1e1e1e", border: "none", borderRadius: 6,
                          color: "#cafd00", fontSize: 13, fontWeight: 600,
                          padding: "4px 8px", marginBottom: 6, width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                      <input
                        type="text"
                        value={s.templateName ?? ""}
                        placeholder="Type de séance (optionnel)"
                        onChange={(e) => updateSession(idx, "templateName", e.target.value)}
                        style={{
                          background: "#1e1e1e", border: "none", borderRadius: 6,
                          color: "#f5f5f5", fontSize: 13,
                          padding: "4px 8px", width: "100%",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <button
                      onClick={() => removeSession(idx)}
                      style={{
                        background: "none", border: "none", color: "#555",
                        cursor: "pointer", padding: 4, fontSize: 16, lineHeight: 1,
                      }}
                      aria-label="Supprimer cette séance"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {parseError && (
              <div style={{
                marginTop: 12, padding: "12px 16px", borderRadius: 10,
                background: "rgba(255,115,81,0.12)", color: "#ff7351",
                fontSize: 13,
              }}>
                {parseError}
              </div>
            )}

            <button
              disabled={sessions.length === 0}
              onClick={() => setStep("confirm")}
              style={{
                marginTop: 24, width: "100%", padding: "16px",
                borderRadius: 12, border: "none", cursor: sessions.length === 0 ? "not-allowed" : "pointer",
                background: sessions.length === 0 ? "#262626" : "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)",
                color: "#0e0e0e", fontWeight: 700, fontSize: 15,
                opacity: sessions.length === 0 ? 0.5 : 1,
              }}
            >
              Continuer → Confirmer
            </button>
          </div>
        )}

        {/* STEP 3: Confirm */}
        {step === "confirm" && planImport && (
          <div>
            <div style={{ background: "#131313", borderRadius: 16, padding: "20px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Résumé de l'import</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "#888" }}>Plan</span>
                  <span style={{ fontWeight: 600 }}>{planImport.plan.name}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "#888" }}>Séances</span>
                  <span style={{ fontWeight: 600, color: "#cafd00" }}>{sessions.length}</span>
                </div>
                {planImport.sessionTemplates.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span style={{ color: "#888" }}>Templates</span>
                    <span style={{ fontWeight: 600 }}>{planImport.sessionTemplates.length}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "#888" }}>Version</span>
                  <span style={{ fontWeight: 600 }}>v{planImport.planVersion.version}</span>
                </div>
              </div>
            </div>

            {importError && (
              <div style={{
                marginBottom: 16, padding: "12px 16px", borderRadius: 10,
                background: "rgba(255,115,81,0.12)", color: "#ff7351",
                fontSize: 13,
              }}>
                {importError}
              </div>
            )}

            <button
              disabled={busy}
              onClick={onConfirm}
              style={{
                width: "100%", padding: "16px",
                borderRadius: 12, border: "none", cursor: busy ? "not-allowed" : "pointer",
                background: busy ? "#262626" : "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)",
                color: "#0e0e0e", fontWeight: 700, fontSize: 15,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Import en cours…" : "Importer le plan"}
            </button>

            <button
              onClick={() => setStep("preview")}
              style={{
                marginTop: 10, width: "100%", padding: "14px",
                borderRadius: 12, border: "none", cursor: "pointer",
                background: "transparent", color: "#888", fontSize: 14,
              }}
            >
              ← Retour à la prévisualisation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
