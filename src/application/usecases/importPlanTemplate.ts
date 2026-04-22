import * as XLSX from "xlsx";
import type { PlanImport } from "../../domain/plan/planImport";

export const PERFECT_PLAN_IMPORT_TEMPLATE: PlanImport = {
  plan: {
    name: "Bloc Hybride S1",
    description: "Template parfait V2 lu par Track'n'Perf",
  },
  planVersion: {
    version: 1,
    payload: {
      source: "excel_v2",
      athlete_level: "intermediate",
      objective: "hybrid_performance",
    },
  },
  sessionTemplates: [
    {
      name: "Force A",
      template: {
        source: "excel_v2",
        sessionType: "strength",
        priority: "high",
        lockStatus: "adaptable",
        blockPrimaryGoal: "strength",
        items: [
          {
            exercise: "Back Squat",
            series: "4",
            reps: "6",
            load: "75%",
            tempo: "2-0-1",
            rest: "120",
            rir: "2",
            coachNotes: "Rythme contrôlé",
          },
          {
            exercise: "Bench Press",
            series: "4",
            reps: "6",
            load: "70%",
            tempo: "2-1-1",
            rest: "120",
            rir: "2",
            coachNotes: "Amplitude complète",
          },
        ],
      },
    },
    {
      name: "Trail Z2",
      template: {
        source: "excel_v2",
        sessionType: "endurance",
        priority: "normal",
        lockStatus: "adaptable",
        blockPrimaryGoal: "endurance",
        items: [
          {
            exercise: "Zone 2 Run",
            series: "1",
            reps: "45min",
            load: null,
            tempo: null,
            rest: null,
            rir: null,
            coachNotes: "RPE 4-5",
          },
        ],
      },
    },
  ],
  plannedSessions: [
    {
      scheduledFor: "2026-05-12",
      templateName: "Force A",
      payload: {
        block_primary_goal: "strength",
        week_label: "S1",
        day_label: "mardi",
      },
    },
    {
      scheduledFor: "2026-05-13",
      templateName: "Trail Z2",
      payload: {
        block_primary_goal: "endurance",
        week_label: "S1",
        day_label: "mercredi",
      },
    },
  ],
};

function buildPlanSheetRows() {
  return [
    {
      plan_name: PERFECT_PLAN_IMPORT_TEMPLATE.plan.name,
      plan_description: PERFECT_PLAN_IMPORT_TEMPLATE.plan.description,
      version: PERFECT_PLAN_IMPORT_TEMPLATE.planVersion.version,
      payload_json: JSON.stringify(PERFECT_PLAN_IMPORT_TEMPLATE.planVersion.payload),
    },
  ];
}

function buildTemplatesSheetRows() {
  return PERFECT_PLAN_IMPORT_TEMPLATE.sessionTemplates.map((t) => {
    const template = t.template ?? {};
    return {
      template_name: t.name,
      description: typeof template.description === "string" ? template.description : "",
      session_type: typeof template.sessionType === "string" ? template.sessionType : "",
      priority: typeof template.priority === "string" ? template.priority : "",
      lock_status: typeof template.lockStatus === "string" ? template.lockStatus : "",
      block_primary_goal: typeof template.blockPrimaryGoal === "string" ? template.blockPrimaryGoal : "",
      payload_json: JSON.stringify({ source: "excel_v2_template" }),
    };
  });
}

function buildItemsSheetRows() {
  const rows: Array<Record<string, string | number>> = [];
  for (const template of PERFECT_PLAN_IMPORT_TEMPLATE.sessionTemplates) {
    const itemsRaw = template.template?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx];
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      rows.push({
        template_name: template.name,
        position: idx + 1,
        exercise_name: String(entry.exercise ?? ""),
        series: String(entry.series ?? ""),
        reps: String(entry.reps ?? ""),
        load: entry.load === null ? "" : String(entry.load ?? ""),
        tempo: entry.tempo === null ? "" : String(entry.tempo ?? ""),
        rest: entry.rest === null ? "" : String(entry.rest ?? ""),
        rir: entry.rir === null ? "" : String(entry.rir ?? ""),
        coach_notes: String(entry.coachNotes ?? ""),
        payload_json: JSON.stringify({ source: "excel_v2_item" }),
      });
    }
  }
  return rows;
}

function buildPlannedSessionsSheetRows() {
  return PERFECT_PLAN_IMPORT_TEMPLATE.plannedSessions.map((s) => ({
    scheduled_for: s.scheduledFor,
    template_name: s.templateName ?? "",
    block_primary_goal: typeof s.payload.block_primary_goal === "string" ? s.payload.block_primary_goal : "",
    week_label: typeof s.payload.week_label === "string" ? s.payload.week_label : "",
    day_label: typeof s.payload.day_label === "string" ? s.payload.day_label : "",
    payload_json: JSON.stringify(s.payload),
  }));
}

export function buildPerfectImportTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: "Template Import Plan V2 - Perfect" };

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildPlanSheetRows()), "plan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildTemplatesSheetRows()), "templates");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildItemsSheetRows()), "items");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildPlannedSessionsSheetRows()), "planned_sessions");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["README"],
      ["Colonnes obligatoires"],
      ["plan: plan_name, version"],
      ["templates: template_name"],
      ["items: template_name, exercise_name"],
      ["planned_sessions: scheduled_for"],
      [""],
      ["Dates acceptées: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY"],
      ["Le format recommandé est ce template XLSX V2."],
    ]),
    "readme",
  );

  return wb;
}

