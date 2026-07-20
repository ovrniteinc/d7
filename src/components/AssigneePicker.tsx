import { Avatar } from "./ui";
import type { Profile } from "../lib/types";

export function AssigneeAvatars({ assignees, size = 20 }: { assignees: Profile[]; size?: number }) {
  if (!assignees.length) return null;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {assignees.slice(0, 3).map((a) => (
          <div key={a.id} className="rounded-full ring-2 ring-[#0a0a0a]" style={{ width: size, height: size }}>
            <Avatar name={a.name} url={a.avatar_url} size={size} />
          </div>
        ))}
      </div>
      {assignees.length > 3 && (
        <span className="ml-1.5 text-[10px] text-white/40">+{assignees.length - 3}</span>
      )}
    </div>
  );
}

export function AssigneeMultiSelect({
  users,
  value,
  onChange,
}: {
  users: Profile[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="glass rounded-xl p-2 max-h-44 overflow-y-auto space-y-0.5">
      {!users.length && <p className="text-xs text-white/40 px-2 py-1">No team members</p>}
      {users.map((u) => (
        <label
          key={u.id}
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={value.includes(u.id)}
            onChange={() => toggle(u.id)}
            className="accent-white"
          />
          <Avatar name={u.name} url={u.avatar_url} size={22} />
          <span className="text-sm text-white/75 truncate">{u.name || u.email}</span>
        </label>
      ))}
    </div>
  );
}

export function AssigneeList({ assignees }: { assignees: Profile[] }) {
  if (!assignees.length) {
    return <span className="text-sm text-white/40">Unassigned</span>;
  }

  return (
    <div className="space-y-2">
      {assignees.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <Avatar name={a.name} url={a.avatar_url} size={24} />
          <span className="text-sm text-white/75">{a.name || a.email}</span>
        </div>
      ))}
    </div>
  );
}
