import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHouseholdId,
  householdIdFromHash,
  householdIdFromInput,
  initialHouseholdId,
  randomHouseholdId,
  setHouseholdId,
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

  it("returns no household when the URL has none and none is remembered", () => {
    vi.stubGlobal("location", { hash: "" });
    const replaceState = vi.fn();
    vi.stubGlobal("history", { replaceState });

    expect(initialHouseholdId()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("creates and writes a household id only when requested", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("history", { replaceState });

    const householdId = createHouseholdId();

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

    expect(initialHouseholdId()).toBe("remembered-household");
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "#household=remembered-household",
    );
  });

  it("joins an explicit household id", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("history", { replaceState });

    expect(setHouseholdId(" joined-household ")).toBe("joined-household");
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "#household=joined-household",
    );
  });

  it("parses join input from full links, hashes, and raw ids", () => {
    expect(householdIdFromInput("https://example.com/#household=abc123")).toBe(
      "abc123",
    );
    expect(householdIdFromInput("#household=def456")).toBe("def456");
    expect(householdIdFromInput("household=ghi789")).toBe("ghi789");
    expect(householdIdFromInput("raw-id")).toBe("raw-id");
    expect(householdIdFromInput("")).toBeNull();
  });
});
