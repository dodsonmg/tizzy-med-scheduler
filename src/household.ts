const HOUSEHOLD_PREFIX = "household=";

export function randomHouseholdId() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function householdIdFromHash(hash: string) {
  const value = hash.replace(/^#/, "");
  const match = value
    .split("&")
    .find((part) => part.startsWith(HOUSEHOLD_PREFIX));

  return match?.slice(HOUSEHOLD_PREFIX.length) || null;
}

export function ensureHouseholdId() {
  const existing = householdIdFromHash(globalThis.location.hash);
  if (existing) {
    return existing;
  }

  const created = randomHouseholdId();
  globalThis.history.replaceState(null, "", `#${HOUSEHOLD_PREFIX}${created}`);
  return created;
}
