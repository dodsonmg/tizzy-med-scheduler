// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

vi.mock("../src/firebase", () => ({
  connectFirebase: vi.fn(),
  hasFirebaseConfig: () => false,
}));

function setHash(hash = "#household=test-household") {
  window.history.replaceState(null, "", hash);
}

async function renderHouseholdApp(hash?: string) {
  setHash(hash);
  render(<App />);
  await screen.findByText("Local preview mode");
}

function firstDoseCard(name: string) {
  const heading = screen.getAllByRole("heading", { name })[0];
  const card = heading.closest("article");

  if (!card) {
    throw new Error(`Could not find dose card for ${name}`);
  }

  return within(card);
}

describe("app interactions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("starts without a household and joins from a shared link", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Create household" })).toBeVisible();

    await user.type(
      screen.getByLabelText("Join with link or ID"),
      "https://example.test/#household=family-care",
    );
    await user.click(screen.getByRole("button", { name: "Join household" }));

    expect(await screen.findByText("Local preview mode")).toBeVisible();
    expect(window.location.hash).toBe("#household=family-care");
    expect(window.localStorage.getItem("tizzy-med-last-household")).toBe(
      "family-care",
    );
  });

  it("records dose checkoffs and persists notes in local fallback mode", async () => {
    const user = userEvent.setup();
    await renderHouseholdApp();

    const doseCard = firstDoseCard("Prednisone");
    await user.type(doseCard.getByLabelText("Note"), "Ate half breakfast first.");
    await user.click(doseCard.getByRole("button", { name: "Vomited" }));

    const savedCard = firstDoseCard("Prednisone");
    expect(await savedCard.findByText(/Logged by Michael/)).toBeVisible();

    cleanup();
    render(<App />);
    await screen.findByText("Local preview mode");

    const restoredCard = firstDoseCard("Prednisone");
    expect(restoredCard.getByDisplayValue("Ate half breakfast first.")).toBeVisible();
    expect(restoredCard.getByText(/Logged by Michael/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "History" }));
    const historyItem = screen.getByText("Vomited after by Michael").closest("article");

    expect(historyItem).toHaveClass("dose-history-item", "vomited");
  });

  it("switches tabs and edits medication fields", async () => {
    const user = userEvent.setup();
    await renderHouseholdApp();

    await user.click(screen.getByRole("button", { name: "Meds" }));
    await user.clear(screen.getByDisplayValue("Capromorelin"));
    await user.type(screen.getByDisplayValue(""), "Appetite helper");

    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByRole("heading", { name: "Appetite helper" })).toBeVisible();
  });

  it("logs health events and shows them in history", async () => {
    const user = userEvent.setup();
    await renderHouseholdApp();

    await user.click(screen.getByRole("button", { name: "Events" }));
    await user.selectOptions(screen.getByLabelText("Type"), "vomited");
    await user.selectOptions(screen.getByLabelText("Severity"), "high");
    await user.type(screen.getByLabelText("Note"), "About ten minutes after dinner.");
    await user.click(screen.getByRole("button", { name: "Save event" }));

    expect(await screen.findByRole("heading", { name: "Recent events" })).toBeVisible();
    expect(
      within(screen.getByLabelText("Recent health events")).getByText("Vomited", {
        selector: "strong",
      }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "History" }));

    expect(screen.getByText("high severity by Michael")).toBeVisible();
    expect(screen.getByText("About ten minutes after dinner.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Summary" }));

    expect(screen.getByRole("heading", { name: "Vet summary" })).toBeVisible();
    expect(
      screen.getByText("high severity by Michael at", { exact: false }),
    ).toBeVisible();
    expect(screen.getByDisplayValue(/event: Vomited/)).toBeVisible();

    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    await user.click(screen.getByRole("button", { name: "Copy summary" }));

    expect(clipboardWriteText).toHaveBeenCalledWith(
      expect.stringContaining("event: Vomited"),
    );
  });
});
