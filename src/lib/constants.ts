import type { KanbanColumn, Priority, ShadeKey, TaskStatus } from "./types";

export const SHADES: Record<ShadeKey, { ring: string; chip: string; dot: string; label: string }> = {
  graphite: { ring: "rgba(255,255,255,0.22)", chip: "rgba(255,255,255,0.12)", dot: "rgba(255,255,255,0.85)", label: "Graphite" },
  ash:      { ring: "rgba(255,255,255,0.16)", chip: "rgba(255,255,255,0.08)", dot: "rgba(255,255,255,0.65)", label: "Ash" },
  slate:    { ring: "rgba(255,255,255,0.30)", chip: "rgba(255,255,255,0.16)", dot: "rgba(255,255,255,1)",    label: "Slate" },
  onyx:     { ring: "rgba(255,255,255,0.10)", chip: "rgba(255,255,255,0.05)", dot: "rgba(255,255,255,0.45)", label: "Onyx" },
  pearl:    { ring: "rgba(255,255,255,0.50)", chip: "rgba(255,255,255,0.22)", dot: "rgba(255,255,255,1)",    label: "Pearl" },
};

export const SHADE_KEYS: ShadeKey[] = ["graphite", "ash", "slate", "onyx", "pearl"];

export function getShade(key?: string) {
  return SHADES[(key as ShadeKey)] ?? SHADES.graphite;
}

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export const PRIORITY_DOTS: Record<Priority, string> = {
  low: "rgba(255,255,255,0.35)",
  medium: "rgba(255,255,255,0.6)",
  high: "rgba(255,255,255,0.85)",
  urgent: "rgba(255,255,255,1)",
};

export const TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "review", "done"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

export const DEFAULT_IDLE_TIMEOUT = 300;
export const DEFAULT_WORKSPACE_NAME = "District 7";

export const ADMIN_NAV = [
  { key: "reports", label: "Reports & Logs", adminOnly: true },
  { key: "user-management", label: "User Management", adminOnly: true },
  { key: "settings", label: "Settings", adminOnly: true },
] as const;
