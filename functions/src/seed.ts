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

export async function seedDefaults(db: FirebaseFirestore.Firestore) {
  const now = new Date().toISOString();
  const batch = db.batch();

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const ref = db.collection("settings").doc(key);
    batch.set(ref, { key, value, updated_at: now }, { merge: true });
  }

  for (const { pattern, category } of DEFAULT_APP_CATEGORIES) {
    const ref = db.collection("app_categories").doc(pattern);
    batch.set(ref, { pattern, category, created_by: null, created_at: now }, { merge: true });
  }

  await batch.commit();
}
