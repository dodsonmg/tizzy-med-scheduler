import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { initialMedications } from "./medications";
import type { AppData, DoseEvent, Medication } from "./types";

export type Repository = {
  subscribe: (
    onData: (data: AppData) => void,
    onError: (error: Error) => void,
  ) => Unsubscribe;
  saveMedication: (medication: Medication) => Promise<void>;
  saveDoseEvent: (event: DoseEvent) => Promise<void>;
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
    subscribe(onData) {
      listener = onData;
      onData(data);
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
    async resetStarterMeds() {
      data = { medications: initialMedications, events: [] };
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

  return {
    subscribe(onData, onError) {
      let medications: Medication[] = [];
      let events: DoseEvent[] = [];
      let medsLoaded = false;
      let eventsLoaded = false;
      let stopped = false;
      let unsubMeds: Unsubscribe | null = null;
      let unsubEvents: Unsubscribe | null = null;

      const publish = () => {
        if (medsLoaded && eventsLoaded) {
          onData({ medications, events });
        }
      };

      ensureHouseholdMembership(db, householdId, userId)
        .then(() => seedStarterMeds(db, householdId))
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
        })
        .catch(onError);

      return () => {
        stopped = true;
        unsubMeds?.();
        unsubEvents?.();
      };
    },
    async saveMedication(medication) {
      await setDoc(doc(medicationsRef, medication.id), medication);
    },
    async saveDoseEvent(event) {
      await setDoc(doc(eventsRef, event.id), event);
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
  if (!existing.empty) {
    return;
  }

  await Promise.all(
    initialMedications.map((medication) =>
      setDoc(doc(medicationsRef, medication.id), medication),
    ),
  );
}

function readLocalData(): AppData {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { medications: initialMedications, events: [] };
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AppData>;
    return {
      medications: parsed.medications ?? initialMedications,
      events: parsed.events ?? [],
    };
  } catch {
    return { medications: initialMedications, events: [] };
  }
}
