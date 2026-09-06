import type { DoseEvent, DoseStatus, Medication, Period } from "./types";

export const statusLabels: Record<DoseStatus, string> = {
  pending: "Pending",
  done: "Done",
  skipped: "Skipped",
  vomited: "Vomited after",
  partial: "Partial dose",
};

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(now);
}

export function makeEventId(medId: string, date: string) {
  return `${date}:${medId}`;
}

export function groupMedsByPeriod(medications: Medication[], periods: Period[]) {
  return periods.map((period) => ({
    period,
    medications: medications.filter(
      (medication) => medication.active && medication.period === period,
    ),
  }));
}

export function countCompletedToday(
  medications: Medication[],
  eventsByMed: Map<string, DoseEvent>,
) {
  return medications.filter((medication) => {
    const event = eventsByMed.get(medication.id);
    return medication.active && event && event.status !== "pending";
  }).length;
}
