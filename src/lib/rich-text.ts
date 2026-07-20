import type { ReactNode } from "react";
import { createElement } from "react";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]'"])/gi;
const MENTION_RE = /@\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g;

export function parseMentionIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    if (match[2]) ids.add(match[2]);
  }
  return [...ids];
}

export function newMentionIds(previous: string, next: string): string[] {
  const prev = new Set(parseMentionIds(previous));
  return parseMentionIds(next).filter((id) => !prev.has(id));
}

export function renderRichText(text: string): ReactNode[] {
  if (!text) return [];

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const combined = new RegExp(`${MENTION_RE.source}|${URL_RE.source}`, "gi");
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const full = match[0];
    const mention = full.match(MENTION_RE);
    if (mention) {
      parts.push(
        createElement(
          "span",
          { key: `${match.index}-m`, className: "text-white font-medium bg-white/10 rounded px-1" },
          `@${mention[1]}`,
        ),
      );
    } else {
      parts.push(
        createElement(
          "a",
          {
            key: `${match.index}-u`,
            href: full,
            target: "_blank",
            rel: "noreferrer",
            className: "text-sky-300 hover:text-sky-200 underline underline-offset-2 break-all",
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
          },
          full.replace(/^https?:\/\//, ""),
        ),
      );
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
