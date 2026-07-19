import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { COL, listDocs, type WhereClause } from "../lib/db";
import { useUIStore } from "../lib/ui-store";
import { GlassPanel, EmptyState, SectionLabel } from "../components/ui";
import { fmtDateTime, fmtClock, fmtActivityAction } from "../lib/format";
import type { ActivityLog, TimeLog, AppUsage, Profile, Task, Project } from "../lib/types";

type Tab = "audit" | "time" | "usage";

export default function Reports() {
  const { personFilter } = useUIStore();
  const [tab, setTab] = useState<Tab>("audit");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles),
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => listDocs<Task>(COL.tasks),
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => listDocs<Project>(COL.projects),
  });

  const userMap: Record<string, Profile> = {};
  (users || []).forEach((u) => { userMap[u.id] = u; });
  const taskMap: Record<string, Task> = {};
  (tasks || []).forEach((t) => { taskMap[t.id] = t; });
  const projectMap: Record<string, Project> = {};
  (projects || []).forEach((p) => { projectMap[p.id] = p; });

  const { data: auditLogs } = useQuery<ActivityLog[]>({
    queryKey: ["audit-logs", from, to, personFilter],
    queryFn: async () => {
      const where: WhereClause[] = [];
      if (personFilter) where.push(["user_id", "==", personFilter]);
      if (from) where.push(["created_at", ">=", new Date(from).toISOString()]);
      if (to) where.push(["created_at", "<=", new Date(to + "T23:59:59").toISOString()]);
      return listDocs<ActivityLog>(COL.activityLogs, {
        where,
        orderBy: [["created_at", "desc"]],
        limit: 1000,
      });
    },
  });

  const { data: timeLogs } = useQuery<TimeLog[]>({
    queryKey: ["time-logs-report", from, to, personFilter],
    queryFn: async () => {
      const where: WhereClause[] = [];
      if (personFilter) where.push(["user_id", "==", personFilter]);
      if (from) where.push(["started_at", ">=", new Date(from).toISOString()]);
      if (to) where.push(["started_at", "<=", new Date(to + "T23:59:59").toISOString()]);
      return listDocs<TimeLog>(COL.timeLogs, {
        where,
        orderBy: [["started_at", "desc"]],
        limit: 1000,
      });
    },
  });

  const { data: appUsage } = useQuery<AppUsage[]>({
    queryKey: ["app-usage-report", from, to, personFilter],
    queryFn: async () => {
      const where: WhereClause[] = [];
      if (personFilter) where.push(["user_id", "==", personFilter]);
      if (from) where.push(["started_at", ">=", new Date(from).toISOString()]);
      if (to) where.push(["started_at", "<=", new Date(to + "T23:59:59").toISOString()]);
      return listDocs<AppUsage>(COL.appUsage, {
        where,
        orderBy: [["started_at", "desc"]],
        limit: 1000,
      });
    },
  });

  const exportCsv = () => {
    let rows: string[][] = [];
    let type = tab;
    if (tab === "audit") {
      rows = [["Time", "User", "Action", "Entity", "Details"]];
      (auditLogs || []).forEach((l) => {
        rows.push([
          fmtDateTime(l.created_at),
          userMap[l.user_id || ""]?.name || "—",
          fmtActivityAction(l.action, l.meta),
          l.entity_type || "—",
          JSON.stringify(l.meta || {}),
        ]);
      });
    } else if (tab === "time") {
      rows = [["Started", "User", "Duration", "Task", "Project", "Source"]];
      (timeLogs || []).forEach((l) => {
        rows.push([fmtDateTime(l.started_at), userMap[l.user_id]?.name || "—", fmtClock(l.duration_seconds || 0), l.task_id ? taskMap[l.task_id]?.title || "—" : "—", l.project_id ? projectMap[l.project_id]?.name || "—" : "—", l.source]);
      });
    } else {
      rows = [["Started", "User", "App", "Window Title", "Category", "Duration"]];
      (appUsage || []).forEach((u) => {
        rows.push([fmtDateTime(u.started_at), userMap[u.user_id]?.name || "—", u.app_name, u.window_title, u.category, fmtClock(u.duration_seconds || 0)]);
      });
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `district7-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex glass rounded-xl p-1">
          {(["audit", "time", "usage"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition ${tab === t ? "bg-white/15 text-white" : "text-white/50"}`}>
              {t === "audit" ? "Audit Log" : t === "time" ? "Time Logs" : "App Usage"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="input !py-2 !px-3 !text-xs w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-white/30 text-xs">to</span>
          <input type="date" className="input !py-2 !px-3 !text-xs w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn btn-ghost !text-xs" onClick={exportCsv}><Download size={13} /> Export CSV</button>
        </div>
      </div>

      <GlassPanel className="p-5">
        {tab === "audit" && (
          <>
            <SectionLabel>Audit log</SectionLabel>
            {(auditLogs || []).length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left eyebrow border-b border-white/8">
                      <th className="py-2 pr-4">Time</th>
                      <th className="py-2 pr-4">User</th>
                      <th className="py-2 pr-4">Action</th>
                      <th className="py-2 pr-4">Entity</th>
                      <th className="py-2 pr-4">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditLogs || []).slice(0, 200).map((l) => (
                      <tr key={l.id} className="table-row">
                        <td className="py-2.5 pr-4 text-white/60 text-xs whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                        <td className="py-2.5 pr-4 text-white/70 text-xs">{userMap[l.user_id || ""]?.name || "System"}</td>
                        <td className="py-2.5 pr-4 text-white/80 text-xs">{fmtActivityAction(l.action, l.meta)}</td>
                        <td className="py-2.5 pr-4 text-white/50 text-xs">{l.entity_type || "—"}</td>
                        <td className="py-2.5 pr-4 text-white/40 text-xs truncate max-w-[200px]">{JSON.stringify(l.meta || {})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No audit entries" icon={<Download size={28} />} />}
          </>
        )}

        {tab === "time" && (
          <>
            <SectionLabel>Time logs</SectionLabel>
            {(timeLogs || []).length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left eyebrow border-b border-white/8">
                      <th className="py-2 pr-4">Started</th>
                      <th className="py-2 pr-4">User</th>
                      <th className="py-2 pr-4">Duration</th>
                      <th className="py-2 pr-4">Task</th>
                      <th className="py-2 pr-4">Project</th>
                      <th className="py-2 pr-4">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(timeLogs || []).slice(0, 200).map((l) => (
                      <tr key={l.id} className="table-row">
                        <td className="py-2.5 pr-4 text-white/60 text-xs">{fmtDateTime(l.started_at)}</td>
                        <td className="py-2.5 pr-4 text-white/70 text-xs">{userMap[l.user_id]?.name || "—"}</td>
                        <td className="py-2.5 pr-4 mono text-white/80 text-xs">{fmtClock(l.duration_seconds || 0)}</td>
                        <td className="py-2.5 pr-4 text-white/60 text-xs truncate max-w-[160px]">{l.task_id ? taskMap[l.task_id]?.title || "—" : "—"}</td>
                        <td className="py-2.5 pr-4 text-white/60 text-xs">{l.project_id ? projectMap[l.project_id]?.name || "—" : "—"}</td>
                        <td className="py-2.5 pr-4 text-white/40 text-xs capitalize">{l.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No time logs" icon={<Download size={28} />} />}
          </>
        )}

        {tab === "usage" && (
          <>
            <SectionLabel>App usage</SectionLabel>
            {(appUsage || []).length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left eyebrow border-b border-white/8">
                      <th className="py-2 pr-4">Started</th>
                      <th className="py-2 pr-4">User</th>
                      <th className="py-2 pr-4">App</th>
                      <th className="py-2 pr-4">Window Title</th>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(appUsage || []).slice(0, 200).map((u) => (
                      <tr key={u.id} className="table-row">
                        <td className="py-2.5 pr-4 text-white/60 text-xs">{fmtDateTime(u.started_at)}</td>
                        <td className="py-2.5 pr-4 text-white/70 text-xs">{userMap[u.user_id]?.name || "—"}</td>
                        <td className="py-2.5 pr-4 text-white/80 text-xs">{u.app_name}</td>
                        <td className="py-2.5 pr-4 text-white/50 text-xs truncate max-w-[200px]">{u.window_title}</td>
                        <td className="py-2.5 pr-4 text-xs capitalize"><span className="dot" style={{ background: u.category === "work" ? "rgba(255,255,255,0.85)" : u.category === "distraction" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)" }} /></td>
                        <td className="py-2.5 pr-4 mono text-white/60 text-xs">{fmtClock(u.duration_seconds || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No app usage data" hint="Usage is recorded automatically when users run Work Tracker." icon={<Download size={28} />} />}
          </>
        )}
      </GlassPanel>
    </div>
  );
}
