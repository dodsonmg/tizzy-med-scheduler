import type { DoseEvent, Medication, Period } from "./types";
import { todayKey } from "./schedule";

export type NotificationSupport = "unsupported" | "available";
export type NotificationPreference = "off" | "on";
export type NotificationPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export type NotificationStatus =
  | "unsupported"
  | "off"
  | "ready"
  | "blocked"
  | "needs-permission";

const NOTIFICATION_PREFERENCE_KEY = "tizzy-med-notifications";
const APP_TITLE = "Tizzy Meds";

export const defaultReminderTimes: Record<Period, string> = {
  Morning: "08:00",
  Midday: "13:00",
  Evening: "18:00",
  Bedtime: "21:00",
};

export type PeriodReminderPlan = {
  period: Period;
  medicationCount: number;
  dueAt: Date;
};

export function notificationSupport(): NotificationSupport {
  return "Notification" in globalThis ? "available" : "unsupported";
}

export function notificationPermission(): NotificationPermissionState {
  if (notificationSupport() === "unsupported") {
    return "unsupported";
  }

  return Notification.permission;
}

export function readNotificationPreference(): NotificationPreference {
  return globalThis.localStorage.getItem(NOTIFICATION_PREFERENCE_KEY) === "on"
    ? "on"
    : "off";
}

export function saveNotificationPreference(preference: NotificationPreference) {
  globalThis.localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, preference);
}

export function notificationStatus(
  preference: NotificationPreference,
  permission: NotificationPermissionState,
): NotificationStatus {
  if (permission === "unsupported") {
    return "unsupported";
  }

  if (permission === "denied") {
    return "blocked";
  }

  if (preference === "off") {
    return "off";
  }

  return permission === "granted" ? "ready" : "needs-permission";
}

export async function requestNotificationPermission() {
  if (notificationSupport() === "unsupported") {
    return "unsupported";
  }

  return Notification.requestPermission();
}

export function pendingPeriodReminders({
  medications,
  eventsByMed,
  now = new Date(),
  reminderTimes = defaultReminderTimes,
}: {
  medications: Medication[];
  eventsByMed: Map<string, DoseEvent>;
  now?: Date;
  reminderTimes?: Record<Period, string>;
}) {
  const today = todayKey(now);

  return Object.entries(reminderTimes).flatMap(([period, time]) => {
    const pendingMeds = medications.filter(
      (medication) =>
        medication.period === period &&
        eventsByMed.get(medication.id)?.status === undefined,
    );
    const dueAt = reminderDate(today, time);

    if (pendingMeds.length === 0 || dueAt.getTime() <= now.getTime()) {
      return [];
    }

    return [
      {
        period: period as Period,
        medicationCount: pendingMeds.length,
        dueAt,
      },
    ];
  });
}

export function schedulePeriodReminderNotifications(
  reminders: PeriodReminderPlan[],
  notify: (reminder: PeriodReminderPlan) => void = showPeriodReminderNotification,
) {
  const timers = reminders.map((reminder) =>
    window.setTimeout(
      () => notify(reminder),
      Math.max(0, reminder.dueAt.getTime() - Date.now()),
    ),
  );

  return () => {
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
  };
}

export function showPeriodReminderNotification(reminder: PeriodReminderPlan) {
  if (notificationPermission() !== "granted") {
    return;
  }

  const noun = reminder.medicationCount === 1 ? "medicine" : "medicines";
  const notification = new Notification(APP_TITLE, {
    body: `${reminder.period}: ${reminder.medicationCount} ${noun} due`,
    tag: `tizzy-meds:${reminder.period}`,
  });

  notification.onclick = () => {
    window.focus();
  };
}

function reminderDate(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}
