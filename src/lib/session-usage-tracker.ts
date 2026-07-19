import { COL, createDoc, listDocs, patchDoc, upsertDoc } from "./db";
import { rollupAppUsage } from "./functions";
import type { AppCategory, AppCategoryRule } from "./types";

const POLL_MS = 5000;
const HEARTBEAT_MS = 30000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentUsageId: string | null = null;
let currentKey: string | null = null;
let startedMs = 0;
let activeUserId: string | null = null;
let categoryRules: AppCategoryRule[] = [];

function browserDeviceId(userId: string) {
  return `${userId}_browser`;
}

function classify(appName: string, windowTitle: string): AppCategory {
  const haystack = `${appName} ${windowTitle}`.toLowerCase();
  for (const rule of categoryRules) {
    if (haystack.includes(rule.pattern.toLowerCase())) {
      return rule.category;
    }
  }
  return "neutral";
}

function currentContext() {
  const appName = "Browser";
  const windowTitle = document.hidden
    ? "Inactive tab"
    : document.title || "District 7";
  return { appName, windowTitle, key: `${appName}::${windowTitle}` };
}

async function touchBrowserDevice(userId: string, tracking: boolean) {
  const now = new Date().toISOString();
  await upsertDoc(COL.agentDevices, browserDeviceId(userId), {
    user_id: userId,
    device_name: "Browser (Work Tracker)",
    os: navigator.platform || "web",
    agent_version: "web",
    last_seen: now,
    is_tracking: tracking,
    created_at: now,
  });
}

async function endCurrentSession() {
  if (!currentUsageId) return;
  const durationSeconds = Math.max(1, Math.round((Date.now() - startedMs) / 1000));
  await patchDoc(COL.appUsage, currentUsageId, {
    ended_at: new Date().toISOString(),
    duration_seconds: durationSeconds,
  });
  if (durationSeconds >= 3) {
    await rollupAppUsage(currentUsageId);
  }
  currentUsageId = null;
  currentKey = null;
}

async function openSession(userId: string, appName: string, windowTitle: string, key: string) {
  if (currentKey === key && currentUsageId) return;

  await endCurrentSession();

  const startedAt = new Date().toISOString();
  const doc = await createDoc(COL.appUsage, {
    user_id: userId,
    device_id: browserDeviceId(userId),
    app_name: appName,
    window_title: windowTitle,
    category: classify(appName, windowTitle),
    started_at: startedAt,
    ended_at: null,
    duration_seconds: null,
    source: "auto",
  });

  currentUsageId = doc.id;
  currentKey = key;
  startedMs = Date.now();
}

async function tick() {
  if (!activeUserId) return;
  const { appName, windowTitle, key } = currentContext();
  await openSession(activeUserId, appName, windowTitle, key);
}

function onActivityChange() {
  tick().catch((err) => console.warn("session usage tick failed", err));
}

function clearTimers() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  document.removeEventListener("visibilitychange", onActivityChange);
  window.removeEventListener("focus", onActivityChange);
}

export function isSessionUsageTracking(userId?: string) {
  return !!activeUserId && (!userId || activeUserId === userId);
}

export async function startSessionUsageTracker(userId: string) {
  if (isSessionUsageTracking(userId)) return;

  await stopSessionUsageTracker();

  activeUserId = userId;
  categoryRules = await listDocs<AppCategoryRule>(COL.appCategories);
  categoryRules.sort((a, b) => b.pattern.length - a.pattern.length);

  await touchBrowserDevice(userId, true);
  await tick();

  document.addEventListener("visibilitychange", onActivityChange);
  window.addEventListener("focus", onActivityChange);

  pollTimer = setInterval(() => {
    tick().catch((err) => console.warn("session usage poll failed", err));
  }, POLL_MS);

  heartbeatTimer = setInterval(() => {
    if (!activeUserId) return;
    touchBrowserDevice(activeUserId, true).catch(() => {});
  }, HEARTBEAT_MS);
}

export async function stopSessionUsageTracker() {
  const userId = activeUserId;
  clearTimers();
  await endCurrentSession();
  if (userId) {
    await touchBrowserDevice(userId, false).catch(() => {});
  }
  activeUserId = null;
  categoryRules = [];
}

export async function resumeSessionUsageTrackerIfNeeded(userId: string) {
  const rows = await listDocs<{ id: string; ended_at: string | null }>(COL.timeLogs, {
    where: [["user_id", "==", userId]],
    orderBy: [["started_at", "desc"]],
    limit: 5,
  });
  const active = rows.find((row) => !row.ended_at);
  if (active) {
    await startSessionUsageTracker(userId);
  }
}
