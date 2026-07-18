# District 7 — Internal Team Work & CRM

A closed internal workspace for a small private team. Admins manage projects, tasks, users, and settings; staff view all work but can only update task status/progress/position. Includes consent-based, transparent productivity tracking.

## Tech Stack

- **React 18** + **Vite** + **TypeScript**
- **React Router** — client-side routing
- **Tailwind CSS 3** — styling (Obsidian Glass monochrome design system)
- **Firebase** — Auth (email/password), Firestore, Security Rules (Spark/free plan — no Cloud Functions)
- **TanStack React Query** — data fetching/caching
- **Zustand** — UI state (filters, selected task, sidebar)
- **Recharts** — monochrome charts
- **@dnd-kit** — Kanban drag-and-drop
- **Framer Motion** — sticky note drag transitions
- **date-fns** — date utilities
- **lucide-react** — monochrome icons
- **Zod** — form validation
- **Sonner** — toasts

---

## Firebase Setup (from scratch)

Do these steps once in the [Firebase Console](https://console.firebase.google.com/) and on your machine.

### 1. Create a Firebase project

1. Go to **Firebase Console** → **Add project**
2. Name it (e.g. `district7-crm`) and finish the wizard

### 2. Enable Authentication

1. **Build** → **Authentication** → **Get started**
2. **Sign-in method** → enable **Email/Password**
3. Leave **Email link** disabled (login is email/password only)

### 3. Create Firestore database

1. **Build** → **Firestore Database** → **Create database**
2. Start in **production mode** (security rules are in this repo)
3. Pick a region close to your team

### 4. Register the web app

1. **Project settings** (gear) → **Your apps** → **Web** (`</>`)
2. Register the app (nickname e.g. `district7-web`)
3. Copy the `firebaseConfig` values into `.env`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

See `.env.example` for the full template.

### 5. Install Firebase CLI and link the project

```bash
npm install -g firebase-tools
firebase login
```

Edit `.firebaserc` and set your project ID:

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

### 6. Deploy Firestore rules and indexes

From the project root (works on the **free Spark plan** — no Blaze upgrade needed):

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

This deploys:

| Resource | Purpose |
|----------|---------|
| `firestore.rules` | Role-based access (admin/staff), task field restrictions |
| `firestore.indexes.json` | Composite indexes for queries |

> **Note:** Cloud Functions require the Blaze (pay-as-you-go) plan. This app does **not** use Cloud Functions. Admin setup, audit logs, and activity rollups run in the client + Firestore rules instead.

### 7. Run the app locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173**

### 8. Create the first admin (no setup secret)

1. Open the login screen
2. Click **"First-run: create initial admin"**
3. Enter admin email, name, and password → **Create initial admin**

This only works when **no admin profile exists yet**. It also seeds default workspace settings and app categories.

Then sign in with the credentials you created.

### 9. Add team members (Spark plan)

Because Cloud Functions are not used, new users need a **Firebase Auth account** created in the console:

1. In the app: **User Management** → **New User** → fill in details → **Create user**
2. In Firebase Console: **Authentication** → **Users** → **Add user** → same email + temp password
3. User signs in → their profile is created automatically from the invite

---

## Architecture

### Firestore collections (15)

| Collection | Purpose |
|------------|---------|
| `profiles` | User workspace fields (role, status, must_reset_password) |
| `projects` | Workspace projects |
| `project_members` | Project ↔ user membership |
| `tasks` | Kanban tasks |
| `comments` | Task comments |
| `time_logs` | Work tracker entries |
| `events` | Calendar events |
| `sticky_notes` | Blackboard notes |
| `settings` | Key/value workspace settings (doc id = key) |
| `app_categories` | App classification rules (doc id = pattern) |
| `agent_devices` | Desktop agent machines |
| `app_usage` | Per-app usage from agent |
| `sessions_activity` | Daily productivity rollups |
| `activity_logs` | Audit trail |
| `presence` | Blackboard live viewers (doc id = user id) |
| `user_invites` | Pending team members (doc id = email) |
| `meta` | App bootstrap flags (`meta/app`) |

### Security model

- **Firestore Security Rules** enforce all access (see `firestore.rules`)
- Admin role stored in **`profiles.role`** (read by rules via `get()`)
- Staff task updates limited to `status`, `progress`, `position`
- First admin bootstrap + default seed data allowed before `meta/app.setupComplete`

### Modules (12)

Dashboard, Projects, Tasks/Kanban, Task Detail Drawer, Calendar, Blackboard, Work Tracker, Productivity, Reports & Logs, Settings, User Management, Profile.

---

## Scripts

```bash
npm run dev        # Start dev server
npm run build      # Production build → dist/
npm run typecheck  # TypeScript check
npm run lint       # ESLint
npm run preview    # Preview production build
```

## Deployment

### Hosting (Firebase)

```bash
npm run build
firebase deploy --only hosting
```

Or deploy everything:

```bash
firebase deploy
```

Ensure all `VITE_FIREBASE_*` env vars are set **before** `npm run build` (they are baked into the static bundle).

---

## Notes

- The `functions/` folder is optional legacy reference; the app runs without deploying Cloud Functions on Spark.
