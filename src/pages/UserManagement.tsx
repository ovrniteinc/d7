import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Copy, RefreshCw, Trash2 } from "lucide-react";
import { COL, listDocs, patchDoc, removeDoc } from "../lib/db";
import { useAuth } from "../lib/auth";
import { GlassPanel, Modal, Avatar, EmptyState, SectionLabel, StatusDot } from "../components/ui";
import { fmtDate } from "../lib/format";
import { createTeamUser, updateUserRole, logActivity } from "../lib/functions";
import { userSchema } from "../lib/schemas";
import type { Profile, Role, UserStatus } from "../lib/types";

export default function UserManagement() {
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string; needsConsoleAuth?: boolean } | null>(null);

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles, { orderBy: [["created_at", "desc"]] }),
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Profile> }) => {
      await patchDoc(COL.profiles, id, patch);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profiles"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleStatus = (u: Profile) => {
    const next: UserStatus = u.status === "active" ? "inactive" : "active";
    updateProfile.mutate({ id: u.id, patch: { status: next } });
    logActivity("user.status_change", "user", u.id, { to: next });
  };

  const resetPassword = (u: Profile) => {
    updateProfile.mutate({ id: u.id, patch: { must_reset_password: true } });
    toast.success("User will be required to reset password on next login");
  };

  const deleteUser = async (id: string) => {
    const admins = (users || []).filter((u) => u.role === "admin" && u.status === "active");
    if (id === me?.id) { toast.error("Cannot delete yourself"); return; }
    if (admins.length <= 1 && admins[0]?.id === id) { toast.error("Cannot delete the last active admin"); return; }
    try {
      await removeDoc(COL.profiles, id);
      logActivity("user.delete", "user", id);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("User deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={() => { setEditUser(null); setDialogOpen(true); }}><Plus size={15} /> New User</button>
      </div>

      <GlassPanel className="p-5">
        <SectionLabel>Team members</SectionLabel>
        {users?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left eyebrow border-b border-white/8">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="table-row">
                    <td className="py-2.5 pr-4"><div className="flex items-center gap-2"><Avatar name={u.name} url={u.avatar_url} size={26} /><span className="text-white/80 text-xs">{u.name || "—"}</span></div></td>
                    <td className="py-2.5 pr-4 text-white/50 text-xs">{u.email}</td>
                    <td className="py-2.5 pr-4 text-white/50 text-xs">{u.title || "—"}</td>
                    <td className="py-2.5 pr-4 text-xs capitalize"><span className="chip">{u.role}</span></td>
                    <td className="py-2.5 pr-4"><div className="flex items-center gap-2"><StatusDot variant={u.status === "active" ? "bright" : "dim"} /><span className="text-xs text-white/60 capitalize">{u.status}</span></div></td>
                    <td className="py-2.5 pr-4 text-white/40 text-xs">{fmtDate(u.created_at)}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditUser(u); setDialogOpen(true); }} className="btn btn-ghost !p-2 !text-xs">Edit</button>
                        <button onClick={() => toggleStatus(u)} className="btn btn-ghost !p-2" title="Toggle status"><RefreshCw size={12} /></button>
                        <button onClick={() => deleteUser(u.id)} className="btn btn-danger !p-2"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No users yet" hint="Create your first team member." icon={<Plus size={28} />} />
        )}
      </GlassPanel>

      <UserDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setCreatedCreds(null); }}
        editUser={editUser}
        onCreated={(creds) => setCreatedCreds(creds)}
        createdCreds={createdCreds}
        onResetPassword={resetPassword}
      />
    </div>
  );
}

function UserDialog({ open, onClose, editUser, onCreated, createdCreds, onResetPassword }: {
  open: boolean;
  onClose: () => void;
  editUser: Profile | null;
  onCreated: (creds: { email: string; password: string; needsConsoleAuth?: boolean }) => void;
  createdCreds: { email: string; password: string; needsConsoleAuth?: boolean } | null;
  onResetPassword: (u: Profile) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editUser) {
      setName(editUser.name);
      setTitle(editUser.title);
      setEmail(editUser.email);
      setRole(editUser.role);
      setPassword("");
    } else {
      setName("");
      setTitle("");
      setEmail("");
      setRole("staff");
      setPassword("");
    }
  }, [open, editUser]);

  const genPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#";
    let p = "";
    for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p);
  };

  const copyCreds = () => {
    if (createdCreds) {
      navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
      toast.success("Credentials copied");
    }
  };

  const submit = async () => {
    if (editUser) {
      setSaving(true);
      try {
        await patchDoc(COL.profiles, editUser.id, { name, title, email });
        if (role !== editUser.role) {
          await updateUserRole(editUser.id, role);
        }
        logActivity("user.update", "user", editUser.id);
        qc.invalidateQueries({ queryKey: ["profiles"] });
        toast.success("User updated");
        onClose();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setSaving(false);
      }
    } else {
      const parsed = userSchema.safeParse({ name, title, email, role, password });
      if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
      setSaving(true);
      try {
        const result = await createTeamUser({ name, title, email, role, password });
        qc.invalidateQueries({ queryKey: ["profiles"] });
        onCreated({ email: result.email, password: result.password, needsConsoleAuth: result.needsConsoleAuth });
        setName(""); setTitle(""); setEmail(""); setRole("staff"); setPassword("");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editUser ? "Edit user" : "New user"} wide>
      {createdCreds ? (
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Invite saved. Complete these steps so the user can sign in (free Spark plan — no Cloud Functions needed).
          </p>
          {createdCreds.needsConsoleAuth && (
            <div className="glass p-4 rounded-xl space-y-2 text-sm text-white/75">
              <p className="font-medium text-white/90">1. Add the Auth account in Firebase Console</p>
              <p className="text-white/55 text-xs">
                Firebase Console → Authentication → Users → Add user → use the exact email and temp password below.
              </p>
              <p className="font-medium text-white/90 pt-2">2. Share credentials with the user</p>
              <p className="text-white/55 text-xs">
                On first login their profile is created automatically from the invite.
              </p>
            </div>
          )}
          <div className="glass p-4 rounded-xl space-y-2">
            <div><span className="label">Email</span><p className="text-sm text-white/85 mono">{createdCreds.email}</p></div>
            <div><span className="label">Password</span><p className="text-sm text-white/85 mono">{createdCreds.password}</p></div>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-ghost flex-1" onClick={copyCreds}><Copy size={14} /> Copy credentials</button>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!editUser} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Role</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {!editUser && (
              <div>
                <label className="label">Temp password</label>
                <div className="flex gap-2">
                  <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" />
                  <button onClick={genPassword} className="btn btn-ghost !text-xs whitespace-nowrap">Generate</button>
                </div>
              </div>
            )}
          </div>
          {editUser && (
            <button onClick={() => onResetPassword(editUser)} className="btn btn-ghost !text-xs"><RefreshCw size={13} /> Force password reset</button>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : editUser ? "Save" : "Create user"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
