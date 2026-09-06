import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureHouseholdId,
  householdIdFromHash,
  randomHouseholdId,
} from "../src/household";

describe("household links", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
    });
  });

  it("reads a household id from the URL hash", () => {
    expect(householdIdFromHash("#household=abc123")).toBe("abc123");
    expect(householdIdFromHash("#tab=today&household=tizzy")).toBe("tizzy");
  });

  it("creates a compact random household id", () => {
    const householdId = randomHouseholdId();
    expect(householdId).toMatch(/^[a-f0-9]{20}$/);
  });

  it("creates and writes a household id when the URL has none", () => {
    vi.stubGlobal("location", { hash: "" });
    const replaceState = vi.fn();
    vi.stubGlobal("history", { replaceState });

    const householdId = ensureHouseholdId();

    expect(householdId).toMatch(/^[a-f0-9]{20}$/);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      `#household=${householdId}`,
    );
  });

  it("reuses the remembered household when launched without a hash", () => {
    store.set("tizzy-med-last-household", "remembered-household");
    vi.stubGlobal("location", { hash: "" });
    const replaceState = vi.fn();
    vi.stubGlobal("history", { replaceState });

    expect(ensureHouseholdId()).toBe("remembered-household");
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "#household=remembered-household",
    );
  });
});
