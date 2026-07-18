import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { COL, createDoc, listDocs, patchDoc, removeDoc, removeWhere } from "../lib/db";
import { useAuth } from "../lib/auth";
import { useUIStore } from "../lib/ui-store";
import { GlassPanel, Modal, ConfirmDialog, Avatar, EmptyState, MonoBadge } from "../components/ui";
import { SHADES, SHADE_KEYS, getShade } from "../lib/constants";
import { projectSchema } from "../lib/schemas";
import { logActivity } from "../lib/functions";
import type { Project, Profile, ProjectMember, Task, ShadeKey } from "../lib/types";

export default function Projects() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { setProjectFilter } = useUIStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => listDocs<Project>(COL.projects, { orderBy: [["created_at", "desc"]] }),
  });

  const { data: members } = useQuery<ProjectMember[]>({
    queryKey: ["project-members"],
    queryFn: () => listDocs<ProjectMember>(COL.projectMembers),
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => listDocs<Task>(COL.tasks),
  });

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles, { orderBy: [["name", "asc"]] }),
  });

  const profileMap: Record<string, Profile> = {};
  (users || []).forEach((u) => { profileMap[u.id] = u; });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      await removeDoc(COL.projects, id);
    },
    onSuccess: (_, id) => {
      logActivity("project.delete", "project", id);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Project deleted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openProject = (p: Project) => {
    setProjectFilter(p.id);
    nav("/tasks");
  };

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={() => { setEditProject(null); setDialogOpen(true); }}>
            <Plus size={15} /> New Project
          </button>
        </div>
      )}

      {!projects?.length ? (
        <EmptyState title="No projects yet" hint={isAdmin ? "Create your first project." : "Ask an admin to create a project."} icon={<Plus size={32} />} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const shade = getShade(p.color);
            const pMembers = (members || []).filter((m) => m.project_id === p.id);
            const pTasks = (tasks || []).filter((t) => t.project_id === p.id);
            return (
              <GlassPanel key={p.id} className="p-5 flex flex-col gap-4 group" style={{ borderColor: shade.ring }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: shade.chip, border: `1px solid ${shade.ring}` }}>
                      <span className="dot" style={{ background: shade.dot }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">{p.name}</h3>
                      <p className="eyebrow capitalize mt-0.5">{p.status.replace("_", " ")}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => { setEditProject(p); setDialogOpen(true); }} className="p-1.5 rounded-lg hover:bg-white/8 text-white/50"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(p.id)} className="p-1.5 rounded-lg hover:bg-white/8 text-white/50"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>

                <p className="text-sm text-white/50 line-clamp-2 flex-1">{p.description || "No description."}</p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center -space-x-2">
                    {pMembers.slice(0, 4).map((m) => {
                      const u = profileMap[m.user_id];
                      return u ? <Avatar key={m.id} name={u.name} url={u.avatar_url} size={26} /> : null;
                    })}
                    {pMembers.length > 4 && (
                      <div className="w-[26px] h-[26px] rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-[10px] text-white/50">+{pMembers.length - 4}</div>
                    )}
                    {!pMembers.length && <span className="text-xs text-white/30">No members</span>}
                  </div>
                  <MonoBadge shade={p.color}>{pTasks.length} tasks</MonoBadge>
                </div>

                <button onClick={() => openProject(p)} className="btn btn-ghost w-full">
                  Open <ArrowRight size={14} />
                </button>
              </GlassPanel>
            );
          })}
        </div>
      )}

      <ProjectDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditProject(null); }}
        project={editProject}
        users={users || []}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteProject.mutate(deleteId)}
        title="Delete project?"
        message="This will permanently delete the project and all its tasks. This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}

function ProjectDialog({ open, onClose, project, users }: { open: boolean; onClose: () => void; project: Project | null; users: Profile[] }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ShadeKey>("graphite");
  const [status, setStatus] = useState("active");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setDescription(project.description);
      setColor(project.color);
      setStatus(project.status);
      listDocs<{ user_id: string }>(COL.projectMembers, {
        where: [["project_id", "==", project.id]],
      })
        .then((data) => setMemberIds(data.map((m) => m.user_id)))
        .catch(() => setMemberIds([]));
    } else {
      setName("");
      setDescription("");
      setColor("graphite");
      setStatus("active");
      setMemberIds([]);
    }
  }, [open, project]);

  const submit = async () => {
    if (!profile) {
      toast.error("Profile not loaded");
      return;
    }
    const parsed = projectSchema.safeParse({ name, description, color, status, memberIds });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSaving(true);
    try {
      if (project) {
        await patchDoc(COL.projects, project.id, { name, description, color, status });
        await removeWhere(COL.projectMembers, "project_id", project.id);
        if (memberIds.length) {
          await Promise.all(
            memberIds.map((uid) => createDoc(COL.projectMembers, { project_id: project.id, user_id: uid })),
          );
        }
        logActivity("project.update", "project", project.id);
        toast.success("Project updated");
      } else {
        const data = await createDoc<Project>(COL.projects, {
          name, description, color, status, created_by: profile.id,
        });
        const newId = data.id;
        if (memberIds.length) {
          await Promise.all(
            memberIds.map((uid) => createDoc(COL.projectMembers, { project_id: newId, user_id: uid })),
          );
        }
        logActivity("project.create", "project", newId);
        toast.success("Project created");
      }
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project-members"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={project ? "Edit project" : "New project"} wide>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Shade</label>
            <div className="flex gap-2">
              {SHADE_KEYS.map((s) => (
                <button key={s} onClick={() => setColor(s)} className="w-9 h-9 rounded-xl transition" style={{ background: SHADES[s].chip, border: `1.5px solid ${color === s ? SHADES[s].dot : SHADES[s].ring}` }} title={s} />
              ))}
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Members</label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {users.map((u) => (
              <button key={u.id} onClick={() => setMemberIds((prev) => prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id])} className={`chip transition ${memberIds.includes(u.id) ? "!bg-white/15 !border-white/30" : ""}`}>
                <Avatar name={u.name} url={u.avatar_url} size={18} />
                {u.name || u.email}
              </button>
            ))}
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
