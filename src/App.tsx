import { useEffect, useMemo, useState } from "react";
import { connectFirebase, hasFirebaseConfig } from "./firebase";
import {
  createHouseholdId,
  householdIdFromInput,
  initialHouseholdId,
  setHouseholdId as persistHouseholdId,
} from "./household";
import { foodRules, initialMedications, periods } from "./medications";
import {
  countCompletedToday,
  formatDay,
  groupMedsByPeriod,
  makeEventId,
  statusLabels,
  todayKey,
} from "./schedule";
import {
  createFirestoreRepository,
  createLocalRepository,
  type Repository,
} from "./repository";
import type { AppData, DoseEvent, DoseStatus, Medication } from "./types";

const DEVICE_NAME_KEY = "tizzy-med-device-name";

type SyncStatus = "connecting" | "synced" | "local" | "error";

export function App() {
  const date = todayKey();
  const [householdId, setHouseholdId] = useState<string | null>(() =>
    initialHouseholdId(),
  );
  const [deviceName, setDeviceName] = useState(
    () => window.localStorage.getItem(DEVICE_NAME_KEY) ?? "Michael",
  );
  const [repository, setRepository] = useState<Repository | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<AppData>({
    medications: initialMedications,
    events: [],
  });
  const [activeTab, setActiveTab] = useState<"today" | "meds" | "history">(
    "today",
  );

  useEffect(() => {
    let ignore = false;

    async function connect() {
      if (!householdId) {
        setRepository(null);
        setSyncStatus("connecting");
        return;
      }

      if (!hasFirebaseConfig()) {
        if (!ignore) {
          setRepository(createLocalRepository());
          setSyncStatus("local");
        }
        return;
      }

      try {
        const services = await connectFirebase();
        if (!ignore) {
          setRepository(
            createFirestoreRepository(services.db, householdId, services.user.uid),
          );
          setSyncStatus("synced");
        }
      } catch (error) {
        if (!ignore) {
          setRepository(createLocalRepository());
          setSyncStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Firebase failed");
        }
      }
    }

    connect();

    return () => {
      ignore = true;
    };
  }, [householdId]);

  useEffect(() => {
    if (!repository) {
      return undefined;
    }

    return repository.subscribe(setData, (error) => {
      setSyncStatus("error");
      setErrorMessage(error.message);
    });
  }, [repository]);

  useEffect(() => {
    window.localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }, [deviceName]);

  const activeMeds = useMemo(
    () => data.medications.filter((medication) => medication.active),
    [data.medications],
  );
  const todayEventsByMed = useMemo(
    () =>
      new Map(
        data.events
          .filter((event) => event.date === date)
          .map((event) => [event.medId, event]),
      ),
    [date, data.events],
  );
  const completedToday = countCompletedToday(activeMeds, todayEventsByMed);
  const shareUrl = window.location.href;

  function createHousehold() {
    setHouseholdId(createHouseholdId());
  }

  function joinHousehold(input: string) {
    const nextHouseholdId = householdIdFromInput(input);
    if (nextHouseholdId) {
      setHouseholdId(persistHouseholdId(nextHouseholdId));
    }
  }

  async function recordDose(medId: string, status: DoseStatus, note = "") {
    const nextEvent: DoseEvent = {
      id: makeEventId(medId, date),
      medId,
      date,
      status,
      performedBy: deviceName.trim() || "Unknown",
      note,
      completedAt: new Date().toISOString(),
    };

    await repository?.saveDoseEvent(nextEvent);
  }

  async function undoDose(medId: string) {
    await repository?.deleteDoseEvent(makeEventId(medId, date));
  }

  async function deleteHistoryEvent(eventId: string) {
    await repository?.deleteDoseEvent(eventId);
  }

  async function updateMedication(
    medId: string,
    field: keyof Medication,
    value: string | boolean,
  ) {
    const medication = data.medications.find((current) => current.id === medId);
    if (!medication) {
      return;
    }

    await repository?.saveMedication({ ...medication, [field]: value });
  }

  async function addMedication() {
    await repository?.saveMedication({
      id: `med-${Date.now()}`,
      name: "New medication",
      dose: "",
      period: "Morning",
      food: "With food",
      purpose: "",
      annotation: "Daily",
      active: true,
    });
    setActiveTab("meds");
  }

  if (!householdId) {
    return <StartScreen onCreate={createHousehold} onJoin={joinHousehold} />;
  }

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="Household status">
        <div>
          <p className="eyebrow">{syncLabel(syncStatus)}</p>
          <h1>Tizzy Meds</h1>
          <p className="today-label">{formatDay()}</p>
        </div>
        <label className="name-field">
          <span>Checked off by</span>
          <input
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            aria-label="Device display name"
          />
        </label>
      </section>

      <section className="share-panel" aria-label="Shared household link">
        <div>
          <strong>Household link</strong>
          <span>{shareUrl}</span>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(shareUrl)}
        >
          Copy
        </button>
      </section>

      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

      <section className="summary-strip" aria-label="Daily progress">
        <div>
          <strong>
            {completedToday}/{activeMeds.length}
          </strong>
          <span>actions logged today</span>
        </div>
        <div>
          <strong>{activeMeds.filter((med) => med.isAsNeeded).length}</strong>
          <span>as-needed opportunities</span>
        </div>
        <button className="plain-button" type="button" onClick={addMedication}>
          Add med
        </button>
      </section>

      <nav className="tabs" aria-label="App sections">
        {(["today", "meds", "history"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "today" ? "Today" : tab === "meds" ? "Meds" : "History"}
          </button>
        ))}
      </nav>

      {activeTab === "today" ? (
        <TodayView
          medications={activeMeds}
          eventsByMed={todayEventsByMed}
          onRecord={recordDose}
          onUndo={undoDose}
        />
      ) : null}

      {activeTab === "meds" ? (
        <MedicationEditor
          medications={data.medications}
          onUpdate={updateMedication}
          onReset={() => repository?.resetStarterMeds()}
        />
      ) : null}

      {activeTab === "history" ? (
        <HistoryView
          events={data.events}
          medications={data.medications}
          onDelete={deleteHistoryEvent}
        />
      ) : null}
    </main>
  );
}

function StartScreen({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: (input: string) => void;
}) {
  const [joinValue, setJoinValue] = useState("");

  return (
    <main className="app-shell start-shell">
      <section className="start-panel" aria-label="Choose a household">
        <p className="eyebrow">Shared medication board</p>
        <h1>Tizzy Meds</h1>
        <div className="start-actions">
          <button type="button" className="primary-button" onClick={onCreate}>
            Create household
          </button>
          <form
            className="join-form"
            onSubmit={(event) => {
              event.preventDefault();
              onJoin(joinValue);
            }}
          >
            <label>
              <span>Join with link or ID</span>
              <input
                value={joinValue}
                onChange={(event) => setJoinValue(event.target.value)}
                placeholder="Paste household link"
              />
            </label>
            <button type="submit" className="plain-button">
              Join household
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function syncLabel(status: SyncStatus) {
  if (status === "synced") {
    return "Synced shared link";
  }
  if (status === "local") {
    return "Local preview mode";
  }
  if (status === "error") {
    return "Sync needs attention";
  }
  return "Connecting";
}

function TodayView({
  medications,
  eventsByMed,
  onRecord,
  onUndo,
}: {
  medications: Medication[];
  eventsByMed: Map<string, DoseEvent>;
  onRecord: (medId: string, status: DoseStatus, note?: string) => void;
  onUndo: (medId: string) => void;
}) {
  return (
    <section className="today-grid" aria-label="Today's medicine schedule">
      {groupMedsByPeriod(medications, periods).map(({ period, medications }) => {
        if (medications.length === 0) {
          return null;
        }

        return (
          <section className="period-section" key={period}>
            <div className="period-heading">
              <h2>{period}</h2>
              <span>{medications.length} items</span>
            </div>
            <div className="dose-list">
              {medications.map((medication) => (
                <DoseCard
                  key={`${medication.id}:${eventsByMed.get(medication.id)?.completedAt ?? "pending"}`}
                  medication={medication}
                  event={eventsByMed.get(medication.id)}
                  onRecord={onRecord}
                  onUndo={onUndo}
                />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}

function DoseCard({
  medication,
  event,
  onRecord,
  onUndo,
}: {
  medication: Medication;
  event?: DoseEvent;
  onRecord: (medId: string, status: DoseStatus, note?: string) => void;
  onUndo: (medId: string) => void;
}) {
  const [note, setNote] = useState(event?.note ?? "");
  const status = event?.status ?? "pending";

  return (
    <article className={`dose-card ${status}`}>
      <div className="dose-card-main">
        <div>
          <div className="med-title-row">
            <h3>{medication.name}</h3>
            <span className={medication.isAsNeeded ? "pill optional" : "pill"}>
              {medication.annotation}
            </span>
          </div>
          <p className="dose-line">
            {medication.dose} - {medication.food}
          </p>
          <p className="purpose-line">{medication.purpose}</p>
        </div>
        <strong className="status-label">{statusLabels[status]}</strong>
      </div>

      <div className="quick-actions" aria-label={`${medication.name} actions`}>
        <button type="button" onClick={() => onRecord(medication.id, "done", note)}>
          Done
        </button>
        <button
          type="button"
          onClick={() => onRecord(medication.id, "skipped", note)}
        >
          Skipped
        </button>
        <button
          type="button"
          onClick={() => onRecord(medication.id, "vomited", note)}
        >
          Vomited
        </button>
        <button
          type="button"
          onClick={() => onRecord(medication.id, "partial", note)}
        >
          Partial
        </button>
      </div>

      <label className="note-field">
        <span>Note</span>
        <textarea
          value={note}
          onChange={(change) => setNote(change.target.value)}
          onBlur={() => {
            if (event) {
              onRecord(medication.id, event.status, note);
            }
          }}
          placeholder="Optional context"
          rows={2}
        />
      </label>

      {event ? (
        <div className="event-footer">
          <span>
            Logged by {event.performedBy} at{" "}
            {new Date(event.completedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <button type="button" onClick={() => onUndo(medication.id)}>
            Undo
          </button>
        </div>
      ) : null}
    </article>
  );
}

function MedicationEditor({
  medications,
  onUpdate,
  onReset,
}: {
  medications: Medication[];
  onUpdate: (
    medId: string,
    field: keyof Medication,
    value: string | boolean,
  ) => void;
  onReset: () => void;
}) {
  return (
    <section className="editor-panel" aria-label="Medication editor">
      <div className="section-intro">
        <h2>Medication setup</h2>
        <button type="button" className="plain-button" onClick={onReset}>
          Reset starter meds
        </button>
      </div>
      <div className="editor-list">
        {medications.map((medication) => (
          <article className="editor-card" key={medication.id}>
            <label>
              <span>Name</span>
              <input
                value={medication.name}
                onChange={(event) =>
                  onUpdate(medication.id, "name", event.target.value)
                }
              />
            </label>
            <label>
              <span>Dose</span>
              <input
                value={medication.dose}
                onChange={(event) =>
                  onUpdate(medication.id, "dose", event.target.value)
                }
              />
            </label>
            <label>
              <span>Period</span>
              <select
                value={medication.period}
                onChange={(event) =>
                  onUpdate(medication.id, "period", event.target.value)
                }
              >
                {periods.map((period) => (
                  <option key={period}>{period}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Food</span>
              <select
                value={medication.food}
                onChange={(event) =>
                  onUpdate(medication.id, "food", event.target.value)
                }
              >
                {foodRules.map((rule) => (
                  <option key={rule}>{rule}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Annotation</span>
              <input
                value={medication.annotation}
                onChange={(event) =>
                  onUpdate(medication.id, "annotation", event.target.value)
                }
              />
            </label>
            <label>
              <span>Purpose</span>
              <input
                value={medication.purpose}
                onChange={(event) =>
                  onUpdate(medication.id, "purpose", event.target.value)
                }
              />
            </label>
            <div className="toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(medication.isAsNeeded)}
                  onChange={(event) =>
                    onUpdate(medication.id, "isAsNeeded", event.target.checked)
                  }
                />
                <span>As needed</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(medication.active)}
                  onChange={(event) =>
                    onUpdate(medication.id, "active", event.target.checked)
                  }
                />
                <span>Active</span>
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HistoryView({
  events,
  medications,
  onDelete,
}: {
  events: DoseEvent[];
  medications: Medication[];
  onDelete: (eventId: string) => void;
}) {
  const medsById = new Map(
    medications.map((medication) => [medication.id, medication]),
  );

  return (
    <section className="history-panel" aria-label="Dose history">
      <h2>History</h2>
      {events.length === 0 ? (
        <p className="empty-state">No doses have been logged yet.</p>
      ) : (
        <div className="history-list">
          {events.map((event) => {
            const medication = medsById.get(event.medId);
            return (
              <article className="history-item" key={event.id}>
                <div>
                  <strong>{medication?.name ?? event.medId}</strong>
                  <span>
                    {statusLabels[event.status]} by {event.performedBy}
                  </span>
                </div>
                <div className="history-meta">
                  <time dateTime={event.completedAt}>
                    {event.date} -{" "}
                    {new Date(event.completedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  <button type="button" onClick={() => onDelete(event.id)}>
                    Delete
                  </button>
                </div>
                {event.note ? <p>{event.note}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
