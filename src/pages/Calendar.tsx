import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, addMonths, addWeeks, addDays, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { COL, createDoc, listDocs, patchDoc, removeDoc } from "../lib/db";
import { useAuth } from "../lib/auth";
import { GlassPanel, Modal, EmptyState } from "../components/ui";
import { getShade } from "../lib/constants";
import { eventSchema } from "../lib/schemas";
import { logActivity } from "../lib/functions";
import type { CalendarEvent, Project, Task, EventType } from "../lib/types";

type ViewMode = "month" | "week" | "day";

export default function Calendar() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  const range = useMemo(() => {
    if (mode === "month") return { start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) };
    if (mode === "week") return { start: startOfWeek(cursor), end: endOfWeek(cursor) };
    return { start: startOfDay(cursor), end: endOfDay(cursor) };
  }, [mode, cursor]);

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ["events", range.start.toISOString(), range.end.toISOString()],
    queryFn: () =>
      listDocs<CalendarEvent>(COL.events, {
        where: [
          ["start_at", ">=", range.start.toISOString()],
          ["start_at", "<=", range.end.toISOString()],
        ],
        orderBy: [["start_at", "asc"]],
      }),
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => listDocs<Task>(COL.tasks),
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => listDocs<Project>(COL.projects),
  });

  const projectMap: Record<string, Project> = {};
  (projects || []).forEach((p) => { projectMap[p.id] = p; });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => { await removeDoc(COL.events, id); },
    onSuccess: (_, id) => { logActivity("event.delete", "event", id); qc.invalidateQueries({ queryKey: ["events"] }); toast.success("Event deleted"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const days = eachDayOfInterval({ start: range.start, end: range.end });

  const eventsForDay = (d: Date) => (events || []).filter((e) => isSameDay(new Date(e.start_at), d));
  const tasksForDay = (d: Date) => (tasks || []).filter((t) => t.due_date && isSameDay(new Date(t.due_date), d));

  const nav = (dir: -1 | 1) => {
    if (mode === "month") setCursor(addMonths(cursor, dir));
    else if (mode === "week") setCursor(addWeeks(cursor, dir));
    else setCursor(addDays(cursor, dir));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => nav(-1)} className="btn btn-ghost !p-2"><ChevronLeft size={16} /></button>
          <h2 className="text-lg font-semibold text-white min-w-[160px] text-center">
            {mode === "month" ? format(cursor, "MMMM yyyy") : mode === "week" ? `${format(range.start, "MMM d")} – ${format(range.end, "MMM d")}` : format(cursor, "MMM d, yyyy")}
          </h2>
          <button onClick={() => nav(1)} className="btn btn-ghost !p-2"><ChevronRight size={16} /></button>
          <button onClick={() => setCursor(new Date())} className="btn btn-ghost !text-xs">Today</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex glass rounded-xl p-1">
            {(["month", "week", "day"] as ViewMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${mode === m ? "bg-white/15 text-white" : "text-white/50"}`}>{m}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => { setEditEvent(null); setDialogDate(new Date()); setDialogOpen(true); }}><Plus size={15} /> Event</button>
        </div>
      </div>

      {mode === "day" ? (
        <DayView events={eventsForDay(cursor)} tasks={tasksForDay(cursor)} projectMap={projectMap} onDelete={deleteEvent.mutate} onEdit={(e) => { setEditEvent(e); setDialogDate(new Date(e.start_at)); setDialogOpen(true); }} />
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="eyebrow text-center pb-2">{d}</div>
          ))}
          {days.map((d) => {
            const dayEvents = eventsForDay(d);
            const dayTasks = tasksForDay(d);
            const inMonth = mode === "month" ? d.getMonth() === cursor.getMonth() : true;
            return (
              <div
                key={d.toISOString()}
                onDoubleClick={() => { setEditEvent(null); setDialogDate(d); setDialogOpen(true); }}
                className={`glass p-2 min-h-[88px] cursor-pointer hover:!border-white/20 transition ${!inMonth ? "opacity-30" : ""}`}
                style={{ borderRadius: 14 }}
              >
                <div className="text-xs text-white/50 mb-1 mono">{format(d, "d")}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((e) => {
                    const shade = e.project_id ? projectMap[e.project_id]?.color : "graphite";
                    const s = getShade(shade);
                    return (
                      <div key={e.id} className="text-[10px] text-white/80 px-1.5 py-1 rounded-md truncate flex items-center gap-1" style={{ background: s.chip, border: `1px solid ${s.ring}` }}>
                        {e.type === "company" && <span className="dot dot-ring" style={{ width: 5, height: 5 }} />}
                        {format(new Date(e.start_at), "HH:mm")} {e.title}
                      </div>
                    );
                  })}
                  {dayTasks.slice(0, 2).map((t) => (
                    <div key={t.id} className="text-[10px] text-white/50 px-1.5 py-1 rounded-md truncate border border-dashed border-white/20">
                      {t.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EventDialog open={dialogOpen} onClose={() => setDialogOpen(false)} date={dialogDate} event={editEvent} projects={projects || []} isAdmin={isAdmin} />
    </div>
  );
}

function DayView({ events, tasks, projectMap, onDelete, onEdit }: {
  events: CalendarEvent[];
  tasks: Task[];
  projectMap: Record<string, Project>;
  onDelete: (id: string) => void;
  onEdit: (e: CalendarEvent) => void;
}) {
  const merged = [
    ...events.map((e) => ({ kind: "event" as const, item: e })),
    ...tasks.map((t) => ({ kind: "task" as const, item: t })),
  ].sort((a, b) => {
    const aDate = a.kind === "event" ? a.item.start_at : a.item.due_date;
    const bDate = b.kind === "event" ? b.item.start_at : b.item.due_date;
    return new Date(aDate || 0).getTime() - new Date(bDate || 0).getTime();
  });

  if (!merged.length) return <EmptyState title="Nothing scheduled" hint="Double-click a day to create an event." icon={<Plus size={28} />} />;

  return (
    <GlassPanel className="p-4 space-y-2">
      {merged.map((entry) => {
        if (entry.kind === "event") {
          const e = entry.item;
          const shade = e.project_id ? projectMap[e.project_id]?.color : "graphite";
          const s = getShade(shade);
          return (
            <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/4 transition group">
              <span className="mono text-xs text-white/50 w-16">{format(new Date(e.start_at), "HH:mm")}</span>
              <span className="dot" style={{ background: s.dot }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate">{e.title}</p>
                {e.type === "company" && <span className="eyebrow">Company</span>}
              </div>
              <button onClick={() => onEdit(e)} className="text-xs text-white/40 hover:text-white opacity-0 group-hover:opacity-100">Edit</button>
              <button onClick={() => onDelete(e.id)} className="text-xs text-white/40 hover:text-white opacity-0 group-hover:opacity-100">Delete</button>
            </div>
          );
        }
        const t = entry.item as Task;
        return (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/15">
            <span className="mono text-xs text-white/50 w-16">Due</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/70 truncate">{t.title}</p>
            </div>
          </div>
        );
      })}
    </GlassPanel>
  );
}

function EventDialog({ open, onClose, date, event, projects, isAdmin }: { open: boolean; onClose: () => void; date: Date | null; event: CalendarEvent | null; projects: Project[]; isAdmin: boolean }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [type, setType] = useState<EventType>("personal");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setDescription(event.description);
      setStartAt(event.start_at?.slice(0, 16) ?? "");
      setEndAt(event.end_at?.slice(0, 16) ?? "");
      setType(event.type);
      setProjectId(event.project_id || "");
    } else if (date) {
      const s = new Date(date);
      s.setHours(9, 0, 0, 0);
      const e = new Date(s);
      e.setHours(10, 0, 0, 0);
      setTitle("");
      setDescription("");
      setStartAt(s.toISOString().slice(0, 16));
      setEndAt(e.toISOString().slice(0, 16));
      setType("personal");
      setProjectId("");
    }
  }, [open, event, date]);

  const submit = async () => {
    const parsed = eventSchema.safeParse({
      title, description, start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(), type,
      project_id: projectId || null,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (type === "company" && !isAdmin) { toast.error("Only admins can create company events"); return; }
    if (!profile) {
      toast.error("Profile not loaded");
      return;
    }
    setSaving(true);
    try {
      if (event) {
        await patchDoc(COL.events, event.id, {
          title, description, start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(), type,
          project_id: projectId || null,
        });
        logActivity("event.update", "event", event.id);
        toast.success("Event updated");
      } else {
        await createDoc(COL.events, {
          title, description, start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(), type,
          project_id: projectId || null,
          owner_id: profile.id,
        });
        logActivity("event.create", "event");
        toast.success("Event created");
      }
      qc.invalidateQueries({ queryKey: ["events"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={event ? "Edit event" : "New event"} wide>
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start</label>
            <input type="datetime-local" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <label className="label">End</label>
            <input type="datetime-local" className="input" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as EventType)} disabled={!isAdmin && type === "company"}>
              <option value="personal">Personal</option>
              {isAdmin && <option value="company">Company</option>}
            </select>
          </div>
          <div>
            <label className="label">Project (optional)</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
