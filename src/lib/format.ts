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
  const h = totalSeconds / 3600;
  if (h < 1) return `${Math.round(totalSeconds / 60)}m`;
  return `${h.toFixed(1)}h`;
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
