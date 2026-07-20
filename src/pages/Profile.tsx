import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, KeyRound, Bell } from "lucide-react";
import { updatePassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { COL, patchDoc } from "../lib/db";
import { useAuth } from "../lib/auth";
import { GlassPanel, LiftedTile, SectionLabel, Avatar } from "../components/ui";
import AvatarCropModal from "../components/AvatarCropModal";
import { resetPasswordSchema } from "../lib/schemas";
import { requestBrowserNotificationPermission } from "../lib/notifications";

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
    task_mention: true,
  });
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
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
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be smaller than 8 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const closeCrop = () => {
    setCropOpen(false);
    setCropImageSrc(null);
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
      await refreshProfile();
      if (Object.values(notifPrefs).some(Boolean)) {
        const permission = await requestBrowserNotificationPermission();
        if (permission === "denied") {
          toast.message("Browser notifications blocked", {
            description: "Enable notifications for this site in your browser settings to get alerts while the app is open.",
          });
        }
      }
      toast.success("Preferences saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-2xl space-y-5">
      <AvatarCropModal
        open={cropOpen}
        imageSrc={cropImageSrc}
        onClose={closeCrop}
        onConfirm={(cropped) => {
          setAvatar(cropped);
          toast.message("Photo updated", { description: "Click Save profile to keep this change." });
        }}
      />
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
        <p className="text-xs text-white/45 mb-4 leading-relaxed">
          When enabled, you get in-app alerts and browser notifications while District 7 is open, plus email alerts on the deployed site (requires Resend setup on Vercel).
        </p>
        <div className="space-y-3">
          {[
            { key: "task_assigned", label: "Task assigned to me" },
            { key: "comment_on_task", label: "Comment on my task" },
            { key: "task_mention", label: "Mentioned in a task" },
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
