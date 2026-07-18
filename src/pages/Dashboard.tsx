import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { FolderKanban, Users, ListTodo, MonitorSmartphone, Clock, CalendarClock } from "lucide-react";
import { COL, listDocs } from "../lib/db";
import { useAuth } from "../lib/auth";
import { StatTile, GlassPanel, LiftedTile, SectionLabel, EmptyState, Avatar, StatusDot } from "../components/ui";
import { fmtRelative, fmtHours, fmtDate } from "../lib/format";
import type { Project, Task, Profile, AgentDevice, ActivityLog, SessionActivity, TaskStatus } from "../lib/types";

const STATUS_ORDER: TaskStatus[] = ["backlog", "todo", "in_progress", "review", "done"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog", todo: "To Do", in_progress: "In Progress", review: "Review", done: "Done",
};

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => listDocs<Project>(COL.projects),
    refetchInterval: 30000,
  });

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles),
    enabled: isAdmin,
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => listDocs<Task>(COL.tasks),
    refetchInterval: 30000,
  });

  const { data: devices } = useQuery<AgentDevice[]>({
    queryKey: ["agent-devices"],
    queryFn: () => listDocs<AgentDevice>(COL.agentDevices),
  });

  const { data: activityLogs } = useQuery<ActivityLog[]>({
    queryKey: ["activity-logs", 12],
    queryFn: () =>
      listDocs<ActivityLog>(COL.activityLogs, {
        orderBy: [["created_at", "desc"]],
        limit: 12,
      }),
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const { data: myTasks } = useQuery<Task[]>({
    queryKey: ["my-tasks", profile?.id],
    queryFn: async () => {
      const rows = await listDocs<Task>(COL.tasks, {
        where: [["assignee_id", "==", profile!.id]],
      });
      return rows
        .filter((t) => t.status !== "done")
        .sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        });
    },
    enabled: !!profile?.id && !isAdmin,
  });

  const { data: myActivity } = useQuery<SessionActivity[]>({
    queryKey: ["my-activity", profile?.id],
    queryFn: () =>
      listDocs<SessionActivity>(COL.sessionsActivity, {
        where: [["user_id", "==", profile!.id]],
        orderBy: [["activity_date", "desc"]],
        limit: 7,
      }),
    enabled: !!profile?.id,
  });

  const { data: allActivity } = useQuery<any[]>({
    queryKey: ["all-activity-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [activity, profiles] = await Promise.all([
        listDocs<SessionActivity>(COL.sessionsActivity, {
          where: [["activity_date", "==", today]],
        }),
        listDocs<Profile>(COL.profiles),
      ]);
      const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
      return activity.map((a) => ({
        ...a,
        profiles: { name: profileMap[a.user_id]?.name || "User" },
      }));
    },
    enabled: isAdmin,
  });

  if (isAdmin) return <AdminDashboard projects={projects || []} users={users || []} tasks={tasks || []} devices={devices || []} activityLogs={activityLogs || []} allActivity={allActivity || []} />;
  return <StaffDashboard myTasks={myTasks || []} myActivity={myActivity || []} devices={devices || []} />;
}

function AdminDashboard({ projects, users, tasks, devices, activityLogs, allActivity }: {
  projects: Project[]; users: Profile[]; tasks: Task[]; devices: AgentDevice[]; activityLogs: ActivityLog[]; allActivity: any[];
}) {
  const activeProjects = projects.filter((p) => p.status === "active");
  const activeUsers = users.filter((u) => u.status === "active");
  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const trackingDevices = devices.filter((d) => d.is_tracking);

  const chartData = allActivity.map((a) => ({
    name: a.profiles?.name || "User",
    Focus: a.focus_seconds || 0,
    Distraction: a.distraction_seconds || 0,
    Idle: a.idle_seconds || 0,
  }));

  const statusCounts = STATUS_ORDER.map((s) => ({
    status: s,
    label: STATUS_LABELS[s],
    count: tasks.filter((t) => t.status === s).length,
  }));
  const maxStatus = Math.max(...statusCounts.map((s) => s.count), 1);

  const profileMap: Record<string, Profile> = {};
  users.forEach((u) => { profileMap[u.id] = u; });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Active Projects" value={activeProjects.length} sub={`${projects.length} total`} icon={<FolderKanban size={16} />} />
        <StatTile label="Active People" value={activeUsers.length} sub={`${users.length} total`} icon={<Users size={16} />} />
        <StatTile label="Open Tasks" value={openTasks.length} sub={`${doneTasks.length} done`} icon={<ListTodo size={16} />} />
        <StatTile label="Tracking Devices" value={trackingDevices.length} sub={`${devices.length} registered`} icon={<MonitorSmartphone size={16} />} />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
        <LiftedTile className="p-6">
          <SectionLabel>Team focus today</SectionLabel>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtHours(v)} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "rgba(20,20,23,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "rgba(255,255,255,0.8)" }}
                  formatter={(v: any) => fmtHours(Number(v) || 0)}
                />
                <Bar dataKey="Focus" stackId="a" fill="rgba(255,255,255,0.85)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Distraction" stackId="a" fill="rgba(255,255,255,0.35)" />
                <Bar dataKey="Idle" stackId="a" fill="rgba(255,255,255,0.15)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No activity recorded today" icon={<Clock size={28} />} />
          )}
        </LiftedTile>

        <GlassPanel className="p-6">
          <SectionLabel>Tasks by status</SectionLabel>
          <div className="space-y-3">
            {statusCounts.map((s) => (
              <div key={s.status}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-white/70">{s.label}</span>
                  <span className="text-xs text-white/40 mono">{s.count}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <GlassPanel className="p-6">
          <SectionLabel>Tracking now</SectionLabel>
          {trackingDevices.length ? (
            <div className="space-y-2">
              {trackingDevices.map((d) => {
                const u = profileMap[d.user_id];
                return (
                  <div key={d.id} className="flex items-center gap-3 py-2">
                    <StatusDot variant="pulse" />
                    <Avatar name={u?.name || "?"} url={u?.avatar_url} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/85 truncate">{d.device_name}</p>
                      <p className="text-xs text-white/35">{u?.name || "Unknown"} · {d.os}</p>
                    </div>
                    <span className="text-xs text-white/30">{fmtRelative(d.last_seen)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No devices tracking" hint="Active agent devices will appear here." icon={<MonitorSmartphone size={28} />} />
          )}
        </GlassPanel>

        <GlassPanel className="p-6">
          <SectionLabel>Recent activity</SectionLabel>
          {activityLogs.length ? (
            <div className="space-y-2">
              {activityLogs.map((l) => {
                const u = profileMap[l.user_id || ""];
                return (
                  <div key={l.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <Avatar name={u?.name || "?"} url={u?.avatar_url} size={24} />
                    <span className="text-white/40 text-xs mono">{l.action}</span>
                    <span className="text-white/30 text-xs ml-auto">{fmtRelative(l.created_at)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No activity yet" icon={<Clock size={28} />} />
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

function StaffDashboard({ myTasks, myActivity, devices }: { myTasks: Task[]; myActivity: SessionActivity[]; devices: AgentDevice[] }) {
  const today = myActivity.find((a) => a.activity_date === new Date().toISOString().slice(0, 10));
  const weekFocus = myActivity.reduce((sum, a) => sum + (a.focus_seconds || 0), 0);
  const upcoming = myTasks.filter((t) => t.due_date).slice(0, 5);

  const chartData = [...myActivity].reverse().map((a) => ({
    date: fmtDate(a.activity_date).split(",")[0],
    Focus: a.focus_seconds || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="My Tasks" value={myTasks.length} icon={<ListTodo size={16} />} />
        <StatTile label="Focus Today" value={fmtHours(today?.focus_seconds || 0)} icon={<Clock size={16} />} />
        <StatTile label="Focus This Week" value={fmtHours(weekFocus)} icon={<Clock size={16} />} />
        <StatTile label="Tracking Devices" value={devices.length} icon={<MonitorSmartphone size={16} />} />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
        <LiftedTile className="p-6">
          <SectionLabel>Weekly focus</SectionLabel>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtHours(v)} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "rgba(20,20,23,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: any) => fmtHours(Number(v) || 0)}
                />
                <Bar dataKey="Focus" fill="rgba(255,255,255,0.75)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No focus data yet" hint="Start the Work Tracker to build your history." icon={<Clock size={28} />} />
          )}
        </LiftedTile>

        <GlassPanel className="p-6">
          <SectionLabel>Upcoming deadlines</SectionLabel>
          {upcoming.length ? (
            <div className="space-y-2">
              {upcoming.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                  <CalendarClock size={15} className="text-white/40" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/85 truncate">{t.title}</p>
                    <p className="text-xs text-white/35">{t.due_date ? fmtDate(t.due_date) : "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No upcoming deadlines" icon={<CalendarClock size={28} />} />
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
