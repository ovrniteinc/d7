import { COL, upsertDoc } from "./db";

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  workspace_name: "District 7",
  idle_timeout_seconds: 300,
  kanban_columns: [
    { id: "backlog", title: "Backlog" },
    { id: "todo", title: "To Do" },
    { id: "in_progress", title: "In Progress" },
    { id: "review", title: "Review" },
    { id: "done", title: "Done" },
  ],
};

export const DEFAULT_APP_CATEGORIES: Array<{ pattern: string; category: string }> = [
  { pattern: "code", category: "work" },
  { pattern: "vscode", category: "work" },
  { pattern: "figma", category: "work" },
  { pattern: "notion", category: "work" },
  { pattern: "slack", category: "work" },
  { pattern: "terminal", category: "work" },
  { pattern: "word", category: "work" },
  { pattern: "excel", category: "work" },
  { pattern: "outlook", category: "work" },
  { pattern: "district 7", category: "work" },
  { pattern: "postman", category: "work" },
  { pattern: "intellij", category: "work" },
  { pattern: "xcode", category: "work" },
  { pattern: "git", category: "work" },
  { pattern: "docker", category: "work" },
  { pattern: "chrome", category: "neutral" },
  { pattern: "safari", category: "neutral" },
  { pattern: "firefox", category: "neutral" },
  { pattern: "spotify", category: "neutral" },
  { pattern: "discord", category: "neutral" },
  { pattern: "steam", category: "distraction" },
  { pattern: "csgo.exe", category: "distraction" },
  { pattern: "youtube", category: "distraction" },
  { pattern: "netflix", category: "distraction" },
  { pattern: "twitch", category: "distraction" },
  { pattern: "twitter", category: "distraction" },
  { pattern: "instagram", category: "distraction" },
  { pattern: "facebook", category: "distraction" },
  { pattern: "reddit", category: "distraction" },
  { pattern: "tiktok", category: "distraction" },
];

export async function seedDefaults() {
  const now = new Date().toISOString();
  await Promise.all([
    ...Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
      upsertDoc(COL.settings, key, { key, value, updated_at: now }),
    ),
    ...DEFAULT_APP_CATEGORIES.map(({ pattern, category }) =>
      upsertDoc(COL.appCategories, pattern, {
        pattern,
        category,
        created_by: null,
        created_at: now,
      }),
    ),
  ]);
}
