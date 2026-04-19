export type ContextSnapshot = {
  timeAvailableMinutes: number | null;
  equipmentAvailable: string[];
  subjectiveStress: number | null; // 1–10
  travelDay: boolean;
};

const DEFAULTS: ContextSnapshot = {
  timeAvailableMinutes: null,
  equipmentAvailable: [],
  subjectiveStress: null,
  travelDay: false,
};

export function normalizeContext(raw: Partial<ContextSnapshot>): ContextSnapshot {
  return {
    timeAvailableMinutes: raw.timeAvailableMinutes ?? DEFAULTS.timeAvailableMinutes,
    equipmentAvailable: raw.equipmentAvailable ?? DEFAULTS.equipmentAvailable,
    subjectiveStress: raw.subjectiveStress ?? DEFAULTS.subjectiveStress,
    travelDay: raw.travelDay ?? DEFAULTS.travelDay,
  };
}
