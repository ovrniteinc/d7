import { useMemo, useRef, useState } from "react";
import type { Profile } from "../lib/types";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  users: Profile[];
  placeholder?: string;
  rows?: number;
  className?: string;
}

export default function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  rows = 4,
  className = "input",
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return users
      .filter((u) => {
        const name = (u.name || u.email).toLowerCase();
        return !q || name.includes(q) || u.email.toLowerCase().includes(q);
      })
      .slice(0, 6);
  }, [mentionQuery, users]);

  const detectMention = (text: string, cursor: number) => {
    const before = text.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    const fragment = before.slice(at + 1);
    if (fragment.includes(" ") || fragment.includes("\n") || fragment.includes("[")) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    setMentionStart(at);
    setMentionQuery(fragment);
  };

  const insertMention = (user: Profile) => {
    if (mentionStart === null || !ref.current) return;
    const cursor = ref.current.selectionStart;
    const label = user.name || user.email.split("@")[0];
    const token = `@[${label}](${user.id})`;
    const next = `${value.slice(0, mentionStart)}${token} ${value.slice(cursor)}`;
    onChange(next);
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      const pos = mentionStart + token.length + 1;
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={className}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detectMention(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => detectMention(e.currentTarget.value, e.currentTarget.selectionStart)}
        onKeyUp={(e) => detectMention(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
      />
      {mentionQuery !== null && suggestions.length > 0 && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 glass-strong rounded-xl overflow-hidden border border-white/10">
          {suggestions.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(u);
              }}
              className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/8 transition"
            >
              {u.name || u.email}
              <span className="text-white/35 text-xs ml-2">{u.email}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-white/30 mt-1">Type @ to mention someone · URLs become clickable links</p>
    </div>
  );
}
