import { useState } from "react";
import { toast } from "sonner";
import { updatePassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { COL, patchDoc } from "../../lib/db";
import { resetPasswordSchema } from "../../lib/schemas";
import { useAuth } from "../../lib/auth";

export default function ForcePasswordReset() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not signed in");
      await updatePassword(currentUser, password);
      await patchDoc(COL.profiles, currentUser.uid, { must_reset_password: false });
      toast.success("Password updated. Please sign in again.");
      await signOut();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="obsidian-bg min-h-screen w-full flex items-center justify-center p-4 relative">
      <div className="relative z-10 w-full max-w-md">
        <div className="glass-strong p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white text-black font-bold">7</div>
            <p className="text-white font-semibold">District 7</p>
          </div>
          <h2 className="text-xl font-semibold text-white mb-1">Reset your password</h2>
          <p className="text-xs text-white/45 mb-6">An admin requires you to set a new password before continuing.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" autoComplete="new-password" />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            <button className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Updating…" : "Update & sign out"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
