// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialMedications } from "../src/medications";
import type { AppData } from "../src/types";

const syncControls = vi.hoisted(() => ({
  onData: null as ((data: AppData) => void) | null,
  onReady: null as (() => void) | null,
}));

vi.mock("../src/firebase", () => ({
  connectFirebase: vi.fn().mockResolvedValue({
    db: {},
    user: { uid: "device-a" },
  }),
  hasFirebaseConfig: () => true,
}));

vi.mock("../src/repository", () => ({
  createFirestoreRepository: vi.fn(() => ({
    subscribe(
      onData: (data: AppData) => void,
      _onError: (error: Error) => void,
      onReady?: () => void,
    ) {
      syncControls.onData = onData;
      syncControls.onReady = onReady ?? null;
      return vi.fn();
    },
  })),
  createLocalRepository: vi.fn(),
}));

describe("app sync status", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "#household=test-household");
    syncControls.onData = null;
    syncControls.onReady = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows syncing until shared Firestore data is ready", async () => {
    render(<App />);

    expect(await screen.findByText("Syncing shared data")).toBeVisible();

    syncControls.onData?.({
      medications: initialMedications,
      events: [],
      healthEvents: [],
    });
    syncControls.onReady?.();

    expect(await screen.findByText("Synced shared link")).toBeVisible();
  });
});

import { App } from "../src/App";
