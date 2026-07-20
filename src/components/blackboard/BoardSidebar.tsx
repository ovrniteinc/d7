import {
  StickyNote,
  Link2,
  CheckSquare,
  LayoutGrid,
  ImagePlus,
  Trash2,
} from "lucide-react";
import type { BoardItemType } from "../../lib/types";

const TOOLS: { type: BoardItemType | "image"; label: string; icon: typeof StickyNote }[] = [
  { type: "note", label: "Note", icon: StickyNote },
  { type: "link", label: "Link", icon: Link2 },
  { type: "todo", label: "To-do", icon: CheckSquare },
  { type: "board", label: "Board", icon: LayoutGrid },
];

interface BoardSidebarProps {
  onAdd: (type: BoardItemType) => void;
  onPickImage: () => void;
  onClearTrash?: () => void;
  canClear: boolean;
}

export default function BoardSidebar({ onAdd, onPickImage, onClearTrash, canClear }: BoardSidebarProps) {
  return (
    <aside className="flex flex-col w-[72px] flex-shrink-0 border-r border-white/8 bg-[rgba(14,14,16,0.85)] py-3">
      <div className="flex flex-col items-center gap-1 px-2">
        {TOOLS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            className="w-full flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-white/55 hover:text-white hover:bg-white/8 transition"
            title={`Add ${label}`}
          >
            <Icon size={18} strokeWidth={1.75} />
            <span className="text-[10px] leading-none">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 px-2 pt-3 border-t border-white/8">
        <button
          type="button"
          onClick={onPickImage}
          className="w-full flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-white/55 hover:text-white hover:bg-white/8 transition"
          title="Add image"
        >
          <ImagePlus size={18} strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Image</span>
        </button>
        {canClear && onClearTrash && (
          <button
            type="button"
            onClick={onClearTrash}
            className="w-full flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-white/45 hover:text-red-300 hover:bg-red-500/10 transition"
            title="Clear this board"
          >
            <Trash2 size={18} strokeWidth={1.75} />
            <span className="text-[10px] leading-none">Clear</span>
          </button>
        )}
      </div>
    </aside>
  );
}
