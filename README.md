# Tizzy Meds

A phone-first shared medication checklist for Tizzy.

The first synced implementation uses Firebase anonymous auth plus a shared
household link. Each phone signs in anonymously, joins the household named in
the URL hash, and writes medication changes and dose events to Firestore in
realtime. If Firebase config is missing locally, the app falls back to
`localStorage` for UI work.

## Current Medication Schedule

| Period | Medication | Dose | Food | Annotation |
| --- | --- | --- | --- | --- |
| Morning | Metronidazole | 0.7 mL | With food | Until gone |
| Morning | Amoxicillin/Clavulanate | 1 tablet | With food | Until gone |
| Morning | Prednisone | 1.5 tablets | With or without food | Daily |
| Midday | Capromorelin | 0.8 mL | Empty stomach | As needed |
| Evening | Metronidazole | 0.7 mL | With food | Until gone |
| Evening | Amoxicillin/Clavulanate | 1 tablet | With food | Until gone |
| Evening | SAMe | 1 tablet | Empty stomach | Liver protectant |
| Bedtime | Ondansetron | 1 tablet | With or without food | As needed, every 8-12 hours |

## Features In This Slice

- Today view grouped by Morning, Midday, Evening, and Bedtime.
- As-needed meds appear in their natural timing slot with an annotation.
- Dose statuses: Done, Skipped, Vomited after, and Partial dose.
- Optional per-dose notes.
- Local display name for who logged this.
- Editable medication list with active/as-needed toggles.
- History view for logged dose events.
- Firebase anonymous auth and Firestore realtime sync.
- GitHub Actions CI plus GitHub Pages deployment.

## Planned Backend Path

The deployed app expects Firebase config values as Vite environment variables.
For local development, copy `.env.example` to `.env.local` and fill in the
values from your Firebase web app config.

Required Firebase features:

- Authentication: enable Anonymous sign-in.
- Firestore: create a database.
- Rules: deploy `firestore.rules`.

GitHub repository secrets used by the Pages workflow:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Firestore collections:

Recommended Firebase collections:

```text
households/{householdId}
households/{householdId}/medications/{medicationId}
households/{householdId}/doseEvents/{eventId}
households/{householdId}/members/{memberId}
households/{householdId}/healthEvents/{eventId}
```

Fields represented in the client:

- `Medication`: `id`, `name`, `dose`, `period`, `food`, `purpose`,
  `annotation`, `isAsNeeded`, `active`.
- `DoseEvent`: `id`, `medId`, `date`, `status`, `performedBy`, `note`,
  `completedAt`.
- `HealthEvent`: reserved for the later event tracker with event type,
  timestamp, logged-by, severity, note, and optional linked dose event.

## Later Event Tracker

- Add an Events tab for ate, drank, vomited, stool, energy, symptoms, and notes.
- Show medication dose history and health events together by day.
- Add a Vet Summary view for appointments and phone calls.
- Add export/copy support for the summary.
- Add Google sign-in and explicit household invitations if shared-link access
  starts feeling too loose.

## Testing Plan

Current:

- `npm run lint`
- `npm test`
- `npm run build`
- Unit tests for schedule grouping, event IDs, completion counts, and household
  links.

Next:

- Add browser interaction tests for checkoff, notes, tab switching, and local
  persistence.
- Add Firebase emulator tests when Firestore sync lands.

## Commands

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

The app currently runs locally at `http://localhost:3000/` during development.
