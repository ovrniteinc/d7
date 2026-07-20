import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, LayoutGrid, Plus, X } from "lucide-react";
import { getShade } from "../../lib/constants";
import type { BoardItemType, BoardTodoItem, StickyNote } from "../../lib/types";

interface BoardItemCardProps {
  item: StickyNote;
  zoom: number;
  canEdit: boolean;
  isEditing: boolean;
  editBody: string;
  onEditBody: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onDragEnd: (x: number, y: number) => void;
  onOpenBoard?: () => void;
  onUpdateTodos: (todos: BoardTodoItem[]) => void;
  onUpdateLink: (body: string, url: string) => void;
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function BoardItemCard({
  item,
  zoom,
  canEdit,
  isEditing,
  editBody,
  onEditBody,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onDragEnd,
  onOpenBoard,
  onUpdateTodos,
  onUpdateLink,
}: BoardItemCardProps) {
  const shade = getShade(item.color);
  const [linkUrl, setLinkUrl] = useState(item.url || "");
  const [newTodo, setNewTodo] = useState("");

  const cardShell = (
    <div
      className="h-full rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: item.type === "board" ? "rgba(255,255,255,0.06)" : shade.chip,
        border: `1px solid ${item.type === "board" ? "rgba(255,255,255,0.14)" : shade.ring}`,
        backdropFilter: "blur(10px)",
        minHeight: item.height,
        width: item.width,
      }}
    >
      {renderContent()}
    </div>
  );

  function addTodo() {
    const text = newTodo.trim();
    if (!text) return;
    onUpdateTodos([
      ...item.todos,
      { id: crypto.randomUUID(), text, done: false },
    ]);
    setNewTodo("");
  }

  function toggleTodo(id: string) {
    onUpdateTodos(item.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function renderContent() {
    switch (item.type as BoardItemType) {
      case "link":
        if (isEditing) {
          return (
            <div className="p-3 space-y-2 flex-1">
              <input
                autoFocus
                className="input !text-sm"
                placeholder="Link title"
                value={editBody}
                onChange={(e) => onEditBody(e.target.value)}
              />
              <input
                className="input !text-sm"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn btn-primary !text-xs !py-1.5" onClick={() => onUpdateLink(editBody, normalizeUrl(linkUrl))}>
                  Save
                </button>
                <button type="button" className="btn btn-ghost !text-xs !py-1.5" onClick={onCancelEdit}>Cancel</button>
              </div>
            </div>
          );
        }
        return (
          <div className="p-4 flex-1">
            <p className="text-sm font-medium text-white/90 mb-2">{item.body || "Untitled link"}</p>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-white/55 hover:text-white inline-flex items-center gap-1 break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {item.url.replace(/^https?:\/\//, "")}
                <ExternalLink size={12} />
              </a>
            ) : (
              <p className="text-xs text-white/35">Double-click to add URL</p>
            )}
          </div>
        );

      case "todo":
        return (
          <div className="p-3 flex flex-col flex-1 min-h-0">
            <p className="text-xs eyebrow mb-2">To-do</p>
            <div className="space-y-1.5 flex-1 overflow-y-auto min-h-0">
              {item.todos.map((todo) => (
                <label key={todo.id} className="flex items-start gap-2 text-sm text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={todo.done}
                    disabled={!canEdit}
                    onChange={() => toggleTodo(todo.id)}
                    className="mt-0.5 accent-white"
                  />
                  <span className={todo.done ? "line-through text-white/40" : ""}>{todo.text}</span>
                </label>
              ))}
              {!item.todos.length && <p className="text-xs text-white/30">No items yet</p>}
            </div>
            {canEdit && (
              <div className="flex gap-1.5 mt-2 pt-2 border-t border-white/10">
                <input
                  className="input !text-xs flex-1"
                  placeholder="Add item…"
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTodo();
                  }}
                />
                <button type="button" onClick={addTodo} className="btn btn-ghost !p-2"><Plus size={14} /></button>
              </div>
            )}
          </div>
        );

      case "board":
        if (isEditing) {
          return (
            <div className="p-3 flex-1">
              <input
                autoFocus
                className="input !text-sm w-full"
                value={editBody}
                onChange={(e) => onEditBody(e.target.value)}
                onBlur={onSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveEdit();
                  if (e.key === "Escape") onCancelEdit();
                }}
                placeholder="Board name"
              />
            </div>
          );
        }
        return (
          <div className="p-4 flex-1 flex flex-col items-start justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <LayoutGrid size={20} className="text-white/70" />
            </div>
            <div className="w-full">
              <p
                className="text-sm font-semibold text-white/90"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (canEdit) onStartEdit();
                }}
              >
                {item.body || "Untitled board"}
              </p>
              <button
                type="button"
                onClick={onOpenBoard}
                className="text-xs text-white/45 hover:text-white mt-2 transition"
              >
                Open board →
              </button>
            </div>
          </div>
        );

      case "image":
        return (
          <div className="flex-1 flex items-center justify-center bg-black/20 min-h-[120px]">
            {item.image_url ? (
              <img src={item.image_url} alt={item.body || "Board image"} className="max-w-full max-h-full object-contain" />
            ) : (
              <p className="text-xs text-white/35 p-4">Empty image</p>
            )}
          </div>
        );

      default:
        if (isEditing) {
          return (
            <textarea
              autoFocus
              className="w-full h-full min-h-[120px] bg-transparent text-sm text-white/90 outline-none resize-none p-4"
              value={editBody}
              onChange={(e) => onEditBody(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              placeholder="Type a note…"
            />
          );
        }
        return (
          <p
            onDoubleClick={() => canEdit && onStartEdit()}
            className="text-sm text-white/85 whitespace-pre-wrap p-4 flex-1 min-h-[80px]"
          >
            {item.body || <span className="text-white/30">Double-click to edit</span>}
          </p>
        );
    }
  }

  const draggable = canEdit && !isEditing;

  return (
    <motion.div
      data-board-item
      drag={draggable}
      dragMomentum={false}
      dragElastic={0}
      initial={false}
      animate={{ x: item.x, y: item.y }}
      style={{ position: "absolute", top: 0, left: 0, zIndex: item.z, width: item.width, cursor: draggable ? undefined : "default" }}
      onDragEnd={(_, info) =>
        onDragEnd(item.x + info.offset.x / zoom, item.y + info.offset.y / zoom)
      }
      className={`group ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      onDoubleClick={(e) => {
        if (!canEdit) return;
        if (item.type === "link" || item.type === "note") {
          e.stopPropagation();
          onStartEdit();
          setLinkUrl(item.url || "");
        }
      }}
    >
      {cardShell}
      {canEdit && !isEditing && (
        <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-6 h-6 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white/60 hover:text-white"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </motion.div>
  );
}
