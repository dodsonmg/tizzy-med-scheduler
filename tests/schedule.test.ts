import { describe, expect, it } from "vitest";
import { initialMedications, periods } from "../src/medications";
import {
  countCompletedToday,
  dueMedicationsForDate,
  groupMedsByPeriod,
  healthEventLabels,
  isMedicationDueOn,
  makeEventId,
  todayKey,
} from "../src/schedule";
import type { DoseEvent, Medication } from "../src/types";

describe("schedule helpers", () => {
  it("groups active medications by natural timing slot", () => {
    const groups = groupMedsByPeriod(initialMedications, periods);

    expect(groups.find((group) => group.period === "Midday")?.medications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Capromorelin",
          annotation: "As needed",
          food: "Empty stomach",
        }),
      ]),
    );
    expect(
      groups
        .flatMap((group) => group.medications)
        .filter((medication) => medication.name === "Ondansetron"),
    ).toHaveLength(3);
    expect(groups.find((group) => group.period === "Morning")?.medications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ondansetron-am",
          annotation: "As needed, 8-12 hour spacing",
        }),
      ]),
    );
    expect(groups.find((group) => group.period === "Midday")?.medications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ondansetron-midday",
          annotation: "As needed, 8-12 hour spacing",
        }),
      ]),
    );
    expect(groups.find((group) => group.period === "Bedtime")?.medications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ondansetron-bedtime",
          annotation: "As needed, 8-12 hour spacing",
        }),
      ]),
    );
  });

  it("uses stable per-day event ids", () => {
    expect(makeEventId("same", "2026-09-06")).toBe("2026-09-06:same");
  });

  it("labels supported health event types", () => {
    expect(healthEventLabels).toMatchObject({
      ate: "Ate",
      drank: "Drank",
      pee: "Pee",
      vomited: "Vomited",
      stool: "Stool",
      energy: "Energy",
      symptom: "Symptom",
      note: "Note",
    });
  });

  it("counts non-pending events as completed for the day", () => {
    const event: DoseEvent = {
      id: "2026-09-06:same",
      medId: "same",
      date: "2026-09-06",
      status: "vomited",
      performedBy: "Michael",
      note: "Threw up shortly after.",
      completedAt: "2026-09-06T22:00:00.000Z",
    };

    expect(
      countCompletedToday(initialMedications, new Map([[event.medId, event]])),
    ).toBe(1);
  });

  it("formats today keys in the household timezone", () => {
    expect(todayKey(new Date("2026-09-06T03:30:00.000Z"))).toBe("2026-09-05");
  });

  it("treats existing medication documents as daily schedules", () => {
    expect(isMedicationDueOn(initialMedications[0], "2026-09-07")).toBe(true);
    expect(isMedicationDueOn(initialMedications[0], "2026-09-08")).toBe(true);
  });

  it("finds weekly medication due dates by selected weekday", () => {
    const medication = makeMedication({
      scheduleType: "weekly",
      daysOfWeek: [1, 4],
    });

    expect(isMedicationDueOn(medication, "2026-09-07")).toBe(true);
    expect(isMedicationDueOn(medication, "2026-09-10")).toBe(true);
    expect(isMedicationDueOn(medication, "2026-09-11")).toBe(false);
  });

  it("supports weekly intervals anchored to a start date", () => {
    const medication = makeMedication({
      scheduleType: "weekly",
      interval: 2,
      anchorDate: "2026-09-07",
    });

    expect(isMedicationDueOn(medication, "2026-09-07")).toBe(true);
    expect(isMedicationDueOn(medication, "2026-09-14")).toBe(false);
    expect(isMedicationDueOn(medication, "2026-09-21")).toBe(true);
  });

  it("supports monthly schedules and clamps end-of-month due dates", () => {
    const medication = makeMedication({
      scheduleType: "monthly",
      interval: 2,
      anchorDate: "2026-01-31",
      dayOfMonth: 31,
    });

    expect(isMedicationDueOn(medication, "2026-01-31")).toBe(true);
    expect(isMedicationDueOn(medication, "2026-02-28")).toBe(false);
    expect(isMedicationDueOn(medication, "2026-03-31")).toBe(true);
    expect(isMedicationDueOn(medication, "2026-04-30")).toBe(false);
  });

  it("filters inactive and not-due medications from a date schedule", () => {
    const dueDaily = makeMedication({ id: "daily" });
    const dueWeekly = makeMedication({
      id: "weekly",
      scheduleType: "weekly",
      daysOfWeek: [1],
    });
    const notDueWeekly = makeMedication({
      id: "later",
      scheduleType: "weekly",
      daysOfWeek: [2],
    });
    const inactive = makeMedication({ id: "inactive", active: false });

    expect(
      dueMedicationsForDate(
        [dueDaily, dueWeekly, notDueWeekly, inactive],
        "2026-09-07",
      ).map((medication) => medication.id),
    ).toEqual(["daily", "weekly"]);
  });
});

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "test-med",
    name: "Test med",
    dose: "1 tablet",
    period: "Morning",
    food: "With food",
    purpose: "Testing",
    annotation: "Daily",
    active: true,
    ...overrides,
  };
}
