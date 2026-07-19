import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors, closestCorners,
  type DragStartEvent, type DragEndEvent, type DragCancelEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { COL, createDoc, getDocById, listDocs, patchDoc } from "../lib/db";
import { useAuth } from "../lib/auth";
import { useUIStore } from "../lib/ui-store";
import { Modal, EmptyState, Avatar, MonoBadge, ShadeStripe } from "../components/ui";
import { STATUS_LABELS, PRIORITY_DOTS, DEFAULT_KANBAN_COLUMNS } from "../lib/constants";
import { taskSchema } from "../lib/schemas";
import { logActivity } from "../lib/functions";
import { notifyTaskAssigned } from "../lib/notifications";
import { fmtDate } from "../lib/format";
import type { Task, Project, Profile, TaskStatus, Priority, ShadeKey } from "../lib/types";

export default function Tasks() {
  const { isAdmin } = useAuth();
  const { personFilter, projectFilter, openTask } = useUIStore();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingMoves, setPendingMoves] = useState<Record<string, Partial<Task>>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: columnsSetting } = useQuery({
    queryKey: ["settings", "kanban_columns"],
    queryFn: async () => {
      const data = await getDocById<{ value: { id: string; title: string }[] }>(COL.settings, "kanban_columns");
      return data?.value || DEFAULT_KANBAN_COLUMNS;
    },
  });
  const columns = (columnsSetting as { id: string; title: string }[]) || DEFAULT_KANBAN_COLUMNS;

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => listDocs<Task>(COL.tasks, { orderBy: [["position", "asc"]] }),
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => listDocs<Project>(COL.projects),
  });

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles),
  });

  const { data: commentCounts } = useQuery<Record<string, number>>({
    queryKey: ["comment-counts"],
    queryFn: async () => {
      const data = await listDocs<{ task_id: string }>(COL.comments);
      const map: Record<string, number> = {};
      data.forEach((c) => { map[c.task_id] = (map[c.task_id] || 0) + 1; });
      return map;
    },
  });

  const projectMap: Record<string, Project> = {};
  (projects || []).forEach((p) => { projectMap[p.id] = p; });
  const userMap: Record<string, Profile> = {};
  (users || []).forEach((u) => { userMap[u.id] = u; });

  const filteredTasks = useMemo(() => {
    let list = tasks || [];
    for (const [id, patch] of Object.entries(pendingMoves)) {
      list = list.map((t) => (t.id === id ? { ...t, ...patch } : t));
    }
    if (projectFilter) list = list.filter((t) => t.project_id === projectFilter);
    if (personFilter && isAdmin) list = list.filter((t) => t.assignee_id === personFilter);
    return list;
  }, [tasks, pendingMoves, projectFilter, personFilter, isAdmin]);

  const clearPendingMove = (id: string) => {
    setPendingMoves((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const applyTaskMove = (id: string, patch: Partial<Task>) => {
    setPendingMoves((prev) => ({ ...prev, [id]: patch }));
    qc.setQueryData<Task[]>(["tasks"], (old) =>
      old?.map((t) => (t.id === id ? { ...t, ...patch } : t)) ?? [],
    );
  };

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      await patchDoc(COL.tasks, id, patch);
    },
    onSuccess: (_data, { id }) => {
      clearPendingMove(id);
    },
    onError: (e, { id }) => {
      clearPendingMove(id);
      toast.error((e as Error).message);
    },
  });

  const persistTaskMove = (id: string, patch: Partial<Task>) => {
    const previous = qc.getQueryData<Task[]>(["tasks"]);
    flushSync(() => {
      applyTaskMove(id, patch);
      setActiveId(null);
    });
    updateTask.mutate(
      { id, patch },
      {
        onError: () => {
          if (previous) qc.setQueryData(["tasks"], previous);
        },
      },
    );
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };

  const onDragCancel = (_e: DragCancelEvent) => {
    setActiveId(null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) {
      setActiveId(null);
      return;
    }
    const taskId = active.id as string;
    const task = filteredTasks.find((t) => t.id === taskId);
    if (!task) {
      setActiveId(null);
      return;
    }

    const overId = over.id as string;
    let newStatus: TaskStatus | null = null;
    if (columns.some((c) => c.id === overId)) {
      newStatus = overId as TaskStatus;
    } else {
      const overTask = filteredTasks.find((t) => t.id === overId);
      if (overTask) newStatus = overTask.status;
    }
    if (!newStatus || newStatus === task.status) {
      const overTask = filteredTasks.find((t) => t.id === overId);
      const newPos = overTask ? overTask.position : Date.now();
      persistTaskMove(taskId, { position: newPos + 0.01 });
      return;
    }

    const patch: Partial<Task> = { status: newStatus, position: Date.now() };
    if (newStatus === "done") patch.progress = 100;
    else if (newStatus === "in_progress" && task.progress === 0) patch.progress = 10;
    persistTaskMove(taskId, patch);
    logActivity("task.move", "task", taskId, { to: newStatus });
  };

  const activeTask = activeId ? filteredTasks.find((t) => t.id === activeId) : null;

  return (
    <div className="h-full flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={() => setDialogOpen(true)}>
            <Plus size={15} /> New Task
          </button>
        </div>
      )}

      {!filteredTasks.length && !projectFilter ? (
        <EmptyState title="No tasks yet" hint={isAdmin ? "Create your first task." : "Tasks will appear here once created."} icon={<Plus size={32} />} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);
              return (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  tasks={colTasks}
                  activeId={activeId}
                  projectMap={projectMap}
                  userMap={userMap}
                  commentCounts={commentCounts || {}}
                  onOpen={openTask}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeTask ? (
              <TaskCard task={activeTask} project={projectMap[activeTask.project_id]} assignee={activeTask.assignee_id ? userMap[activeTask.assignee_id] : null} commentCount={commentCounts?.[activeTask.id] || 0} onClick={() => {}} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskDialog open={dialogOpen} onClose={() => setDialogOpen(false)} projects={projects || []} users={users || []} />
    </div>
  );
}

function KanbanColumn({ col, tasks, activeId, projectMap, userMap, commentCounts, onOpen }: {
  col: { id: string; title: string };
  tasks: Task[];
  activeId: string | null;
  projectMap: Record<string, Project>;
  userMap: Record<string, Profile>;
  commentCounts: Record<string, number>;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div ref={setNodeRef} className={`flex-shrink-0 w-72 flex flex-col gap-3 p-3 rounded-2xl transition ${isOver ? "bg-white/5" : ""}`}>
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-white/85">{col.title}</h3>
        <span className="text-xs text-white/35 mono">{tasks.length}</span>
      </div>
      <div className="space-y-2 min-h-[60px]">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            hidden={t.id === activeId}
            project={projectMap[t.project_id]}
            assignee={t.assignee_id ? userMap[t.assignee_id] : null}
            commentCount={commentCounts[t.id] || 0}
            onClick={() => onOpen(t.id)}
          />
        ))}
        {!tasks.length && <div className="text-xs text-white/20 text-center py-4">Drop tasks here</div>}
      </div>
    </div>
  );
}

function TaskCard({ task, project, assignee, commentCount, hidden, onClick }: {
  task: Task;
  project?: Project;
  assignee?: Profile | null;
  commentCount: number;
  hidden?: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const shade = project?.color || "graphite";
  const invisible = hidden || isDragging;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`glass p-3 cursor-pointer hover:!border-white/20 transition ${invisible ? "opacity-0" : ""}`}
      style={{ borderRadius: 16 }}
    >
      <div className="flex gap-2.5">
        <ShadeStripe shade={shade as ShadeKey} />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm text-white/90 font-medium leading-snug">{task.title}</p>
          {project && <MonoBadge shade={shade as ShadeKey}>{project.name}</MonoBadge>}
          <div className="progress-track"><div className="progress-fill" style={{ width: `${task.progress ?? 0}%` }} /></div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="dot" style={{ background: PRIORITY_DOTS[task.priority as Priority] }} />
              {task.due_date && <span className="text-[10px] text-white/40">{fmtDate(task.due_date)}</span>}
              {commentCount > 0 && <span className="text-[10px] text-white/30">{commentCount}</span>}
            </div>
            {assignee && <Avatar name={assignee.name} url={assignee.avatar_url} size={20} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskDialog({ open, onClose, projects, users }: { open: boolean; onClose: () => void; projects: Project[]; users: Profile[] }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const parsed = taskSchema.safeParse({
      title, description, project_id: projectId,
      assignee_id: assigneeId || null, priority, status, due_date: dueDate || null,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!profile) {
      toast.error("Profile not loaded");
      return;
    }
    setSaving(true);
    try {
      const data = await createDoc<Task>(COL.tasks, {
        title, description, project_id: projectId,
        assignee_id: assigneeId || null, priority, status,
        due_date: dueDate || null, created_by: profile.id,
        position: Date.now(), progress: 0,
      });
      logActivity("task.create", "task", data.id, { title });
      if (assigneeId && assigneeId !== profile.id) {
        await notifyTaskAssigned({
          recipientId: assigneeId,
          actorId: profile.id,
          actorName: profile.name || profile.email,
          taskId: data.id,
          taskTitle: title,
        }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
      setTitle(""); setDescription(""); setProjectId(""); setAssigneeId(""); setPriority("medium"); setStatus("backlog"); setDueDate("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New task" wide>
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Project</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assignee</label>
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Due date</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create task"}</button>
        </div>
      </div>
    </Modal>
  );
}
