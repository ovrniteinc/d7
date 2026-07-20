import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { COL, createDoc, getDocById } from "./db";
import type { NotificationType, Profile } from "./types";

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, COL.notifications, id), { read: true });
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;

  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.update(doc(db, COL.notifications, id), { read: true });
    }
    await batch.commit();
  }
}

const PREF_BY_TYPE: Record<NotificationType, string> = {
  task_assigned: "task_assigned",
  comment_on_task: "comment_on_task",
  daily_summary: "daily_summary",
};

function prefEnabled(profile: Profile, type: NotificationType) {
  const key = PREF_BY_TYPE[type];
  return profile.notif_prefs?.[key] !== false;
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported" as const;
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  return Notification.requestPermission();
}

export function showBrowserNotification(title: string, body: string, link?: string | null) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    icon: "/favicon.jpeg",
    tag: `${title}-${body}`.slice(0, 120),
  });
  n.onclick = () => {
    window.focus();
    if (link) window.location.href = link;
    n.close();
  };
}

async function sendEmailNotification(notificationId: string) {
  const user = auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

  try {
    await fetch("/api/send-notification-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notificationId, appUrl }),
    });
  } catch (e) {
    console.warn("Email notification failed", e);
  }
}

export async function notifyUser(input: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}) {
  if (input.recipientId === input.actorId) return;

  const recipient = await getDocById<Profile>(COL.profiles, input.recipientId);
  if (!recipient || recipient.status !== "active") return;
  if (!prefEnabled(recipient, input.type)) return;

  const doc = await createDoc(COL.notifications, {
    user_id: input.recipientId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    actor_id: input.actorId,
    read: false,
  });

  await sendEmailNotification(doc.id);
  return doc.id;
}

export async function notifyTaskAssignedMany(input: {
  recipientIds: string[];
  actorId: string;
  actorName: string;
  taskId: string;
  taskTitle: string;
}) {
  const unique = [...new Set(input.recipientIds.filter(Boolean))];
  await Promise.all(
    unique.map((recipientId) =>
      notifyTaskAssigned({
        recipientId,
        actorId: input.actorId,
        actorName: input.actorName,
        taskId: input.taskId,
        taskTitle: input.taskTitle,
      }).catch(() => {}),
    ),
  );
}

export async function notifyTaskCommentAssignees(input: {
  assigneeIds: string[];
  actorId: string;
  actorName: string;
  taskId: string;
  taskTitle: string;
  preview: string;
}) {
  const unique = [...new Set(input.assigneeIds.filter(Boolean))];
  await Promise.all(
    unique.map((recipientId) =>
      notifyTaskComment({
        recipientId,
        actorId: input.actorId,
        actorName: input.actorName,
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        preview: input.preview,
      }).catch(() => {}),
    ),
  );
}

export async function notifyTaskAssigned(input: {
  recipientId: string;
  actorId: string;
  actorName: string;
  taskId: string;
  taskTitle: string;
}) {
  return notifyUser({
    recipientId: input.recipientId,
    actorId: input.actorId,
    type: "task_assigned",
    title: "Task assigned to you",
    body: `${input.actorName} assigned “${input.taskTitle}” to you`,
    link: `/tasks?task=${input.taskId}`,
    entityType: "task",
    entityId: input.taskId,
  });
}

export async function notifyTaskComment(input: {
  recipientId: string;
  actorId: string;
  actorName: string;
  taskId: string;
  taskTitle: string;
  preview: string;
}) {
  return notifyUser({
    recipientId: input.recipientId,
    actorId: input.actorId,
    type: "comment_on_task",
    title: "New comment on your task",
    body: `${input.actorName} on “${input.taskTitle}”: ${input.preview}`,
    link: `/tasks?task=${input.taskId}`,
    entityType: "task",
    entityId: input.taskId,
  });
}
