import type {
  DoseEvent,
  DoseStatus,
  HealthEventType,
  Medication,
  Period,
} from "./types";

export const statusLabels: Record<DoseStatus, string> = {
  pending: "Pending",
  done: "Done",
  skipped: "Skipped",
  vomited: "Vomited after",
  partial: "Partial dose",
};

export const healthEventLabels: Record<HealthEventType, string> = {
  ate: "Ate",
  drank: "Drank",
  pee: "Pee",
  vomited: "Vomited",
  stool: "Stool",
  energy: "Energy",
  symptom: "Symptom",
  note: "Note",
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

export function makeHealthEventId(now = new Date()) {
  return `health:${now.toISOString()}:${crypto.randomUUID()}`;
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

export function dueMedicationsForDate(medications: Medication[], date = todayKey()) {
  return medications.filter((medication) => isMedicationDueOn(medication, date));
}

export function isMedicationDueOn(medication: Medication, date: string) {
  if (!medication.active) {
    return false;
  }

  const scheduleType = medication.scheduleType ?? "daily";
  const interval = validInterval(medication.interval);

  if (scheduleType === "daily") {
    return matchesDailySchedule(medication, date, interval);
  }

  if (scheduleType === "weekly") {
    return matchesWeeklySchedule(medication, date, interval);
  }

  return matchesMonthlySchedule(medication, date, interval);
}

function matchesDailySchedule(
  medication: Medication,
  date: string,
  interval: number,
) {
  if (!medication.anchorDate || interval === 1) {
    return true;
  }

  const daysSinceAnchor = differenceInDays(date, medication.anchorDate);
  return daysSinceAnchor >= 0 && daysSinceAnchor % interval === 0;
}

function matchesWeeklySchedule(
  medication: Medication,
  date: string,
  interval: number,
) {
  const weekdays = medication.daysOfWeek?.length
    ? medication.daysOfWeek
    : [weekdayForDate(medication.anchorDate ?? date)];

  if (!weekdays.includes(weekdayForDate(date))) {
    return false;
  }

  if (!medication.anchorDate || interval === 1) {
    return true;
  }

  const weeksSinceAnchor = Math.floor(
    differenceInDays(startOfWeek(date), startOfWeek(medication.anchorDate)) / 7,
  );
  return weeksSinceAnchor >= 0 && weeksSinceAnchor % interval === 0;
}

function matchesMonthlySchedule(
  medication: Medication,
  date: string,
  interval: number,
) {
  const dueDay = medication.dayOfMonth ?? dayOfMonth(medication.anchorDate ?? date);

  if (dayOfMonth(date) !== clampDayToMonth(dueDay, date)) {
    return false;
  }

  if (!medication.anchorDate || interval === 1) {
    return true;
  }

  const monthsSinceAnchor = differenceInMonths(date, medication.anchorDate);
  return monthsSinceAnchor >= 0 && monthsSinceAnchor % interval === 0;
}

function validInterval(interval: number | undefined) {
  return interval && interval > 1 ? Math.floor(interval) : 1;
}

function weekdayForDate(date: string) {
  return parseDateKey(date).getUTCDay();
}

function dayOfMonth(date: string) {
  return parseDateKey(date).getUTCDate();
}

function startOfWeek(date: string) {
  const parsed = parseDateKey(date);
  parsed.setUTCDate(parsed.getUTCDate() - parsed.getUTCDay());
  return toDateKey(parsed);
}

function differenceInDays(date: string, anchorDate: string) {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(
    (parseDateKey(date).getTime() - parseDateKey(anchorDate).getTime()) /
      millisPerDay,
  );
}

function differenceInMonths(date: string, anchorDate: string) {
  const parsedDate = parseDateKey(date);
  const parsedAnchor = parseDateKey(anchorDate);
  return (
    (parsedDate.getUTCFullYear() - parsedAnchor.getUTCFullYear()) * 12 +
    parsedDate.getUTCMonth() -
    parsedAnchor.getUTCMonth()
  );
}

function clampDayToMonth(day: number, date: string) {
  const parsed = parseDateKey(date);
  return Math.min(day, daysInMonth(parsed.getUTCFullYear(), parsed.getUTCMonth()));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function parseDateKey(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
