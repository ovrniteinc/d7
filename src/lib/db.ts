import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
  type WhereFilterOp,
} from "firebase/firestore";
import { db } from "./firebase";

export const COL = {
  profiles: "profiles",
  projects: "projects",
  projectMembers: "project_members",
  tasks: "tasks",
  comments: "comments",
  taskAttachments: "task_attachments",
  timeLogs: "time_logs",
  events: "events",
  stickyNotes: "sticky_notes",
  settings: "settings",
  appCategories: "app_categories",
  agentDevices: "agent_devices",
  appUsage: "app_usage",
  sessionsActivity: "sessions_activity",
  activityLogs: "activity_logs",
  notifications: "notifications",
  presence: "presence",
  meta: "meta",
  userInvites: "user_invites",
} as const;

type ColName = (typeof COL)[keyof typeof COL];

export type WhereClause = [string, WhereFilterOp, unknown];
export type OrderClause = [string, "asc" | "desc"];

export interface QueryOptions {
  where?: WhereClause[];
  orderBy?: OrderClause[];
  limit?: number;
}

function toIso(value: unknown): string {
  if (!value) return new Date(0).toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return String(value);
}

function normalizeDoc<T extends DocumentData>(id: string, data: DocumentData): T {
  const out: Record<string, unknown> = { id, ...data };
  for (const key of ["created_at", "updated_at", "started_at", "ended_at", "start_at", "end_at", "last_seen", "activity_date"]) {
    if (key in out && out[key] != null) {
      out[key] = key === "activity_date" ? String(out[key]).slice(0, 10) : toIso(out[key]);
    }
  }
  if ("project_id" in out && "status" in out) {
    if (!Array.isArray(out.assignee_ids)) {
      out.assignee_ids =
        typeof out.assignee_id === "string" && out.assignee_id ? [out.assignee_id] : [];
    } else {
      out.assignee_ids = [...new Set((out.assignee_ids as string[]).filter(Boolean))];
    }
    delete out.assignee_id;
  }
  if ("author_id" in out && "x" in out && "y" in out) {
    if (typeof out.board_id !== "string" || !out.board_id) out.board_id = "root";
    if (typeof out.type !== "string") out.type = "note";
    if (typeof out.url !== "string") out.url = null;
    if (typeof out.image_url !== "string") out.image_url = null;
    if (!Array.isArray(out.todos)) out.todos = [];
    if (typeof out.width !== "number") out.width = out.type === "image" ? 280 : 220;
    if (typeof out.height !== "number") out.height = out.type === "todo" ? 200 : out.type === "image" ? 200 : 160;
  }
  return out as T;
}

function buildConstraints(options?: QueryOptions): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  for (const [field, op, value] of options?.where || []) {
    constraints.push(where(field, op, value));
  }
  for (const [field, dir] of options?.orderBy || []) {
    constraints.push(orderBy(field, dir));
  }
  if (options?.limit) constraints.push(limit(options.limit));
  return constraints;
}

export async function listDocs<T extends DocumentData>(col: ColName, options?: QueryOptions): Promise<T[]> {
  const q = query(collection(db, col), ...buildConstraints(options));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeDoc<T>(d.id, d.data()));
}

export async function getDocById<T extends DocumentData>(col: ColName, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, col, id));
  if (!snap.exists()) return null;
  return normalizeDoc<T>(snap.id, snap.data());
}

export async function createDoc<T extends DocumentData>(
  col: ColName,
  data: DocumentData,
  id?: string,
): Promise<T> {
  const now = new Date().toISOString();
  const payload = {
    ...data,
    created_at: data.created_at ?? now,
    updated_at: data.updated_at ?? now,
  };
  if (id) {
    await setDoc(doc(db, col, id), payload);
    return normalizeDoc<T>(id, payload);
  }
  const ref = await addDoc(collection(db, col), payload);
  return normalizeDoc<T>(ref.id, payload);
}

export async function patchDoc(col: ColName, id: string, data: DocumentData): Promise<void> {
  await updateDoc(doc(db, col, id), {
    ...data,
    updated_at: new Date().toISOString(),
  });
}

export async function upsertDoc(col: ColName, id: string, data: DocumentData): Promise<void> {
  await setDoc(
    doc(db, col, id),
    {
      ...data,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function removeDoc(col: ColName, id: string): Promise<void> {
  await deleteDoc(doc(db, col, id));
}

export async function removeWhere(col: ColName, field: string, value: unknown): Promise<void> {
  const rows = await listDocs<{ id: string }>(col, { where: [[field, "==", value]] });
  await Promise.all(rows.map((r) => removeDoc(col, r.id)));
}

export function watchCollection<T extends DocumentData>(
  col: ColName,
  options: QueryOptions | undefined,
  callback: (rows: T[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, col), ...buildConstraints(options));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => normalizeDoc<T>(d.id, d.data())));
    },
    (err) => {
      console.error(`watchCollection ${col} error`, err);
      onError?.(err);
    },
  );
}
