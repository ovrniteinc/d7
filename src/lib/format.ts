import { formatDistanceToNow, formatDuration, intervalToDuration } from "date-fns";

function toValidDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtRelative(date: string | Date | null | undefined): string {
  const d = toValidDate(date);
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

export function fmtDate(date: string | Date | null | undefined): string {
  const d = toValidDate(date);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(date: string | Date | null | undefined): string {
  const d = toValidDate(date);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function fmtDurationShort(totalSeconds: number): string {
  const d = intervalToDuration({ start: 0, end: totalSeconds * 1000 });
  return formatDuration(d, { delimiter: ", " }) || "0s";
}

export function fmtHours(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const h = totalSeconds / 3600;
  if (h < 1) return `${Math.floor(totalSeconds / 60)}m`;
  return `${h.toFixed(1)}h`;
}

/** Human-readable duration for app usage rows (includes seconds and active sessions). */
export function fmtUsageDuration(
  totalSeconds: number | null | undefined,
  isActive?: boolean,
): string {
  if (totalSeconds == null) return isActive ? "Active" : "—";
  return fmtHours(totalSeconds);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ACTIVITY_LABELS: Record<string, string> = {
  "system.setup_admin": "Initial admin setup completed",
  "project.create": "Created a project",
  "project.update": "Updated a project",
  "project.delete": "Deleted a project",
  "task.create": "Created a task",
  "task.update": "Updated a task",
  "task.delete": "Deleted a task",
  "task.move": "Moved a task",
  "event.create": "Created an event",
  "event.update": "Updated an event",
  "event.delete": "Deleted an event",
  "user.create": "Created a user",
  "user.update": "Updated a user",
  "user.delete": "Deleted a user",
  "user.role_update": "Changed a user's role",
  "user.status_change": "Changed a user's status",
  "user.provisioned": "User joined the workspace",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  active: "Active",
  inactive: "Inactive",
  admin: "Admin",
  staff: "Staff",
};

function labelValue(value: unknown): string {
  if (value == null) return "";
  const key = String(value);
  return STATUS_LABELS[key] || key.replace(/_/g, " ");
}

export function fmtActivityAction(action: string, meta?: Record<string, unknown>): string {
  if (action === "task.move" && meta?.to) {
    return `Moved a task to ${labelValue(meta.to)}`;
  }
  if (action === "task.create" && meta?.title) {
    return `Created task “${meta.title}”`;
  }
  if (action === "user.status_change" && meta?.to) {
    return `Changed user status to ${labelValue(meta.to)}`;
  }
  if (action === "user.role_update" && meta?.role) {
    return `Changed user role to ${labelValue(meta.role)}`;
  }
  if (ACTIVITY_LABELS[action]) return ACTIVITY_LABELS[action];

  return action
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
