import { describe, expect, it } from "vitest";
import { importPlanFromCsvText } from "./importPlanFromCsv";

describe("importPlanFromCsvText", () => {
  it("parses a minimal valid CSV (happy path)", () => {
    const csv = [
      "plan_name,scheduled_for,template_name,payload_json",
      'My Plan,2026-04-15,Session A,"{""note"":""hi""}"',
      'My Plan,2026-04-16,Session B,"{}"',
      "",
    ].join("\n");

    const res = importPlanFromCsvText(csv);
    expect(res.plan.name).toBe("My Plan");
    expect(res.plannedSessions).toHaveLength(2);
    expect(res.sessionTemplates.map((t) => t.name).sort()).toEqual(["Session A", "Session B"]);
  });

  it("rejects invalid format (missing plan_name)", () => {
    const csv = ["scheduled_for,template_name", "2026-04-15,Session A"].join("\n");
    expect(() => importPlanFromCsvText(csv)).toThrow(/plan name/i);
  });
});

