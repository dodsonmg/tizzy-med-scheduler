import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;
const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeWithFirestore = hasFirestoreEmulator ? describe : describe.skip;

beforeAll(async () => {
  if (!hasFirestoreEmulator) {
    return;
  }

  testEnv = await initializeTestEnvironment({
    projectId: "demo-tizzy-med-scheduler",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  if (!testEnv) {
    return;
  }

  await testEnv.clearFirestore();
});

afterAll(async () => {
  if (!testEnv) {
    return;
  }

  await testEnv.cleanup();
});

describeWithFirestore("firestore security rules", () => {
  it("lets an anonymous device join a household from a shared link", async () => {
    const db = testEnv.authenticatedContext("device-a", {
      provider_id: "anonymous",
    }).firestore();

    await assertSucceeds(
      db.doc("households/tizzy/members/device-a").set({
        userId: "device-a",
        joinedAt: "2026-09-06T16:00:00.000Z",
        authMode: "anonymous",
      }),
    );
    await assertSucceeds(
      db.doc("households/tizzy").set({
        id: "tizzy",
        createdBy: "device-a",
        updatedAt: "2026-09-06T16:00:00.000Z",
      }),
    );
    await assertSucceeds(db.doc("households/tizzy").get());
  });

  it("lets household members read and write medication and event data", async () => {
    await seedMember("tizzy", "device-a");

    const db = testEnv.authenticatedContext("device-a", {
      provider_id: "anonymous",
    }).firestore();

    await assertSucceeds(
      db.doc("households/tizzy/medications/prednisone").set({
        id: "prednisone",
        name: "Prednisone",
        dose: "1.5 tablets",
        period: "Morning",
        food: "With or without food",
        purpose: "Anti-inflammatory steroid",
        annotation: "Daily",
        active: true,
      }),
    );
    await assertSucceeds(
      db.doc("households/tizzy/doseEvents/2026-09-06:prednisone").set({
        id: "2026-09-06:prednisone",
        medId: "prednisone",
        date: "2026-09-06",
        status: "done",
        performedBy: "Michael",
        note: "",
        completedAt: "2026-09-06T16:00:00.000Z",
      }),
    );
    await assertSucceeds(
      db.doc("households/tizzy/healthEvents/event-a").set({
        id: "event-a",
        type: "ate",
        occurredAt: "2026-09-06T16:00:00.000Z",
        loggedAt: "2026-09-06T16:05:00.000Z",
        loggedBy: "Michael",
        severity: "low",
        note: "Ate breakfast.",
      }),
    );
    await assertSucceeds(db.doc("households/tizzy/medications/prednisone").get());
    await assertSucceeds(
      db.doc("households/tizzy/doseEvents/2026-09-06:prednisone").get(),
    );
    await assertSucceeds(db.doc("households/tizzy/healthEvents/event-a").get());
  });

  it("prevents non-members from reading or writing another household", async () => {
    await seedMember("tizzy", "device-a");

    const outsiderDb = testEnv.authenticatedContext("device-b", {
      provider_id: "anonymous",
    }).firestore();

    await assertFails(outsiderDb.doc("households/tizzy").get());
    await assertFails(
      outsiderDb.doc("households/tizzy/medications/prednisone").set({
        id: "prednisone",
        active: true,
      }),
    );
    await assertFails(
      outsiderDb.doc("households/tizzy/doseEvents/2026-09-06:prednisone").set({
        id: "2026-09-06:prednisone",
      }),
    );
    await assertFails(
      outsiderDb.doc("households/tizzy/healthEvents/event-a").set({
        id: "event-a",
      }),
    );
  });

  it("prevents unauthenticated clients from joining or reading households", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(
      db.doc("households/tizzy/members/anonymous").set({
        userId: "anonymous",
      }),
    );
    await assertFails(db.doc("households/tizzy").get());
  });
});

async function seedMember(householdId: string, userId: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await db.doc(`households/${householdId}`).set({
      id: householdId,
      createdBy: userId,
      updatedAt: "2026-09-06T16:00:00.000Z",
    });
    await db.doc(`households/${householdId}/members/${userId}`).set({
      userId,
      joinedAt: "2026-09-06T16:00:00.000Z",
      authMode: "anonymous",
    });
  });
}
