export type Period = "Morning" | "Midday" | "Evening" | "Bedtime";
export type FoodRule = "With food" | "Empty stomach" | "With or without food";
export type DoseStatus = "pending" | "done" | "skipped" | "vomited" | "partial";
export type HealthEventType =
  | "ate"
  | "drank"
  | "vomited"
  | "stool"
  | "energy"
  | "symptom"
  | "note";
export type HealthSeverity = "low" | "medium" | "high";

export type Medication = {
  id: string;
  name: string;
  dose: string;
  period: Period;
  food: FoodRule;
  purpose: string;
  annotation: string;
  isAsNeeded?: boolean;
  active: boolean;
};

export type DoseEvent = {
  id: string;
  medId: string;
  date: string;
  status: DoseStatus;
  performedBy: string;
  note: string;
  completedAt: string;
};

export type HealthEvent = {
  id: string;
  type: HealthEventType;
  occurredAt: string;
  loggedAt: string;
  loggedBy: string;
  severity?: HealthSeverity;
  note: string;
  linkedDoseEventId?: string;
};

export type AppData = {
  medications: Medication[];
  events: DoseEvent[];
  healthEvents: HealthEvent[];
};
