# Tizzy Meds

A phone-first shared medication checklist for Tizzy.

Tizzy Meds is a Vite, React, and TypeScript app deployed on GitHub Pages. It
uses Firebase anonymous auth and Firestore realtime sync behind a shared
household link. Each phone signs in anonymously, joins the household named in
the URL hash, and syncs medication changes, dose checkoffs, dose notes, and
health events.

Live app:

```text
https://dodsonmg.github.io/tizzy-med-scheduler/
```

The full household URL includes a private `#household=...` hash. Do not publish
that full URL; share it only with people who should be able to view and update
the household medication board.

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

## Current Features

- Today view grouped by Morning, Midday, Evening, and Bedtime.
- As-needed meds appear in their natural timing slot with an annotation.
- Dose statuses: Done, Skipped, Vomited after, and Partial dose.
- Optional per-dose notes.
- Event logging for appetite, drinking, vomiting, stool, energy, symptoms, and
  general notes.
- Local display name for who logged this.
- Editable medication list with active/as-needed toggles.
- History view for logged dose and health events, with a vet-friendly summary
  that can be copied or exported.
- Status color schemes for completed, skipped/partial, vomited, and health
  event entries.
- Firebase anonymous auth and Firestore realtime sync, with startup sync
  feedback while shared data loads.
- GitHub Actions CI, Firestore rules tests, and GitHub Pages deployment.

## Firebase Setup

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
- `HealthEvent`: `id`, `type`, `timestamp`, `loggedBy`, `severity`, `note`,
  and optional `linkedDoseEventId`.

## Development

Useful commands:

```bash
npm install
npm run dev
npm run lint
npm test
npm run test:rules
npm run build
```

The app runs locally at `http://localhost:5173/` during development. Add a
household hash such as `#household=test-household` to exercise the main UI. If
Firebase config is missing locally, it falls back to `localStorage` for UI work;
with `.env.local` configured, localhost uses the shared Firestore backend.

`npm run test:rules` runs the Firestore emulator security rules suite and
requires a local Java runtime that is compatible with Firebase Tools.

GitHub Actions runs lint, app tests, Firestore rules tests, build, and GitHub
Pages deployment on pushes to `main`.
