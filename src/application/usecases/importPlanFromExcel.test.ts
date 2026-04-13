import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { importPlanFromExcelArrayBuffer } from "./importPlanFromExcel";

describe("importPlanFromExcelArrayBuffer", () => {
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
});

