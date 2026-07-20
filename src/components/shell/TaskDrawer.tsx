import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Trash2, Play, Square, Send, Paperclip, Download } from "lucide-react";
import { COL, createDoc, getDocById, listDocs, patchDoc, removeDoc } from "../../lib/db";
import { useAuth } from "../../lib/auth";
import { useUIStore } from "../../lib/ui-store";
import { STATUS_LABELS, PRIORITIES, PRIORITY_DOTS } from "../../lib/constants";
import type { Task, Comment, Profile, Project, TimeLog, Priority, TaskStatus, TaskAttachment } from "../../lib/types";
import { Avatar, MonoBadge, StatusDot } from "../ui";
import { fmtRelative, fmtClock, fmtHours, fmtDate } from "../../lib/format";
import { logActivity, rollupTimeLog } from "../../lib/functions";
import { notifyTaskAssignedMany, notifyTaskCommentAssignees, notifyTaskMentionMany } from "../../lib/notifications";
import { newAssigneeIds } from "../../lib/tasks";
import { newMentionIds } from "../../lib/rich-text";
import { readAttachmentFile, formatFileSize } from "../../lib/task-attachments";
import { AssigneeList, AssigneeMultiSelect } from "../AssigneePicker";
import MentionTextarea from "../MentionTextarea";
import { RichText } from "../RichText";

export default function TaskDrawer() {
  const { profile, isAdmin } = useAuth();
  const { selectedTaskId, drawerOpen, closeTask } = useUIStore();
  const qc = useQueryClient();

  const [commentBody, setCommentBody] = useState("");
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerLogId, setTimerLogId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
  const [editPriority, setEditPriority] = useState<Priority>("medium");
  const [editDue, setEditDue] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("backlog");

  const { data: task } = useQuery<Task>({
    queryKey: ["task", selectedTaskId],
    queryFn: async () => {
      const data = await getDocById<Task>(COL.tasks, selectedTaskId!);
      if (!data) throw new Error("Task not found");
      return data;
    },
    enabled: !!selectedTaskId,
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["project", task?.project_id],
    queryFn: async () => {
      const data = await getDocById<Project>(COL.projects, task!.project_id);
      if (!data) throw new Error("Project not found");
      return data;
    },
    enabled: !!task?.project_id,
  });

  const { data: allUsers } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles, { orderBy: [["name", "asc"]] }),
    enabled: !!selectedTaskId,
  });

  const assignees = (task?.assignee_ids || [])
    .map((id) => allUsers?.find((u) => u.id === id))
    .filter(Boolean) as Profile[];

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["comments", selectedTaskId],
    queryFn: () =>
      listDocs<Comment>(COL.comments, {
        where: [["task_id", "==", selectedTaskId!]],
        orderBy: [["created_at", "desc"]],
      }),
    enabled: !!selectedTaskId,
  });

  const { data: commentProfiles } = useQuery<Record<string, Profile>>({
    queryKey: ["profiles-by-id"],
    queryFn: async () => {
      const data = await listDocs<Profile>(COL.profiles);
      const map: Record<string, Profile> = {};
      data.forEach((p) => { map[p.id] = p; });
      return map;
    },
    enabled: !!selectedTaskId,
  });

  const { data: timeLogs } = useQuery<TimeLog[]>({
    queryKey: ["time-logs-task", selectedTaskId],
    queryFn: () =>
      listDocs<TimeLog>(COL.timeLogs, {
        where: [["task_id", "==", selectedTaskId!]],
        orderBy: [["started_at", "desc"]],
      }),
    enabled: !!selectedTaskId,
  });

  const { data: attachments } = useQuery<TaskAttachment[]>({
    queryKey: ["task-attachments", selectedTaskId],
    queryFn: () =>
      listDocs<TaskAttachment>(COL.taskAttachments, {
        where: [["task_id", "==", selectedTaskId!]],
        orderBy: [["created_at", "desc"]],
      }),
    enabled: !!selectedTaskId,
  });

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDesc(task.description);
      setEditAssigneeIds(task.assignee_ids || []);
      setEditPriority(task.priority);
      setEditDue(task.due_date || "");
      setEditStatus(task.status);
    }
  }, [task]);

  useEffect(() => {
    if (!timerActive) return;
    const i = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [timerActive]);

  const updateTask = useMutation({
    mutationFn: async (patch: Partial<Task>) => {
      await patchDoc(COL.tasks, selectedTaskId!, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", selectedTaskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      await removeDoc(COL.tasks, selectedTaskId!);
    },
    onSuccess: () => {
      logActivity("task.delete", "task", selectedTaskId || undefined);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
      toast.success("Task deleted");
      closeTask();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profile not loaded");
      await createDoc(COL.comments, {
        task_id: selectedTaskId!,
        user_id: profile.id,
        body: commentBody,
      });
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["comments", selectedTaskId] });
      const body = commentBody.trim();
      setCommentBody("");
      if (task && profile && body) {
        const mentionIds = newMentionIds("", body).filter((id) => id !== profile.id);
        if (mentionIds.length) {
          await notifyTaskMentionMany({
            recipientIds: mentionIds,
            actorId: profile.id,
            actorName: profile.name || profile.email,
            taskId: task.id,
            taskTitle: task.title,
            context: "comment",
          }).catch(() => {});
        }
        if (task.assignee_ids?.length) {
          const recipients = task.assignee_ids.filter(
            (id) => id !== profile.id && !mentionIds.includes(id),
          );
          if (recipients.length) {
            await notifyTaskCommentAssignees({
              assigneeIds: recipients,
              actorId: profile.id,
              actorName: profile.name || profile.email,
              taskId: task.id,
              taskTitle: task.title,
              preview: body.length > 120 ? `${body.slice(0, 117)}…` : body,
            }).catch(() => {});
          }
        }
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startTimer = async () => {
    if (!profile) {
      toast.error("Profile not loaded");
      return;
    }
    setTimerSeconds(0);
    setTimerActive(true);
    try {
      const data = await createDoc<TimeLog>(COL.timeLogs, {
        user_id: profile.id,
        task_id: selectedTaskId,
        project_id: task?.project_id,
        started_at: new Date().toISOString(),
        source: "timer",
      });
      setTimerLogId(data.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const stopTimer = async () => {
    setTimerActive(false);
    if (!timerLogId) return;
    const ended = new Date().toISOString();
    try {
      await patchDoc(COL.timeLogs, timerLogId, {
        ended_at: ended,
        duration_seconds: timerSeconds,
      });
      rollupTimeLog(timerLogId);
      qc.invalidateQueries({ queryKey: ["time-logs-task", selectedTaskId] });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      toast.success(`Logged ${fmtClock(timerSeconds)}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setTimerLogId(null);
  };

  const saveEdit = async () => {
    const previousAssignees = task?.assignee_ids || [];
    const previousDesc = task?.description || "";
    const nextAssignees = editAssigneeIds;
    updateTask.mutate({
      title: editTitle,
      description: editDesc,
      assignee_ids: nextAssignees,
      priority: editPriority,
      due_date: editDue || null,
      status: editStatus,
    });
    setEditMode(false);
    logActivity("task.update", "task", selectedTaskId || undefined);
    if (profile) {
      const added = newAssigneeIds(previousAssignees, nextAssignees).filter((id) => id !== profile.id);
      if (added.length) {
        await notifyTaskAssignedMany({
          recipientIds: added,
          actorId: profile.id,
          actorName: profile.name || profile.email,
          taskId: selectedTaskId!,
          taskTitle: editTitle || task?.title || "Task",
        }).catch(() => {});
      }
      const mentioned = newMentionIds(previousDesc, editDesc).filter((id) => id !== profile.id);
      if (mentioned.length) {
        await notifyTaskMentionMany({
          recipientIds: mentioned,
          actorId: profile.id,
          actorName: profile.name || profile.email,
          taskId: selectedTaskId!,
          taskTitle: editTitle || task?.title || "Task",
          context: "description",
        }).catch(() => {});
      }
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!profile || !selectedTaskId) return;
    setUploading(true);
    try {
      const { dataUrl, sizeBytes } = await readAttachmentFile(file);
      await createDoc(COL.taskAttachments, {
        task_id: selectedTaskId,
        user_id: profile.id,
        file_name: file.name,
        file_type: file.type || "application/octet-stream",
        file_url: dataUrl,
        size_bytes: sizeBytes,
      });
      qc.invalidateQueries({ queryKey: ["task-attachments", selectedTaskId] });
      toast.success("File attached");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (id: string) => {
    try {
      await removeDoc(COL.taskAttachments, id);
      qc.invalidateQueries({ queryKey: ["task-attachments", selectedTaskId] });
      toast.success("Attachment removed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!drawerOpen || !task) return null;

  const totalTime = (timeLogs || []).reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
  const shade = project?.color || "graphite";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={closeTask} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md glass-strong rounded-none p-6 overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2">
            <MonoBadge shade={shade}>{project?.name || "Project"}</MonoBadge>
          </div>
          <button onClick={closeTask} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        {editMode && isAdmin ? (
          <input className="input mb-3 text-base font-semibold" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        ) : (
          <h2 className="text-xl font-semibold text-white mb-2">{task.title}</h2>
        )}

        <div className="space-y-4">
          <div>
            <p className="label">Description</p>
            {editMode && isAdmin ? (
              <MentionTextarea value={editDesc} onChange={setEditDesc} users={allUsers || []} placeholder="Add details, @mention teammates, or paste links…" />
            ) : task.description ? (
              <RichText text={task.description} className="text-sm text-white/65" />
            ) : (
              <p className="text-sm text-white/65">No description.</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label">Attachments</p>
              <label className="btn btn-ghost !py-1 !px-2 !text-xs cursor-pointer">
                <Paperclip size={13} /> {uploading ? "Uploading…" : "Attach"}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAttachment(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="space-y-2">
              {(attachments || []).map((a) => (
                <div key={a.id} className="flex items-center gap-2 glass px-3 py-2 rounded-xl">
                  <Paperclip size={13} className="text-white/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={a.file_url}
                      download={a.file_name}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-sky-300 hover:text-sky-200 truncate block"
                    >
                      {a.file_name}
                    </a>
                    <span className="text-[10px] text-white/35">{formatFileSize(a.size_bytes)}</span>
                  </div>
                  <a href={a.file_url} download={a.file_name} className="text-white/40 hover:text-white p-1">
                    <Download size={13} />
                  </a>
                  {isAdmin && (
                    <button onClick={() => deleteAttachment(a.id)} className="text-white/40 hover:text-red-300 p-1">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {!attachments?.length && <p className="text-xs text-white/30">No files attached.</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <p className="label">Assignees</p>
              {editMode && isAdmin ? (
                <AssigneeMultiSelect users={allUsers || []} value={editAssigneeIds} onChange={setEditAssigneeIds} />
              ) : (
                <AssigneeList assignees={assignees} />
              )}
            </div>
            <div>
              <p className="label">Priority</p>
              {editMode && isAdmin ? (
                <select className="input" value={editPriority} onChange={(e) => setEditPriority(e.target.value as Priority)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="dot" style={{ background: PRIORITY_DOTS[task.priority] }} />
                  <span className="text-sm text-white/75 capitalize">{task.priority}</span>
                </div>
              )}
            </div>
            <div>
              <p className="label">Due date</p>
              {editMode && isAdmin ? (
                <input type="date" className="input" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
              ) : (
                <span className="text-sm text-white/75">{task.due_date ? fmtDate(task.due_date) : "—"}</span>
              )}
            </div>
            <div>
              <p className="label">Status</p>
              {editMode && isAdmin ? (
                <select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value as TaskStatus)}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              ) : (
                <span className="text-sm text-white/75">{STATUS_LABELS[task.status]}</span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label">Progress</p>
              <span className="text-xs text-white/50 mono">{task.progress ?? 0}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={task.progress ?? 0}
              onChange={(e) => updateTask.mutate({ progress: parseInt(e.target.value) })}
              className="w-full accent-white"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => updateTask.mutate({ status: s, progress: s === "done" ? 100 : s === "in_progress" && task.progress === 0 ? 10 : task.progress })}
                className={`chip transition ${task.status === s ? "!bg-white/15 !border-white/30" : "hover:!bg-white/10"}`}
              >
                {task.status === s && <StatusDot variant="bright" />}
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="glass p-4 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="label">Quick timer</p>
              <span className="text-xs text-white/40">Total: {fmtHours(totalTime)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="mono text-2xl text-white">{fmtClock(timerSeconds)}</span>
              {timerActive ? (
                <button onClick={stopTimer} className="btn btn-ghost ml-auto"><Square size={14} /> Stop</button>
              ) : (
                <button onClick={startTimer} className="btn btn-primary ml-auto"><Play size={14} /> Start</button>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <button onClick={saveEdit} className="btn btn-primary flex-1" disabled={updateTask.isPending}>Save</button>
                  <button onClick={() => setEditMode(false)} className="btn btn-ghost">Cancel</button>
                </>
              ) : (
                <button onClick={() => setEditMode(true)} className="btn btn-ghost flex-1">Edit task</button>
              )}
              <button onClick={() => deleteTask.mutate()} className="btn btn-danger"><Trash2 size={14} /></button>
            </div>
          )}

          <div>
            <p className="label mb-3">Comments</p>
            <div className="space-y-3 mb-3">
              {(comments || []).map((c) => {
                const cp = commentProfiles?.[c.user_id];
                return (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={cp?.name || "?"} url={cp?.avatar_url} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm text-white/85">{cp?.name || "Unknown"}</span>
                        <span className="text-[10px] text-white/35">{fmtRelative(c.created_at)}</span>
                      </div>
                      <RichText text={c.body} className="text-sm text-white/60 mt-0.5" />
                    </div>
                  </div>
                );
              })}
              {!comments?.length && <p className="text-xs text-white/30">No comments yet.</p>}
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <MentionTextarea
                  value={commentBody}
                  onChange={setCommentBody}
                  users={allUsers || []}
                  placeholder="Add a comment…"
                  rows={2}
                />
              </div>
              <button onClick={() => commentBody.trim() && addComment.mutate()} className="btn btn-ghost shrink-0" disabled={addComment.isPending}>
                <Send size={14} />
              </button>
            </div>
          </div>

          <div>
            <p className="label mb-2">Recent time logs</p>
            <div className="space-y-1">
              {(timeLogs || []).slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs text-white/50 py-1.5 border-b border-white/5">
                  <span>{fmtRelative(l.started_at)}</span>
                  <span className="mono">{l.duration_seconds ? fmtClock(l.duration_seconds) : "—"}</span>
                  <span className="capitalize">{l.source}</span>
                </div>
              ))}
              {!timeLogs?.length && <p className="text-xs text-white/30">No time logged.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
