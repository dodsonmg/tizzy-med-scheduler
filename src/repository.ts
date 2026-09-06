import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  deleteDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { initialMedications } from "./medications";
import type { AppData, DoseEvent, HealthEvent, Medication } from "./types";

export type Repository = {
  subscribe: (
    onData: (data: AppData) => void,
    onError: (error: Error) => void,
    onReady?: () => void,
  ) => Unsubscribe;
  saveMedication: (medication: Medication) => Promise<void>;
  saveDoseEvent: (event: DoseEvent) => Promise<void>;
  deleteDoseEvent: (eventId: string) => Promise<void>;
  saveHealthEvent: (event: HealthEvent) => Promise<void>;
  deleteHealthEvent: (eventId: string) => Promise<void>;
  resetStarterMeds: () => Promise<void>;
};

const STORAGE_KEY = "tizzy-med-scheduler-v1";

export function createLocalRepository(): Repository {
  let data = readLocalData();
  let listener: ((next: AppData) => void) | null = null;

  function publish() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    listener?.(data);
  }

  return {
    subscribe(onData, _onError, onReady) {
      listener = onData;
      onData(data);
      onReady?.();
      return () => {
        listener = null;
      };
    },
    async saveMedication(medication) {
      data = {
        ...data,
        medications: [
          ...data.medications.filter((current) => current.id !== medication.id),
          medication,
        ],
      };
      publish();
    },
    async saveDoseEvent(event) {
      data = {
        ...data,
        events: [
          event,
          ...data.events.filter((current) => current.id !== event.id),
        ],
      };
      publish();
    },
    async deleteDoseEvent(eventId) {
      data = {
        ...data,
        events: data.events.filter((current) => current.id !== eventId),
      };
      publish();
    },
    async saveHealthEvent(event) {
      data = {
        ...data,
        healthEvents: [
          event,
          ...data.healthEvents.filter((current) => current.id !== event.id),
        ],
      };
      publish();
    },
    async deleteHealthEvent(eventId) {
      data = {
        ...data,
        healthEvents: data.healthEvents.filter((current) => current.id !== eventId),
      };
      publish();
    },
    async resetStarterMeds() {
      data = { medications: initialMedications, events: [], healthEvents: [] };
      publish();
    },
  };
}

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

function readLocalData(): AppData {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { medications: initialMedications, events: [], healthEvents: [] };
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AppData>;
    return {
      medications: parsed.medications ?? initialMedications,
      events: parsed.events ?? [],
      healthEvents: parsed.healthEvents ?? [],
    };
  } catch {
    return { medications: initialMedications, events: [], healthEvents: [] };
  }
}
