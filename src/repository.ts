import { initialMedications } from "./medications";
import type { AppData, DoseEvent, HealthEvent, Medication } from "./types";

export type Unsubscribe = () => void;

export type Repository = {
  subscribe: (
    onData: (data: AppData) => void,
    onError: (error: Error) => void,
    onReady?: () => void,
  ) => Unsubscribe;
  saveMedication: (medication: Medication) => Promise<void>;
  deleteMedication: (medicationId: string) => Promise<void>;
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
    async deleteMedication(medicationId) {
      data = {
        ...data,
        medications: data.medications.filter(
          (current) => current.id !== medicationId,
        ),
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
