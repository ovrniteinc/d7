export type AppCategory = "work" | "neutral" | "distraction";

export interface CategoryRule {
  pattern: string;
  category: AppCategory;
}

export function classifyApp(appName: string, windowTitle: string, rules: CategoryRule[]): AppCategory {
  const haystack = `${appName} ${windowTitle}`.toLowerCase();
  for (const rule of rules) {
    if (haystack.includes(rule.pattern.toLowerCase())) {
      return rule.category;
    }
  }
  return "neutral";
}
