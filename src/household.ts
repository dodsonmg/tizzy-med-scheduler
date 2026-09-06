const HOUSEHOLD_PREFIX = "household=";
const LAST_HOUSEHOLD_KEY = "tizzy-med-last-household";

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

export function initialHouseholdId() {
  const existing = householdIdFromHash(globalThis.location.hash);
  if (existing) {
    rememberHouseholdId(existing);
    return existing;
  }

  const remembered = globalThis.localStorage.getItem(LAST_HOUSEHOLD_KEY);
  if (remembered) {
    globalThis.history.replaceState(null, "", `#${HOUSEHOLD_PREFIX}${remembered}`);
    return remembered;
  }

  return null;
}

export function createHouseholdId() {
  const created = randomHouseholdId();
  return setHouseholdId(created);
}

export function setHouseholdId(householdId: string) {
  const trimmed = householdId.trim();
  rememberHouseholdId(trimmed);
  globalThis.history.replaceState(null, "", `#${HOUSEHOLD_PREFIX}${trimmed}`);
  return trimmed;
}

export function householdIdFromInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    return householdIdFromHash(trimmed.slice(hashIndex));
  }

  return trimmed.replace(/^household=/, "") || null;
}

function rememberHouseholdId(householdId: string) {
  globalThis.localStorage.setItem(LAST_HOUSEHOLD_KEY, householdId);
}
