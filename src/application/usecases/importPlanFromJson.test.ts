import { describe, expect, it } from "vitest";
import { importPlanFromJsonText } from "./importPlanFromJson";

describe("importPlanFromJsonText", () => {
  it("parses a valid payload (happy path)", () => {
    const json = JSON.stringify({
      plan: { name: "Base plan", description: null },
      planVersion: { version: 1, payload: {} },
      sessionTemplates: [{ name: "Session A", template: { kind: "gym" } }],
      plannedSessions: [
        { scheduledFor: "2026-04-14", templateName: "Session A", payload: { note: "ok" } },
      ],
    });

    const res = importPlanFromJsonText(json);
    expect(res.plan.name).toBe("Base plan");
    expect(res.plannedSessions).toHaveLength(1);
  });

  it("rejects invalid format (bad date)", () => {
    const json = JSON.stringify({
      plan: { name: "Bad", description: null },
      planVersion: { version: 1, payload: {} },
      sessionTemplates: [],
      plannedSessions: [{ scheduledFor: "14/04/2026", templateName: null, payload: {} }],
    });

    expect(() => importPlanFromJsonText(json)).toThrow();
  });
});

