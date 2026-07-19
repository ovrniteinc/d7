import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Square, Timer } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { COL, createDoc, listDocs, patchDoc } from "../lib/db";
import { useAuth } from "../lib/auth";
import { useUIStore } from "../lib/ui-store";
import { GlassPanel, LiftedTile, StatTile, EmptyState, SectionLabel } from "../components/ui";
import { fmtClock, fmtHours, fmtRelative } from "../lib/format";
import { rollupTimeLog } from "../lib/functions";
import { startSessionUsageTracker, stopSessionUsageTracker } from "../lib/session-usage-tracker";
import type { TimeLog, Task, Project, Profile } from "../lib/types";

export default function WorkTracker() {
  const { profile, isAdmin } = useAuth();
  const { personFilter } = useUIStore();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"tracking" | "idle" | "away">("idle");
  const [seconds, setSeconds] = useState(0);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const lastInputRef = useRef(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => listDocs<Task>(COL.tasks),
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => listDocs<Project>(COL.projects),
  });

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles),
    enabled: isAdmin,
  });

  const targetUserId = isAdmin && personFilter ? personFilter : profile?.id;

  const { data: timeLogs } = useQuery<TimeLog[]>({
    queryKey: ["time-logs", targetUserId],
    queryFn: async () => {
      const where: [string, "==", unknown][] = [];
      if (targetUserId) where.push(["user_id", "==", targetUserId]);
      return listDocs<TimeLog>(COL.timeLogs, {
        where: where.length ? where : undefined,
        orderBy: [["started_at", "desc"]],
        limit: 100,
      });
    },
  });

  const projectMap: Record<string, Project> = {};
  (projects || []).forEach((p) => { projectMap[p.id] = p; });
  const taskMap: Record<string, Task> = {};
  (tasks || []).forEach((t) => { taskMap[t.id] = t; });
  const userMap: Record<string, Profile> = {};
  (users || []).forEach((u) => { userMap[u.id] = u; });

  const availableTasks = isAdmin ? (tasks || []) : (tasks || []).filter((t) => t.assignee_id === profile?.id);

  useEffect(() => {
    const reconcile = async () => {
      if (!profile) return;
      try {
        const rows = await listDocs<TimeLog>(COL.timeLogs, {
          where: [["user_id", "==", profile.id]],
          orderBy: [["started_at", "desc"]],
          limit: 20,
        });
        const data = rows.find((row) => !row.ended_at);
        if (data) {
          setActiveLogId(data.id);
          setSelectedTask(data.task_id || "");
          setSelectedProject(data.project_id || "");
          setStatus("tracking");
          const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000);
          setSeconds(elapsed);
          setFocusSeconds(elapsed);
          await startSessionUsageTracker(profile.id);
        }
      } catch (e) {
        console.warn("Failed to reconcile active timer", e);
      }
    };
    reconcile();
  }, [profile]);

  useEffect(() => {
    const onInput = () => { lastInputRef.current = Date.now(); if (status === "away") setStatus("tracking"); };
    const onVisibility = () => { if (document.hidden) setStatus("away"); else if (activeLogId) setStatus("tracking"); };
    window.addEventListener("mousemove", onInput);
    window.addEventListener("keydown", onInput);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("mousemove", onInput);
      window.removeEventListener("keydown", onInput);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, activeLogId]);

  useEffect(() => {
    if (status !== "tracking") return;
    tickRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
      if (Date.now() - lastInputRef.current > 300000) {
        setStatus("idle");
        setIdleSeconds((s) => s + 1);
      } else {
        setFocusSeconds((s) => s + 1);
      }
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [status]);

  const start = async () => {
    if (!profile) {
      toast.error("Profile not loaded");
      return;
    }
    setSeconds(0); setFocusSeconds(0); setIdleSeconds(0);
    setStatus("tracking");
    lastInputRef.current = Date.now();
    try {
      const data = await createDoc<TimeLog>(COL.timeLogs, {
        user_id: profile.id,
        task_id: selectedTask || null,
        project_id: selectedProject || null,
        started_at: new Date().toISOString(),
        source: "timer",
      });
      setActiveLogId(data.id);
      await startSessionUsageTracker(profile.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const stop = async () => {
    if (!activeLogId) { setStatus("idle"); return; }
    const ended = new Date().toISOString();
    try {
      await stopSessionUsageTracker();
      await patchDoc(COL.timeLogs, activeLogId, {
        ended_at: ended, duration_seconds: focusSeconds,
      });
      rollupTimeLog(activeLogId);
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      qc.invalidateQueries({ queryKey: ["app-usage"] });
      qc.invalidateQueries({ queryKey: ["agent-devices"] });
      toast.success(`Logged ${fmtClock(focusSeconds)}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setActiveLogId(null);
    setStatus("idle");
    setSeconds(0); setFocusSeconds(0); setIdleSeconds(0);
  };

  const focusByProject = (timeLogs || [])
    .filter((l) => l.duration_seconds && l.project_id)
    .reduce<Record<string, number>>((acc, l) => {
      acc[l.project_id!] = (acc[l.project_id!] || 0) + (l.duration_seconds || 0);
      return acc;
    }, {});
  const chartData = Object.entries(focusByProject).map(([pid, sec]) => ({
    name: projectMap[pid]?.name || "Unknown",
    Focus: sec,
  })).sort((a, b) => b.Focus - a.Focus).slice(0, 8);

  const todayFocus = (timeLogs || [])
    .filter((l) => l.duration_seconds && new Date(l.started_at).toDateString() === new Date().toDateString())
    .reduce((sum, l) => sum + (l.duration_seconds || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-[1fr_1.5fr] gap-4">
        <LiftedTile className="p-6">
          <SectionLabel>Session</SectionLabel>
          <div className="flex items-center gap-3 mb-4">
            <span className={`dot ${status === "tracking" ? "dot-pulse" : status === "idle" ? "dot-mid" : "dot-dim"}`} />
            <span className="text-sm text-white/85 capitalize">{status}</span>
          </div>
          <div className="mono text-5xl text-white mb-4 tracking-tight">{fmtClock(seconds)}</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass p-3 rounded-xl">
              <p className="eyebrow">Focus</p>
              <p className="mono text-lg text-white/85">{fmtClock(focusSeconds)}</p>
            </div>
            <div className="glass p-3 rounded-xl">
              <p className="eyebrow">Idle</p>
              <p className="mono text-lg text-white/50">{fmtClock(idleSeconds)}</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            <select className="input" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} disabled={status === "tracking"}>
              <option value="">Select project (optional)</option>
              {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="input" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)} disabled={status === "tracking"}>
              <option value="">Select task (optional)</option>
              {availableTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          {status === "idle" && !activeLogId ? (
            <button onClick={start} className="btn btn-primary w-full"><Play size={15} /> Start tracking</button>
          ) : (
            <button onClick={stop} className="btn btn-ghost w-full"><Square size={15} /> Stop & log</button>
          )}
          <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
            While the timer runs, browser activity is saved to App usage automatically (same login, no extra setup).
          </p>
        </LiftedTile>

        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Today's Focus" value={fmtHours(todayFocus)} icon={<Timer size={16} />} />
          <StatTile label="Total Sessions" value={(timeLogs || []).filter((l) => l.ended_at).length} icon={<Timer size={16} />} />
          <GlassPanel className="p-5 col-span-2">
            <SectionLabel>Focus by project</SectionLabel>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtHours(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{ background: "rgba(20,20,23,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: any) => fmtHours(Number(v) || 0)}
                  />
                  <Bar dataKey="Focus" fill="rgba(255,255,255,0.7)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No focus data yet" hint="Start tracking to see breakdown." icon={<Timer size={28} />} />
            )}
          </GlassPanel>
        </div>
      </div>

      <GlassPanel className="p-5">
        <SectionLabel>Session history</SectionLabel>
        {(timeLogs || []).filter((l) => l.ended_at).length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left eyebrow border-b border-white/8">
                  <th className="py-2 pr-4">Started</th>
                  {isAdmin && <th className="py-2 pr-4">User</th>}
                  <th className="py-2 pr-4">Duration</th>
                  <th className="py-2 pr-4">Task</th>
                  <th className="py-2 pr-4">Project</th>
                  <th className="py-2 pr-4">Source</th>
                </tr>
              </thead>
              <tbody>
                {(timeLogs || []).filter((l) => l.ended_at).slice(0, 50).map((l) => (
                  <tr key={l.id} className="table-row">
                    <td className="py-2.5 pr-4 text-white/60 text-xs">{fmtRelative(l.started_at)}</td>
                    {isAdmin && <td className="py-2.5 pr-4 text-white/60 text-xs">{userMap[l.user_id]?.name || "—"}</td>}
                    <td className="py-2.5 pr-4 mono text-white/80 text-xs">{fmtClock(l.duration_seconds || 0)}</td>
                    <td className="py-2.5 pr-4 text-white/60 text-xs truncate max-w-[160px]">{l.task_id ? taskMap[l.task_id]?.title || "—" : "—"}</td>
                    <td className="py-2.5 pr-4 text-white/60 text-xs">{l.project_id ? projectMap[l.project_id]?.name || "—" : "—"}</td>
                    <td className="py-2.5 pr-4 text-white/40 text-xs capitalize">{l.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No sessions logged" hint="Start tracking to build history." icon={<Timer size={28} />} />
        )}
      </GlassPanel>
    </div>
  );
}
