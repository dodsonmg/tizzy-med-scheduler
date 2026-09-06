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
  makeHealthEventId,
  healthEventLabels,
  statusLabels,
  todayKey,
} from "./schedule";
import {
  createFirestoreRepository,
  createLocalRepository,
  type Repository,
} from "./repository";
import type { AppData, DoseEvent, DoseStatus, Medication } from "./types";
import type { HealthEvent, HealthEventType, HealthSeverity } from "./types";

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
    healthEvents: [],
  });
  const [activeTab, setActiveTab] = useState<
    "today" | "events" | "meds" | "history" | "summary"
  >("today");

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

  async function recordHealthEvent(
    type: HealthEventType,
    occurredAt: string,
    severity: HealthSeverity | "",
    note: string,
  ) {
    const loggedAt = new Date();
    const nextEvent: HealthEvent = {
      id: makeHealthEventId(loggedAt),
      type,
      occurredAt: new Date(occurredAt).toISOString(),
      loggedAt: loggedAt.toISOString(),
      loggedBy: deviceName.trim() || "Unknown",
      note,
      ...(severity ? { severity } : {}),
    };

    await repository?.saveHealthEvent(nextEvent);
  }

  async function deleteHealthEvent(eventId: string) {
    await repository?.deleteHealthEvent(eventId);
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
        {(["today", "events", "history", "summary", "meds"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "today"
              ? "Today"
              : tab === "events"
                ? "Events"
                : tab === "summary"
                  ? "Summary"
                : tab === "meds"
                  ? "Meds"
                  : "History"}
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

      {activeTab === "events" ? (
        <EventsView events={data.healthEvents} onRecord={recordHealthEvent} />
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
          healthEvents={data.healthEvents}
          medications={data.medications}
          onDelete={deleteHistoryEvent}
          onDeleteHealthEvent={deleteHealthEvent}
        />
      ) : null}

      {activeTab === "summary" ? (
        <VetSummaryView
          events={data.events}
          healthEvents={data.healthEvents}
          medications={data.medications}
        />
      ) : null}
    </main>
  );
}

const healthEventTypes = Object.keys(healthEventLabels) as HealthEventType[];

function EventsView({
  events,
  onRecord,
}: {
  events: HealthEvent[];
  onRecord: (
    type: HealthEventType,
    occurredAt: string,
    severity: HealthSeverity | "",
    note: string,
  ) => void;
}) {
  const [type, setType] = useState<HealthEventType>("ate");
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocal(new Date()));
  const [severity, setSeverity] = useState<HealthSeverity | "">("");
  const [note, setNote] = useState("");
  const recentEvents = events.slice(0, 5);

  return (
    <section className="events-panel" aria-label="Health event logger">
      <form
        className="event-form"
        onSubmit={(event) => {
          event.preventDefault();
          onRecord(type, occurredAt, severity, note.trim());
          setOccurredAt(toDatetimeLocal(new Date()));
          setSeverity("");
          setNote("");
        }}
      >
        <div className="section-intro">
          <h2>Log event</h2>
          <button type="submit" className="plain-button">
            Save event
          </button>
        </div>
        <label>
          <span>Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as HealthEventType)}
          >
            {healthEventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {healthEventLabels[eventType]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>When</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Severity</span>
          <select
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value as HealthSeverity | "")
            }
          >
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="event-note">
          <span>Note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional details"
            rows={3}
          />
        </label>
      </form>

      <div className="recent-events" aria-label="Recent health events">
        <h2>Recent events</h2>
        {recentEvents.length === 0 ? (
          <p className="empty-state">No health events have been logged yet.</p>
        ) : (
          <div className="history-list">
            {recentEvents.map((event) => (
              <HealthEventItem event={event} key={event.id} />
            ))}
          </div>
        )}
      </div>
    </section>
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
  healthEvents,
  medications,
  onDelete,
  onDeleteHealthEvent,
}: {
  events: DoseEvent[];
  healthEvents: HealthEvent[];
  medications: Medication[];
  onDelete: (eventId: string) => void;
  onDeleteHealthEvent: (eventId: string) => void;
}) {
  const medsById = new Map(
    medications.map((medication) => [medication.id, medication]),
  );
  const timeline = [
    ...events.map((event) => ({ kind: "dose" as const, event })),
    ...healthEvents.map((event) => ({ kind: "health" as const, event })),
  ].sort((a, b) => {
    const aTime = a.kind === "dose" ? a.event.completedAt : a.event.occurredAt;
    const bTime = b.kind === "dose" ? b.event.completedAt : b.event.occurredAt;
    return bTime.localeCompare(aTime);
  });

  return (
    <section className="history-panel" aria-label="History">
      <h2>History</h2>
      {timeline.length === 0 ? (
        <p className="empty-state">Nothing has been logged yet.</p>
      ) : (
        <div className="history-list">
          {timeline.map((item) =>
            item.kind === "dose" ? (
              <DoseHistoryItem
                event={item.event}
                medication={medsById.get(item.event.medId)}
                onDelete={onDelete}
                key={`dose:${item.event.id}`}
              />
            ) : (
              <HealthEventItem
                event={item.event}
                onDelete={onDeleteHealthEvent}
                key={`health:${item.event.id}`}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function VetSummaryView({
  events,
  healthEvents,
  medications,
}: {
  events: DoseEvent[];
  healthEvents: HealthEvent[];
  medications: Medication[];
}) {
  const [copied, setCopied] = useState(false);
  const medsById = new Map(
    medications.map((medication) => [medication.id, medication]),
  );
  const days = groupTimelineByDay(events, healthEvents);
  const summaryText = makeVetSummaryText(days, medsById);

  async function copySummary() {
    await navigator.clipboard?.writeText(summaryText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="summary-panel" aria-label="Vet summary">
      <div className="section-intro">
        <h2>Vet summary</h2>
        <button type="button" className="plain-button" onClick={copySummary}>
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>

      {days.length === 0 ? (
        <p className="empty-state">Nothing has been logged yet.</p>
      ) : (
        <div className="summary-days">
          {days.map((day) => (
            <article className="summary-day" key={day.date}>
              <div className="summary-day-heading">
                <h3>{formatSummaryDate(day.date)}</h3>
                <span>
                  {day.items.length} {day.items.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              <div className="summary-entry-list">
                {day.items.map((item) =>
                  item.kind === "dose" ? (
                    <DoseSummaryEntry
                      event={item.event}
                      medication={medsById.get(item.event.medId)}
                      key={`dose:${item.event.id}`}
                    />
                  ) : (
                    <HealthSummaryEntry
                      event={item.event}
                      key={`health:${item.event.id}`}
                    />
                  ),
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <label className="summary-copy-field">
        <span>Copy/export text</span>
        <textarea value={summaryText} readOnly rows={10} />
      </label>
    </section>
  );
}

function DoseSummaryEntry({
  event,
  medication,
}: {
  event: DoseEvent;
  medication?: Medication;
}) {
  return (
    <div className={`summary-entry dose-history-item ${event.status}`}>
      <strong>{medication?.name ?? event.medId}</strong>
      <span>
        {statusLabels[event.status]} by {event.performedBy} at{" "}
        {formatSummaryTime(event.completedAt)}
      </span>
      {event.note ? <p>{event.note}</p> : null}
    </div>
  );
}

function HealthSummaryEntry({ event }: { event: HealthEvent }) {
  return (
    <div className="summary-entry health-item">
      <strong>{healthEventLabels[event.type]}</strong>
      <span>
        {event.severity ? `${event.severity} severity by ` : "Logged by "}
        {event.loggedBy} at {formatSummaryTime(event.occurredAt)}
      </span>
      {event.note ? <p>{event.note}</p> : null}
    </div>
  );
}

function DoseHistoryItem({
  event,
  medication,
  onDelete,
}: {
  event: DoseEvent;
  medication?: Medication;
  onDelete: (eventId: string) => void;
}) {
  return (
    <article className={`history-item dose-history-item ${event.status}`}>
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
}

function HealthEventItem({
  event,
  onDelete,
}: {
  event: HealthEvent;
  onDelete?: (eventId: string) => void;
}) {
  return (
    <article className="history-item health-item">
      <div>
        <strong>{healthEventLabels[event.type]}</strong>
        <span>
          {event.severity ? `${event.severity} severity by ` : "Logged by "}
          {event.loggedBy}
        </span>
      </div>
      <div className="history-meta">
        <time dateTime={event.occurredAt}>
          {new Date(event.occurredAt).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}{" "}
          -{" "}
          {new Date(event.occurredAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
        {onDelete ? (
          <button type="button" onClick={() => onDelete(event.id)}>
            Delete
          </button>
        ) : null}
      </div>
      {event.note ? <p>{event.note}</p> : null}
    </article>
  );
}

type TimelineItem =
  | { kind: "dose"; event: DoseEvent }
  | { kind: "health"; event: HealthEvent };

type SummaryDay = {
  date: string;
  items: TimelineItem[];
};

function groupTimelineByDay(
  events: DoseEvent[],
  healthEvents: HealthEvent[],
): SummaryDay[] {
  const items: TimelineItem[] = [
    ...events.map((event) => ({ kind: "dose" as const, event })),
    ...healthEvents.map((event) => ({ kind: "health" as const, event })),
  ].sort((a, b) => itemTime(b).localeCompare(itemTime(a)));
  const days = new Map<string, TimelineItem[]>();

  for (const item of items) {
    const date =
      item.kind === "dose" ? item.event.date : todayKey(new Date(item.event.occurredAt));
    days.set(date, [...(days.get(date) ?? []), item]);
  }

  return Array.from(days, ([date, dayItems]) => ({ date, items: dayItems }));
}

function makeVetSummaryText(
  days: SummaryDay[],
  medsById: Map<string, Medication>,
) {
  if (days.length === 0) {
    return "Tizzy vet summary\n\nNo medication doses or health events logged yet.";
  }

  return [
    "Tizzy vet summary",
    "",
    ...days.flatMap((day) => [
      formatSummaryDate(day.date),
      ...day.items.map((item) =>
        item.kind === "dose"
          ? formatDoseSummaryLine(item.event, medsById.get(item.event.medId))
          : formatHealthSummaryLine(item.event),
      ),
      "",
    ]),
  ]
    .join("\n")
    .trimEnd();
}

function formatDoseSummaryLine(event: DoseEvent, medication?: Medication) {
  const details = [
    `${formatSummaryTime(event.completedAt)} med: ${medication?.name ?? event.medId}`,
    statusLabels[event.status].toLowerCase(),
    `by ${event.performedBy}`,
    event.note,
  ].filter(Boolean);

  return `- ${details.join("; ")}`;
}

function formatHealthSummaryLine(event: HealthEvent) {
  const details = [
    `${formatSummaryTime(event.occurredAt)} event: ${healthEventLabels[event.type]}`,
    event.severity ? `${event.severity} severity` : "",
    `by ${event.loggedBy}`,
    event.note,
  ].filter(Boolean);

  return `- ${details.join("; ")}`;
}

function itemTime(item: TimelineItem) {
  return item.kind === "dose" ? item.event.completedAt : item.event.occurredAt;
}

function formatSummaryDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSummaryTime(date: string) {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDatetimeLocal(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}
