export type Role = "admin" | "staff";
export type UserStatus = "active" | "inactive";
export type ShadeKey = "graphite" | "ash" | "slate" | "onyx" | "pearl";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "active" | "on_hold" | "archived";
export type EventType = "company" | "personal";
export type TimeLogSource = "timer" | "auto" | "manual" | "agent";
export type AppCategory = "work" | "neutral" | "distraction";

export interface Profile {
  id: string;
  email: string;
  name: string;
  title: string;
  role: Role;
  status: UserStatus;
  must_reset_password: boolean;
  avatar_url: string | null;
  notif_prefs: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: ShadeKey;
  status: ProjectStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  due_date: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface TimeLog {
  id: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  source: TimeLogSource;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  type: EventType;
  owner_id: string;
  project_id: string | null;
  created_at: string;
}

export interface StickyNote {
  id: string;
  author_id: string;
  body: string;
  color: ShadeKey;
  x: number;
  y: number;
  z: number;
  created_at: string;
  updated_at: string;
}

export interface Setting {
  key: string;
  value: any;
  updated_at: string;
}

export interface AppCategoryRule {
  pattern: string;
  category: AppCategory;
  created_by: string | null;
  created_at: string;
}

export interface AgentDevice {
  id: string;
  user_id: string;
  device_name: string;
  os: string;
  agent_version: string | null;
  last_seen: string;
  is_tracking: boolean;
  created_at: string;
}

export interface AppUsage {
  id: string;
  user_id: string;
  device_id: string | null;
  app_name: string;
  window_title: string;
  category: AppCategory;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  source: "auto" | "agent";
  created_at: string;
}

export interface SessionActivity {
  id: string;
  user_id: string;
  activity_date: string;
  focus_seconds: number;
  idle_seconds: number;
  distraction_seconds: number;
  productivity_score: number;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  meta: Record<string, any>;
  created_at: string;
}

export interface PresenceRow {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  last_seen: string;
}

export interface UserInvite {
  email: string;
  name: string;
  title: string;
  role: Role;
  must_reset_password: boolean;
  created_at: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
}
