import type { PlanImport } from "../../domain/plan/planImport";
import { planImportSchema } from "../../domain/plan/planImport.schema";

export function importPlanFromJsonText(jsonText: string): PlanImport {
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON: could not parse.");
  }

  return planImportSchema.parse(obj);
}

