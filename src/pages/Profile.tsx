import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, KeyRound, Bell } from "lucide-react";
import { updatePassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { COL, patchDoc } from "../lib/db";
import { useAuth } from "../lib/auth";
import { GlassPanel, LiftedTile, SectionLabel, Avatar } from "../components/ui";
import { resetPasswordSchema } from "../lib/schemas";

export default function Profile() {
  const { profile, refreshProfile, signOut } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(profile?.name || "");
  const [title, setTitle] = useState(profile?.title || "");
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(profile?.notif_prefs || {
    task_assigned: true,
    comment_on_task: true,
    daily_summary: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await patchDoc(COL.profiles, profile!.id, { name, title, avatar_url: avatar });
      await refreshProfile();
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Profile updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const ratio = Math.max(256 / img.width, 256 / img.height);
        const x = (img.width * ratio - 256) / 2 / ratio;
        const y = (img.height * ratio - 256) / 2 / ratio;
        ctx.drawImage(img, -x, -y, 256 / ratio, 256 / ratio);
        setAvatar(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const changePassword = async () => {
    const parsed = resetPasswordSchema.safeParse({ password: pw, confirm: confirmPw });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setSavingPw(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not signed in");
      await updatePassword(currentUser, pw);
      toast.success("Password changed. Please sign in again.");
      await signOut();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPw(false);
    }
  };

  const saveNotifs = async () => {
    try {
      await patchDoc(COL.profiles, profile!.id, { notif_prefs: notifPrefs });
      toast.success("Preferences saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-2xl space-y-5">
      <LiftedTile className="p-6">
        <SectionLabel>Profile</SectionLabel>
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <Avatar name={name || "User"} url={avatar} size={72} />
            <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white text-black flex items-center justify-center"><Upload size={13} /></button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{name || "Unnamed"}</p>
            <p className="text-sm text-white/45">{profile.email}</p>
            <span className="chip mt-2 capitalize">{profile.role}</span>
          </div>
        </div>
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
        <div className="mt-4"><button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button></div>
      </LiftedTile>

      <GlassPanel className="p-6">
        <SectionLabel>Change password</SectionLabel>
        <div className="space-y-4">
          <div>
            <label className="label">New password</label>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Minimum 8 characters" />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={changePassword} disabled={savingPw}><KeyRound size={14} /> {savingPw ? "Changing…" : "Change & sign out"}</button>
        </div>
      </GlassPanel>

      <GlassPanel className="p-6">
        <SectionLabel>Notification preferences</SectionLabel>
        <div className="space-y-3">
          {[
            { key: "task_assigned", label: "Task assigned to me" },
            { key: "comment_on_task", label: "Comment on my task" },
            { key: "daily_summary", label: "Daily summary" },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between">
              <span className="text-sm text-white/75 flex items-center gap-2"><Bell size={14} className="text-white/40" /> {n.label}</span>
              <button
                onClick={() => setNotifPrefs((prev) => ({ ...prev, [n.key]: !prev[n.key] }))}
                className={`w-11 h-6 rounded-full transition relative ${notifPrefs[n.key] ? "bg-white/80" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full transition ${notifPrefs[n.key] ? "left-[22px] bg-black" : "left-0.5 bg-white/60"}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4"><button className="btn btn-primary" onClick={saveNotifs}>Save preferences</button></div>
      </GlassPanel>
    </div>
  );
}
