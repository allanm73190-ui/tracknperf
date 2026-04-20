import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { importPlanFromExcelArrayBuffer, importProgrammeTemplateFromExcelArrayBuffer } from "./importPlanFromExcel";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("importPlanFromExcelArrayBuffer", () => {
  it("parses a V2 workbook (plan/templates/items/planned_sessions)", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          plan_name: "Plan Hybride V2",
          plan_description: "Bloc 1",
          version: 2,
          payload_json: JSON.stringify({ athlete_level: "intermediate" }),
        },
      ]),
      "plan",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { template_name: "Force A", session_type: "strength", priority: "high" },
        { template_name: "Trail Z2", session_type: "endurance", priority: "normal" },
      ]),
      "templates",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { template_name: "Force A", position: 1, exercise_name: "Back Squat", series: "4", reps: "6", load: "75%" },
        { template_name: "Force A", position: 2, exercise_name: "Bench Press", series: "4", reps: "6", load: "70%" },
        { template_name: "Trail Z2", position: 1, exercise_name: "Zone 2 Run", reps: "45min" },
      ]),
      "items",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { scheduled_for: "2026-05-12", template_name: "Force A", block_primary_goal: "force" },
        { scheduled_for: "2026-05-13", template_name: "Trail Z2", block_primary_goal: "endurance" },
      ]),
      "planned_sessions",
    );

    const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const res = importPlanFromExcelArrayBuffer(ab);

    expect(res.plan.name).toBe("Plan Hybride V2");
    expect(res.plan.description).toBe("Bloc 1");
    expect(res.planVersion.version).toBe(2);
    expect(res.planVersion.payload).toMatchObject({ source: "excel_v2", athlete_level: "intermediate" });
    expect(res.sessionTemplates.map((t) => t.name).sort()).toEqual(["Force A", "Trail Z2"]);
    const forceA = res.sessionTemplates.find((t) => t.name === "Force A");
    expect(Array.isArray(forceA?.template.items)).toBe(true);
    expect((forceA?.template.items as unknown[]).length).toBe(2);
    expect(res.plannedSessions).toHaveLength(2);
    expect(res.plannedSessions[0]?.scheduledFor).toBe("2026-05-12");
  });

  it("returns explicit V2 errors when required columns are missing", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { template_name: "Force A", series: "4", reps: "6" },
      ]),
      "items",
    );
    const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    expect(() => importPlanFromExcelArrayBuffer(ab)).toThrow(/excel v2 invalide/i);
    expect(() => importPlanFromExcelArrayBuffer(ab)).toThrow(/exercise_name/i);
  });

  it("parses a worksheet with date + template columns (happy path)", () => {
    const ws = XLSX.utils.json_to_sheet([
      { date: "2026-04-17", template_name: "Session A", note: "ok" },
      { date: "2026-04-18", template_name: "Session B", note: "yo" },
    ]);
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: "My Excel Plan" };
    XLSX.utils.book_append_sheet(wb, ws, "Programme");
    const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const res = importPlanFromExcelArrayBuffer(ab);
    expect(res.plan.name).toBe("My Excel Plan");
    expect(res.plannedSessions).toHaveLength(2);
    expect(res.sessionTemplates.map((t) => t.name).sort()).toEqual(["Session A", "Session B"]);
    expect(res.plannedSessions[0]?.payload).toMatchObject({ note: "ok" });
  });

  it("rejects unrecognized template (no date column)", () => {
    const ws = XLSX.utils.json_to_sheet([{ foo: "bar" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Programme");
    const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(() => importPlanFromExcelArrayBuffer(ab)).toThrow(/template not recognized/i);
  });

  it("parses the legacy programme_template.xlsx fixture into session templates", async () => {
    const p = join(__dirname, "../../../tests/fixtures/programme_template.xlsx");
    const buf = await readFile(p);
    const u8 = new Uint8Array(buf);

    // Sanity: the fixture has the expected sheet/table structure under xlsx.
    const wb = XLSX.read(u8, { type: "array" });
    const forceSheetName = wb.SheetNames.find((n) => n.includes("Force"));
    expect(forceSheetName).toBeTruthy();
    const forceSheet = forceSheetName ? wb.Sheets[forceSheetName] : null;
    expect(forceSheet).toBeTruthy();
    if (forceSheet) {
      const rows = XLSX.utils.sheet_to_json(forceSheet, { header: 1, defval: null, raw: false }) as unknown[][];
      expect(Array.isArray(rows[1])).toBe(true);
      const headerRow = (rows[1] ?? []) as unknown[];
      expect(String(headerRow[0] ?? "")).toMatch(/Exercice/i);
    }

    const legacy = importProgrammeTemplateFromExcelArrayBuffer(u8);
    expect(legacy).toBeTruthy();

    const res = importPlanFromExcelArrayBuffer(u8);
    expect(res.sessionTemplates.length).toBeGreaterThanOrEqual(4);
    expect(res.plannedSessions).toHaveLength(0);

    const names = res.sessionTemplates.map((t) => t.name);
    expect(names.join(" ")).toMatch(/Force|Hypertrophie|Spécifique|Trail|Repos/i);

    const force = res.sessionTemplates.find((t) => /force/i.test(t.name));
    expect(force?.template).toBeTruthy();
  });
});
