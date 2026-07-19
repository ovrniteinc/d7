# District 7 Desktop Agent

Syncs **active app usage** from your computer into District 7 (Productivity → App usage timeline, Reports → App Usage, Settings → Agent devices).

## What it tracks

- Application name (e.g. `Cursor.exe`, `chrome.exe`)
- Window title
- Time spent in each app
- Category: **work**, **neutral**, or **distraction** (from Settings → App categories)

It does **not** record keystrokes, screenshots, or full browsing history.

## Requirements

- **Windows** or **macOS** (uses the `active-win` library)
- Node.js 18+
- A District 7 user account (same email/password as the web app)
- Firebase env vars (same project as the web app)

## Using with the deployed web app (Vercel)

The agent does **not** get deployed with the website. That is expected.

| Component | Where it runs | Purpose |
|-----------|---------------|---------|
| Web app | Vercel (browser) | UI — tasks, blackboard, productivity charts |
| Desktop agent | Each user's PC | Syncs app usage into Firebase |
| Firebase | Cloud | Shared database for both |

When a user opens `https://your-app.vercel.app`, they use the live site. On their computer they separately run `npm start` in the `agent` folder. Data goes to the **same Firestore** as the deployed app, so **App usage timeline** fills in on the live site.

### Distributing to your team

1. **Developers** — clone the repo, use root `.env`, run `cd agent && npm start`.
2. **Other staff** — admin sends:
   - the `agent` folder (or full repo zip),
   - Firebase config values (from `.env`, not secret — same as in the web build),
   - each person adds their own `D7_AGENT_EMAIL` / `D7_AGENT_PASSWORD`.
3. **Optional later** — package as a Windows `.exe` so staff do not need Node.js (not included yet).

Users only need the agent running on machines they want tracked. They do **not** need the web dev server.

## Setup

1. From the project root, make sure `.env` has your Firebase config (already used by the web app).

2. Add your login to `.env`:

```env
D7_AGENT_EMAIL=your@email.com
D7_AGENT_PASSWORD=your-password
```

3. Install and run the agent:

```bash
cd agent
npm install
npm start
```

4. Open **Productivity** in the web app — after a few minutes of switching apps, entries appear under **App usage timeline**.

5. Your device shows under **Settings → Agent devices**.

## Commands

```bash
npm start   # run the agent
npm run dev # run with auto-restart on code changes
```

Press **Ctrl+C** to stop. The agent marks the device as not tracking when it exits.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Missing environment variable` | Copy Firebase values from `.env` at project root |
| `Set D7_AGENT_EMAIL…` | Add email/password to `.env` |
| No data in timeline | Keep the agent running while using apps; sessions need a few seconds per app |
| Permission errors on macOS | Grant **Accessibility** permission to Terminal / Node in System Settings |

## Privacy

Only run this on machines where users have agreed to tracking. Admins can remove devices from Settings.
