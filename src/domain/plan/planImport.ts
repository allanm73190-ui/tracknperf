export type PlanImport = {
  plan: {
    name: string;
    description: string | null;
  };
  planVersion: {
    version: number;
    payload: Record<string, unknown>;
  };
  sessionTemplates: Array<{
    name: string;
    template: Record<string, unknown>;
  }>;
  plannedSessions: Array<{
    scheduledFor: string; // YYYY-MM-DD
    templateName: string | null;
    payload: Record<string, unknown>;
  }>;
};

export type PersistedPlanImportResult = {
  planId: string;
  planVersionId: string;
  sessionTemplateIdsByName: Record<string, string>;
  plannedSessionIds: string[];
};

