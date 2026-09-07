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
