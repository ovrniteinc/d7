/** Normalize legacy single assignee_id into assignee_ids. */
export function normalizeAssigneeIds(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.assignee_ids)) {
    return [...new Set(data.assignee_ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  }
  if (typeof data.assignee_id === "string" && data.assignee_id) {
    return [data.assignee_id];
  }
  return [];
}

export function taskHasAssignee(task: { assignee_ids: string[] }, userId: string): boolean {
  return task.assignee_ids.includes(userId);
}

export function newAssigneeIds(previous: string[], next: string[]): string[] {
  const prev = new Set(previous);
  return next.filter((id) => !prev.has(id));
}

export function resolveAssignees(ids: string[], users: Record<string, { id: string; name: string; email: string; avatar_url: string | null }>): {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}[] {
  return ids.map((id) => users[id]).filter(Boolean);
}
