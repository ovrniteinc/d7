import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Clock, Trophy } from "lucide-react";
import { subDays, format } from "date-fns";
import { COL, listDocs, type WhereClause } from "../lib/db";
import { useAuth } from "../lib/auth";
import { useUIStore } from "../lib/ui-store";
import { GlassPanel, LiftedTile, StatTile, EmptyState, SectionLabel, Avatar } from "../components/ui";
import { fmtHours } from "../lib/format";
import type { SessionActivity, Profile, AppUsage } from "../lib/types";

export default function Productivity() {
  const { isAdmin, profile } = useAuth();
  const { personFilter } = useUIStore();
  const [range, setRange] = useState<"week" | "month">("week");

  const days = range === "week" ? 7 : 30;
  const startDate = subDays(new Date(), days);

  const targetUserId = isAdmin && personFilter ? personFilter : profile?.id;

  const { data: activity } = useQuery<SessionActivity[]>({
    queryKey: ["sessions-activity", targetUserId, days],
    queryFn: async () => {
      const where: WhereClause[] = [
        ["activity_date", ">=", startDate.toISOString().slice(0, 10)],
      ];
      if (targetUserId) where.push(["user_id", "==", targetUserId]);
      const rows = await listDocs<SessionActivity>(COL.sessionsActivity, { where });
      return rows.sort((a, b) => a.activity_date.localeCompare(b.activity_date));
    },
  });

  const { data: allActivity } = useQuery<SessionActivity[]>({
    queryKey: ["all-sessions-activity", days],
    queryFn: () =>
      listDocs<SessionActivity>(COL.sessionsActivity, {
        where: [["activity_date", ">=", startDate.toISOString().slice(0, 10)]],
      }),
    enabled: isAdmin,
  });

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles),
    enabled: isAdmin,
  });

  const { data: appUsage } = useQuery<AppUsage[]>({
    queryKey: ["app-usage", targetUserId, days],
    queryFn: async () => {
      const where: WhereClause[] = [
        ["started_at", ">=", startDate.toISOString()],
      ];
      if (targetUserId) where.push(["user_id", "==", targetUserId]);
      return listDocs<AppUsage>(COL.appUsage, {
        where,
        orderBy: [["started_at", "desc"]],
        limit: 200,
      });
    },
    enabled: isAdmin,
  });

  const stackedData = useMemo(() => {
    const byDate: Record<string, { date: string; Focus: number; Distraction: number; Idle: number }> = {};
    (activity || []).forEach((a) => {
      const key = a.activity_date;
      if (!byDate[key]) byDate[key] = { date: format(new Date(key), "MMM d"), Focus: 0, Distraction: 0, Idle: 0 };
      byDate[key].Focus += a.focus_seconds || 0;
      byDate[key].Distraction += a.distraction_seconds || 0;
      byDate[key].Idle += a.idle_seconds || 0;
    });
    return Object.values(byDate);
  }, [activity]);

  const todayActivity = (activity || []).find((a) => a.activity_date === new Date().toISOString().slice(0, 10));
  const todayData = [
    { name: "Focus", value: todayActivity?.focus_seconds || 0 },
    { name: "Distraction", value: todayActivity?.distraction_seconds || 0 },
    { name: "Idle", value: todayActivity?.idle_seconds || 0 },
  ].filter((d) => d.value > 0);

  const trendData = (activity || []).map((a) => ({
    date: format(new Date(a.activity_date), "MMM d"),
    score: Number(a.productivity_score) || 0,
  }));

  const leaderboard = useMemo(() => {
    if (!isAdmin || !allActivity) return [];
    const userMap: Record<string, Profile> = {};
    (users || []).forEach((u) => { userMap[u.id] = u; });
    const byUser: Record<string, { focus: number; score: number; count: number }> = {};
    allActivity.forEach((a) => {
      if (!byUser[a.user_id]) byUser[a.user_id] = { focus: 0, score: 0, count: 0 };
      byUser[a.user_id].focus += a.focus_seconds || 0;
      byUser[a.user_id].score += Number(a.productivity_score) || 0;
      byUser[a.user_id].count += 1;
    });
    return Object.entries(byUser)
      .map(([uid, v]) => ({ user: userMap[uid], focus: v.focus, avgScore: v.count > 0 ? Math.round(v.score / v.count) : 0 }))
      .filter((e) => e.user)
      .sort((a, b) => b.focus - a.focus);
  }, [isAdmin, allActivity, users]);

  const totalFocus = (activity || []).reduce((s, a) => s + (a.focus_seconds || 0), 0);
  const avgScore = activity && activity.length ? Math.round(activity.reduce((s, a) => s + (Number(a.productivity_score) || 0), 0) / activity.length) : 0;

  const PIE_COLORS = ["rgba(255,255,255,0.85)", "rgba(255,255,255,0.35)", "rgba(255,255,255,0.15)"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex glass rounded-xl p-1">
          {(["week", "month"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition ${range === r ? "bg-white/15 text-white" : "text-white/50"}`}>{r}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile label="Total Focus" value={fmtHours(totalFocus)} icon={<Clock size={16} />} />
        <StatTile label="Avg Score" value={`${avgScore}%`} icon={<Trophy size={16} />} />
        <StatTile label="Days Tracked" value={activity?.length || 0} icon={<Clock size={16} />} />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
        <LiftedTile className="p-6">
          <SectionLabel>Focus vs Distraction vs Idle</SectionLabel>
          {stackedData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stackedData}>
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtHours(v)} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "rgba(20,20,23,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: any) => fmtHours(Number(v) || 0)}
                />
                <Bar dataKey="Focus" stackId="a" fill="rgba(255,255,255,0.85)" />
                <Bar dataKey="Distraction" stackId="a" fill="rgba(255,255,255,0.35)" />
                <Bar dataKey="Idle" stackId="a" fill="rgba(255,255,255,0.15)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No activity data" icon={<Clock size={28} />} />
          )}
        </LiftedTile>

        <GlassPanel className="p-6">
          <SectionLabel>Today's split</SectionLabel>
          {todayData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={todayData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {todayData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} stroke="none" />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "rgba(20,20,23,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: any) => fmtHours(Number(v) || 0)}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No data today" icon={<Clock size={28} />} />
          )}
        </GlassPanel>
      </div>

      <GlassPanel className="p-6">
        <SectionLabel>Productivity score trend</SectionLabel>
        {trendData.length ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData}>
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "rgba(20,20,23,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
                formatter={(v: any) => `${Number(v) || 0}%`}
              />
              <Line type="monotone" dataKey="score" stroke="rgba(255,255,255,0.7)" strokeWidth={2} dot={{ fill: "rgba(255,255,255,0.9)", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No trend data yet" icon={<Clock size={28} />} />
        )}
      </GlassPanel>

      {isAdmin && (
        <>
          <GlassPanel className="p-6">
            <SectionLabel>Team leaderboard</SectionLabel>
            {leaderboard.length ? (
              <div className="space-y-2">
                {leaderboard.map((entry, i) => (
                  <div key={entry.user.id} className="flex items-center gap-4 py-2">
                    <span className="mono text-sm text-white/40 w-6">{i + 1}</span>
                    <Avatar name={entry.user.name} url={entry.user.avatar_url} size={28} />
                    <span className="text-sm text-white/85 flex-1">{entry.user.name}</span>
                    <span className="mono text-sm text-white/70 w-20 text-right">{fmtHours(entry.focus)}</span>
                    <div className="w-24">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-white/40">{entry.avgScore}%</span>
                      </div>
                      <div className="progress-track"><div className="progress-fill" style={{ width: `${entry.avgScore}%` }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No team data yet" icon={<Trophy size={28} />} />
            )}
          </GlassPanel>

          <GlassPanel className="p-6">
            <SectionLabel>App usage timeline</SectionLabel>
            {appUsage?.length ? (
              <div className="space-y-1">
                {appUsage.slice(0, 50).map((u) => (
                  <div key={u.id} className="flex items-center gap-3 py-1.5 border-b border-white/5 text-xs">
                    <span className="dot" style={{ background: u.category === "work" ? "rgba(255,255,255,0.85)" : u.category === "distraction" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)" }} />
                    <span className="text-white/80 w-32 truncate">{u.app_name}</span>
                    <span className="text-white/40 flex-1 truncate">{u.window_title}</span>
                    <span className="mono text-white/60">{u.duration_seconds ? fmtHours(u.duration_seconds) : "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No app usage recorded" hint="Install the desktop agent to sync app usage." icon={<Clock size={28} />} />
            )}
          </GlassPanel>
        </>
      )}
    </div>
  );
}
