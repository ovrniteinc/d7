import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Home, Minus, Plus } from "lucide-react";
import {
  COL,
  createDoc,
  listDocs,
  patchDoc,
  removeDoc,
  upsertDoc,
  watchCollection,
} from "../lib/db";
import { useAuth } from "../lib/auth";
import { Avatar, StatusDot } from "../components/ui";
import BoardSidebar from "../components/blackboard/BoardSidebar";
import BoardItemCard from "../components/blackboard/BoardItemCard";
import { compressBoardImage } from "../lib/board-image";
import type { BoardItemType, BoardTodoItem, PresenceRow, StickyNote } from "../lib/types";

const ROOT_BOARD_ID = "root";
const CANVAS_SIZE = 4800;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

const DEFAULTS: Record<BoardItemType, Partial<StickyNote>> = {
  note: { width: 220, height: 160, color: "graphite" },
  link: { width: 260, height: 130, color: "graphite", url: "" },
  todo: { width: 260, height: 220, color: "graphite", todos: [{ id: crypto.randomUUID(), text: "New item", done: false }] },
  board: { width: 220, height: 150, color: "graphite" },
  image: { width: 300, height: 220, color: "graphite" },
};

interface BoardCrumb {
  id: string;
  title: string;
}

export default function Blackboard() {
  const { profile, isAdmin } = useAuth();
  const [items, setItems] = useState<StickyNote[]>([]);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [connected, setConnected] = useState(true);
  const [activeBoardId, setActiveBoardId] = useState(ROOT_BOARD_ID);
  const [trail, setTrail] = useState<BoardCrumb[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const presenceInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const applyZoom = useCallback((next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    const prev = zoomRef.current;
    const clamped = clampZoom(next);
    if (clamped === prev) return;

    if (el) {
      const rect = el.getBoundingClientRect();
      const px = clientX != null ? clientX - rect.left : el.clientWidth / 2;
      const py = clientY != null ? clientY - rect.top : el.clientHeight / 2;
      const canvasX = (el.scrollLeft + px) / prev;
      const canvasY = (el.scrollTop + py) / prev;

      zoomRef.current = clamped;
      setZoom(clamped);

      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollLeft = canvasX * clamped - px;
        scrollRef.current.scrollTop = canvasY * clamped - py;
      });
      return;
    }

    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);

  const zoomBy = useCallback(
    (delta: number, clientX?: number, clientY?: number) => {
      applyZoom(zoomRef.current + delta, clientX, clientY);
    },
    [applyZoom],
  );

  const resetZoom = useCallback(() => applyZoom(1), [applyZoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      zoomBy(delta, e.clientX, e.clientY);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy, activeBoardId]);

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: PointerEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = panStartRef.current.scrollLeft - (e.clientX - panStartRef.current.x);
      el.scrollTop = panStartRef.current.scrollTop - (e.clientY - panStartRef.current.y);
    };

    const onUp = () => setIsPanning(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isPanning]);

  const startPan = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const onItem = target.closest("[data-board-item]");
    const isMiddleClick = e.button === 1;
    if (!isMiddleClick && onItem) return;
    if (e.button !== 0 && e.button !== 1) return;

    const el = scrollRef.current;
    if (!el) return;

    e.preventDefault();
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setIsPanning(true);
  };

  useEffect(() => {
    const unsubNotes = watchCollection<StickyNote>(
      COL.stickyNotes,
      { orderBy: [["z", "desc"]] },
      (rows) => {
        setItems(rows.filter((row) => row.board_id === activeBoardId));
        setConnected(true);
      },
      () => setConnected(false),
    );

    const unsubPresence = watchCollection<PresenceRow>(
      COL.presence,
      undefined,
      (rows) => {
        const cutoff = Date.now() - 30000;
        setPresence(
          rows.filter((p) => {
            const t = new Date(p.last_seen).getTime();
            return !Number.isNaN(t) && t > cutoff;
          }),
        );
        setConnected(true);
      },
      () => setConnected(false),
    );

    return () => {
      unsubNotes();
      unsubPresence();
    };
  }, [activeBoardId]);

  useEffect(() => {
    if (!profile) return;
    const heartbeat = async () => {
      await upsertDoc(COL.presence, profile.id, {
        user_id: profile.id,
        name: profile.name,
        avatar_url: profile.avatar_url,
        last_seen: new Date().toISOString(),
      });
    };
    heartbeat();
    presenceInterval.current = setInterval(heartbeat, 15000);
    return () => {
      if (presenceInterval.current) clearInterval(presenceInterval.current);
      removeDoc(COL.presence, profile.id).catch(() => {});
    };
  }, [profile]);

  const boardItems = items;

  const getDropPoint = () => {
    const scrollEl = scrollRef.current;
    const scale = zoomRef.current;
    if (!scrollEl) return { x: 120, y: 120 };
    return {
      x: Math.max(40, (scrollEl.scrollLeft + scrollEl.clientWidth / 2) / scale - 120),
      y: Math.max(40, (scrollEl.scrollTop + scrollEl.clientHeight / 2) / scale - 80),
    };
  };

  const createItem = async (type: BoardItemType, extra: Partial<StickyNote> = {}) => {
    if (!profile) {
      toast.error("Profile not loaded");
      return;
    }
    const { x, y } = getDropPoint();
    const defaults = DEFAULTS[type];
    try {
      const data = await createDoc<StickyNote>(COL.stickyNotes, {
        board_id: activeBoardId,
        author_id: profile.id,
        type,
        body: type === "board" ? "New board" : type === "link" ? "New link" : "",
        color: defaults.color || "graphite",
        url: type === "link" ? "" : null,
        image_url: null,
        todos: type === "todo" ? (defaults.todos as BoardTodoItem[]) : [],
        x: Math.round(x),
        y: Math.round(y),
        z: Date.now(),
        width: defaults.width || 220,
        height: defaults.height || 160,
        ...extra,
      });
      if (type === "note" || type === "link" || type === "board") {
        setEditingId(data.id);
        setEditBody(data.body);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StickyNote> }) => {
      await patchDoc(COL.stickyNotes, id, patch);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      await removeDoc(COL.stickyNotes, id);
    },
    onSuccess: (_, id) => {
      setItems((prev) => prev.filter((n) => n.id !== id));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const clearBoard = async () => {
    try {
      const onBoard = await listDocs<StickyNote>(COL.stickyNotes, {
        where: [["board_id", "==", activeBoardId]],
      });
      await Promise.all(onBoard.map((n) => removeDoc(COL.stickyNotes, n.id)));
      setItems([]);
      toast.success("Board cleared");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDragEnd = (item: StickyNote, x: number, y: number) => {
    const nextX = Math.max(0, Math.round(x));
    const nextY = Math.max(0, Math.round(y));
    const z = Date.now();
    const previous = { x: item.x, y: item.y, z: item.z };
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, x: nextX, y: nextY, z } : n)));
    updateItem.mutate(
      { id: item.id, patch: { x: nextX, y: nextY, z } },
      {
        onError: () => {
          setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, ...previous } : n)));
        },
      },
    );
  };

  const openBoard = (item: StickyNote) => {
    setTrail((prev) => [...prev, { id: item.id, title: item.body || "Untitled board" }]);
    setActiveBoardId(item.id);
    setEditingId(null);
    resetZoom();
  };

  const goHome = () => {
    setActiveBoardId(ROOT_BOARD_ID);
    setTrail([]);
    setEditingId(null);
    resetZoom();
  };

  const goToCrumb = (index: number) => {
    if (index < 0) {
      goHome();
      return;
    }
    const next = trail.slice(0, index + 1);
    setTrail(next);
    setActiveBoardId(next[next.length - 1].id);
    setEditingId(null);
    resetZoom();
  };

  const onImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const image_url = await compressBoardImage(file);
      const { x, y } = getDropPoint();
      await createItem("image", {
        image_url,
        body: file.name.replace(/\.[^.]+$/, ""),
        x: Math.round(x),
        y: Math.round(y),
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const saveEdit = (id: string) => {
    updateItem.mutate({ id, patch: { body: editBody } });
    setEditingId(null);
  };

  return (
    <div className="h-[calc(100vh-7rem)] lg:h-[calc(100vh-6.5rem)] -m-4 lg:-m-6 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/8 bg-[rgba(10,10,11,0.6)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 text-sm">
          <button type="button" onClick={goHome} className="flex items-center gap-1.5 text-white/70 hover:text-white transition flex-shrink-0">
            <Home size={15} />
            <span>Home</span>
          </button>
          {trail.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-2 min-w-0">
              <ChevronRight size={14} className="text-white/30 flex-shrink-0" />
              <button
                type="button"
                onClick={() => goToCrumb(i)}
                className="text-white/60 hover:text-white truncate max-w-[140px]"
              >
                {crumb.title}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-white/35 hidden sm:inline">{boardItems.length} items</span>
          <div className="flex items-center gap-2 chip">
            <StatusDot variant={connected ? "pulse" : "dim"} />
            <span className="text-xs">{connected ? "Live" : "Reconnecting"}</span>
          </div>
          <div className="flex items-center -space-x-2">
            {presence.slice(0, 5).map((p) => (
              <Avatar key={p.id} name={p.name} url={p.avatar_url} size={24} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <BoardSidebar
          onAdd={createItem}
          onPickImage={() => imageInputRef.current?.click()}
          onClearTrash={clearBoard}
          canClear={isAdmin && boardItems.length > 0}
        />
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImagePick} />

        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onPointerDown={startPan}
            className={`absolute inset-0 overflow-auto bg-[#121214] ${isPanning ? "cursor-grabbing select-none" : "cursor-grab"}`}
          >
            <div
              style={{
                width: CANVAS_SIZE * zoom,
                height: CANVAS_SIZE * zoom,
                minWidth: "100%",
                minHeight: "100%",
              }}
            >
              <div
                className="relative"
                style={{
                  width: CANVAS_SIZE,
                  height: CANVAS_SIZE,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                  cursor: isPanning ? "grabbing" : "grab",
                }}
              >
                {!boardItems.length && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center max-w-sm px-6">
                      <p className="text-white/70 text-sm font-medium mb-1">Start with a board element</p>
                      <p className="text-white/35 text-xs leading-relaxed">
                        Use the toolbar on the left to add notes, links, to-dos, nested boards, and images.
                      </p>
                    </div>
                  </div>
                )}

                {boardItems.map((item) => {
                  const canEdit = item.author_id === profile?.id || isAdmin;
                  const isEditing = editingId === item.id;
                  return (
                    <BoardItemCard
                      key={item.id}
                      item={item}
                      zoom={zoom}
                      canEdit={canEdit}
                      isEditing={isEditing}
                      editBody={editBody}
                      onEditBody={setEditBody}
                      onStartEdit={() => {
                        setEditingId(item.id);
                        setEditBody(item.body);
                      }}
                      onSaveEdit={() => saveEdit(item.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onDelete={() => deleteItem.mutate(item.id)}
                      onDragEnd={(x, y) => onDragEnd(item, x, y)}
                      onOpenBoard={() => openBoard(item)}
                      onUpdateTodos={(todos) => updateItem.mutate({ id: item.id, patch: { todos } })}
                      onUpdateLink={(body, url) => {
                        updateItem.mutate({ id: item.id, patch: { body, url: url || null } });
                        setEditingId(null);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 glass-strong rounded-xl p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => zoomBy(-ZOOM_STEP)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
              title="Zoom out"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="min-w-[52px] h-8 px-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition mono"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomBy(ZOOM_STEP)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
              title="Zoom in"
            >
              <Plus size={16} />
            </button>
          </div>

          <p className="absolute bottom-4 left-4 z-10 text-[10px] text-white/30 hidden sm:block pointer-events-none">
            Drag empty area to pan · Ctrl + scroll to zoom
          </p>
        </div>
      </div>
    </div>
  );
}
