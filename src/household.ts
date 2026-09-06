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

export function ensureHouseholdId() {
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

  const created = randomHouseholdId();
  rememberHouseholdId(created);
  globalThis.history.replaceState(null, "", `#${HOUSEHOLD_PREFIX}${created}`);
  return created;
}

function rememberHouseholdId(householdId: string) {
  globalThis.localStorage.setItem(LAST_HOUSEHOLD_KEY, householdId);
}
