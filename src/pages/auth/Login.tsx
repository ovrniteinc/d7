import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { loginSchema } from "../../lib/schemas";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      toast.success("Signed in");
      nav("/");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="obsidian-bg min-h-screen w-full flex items-center justify-center p-4 relative">
      <div className="relative z-10 grid lg:grid-cols-[1fr_1.1fr] max-w-5xl w-full gap-6 items-stretch">
        <div className="hidden lg:flex flex-col justify-between p-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white text-black font-bold text-lg">7</div>
            <div>
              <p className="text-white font-semibold tracking-tight">District 7</p>
              <p className="eyebrow">Internal Work & CRM</p>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold text-white leading-tight text-balance">
              The closed workspace for your team's work, time, and focus.
            </h1>
            <p className="text-sm text-white/45 max-w-sm">
              Projects, tasks, calendar, a shared blackboard, and consent-based productivity insight —
              all behind admin-provisioned access.
            </p>
          </div>
          <p className="text-xs text-white/30">Consent-based monitoring · UK-GDPR · Saudi PDPL</p>
        </div>

        <div className="glass-strong p-8 flex flex-col justify-center">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white text-black font-bold">7</div>
            <p className="text-white font-semibold">District 7</p>
          </div>
          <h2 className="text-xl font-semibold text-white mb-1">Sign in</h2>
          <p className="text-xs text-white/45 mb-6">Accounts are admin-provisioned only.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@district7.local" autoComplete="email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
