import activeWin from "active-win";
import { hostname, platform, release } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db, signInAgent } from "./firebase.js";
import { classifyApp, type CategoryRule } from "./classify.js";
import { rollupAppUsage } from "./rollup.js";

const AGENT_VERSION = "1.0.0";
const POLL_MS = 2000;
const HEARTBEAT_MS = 15000;
const DEVICE_FILE = join(dirname(fileURLToPath(import.meta.url)), "../.d7-device-id");

interface CurrentSession {
  id: string;
  appName: string;
  windowTitle: string;
  startedMs: number;
}

let currentSession: CurrentSession | null = null;
let categoryRules: CategoryRule[] = [];
let deviceId: string | null = null;
let stopping = false;

async function loadCategoryRules() {
  const snap = await getDocs(collection(db, "app_categories"));
  categoryRules = snap.docs
    .map((d) => d.data() as CategoryRule)
    .sort((a, b) => b.pattern.length - a.pattern.length);
}

function readSavedDeviceId() {
  if (!existsSync(DEVICE_FILE)) return null;
  return readFileSync(DEVICE_FILE, "utf8").trim() || null;
}

function saveDeviceId(id: string) {
  writeFileSync(DEVICE_FILE, id, "utf8");
}

async function registerDevice(userId: string) {
  const saved = readSavedDeviceId();
  const now = new Date().toISOString();

  if (saved) {
    deviceId = saved;
    await updateDoc(doc(db, "agent_devices", saved), {
      last_seen: now,
      is_tracking: true,
      agent_version: AGENT_VERSION,
    }).catch(async () => {
      deviceId = null;
      await createDevice(userId, now);
    });
    return;
  }

  await createDevice(userId, now);
}

async function createDevice(userId: string, now: string) {
  const ref = await addDoc(collection(db, "agent_devices"), {
    user_id: userId,
    device_name: hostname(),
    os: `${platform()} ${release()}`,
    agent_version: AGENT_VERSION,
    last_seen: now,
    is_tracking: true,
    created_at: now,
  });
  deviceId = ref.id;
  saveDeviceId(ref.id);
}

async function heartbeat() {
  if (!deviceId || stopping) return;
  await updateDoc(doc(db, "agent_devices", deviceId), {
    last_seen: new Date().toISOString(),
    is_tracking: true,
  });
}

async function endSession(session: CurrentSession) {
  const endedAt = new Date().toISOString();
  const durationSeconds = Math.max(1, Math.round((Date.now() - session.startedMs) / 1000));

  await updateDoc(doc(db, "app_usage", session.id), {
    ended_at: endedAt,
    duration_seconds: durationSeconds,
  });

  if (durationSeconds >= 3) {
    await rollupAppUsage(db, session.id);
  }
}

async function startSession(userId: string, appName: string, windowTitle: string) {
  const category = classifyApp(appName, windowTitle, categoryRules);
  const startedAt = new Date().toISOString();

  const ref = await addDoc(collection(db, "app_usage"), {
    user_id: userId,
    device_id: deviceId,
    app_name: appName,
    window_title: windowTitle,
    category,
    started_at: startedAt,
    ended_at: null,
    duration_seconds: null,
    source: "agent",
    created_at: startedAt,
  });

  currentSession = {
    id: ref.id,
    appName,
    windowTitle,
    startedMs: Date.now(),
  };
}

async function pollActiveWindow(userId: string) {
  if (stopping) return;

  const win = await activeWin();
  if (!win?.owner?.name) return;

  const appName = win.owner.name;
  const windowTitle = win.title || "";

  if (
    currentSession &&
    currentSession.appName === appName &&
    currentSession.windowTitle === windowTitle
  ) {
    return;
  }

  if (currentSession) {
    await endSession(currentSession);
    currentSession = null;
  }

  await startSession(userId, appName, windowTitle);
  console.log(`[track] ${appName} — ${windowTitle.slice(0, 60)}`);
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping agent…");

  if (currentSession) {
    await endSession(currentSession);
    currentSession = null;
  }

  if (deviceId) {
    await updateDoc(doc(db, "agent_devices", deviceId), {
      is_tracking: false,
      last_seen: new Date().toISOString(),
    }).catch(() => {});
  }

  process.exit(0);
}

async function main() {
  console.log("District 7 desktop agent");
  console.log("Signing in…");

  const user = await signInAgent();
  console.log(`Signed in as ${user.email}`);

  await loadCategoryRules();
  console.log(`Loaded ${categoryRules.length} app category rules`);

  await registerDevice(user.uid);
  console.log(`Device registered (${deviceId})`);
  console.log("Tracking active windows. Press Ctrl+C to stop.\n");

  await pollActiveWindow(user.uid);

  setInterval(() => {
    pollActiveWindow(user.uid).catch((err) => console.error("Poll failed:", err.message));
  }, POLL_MS);

  setInterval(() => {
    heartbeat().catch((err) => console.error("Heartbeat failed:", err.message));
  }, HEARTBEAT_MS);

  setInterval(() => {
    loadCategoryRules().catch(() => {});
  }, 5 * 60 * 1000);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
