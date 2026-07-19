import { z } from "zod";

const documentId = z.string().min(1, "Required");
const nullableDocumentId = z.string().min(1).nullable();

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password required"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Minimum 8 characters"),
    confirm: z.string().min(8, "Minimum 8 characters"),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const projectSchema = z.object({
  name: z.string().min(2, "Name too short").max(80, "Name too long"),
  description: z.string().max(500).optional().default(""),
  color: z.enum(["graphite", "ash", "slate", "onyx", "pearl"]),
  status: z.enum(["active", "on_hold", "archived"]),
  memberIds: z.array(z.string()).default([]),
});

export const taskSchema = z.object({
  title: z.string().min(2, "Title too short").max(140, "Title too long"),
  description: z.string().max(2000).optional().default(""),
  project_id: documentId,
  assignee_id: nullableDocumentId,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["backlog", "todo", "in_progress", "review", "done"]),
  due_date: z.string().nullable(),
});

export const eventSchema = z.object({
  title: z.string().min(2, "Title too short").max(120),
  description: z.string().max(500).optional().default(""),
  start_at: z.string(),
  end_at: z.string(),
  type: z.enum(["company", "personal"]),
  project_id: nullableDocumentId,
});

export const userSchema = z.object({
  name: z.string().min(2, "Name too short"),
  title: z.string().max(80).optional().default(""),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "staff"]),
  password: z.string().min(8, "Minimum 8 characters"),
});

export const settingsGeneralSchema = z.object({
  workspace_name: z.string().min(1).max(60),
  idle_timeout_seconds: z.number().int().min(30, "Minimum 30 seconds").max(3600),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ProjectValues = z.infer<typeof projectSchema>;
export type TaskValues = z.infer<typeof taskSchema>;
export type EventValues = z.infer<typeof eventSchema>;
export type UserValues = z.infer<typeof userSchema>;
export type SettingsGeneralValues = z.infer<typeof settingsGeneralSchema>;
