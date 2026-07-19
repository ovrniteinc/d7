import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { COL, createDoc, listDocs, patchDoc, removeDoc, upsertDoc, watchCollection } from "../lib/db";
import { useAuth } from "../lib/auth";
import { Avatar, StatusDot } from "../components/ui";
import { SHADES, SHADE_KEYS, getShade } from "../lib/constants";
import type { StickyNote, PresenceRow, ShadeKey } from "../lib/types";

export default function Blackboard() {
  const { profile, isAdmin } = useAuth();
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [connected, setConnected] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const presenceInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsubNotes = watchCollection<StickyNote>(
      COL.stickyNotes,
      { orderBy: [["z", "desc"]] },
      (rows) => {
        setNotes(rows);
        setConnected(true);
      },
      () => setConnected(false),
    );

    const unsubPresence = watchCollection<PresenceRow>(
      COL.presence,
      undefined,
      (rows) => {
        const cutoff = Date.now() - 30000;
        setPresence(rows.filter((p) => {
          const t = new Date(p.last_seen).getTime();
          return !Number.isNaN(t) && t > cutoff;
        }));
        setConnected(true);
      },
      () => setConnected(false),
    );

    return () => {
      unsubNotes();
      unsubPresence();
    };
  }, []);

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

  const createNote = async (color: ShadeKey, x: number, y: number) => {
    if (!profile) {
      toast.error("Profile not loaded");
      return;
    }
    try {
      const data = await createDoc<StickyNote>(COL.stickyNotes, {
        author_id: profile.id,
        body: "",
        color,
        x, y, z: Date.now(),
      });
      setEditingId(data.id);
      setEditBody("");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setPickerOpen(false);
  };

  const updateNote = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StickyNote> }) => {
      await patchDoc(COL.stickyNotes, id, patch);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => { await removeDoc(COL.stickyNotes, id); },
    onSuccess: (_, id) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const clearBoard = async () => {
    try {
      const all = await listDocs<StickyNote>(COL.stickyNotes);
      await Promise.all(all.map((n) => removeDoc(COL.stickyNotes, n.id)));
      setNotes([]);
      toast.success("Board cleared");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (editingId) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPickerPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setPickerOpen(true);
  };

  const startEdit = (note: StickyNote) => {
    setEditingId(note.id);
    setEditBody(note.body);
  };

  const saveEdit = (id: string) => {
    updateNote.mutate({ id, patch: { body: editBody } });
    setEditingId(null);
  };

  const onDragEnd = (note: StickyNote, x: number, y: number) => {
    const nextX = Math.max(0, Math.round(x));
    const nextY = Math.max(0, Math.round(y));
    const z = Date.now();
    const previous = { x: note.x, y: note.y, z: note.z };
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, x: nextX, y: nextY, z } : n)),
    );
    updateNote.mutate(
      { id: note.id, patch: { x: nextX, y: nextY, z } },
      {
        onError: () => {
          setNotes((prev) =>
            prev.map((n) => (n.id === note.id ? { ...n, ...previous } : n)),
          );
        },
      },
    );
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 chip">
            <StatusDot variant={connected ? "pulse" : "dim"} />
            <span className="text-xs">{connected ? "Live" : "Reconnecting"}</span>
          </div>
          <div className="flex items-center -space-x-2">
            {presence.slice(0, 5).map((p) => (
              <Avatar key={p.id} name={p.name} url={p.avatar_url} size={24} />
            ))}
            {presence.length > 0 && <span className="text-xs text-white/40 ml-3">{presence.length} viewing</span>}
          </div>
        </div>
        {isAdmin && notes.length > 0 && (
          <button className="btn btn-danger !text-xs" onClick={clearBoard}><Trash2 size={13} /> Clear board</button>
        )}
      </div>

      <div
        ref={canvasRef}
        onDoubleClick={handleCanvasDoubleClick}
        className="flex-1 relative overflow-hidden rounded-2xl border border-white/8"
        style={{
          backgroundColor: "rgba(12,12,14,0.6)",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-white/25 text-sm">Double-click to create a note</p>
          </div>
        )}

        {notes.map((note) => {
          const s = getShade(note.color);
          const isEditing = editingId === note.id;
          const canEdit = note.author_id === profile?.id || isAdmin;
          return (
            <motion.div
              key={note.id}
              drag={canEdit && !isEditing}
              dragMomentum={false}
              dragElastic={0}
              initial={false}
              animate={{ x: note.x, y: note.y }}
              style={{ position: "absolute", top: 0, left: 0, zIndex: note.z }}
              onDragEnd={(_, info) => onDragEnd(note, note.x + info.offset.x, note.y + info.offset.y)}
              className={`w-48 p-4 rounded-2xl group ${canEdit && !isEditing ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <div style={{ background: s.chip, border: `1px solid ${s.ring}`, borderRadius: 16, padding: 16, minHeight: 80, backdropFilter: "blur(8px)" }}>
                {isEditing ? (
                  <textarea
                    autoFocus
                    className="w-full bg-transparent text-sm text-white/90 outline-none resize-none"
                    style={{ minHeight: 60 }}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onBlur={() => saveEdit(note.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(note.id);
                      if (e.key === "Escape") { setEditingId(null); }
                    }}
                    placeholder="Type a note…"
                  />
                ) : (
                  <p onDoubleClick={() => canEdit && startEdit(note)} className="text-sm text-white/85 whitespace-pre-wrap min-h-[40px]">
                    {note.body || <span className="text-white/30">Double-click to edit</span>}
                  </p>
                )}
              </div>
              {canEdit && !isEditing && (
                <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => deleteNote.mutate(note.id)} className="w-6 h-6 rounded-full bg-black/60 border border-white/15 flex items-center justify-center text-white/60 hover:text-white">
                    <X size={11} />
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}

        {pickerOpen && (
          <div className="absolute z-50 glass-strong rounded-2xl p-3" style={{ left: pickerPos.x, top: pickerPos.y }}>
            <p className="eyebrow mb-2">Pick shade</p>
            <div className="flex gap-2">
              {SHADE_KEYS.map((s) => (
                <button key={s} onClick={() => createNote(s, pickerPos.x, pickerPos.y)} className="w-9 h-9 rounded-xl transition hover:scale-110" style={{ background: SHADES[s].chip, border: `1.5px solid ${SHADES[s].ring}` }} title={s} />
              ))}
            </div>
            <button onClick={() => setPickerOpen(false)} className="text-xs text-white/40 mt-2 hover:text-white">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
