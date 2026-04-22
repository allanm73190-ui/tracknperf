import * as XLSX from "xlsx";
import { useState } from "react";
import { buildPerfectImportTemplateWorkbook } from "../../application/usecases/importPlanTemplate";
import { deleteAllImportedPrograms } from "../../application/usecases/deleteImportedPrograms";

type ImportProgramActionsProps = {
  disabled?: boolean;
  onProgramsPurged?: (deletedPlans: number) => void;
};

export function ImportProgramActions(props: ImportProgramActionsProps) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onDownloadTemplate() {
    const wb = buildPerfectImportTemplateWorkbook();
    XLSX.writeFile(wb, "template-import-plan-v2-parfait.xlsx");
    setInfo("Template parfait téléchargé.");
    setError(null);
  }

  async function onPurgeImportedPrograms() {
    setInfo(null);
    setError(null);
    const confirmed = window.confirm(
      "Confirmez-vous la purge du programme importé (désactivation des plans, suppression des templates, masquage des séances planifiées) ? Cette action est irréversible.",
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await deleteAllImportedPrograms();
      setInfo(
        `${result.deactivatedPlans} plan(s) désactivé(s), ${result.deletedPlannedSessions} séance(s) planifiée(s) masquée(s), ${result.deletedTemplates} template(s) supprimé(s).`,
      );
      props.onProgramsPurged?.(result.deletedPlans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  const isDisabled = !!props.disabled || busy;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onDownloadTemplate}
          disabled={isDisabled}
          style={{
            background: "transparent",
            color: "#adaaaa",
            fontSize: 13,
            textDecoration: "underline",
            border: "none",
            cursor: isDisabled ? "not-allowed" : "pointer",
            padding: 8,
            opacity: isDisabled ? 0.6 : 1,
          }}
        >
          Télécharger le template parfait (.xlsx)
        </button>
        <button
          type="button"
          onClick={() => void onPurgeImportedPrograms()}
          disabled={isDisabled}
          style={{
            background: "transparent",
            color: "#ff7351",
            fontSize: 13,
            textDecoration: "underline",
            border: "none",
            cursor: isDisabled ? "not-allowed" : "pointer",
            padding: 8,
            opacity: isDisabled ? 0.6 : 1,
          }}
        >
          Supprimer tout le programme importé
        </button>
      </div>

      {info ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(202,253,0,0.12)",
            color: "#cafd00",
            fontSize: 13,
          }}
        >
          {info}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,115,81,0.12)",
            color: "#ff7351",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
