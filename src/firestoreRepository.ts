import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { initialMedications } from "./medications";
import type { Repository, Unsubscribe } from "./repository";
import type { DoseEvent, HealthEvent, Medication } from "./types";

export function createFirestoreRepository(
  db: Firestore,
  householdId: string,
  userId: string,
): Repository {
  const householdPath = `households/${householdId}`;
  const medicationsRef = collection(db, householdPath, "medications");
  const eventsRef = collection(db, householdPath, "doseEvents");
  const healthEventsRef = collection(db, householdPath, "healthEvents");

  return {
    subscribe(onData, onError, onReady) {
      let medications: Medication[] = [];
      let events: DoseEvent[] = [];
      let healthEvents: HealthEvent[] = [];
      let medsLoaded = false;
      let eventsLoaded = false;
      let healthEventsLoaded = false;
      let ready = false;
      let stopped = false;
      let unsubMeds: Unsubscribe | null = null;
      let unsubEvents: Unsubscribe | null = null;
      let unsubHealthEvents: Unsubscribe | null = null;

      const publish = () => {
        if (medsLoaded && eventsLoaded && healthEventsLoaded) {
          onData({ medications, events, healthEvents });
          if (!ready) {
            ready = true;
            onReady?.();
          }
        }
      };

      ensureHouseholdMembership(db, householdId, userId)
        .then(() => {
          if (stopped) {
            return;
          }

          unsubMeds = onSnapshot(
            query(medicationsRef),
            (snapshot) => {
              medications = snapshot.docs.map((item) => item.data() as Medication);
              medsLoaded = true;
              publish();
            },
            onError,
          );

          unsubEvents = onSnapshot(
            query(eventsRef),
            (snapshot) => {
              events = snapshot.docs
                .map((item) => item.data() as DoseEvent)
                .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
              eventsLoaded = true;
              publish();
            },
            onError,
          );

          unsubHealthEvents = onSnapshot(
            query(healthEventsRef),
            (snapshot) => {
              healthEvents = snapshot.docs
                .map((item) => item.data() as HealthEvent)
                .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
              healthEventsLoaded = true;
              publish();
            },
            onError,
          );

          seedStarterMeds(db, householdId).catch(onError);
        })
        .catch(onError);

      return () => {
        stopped = true;
        unsubMeds?.();
        unsubEvents?.();
        unsubHealthEvents?.();
      };
    },
    async saveMedication(medication) {
      await setDoc(doc(medicationsRef, medication.id), medication);
    },
    async saveDoseEvent(event) {
      await setDoc(doc(eventsRef, event.id), event);
    },
    async deleteDoseEvent(eventId) {
      await deleteDoc(doc(eventsRef, eventId));
    },
    async saveHealthEvent(event) {
      await setDoc(doc(healthEventsRef, event.id), event);
    },
    async deleteHealthEvent(eventId) {
      await deleteDoc(doc(healthEventsRef, eventId));
    },
    async resetStarterMeds() {
      await Promise.all(
        initialMedications.map((medication) =>
          setDoc(doc(medicationsRef, medication.id), medication),
        ),
      );
    },
  };
}

async function ensureHouseholdMembership(
  db: Firestore,
  householdId: string,
  userId: string,
) {
  const now = new Date().toISOString();

  await setDoc(doc(db, "households", householdId, "members", userId), {
    userId,
    joinedAt: now,
    authMode: "anonymous",
  });
  await setDoc(
    doc(db, "households", householdId),
    {
      id: householdId,
      createdBy: userId,
      updatedAt: now,
    },
    { merge: true },
  );
}

async function seedStarterMeds(db: Firestore, householdId: string) {
  const medicationsRef = collection(
    db,
    `households/${householdId}`,
    "medications",
  );
  const existing = await getDocs(medicationsRef);
  const existingIds = new Set(existing.docs.map((item) => item.id));

  await Promise.all(
    initialMedications
      .filter((medication) => !existingIds.has(medication.id))
      .map((medication) => setDoc(doc(medicationsRef, medication.id), medication)),
  );

  if (existingIds.has("ondansetron")) {
    await setDoc(
      doc(medicationsRef, "ondansetron"),
      {
        active: false,
        annotation: "Replaced by morning/midday/bedtime opportunities",
      },
      { merge: true },
    );
  }
}
