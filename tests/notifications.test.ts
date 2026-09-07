// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notificationPermission,
  notificationStatus,
  pendingPeriodReminders,
  readNotificationPreference,
  requestNotificationPermission,
  schedulePeriodReminderNotifications,
  saveNotificationPreference,
  showPeriodReminderNotification,
} from "../src/notifications";
import type { DoseEvent, Medication } from "../src/types";

describe("notification helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Reflect.deleteProperty(globalThis, "Notification");
  });

  it("reports unsupported browsers", () => {
    expect(notificationPermission()).toBe("unsupported");
    expect(notificationStatus("on", "unsupported")).toBe("unsupported");
  });

  it("persists the local device preference", () => {
    expect(readNotificationPreference()).toBe("off");

    saveNotificationPreference("on");

    expect(readNotificationPreference()).toBe("on");
  });

  it("maps permission and preference into user-facing status", () => {
    expect(notificationStatus("off", "default")).toBe("off");
    expect(notificationStatus("on", "default")).toBe("needs-permission");
    expect(notificationStatus("on", "granted")).toBe("ready");
    expect(notificationStatus("on", "denied")).toBe("blocked");
  });

  it("requests browser notification permission when supported", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: {
        permission: "default",
        requestPermission,
      },
    });

    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("plans future period reminders for due and unlogged medications", () => {
    const medications = [
      makeMedication({ id: "morning", period: "Morning" }),
      makeMedication({ id: "midday", period: "Midday" }),
      makeMedication({ id: "evening", period: "Evening" }),
    ];
    const eventsByMed = new Map([
      ["morning", makeDoseEvent({ medId: "morning", status: "done" })],
    ]);

    expect(
      pendingPeriodReminders({
        medications,
        eventsByMed,
        now: new Date("2026-09-07T12:00:00"),
      }).map((reminder) => reminder.period),
    ).toEqual(["Midday", "Evening"]);
  });

  it("suppresses period reminders after all due medications are logged", () => {
    const medications = [
      makeMedication({ id: "midday-a", period: "Midday" }),
      makeMedication({ id: "midday-b", period: "Midday" }),
    ];
    const eventsByMed = new Map([
      ["midday-a", makeDoseEvent({ medId: "midday-a", status: "skipped" })],
      ["midday-b", makeDoseEvent({ medId: "midday-b", status: "partial" })],
    ]);

    expect(
      pendingPeriodReminders({
        medications,
        eventsByMed,
        now: new Date("2026-09-07T12:00:00"),
      }),
    ).toEqual([]);
  });

  it("schedules and clears reminder timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00"));
    const notify = vi.fn();

    const cleanup = schedulePeriodReminderNotifications(
      [
        {
          period: "Midday",
          medicationCount: 1,
          dueAt: new Date("2026-09-07T12:00:02"),
        },
      ],
      notify,
    );

    vi.advanceTimersByTime(1_000);
    expect(notify).not.toHaveBeenCalled();

    cleanup();
    vi.advanceTimersByTime(2_000);
    expect(notify).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("shows period reminder browser notifications", () => {
    const notifications: Array<{
      title: string;
      options?: NotificationOptions;
    }> = [];

    class MockNotification {
      static permission = "granted";
      onclick: (() => void) | null = null;

      constructor(title: string, options?: NotificationOptions) {
        notifications.push({ title, options });
      }
    }

    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: MockNotification,
    });

    showPeriodReminderNotification({
      period: "Evening",
      medicationCount: 2,
      dueAt: new Date("2026-09-07T18:00:00"),
    });

    expect(notifications).toEqual([
      {
        title: "Tizzy Meds",
        options: {
          body: "Evening: 2 medicines due",
          tag: "tizzy-meds:Evening",
        },
      },
    ]);
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

function makeDoseEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: "event-a",
    medId: "test-med",
    date: "2026-09-07",
    status: "done",
    performedBy: "Michael",
    note: "",
    completedAt: "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}
