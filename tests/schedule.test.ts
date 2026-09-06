import { describe, expect, it } from "vitest";
import { initialMedications, periods } from "../src/medications";
import {
  countCompletedToday,
  groupMedsByPeriod,
  makeEventId,
  todayKey,
} from "../src/schedule";
import type { DoseEvent } from "../src/types";

describe("schedule helpers", () => {
  it("groups active medications by natural timing slot", () => {
    const groups = groupMedsByPeriod(initialMedications, periods);

    expect(groups.find((group) => group.period === "Midday")?.medications).toEqual([
      expect.objectContaining({
        name: "Capromorelin",
        annotation: "As needed",
        food: "Empty stomach",
      }),
    ]);
    expect(groups.find((group) => group.period === "Bedtime")?.medications).toEqual([
      expect.objectContaining({
        name: "Ondansetron",
        annotation: "As needed, every 8-12 hours",
      }),
    ]);
  });

  it("uses stable per-day event ids", () => {
    expect(makeEventId("same", "2026-09-06")).toBe("2026-09-06:same");
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
});
