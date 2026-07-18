import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import {
  COL,
  createDoc,
  getDocById,
  listDocs,
  patchDoc,
  removeDoc,
  upsertDoc,
} from "./db";
import { seedDefaults } from "./seed";
import type { SessionActivity, TimeLog, UserInvite } from "./types";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function setupInitialAdmin(email?: string, password?: string, name?: string) {
  const adminEmail = email || "admin@district7.local";
  const adminPassword = password || "District7!2024";
  const adminName = name || "District Admin";

  if (adminPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const setup = await getDocById<{ setupComplete?: boolean }>(COL.meta, "app");
  if (setup?.setupComplete) {
    throw new Error("Admin already exists");
  }

  let uid: string;
  try {
    const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    uid = cred.user.uid;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/email-already-in-use") {
      throw new Error(
        "This email already exists in Firebase Auth. Remove it under Authentication → Users in Firebase Console, then try again.",
      );
    }
    throw error;
  }

  const existingProfile = await getDocById(COL.profiles, uid);
  if (existingProfile) {
    await signOut(auth);
    throw new Error("An admin profile already exists for this account.");
  }

  const now = new Date().toISOString();

  await createDoc(
    COL.profiles,
    {
      email: adminEmail,
      name: adminName,
      title: "Administrator",
      role: "admin",
      status: "active",
      must_reset_password: false,
      avatar_url: null,
      notif_prefs: {},
    },
    uid,
  );

  await seedDefaults();
  await upsertDoc(COL.meta, "app", { setupComplete: true, updated_at: now });
  await logActivity("system.setup_admin", "user", uid, { email: adminEmail });

  await signOut(auth);

  return { ok: true, email: adminEmail, id: uid };
}

export async function createTeamUser(input: {
  name: string;
  title: string;
  email: string;
  role: "admin" | "staff";
  password: string;
}) {
  const email = normalizeEmail(input.email);
  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  await upsertDoc(COL.userInvites, email, {
    email,
    name: input.name,
    title: input.title || "",
    role: input.role,
    must_reset_password: true,
    created_at: new Date().toISOString(),
  });

  return {
    id: email,
    email: input.email,
    name: input.name,
    role: input.role,
    password: input.password,
    needsConsoleAuth: true,
  };
}

export async function updateUserRole(userId: string, role: "admin" | "staff") {
  await patchDoc(COL.profiles, userId, { role });
  await logActivity("user.role_update", "user", userId, { role });
  return { ok: true };
}

export async function logActivity(
  action: string,
  entityType?: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    await createDoc(COL.activityLogs, {
      user_id: user.uid,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      meta: meta || {},
    });
  } catch (e) {
    console.warn("logActivity failed", e);
  }
}

export async function rollupTimeLog(logId: string) {
  try {
    const log = await getDocById<TimeLog>(COL.timeLogs, logId);
    if (!log?.ended_at || !log.duration_seconds) return;

    const dateStr = log.started_at.slice(0, 10);
    const focusSeconds = log.source === "timer" ? log.duration_seconds : 0;

    const existing = await listDocs<SessionActivity>(COL.sessionsActivity, {
      where: [
        ["user_id", "==", log.user_id],
        ["activity_date", "==", dateStr],
      ],
      limit: 1,
    });

    const row = existing[0];
    const focus = (row?.focus_seconds || 0) + focusSeconds;
    const idle = row?.idle_seconds || 0;
    const distraction = row?.distraction_seconds || 0;
    const tracked = focus + idle + distraction;
    const score = tracked > 0 ? Math.round((focus / tracked) * 100) : 0;
    const now = new Date().toISOString();

    if (row) {
      await patchDoc(COL.sessionsActivity, row.id, {
        focus_seconds: focus,
        productivity_score: score,
      });
    } else {
      await createDoc(COL.sessionsActivity, {
        user_id: log.user_id,
        activity_date: dateStr,
        focus_seconds: focus,
        idle_seconds: 0,
        distraction_seconds: 0,
        productivity_score: score,
        updated_at: now,
      });
    }
  } catch (e) {
    console.warn("rollupTimeLog failed", e);
  }
}

export async function rollupAppUsage(usageId: string) {
  try {
    const usage = await getDocById<{
      user_id: string;
      started_at: string;
      ended_at: string | null;
      duration_seconds: number | null;
      category: string;
    }>(COL.appUsage, usageId);
    if (!usage?.ended_at || !usage.duration_seconds) return;

    const dateStr = usage.started_at.slice(0, 10);
    const category = usage.category || "neutral";
    const seconds = usage.duration_seconds;

    const existing = await listDocs<SessionActivity>(COL.sessionsActivity, {
      where: [
        ["user_id", "==", usage.user_id],
        ["activity_date", "==", dateStr],
      ],
      limit: 1,
    });

    const row = existing[0];
    const focus = (row?.focus_seconds || 0) + (category === "work" ? seconds : 0);
    const idle = row?.idle_seconds || 0;
    const distraction =
      (row?.distraction_seconds || 0) + (category === "distraction" ? seconds : 0);
    const tracked = focus + idle + distraction;
    const score = tracked > 0 ? Math.round((focus / tracked) * 100) : 0;
    const now = new Date().toISOString();

    if (row) {
      await patchDoc(COL.sessionsActivity, row.id, {
        focus_seconds: focus,
        distraction_seconds: distraction,
        productivity_score: score,
      });
    } else {
      await createDoc(COL.sessionsActivity, {
        user_id: usage.user_id,
        activity_date: dateStr,
        focus_seconds: focus,
        idle_seconds: 0,
        distraction_seconds: distraction,
        productivity_score: score,
        updated_at: now,
      });
    }
  } catch (e) {
    console.warn("rollupAppUsage failed", e);
  }
}

export async function provisionProfileFromInvite(uid: string, email: string) {
  const key = normalizeEmail(email);
  const invite = await getDocById<UserInvite>(COL.userInvites, key);
  if (!invite) return null;

  const now = new Date().toISOString();
  const profile = {
    email: key,
    name: invite.name,
    title: invite.title,
    role: invite.role,
    status: "active" as const,
    must_reset_password: invite.must_reset_password,
    avatar_url: null,
    notif_prefs: {},
    created_at: now,
    updated_at: now,
  };

  await createDoc(COL.profiles, profile, uid);
  await removeDoc(COL.userInvites, key);
  await logActivity("user.provisioned", "user", uid, { email: key });

  return { id: uid, ...profile };
}
