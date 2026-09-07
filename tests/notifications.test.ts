// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notificationPermission,
  notificationStatus,
  readNotificationPreference,
  requestNotificationPermission,
  saveNotificationPreference,
} from "../src/notifications";

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
});
