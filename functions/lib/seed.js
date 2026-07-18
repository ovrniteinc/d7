"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_APP_CATEGORIES = exports.DEFAULT_SETTINGS = void 0;
exports.seedDefaults = seedDefaults;
exports.DEFAULT_SETTINGS = {
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
exports.DEFAULT_APP_CATEGORIES = [
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
async function seedDefaults(db) {
    const now = new Date().toISOString();
    const batch = db.batch();
    for (const [key, value] of Object.entries(exports.DEFAULT_SETTINGS)) {
        const ref = db.collection("settings").doc(key);
        batch.set(ref, { key, value, updated_at: now }, { merge: true });
    }
    for (const { pattern, category } of exports.DEFAULT_APP_CATEGORIES) {
        const ref = db.collection("app_categories").doc(pattern);
        batch.set(ref, { pattern, category, created_by: null, created_at: now }, { merge: true });
    }
    await batch.commit();
}
//# sourceMappingURL=seed.js.map