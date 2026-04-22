import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { importPlanFromExcelArrayBuffer } from "./importPlanFromExcel";
import { buildPerfectImportTemplateWorkbook, PERFECT_PLAN_IMPORT_TEMPLATE } from "./importPlanTemplate";

describe("buildPerfectImportTemplateWorkbook", () => {
  it("creates an Excel template that is parsed end-to-end by the app", () => {
    const wb = buildPerfectImportTemplateWorkbook();
    const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const parsed = importPlanFromExcelArrayBuffer(ab);

    expect(parsed.plan.name).toBe(PERFECT_PLAN_IMPORT_TEMPLATE.plan.name);
    expect(parsed.planVersion.version).toBe(PERFECT_PLAN_IMPORT_TEMPLATE.planVersion.version);
    expect(parsed.sessionTemplates.map((t) => t.name).sort()).toEqual(["Force A", "Trail Z2"]);
    expect(parsed.plannedSessions).toHaveLength(2);
    expect(parsed.plannedSessions[0]?.scheduledFor).toBe("2026-05-12");

    const forceTemplate = parsed.sessionTemplates.find((t) => t.name === "Force A");
    const items = (forceTemplate?.template.items ?? []) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      exercise: "Back Squat",
      series: "4",
      reps: "6",
      load: "75%",
      tempo: "2-0-1",
      rest: "120",
      rir: "2",
      coachNotes: "Rythme contrôlé",
    });
  });
});

