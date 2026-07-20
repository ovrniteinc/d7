import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Wifi } from "lucide-react";
import { COL, listDocs } from "../lib/db";
import { GlassPanel, SectionLabel, Avatar, EmptyState, StatusDot } from "../components/ui";
import { fmtRelative } from "../lib/format";
import type { AgentDevice, PresenceRow, Profile } from "../lib/types";

export default function Sessions() {
  const { data: devices } = useQuery<AgentDevice[]>({
    queryKey: ["agent-devices"],
    queryFn: () => listDocs<AgentDevice>(COL.agentDevices, { orderBy: [["last_seen", "desc"]] }),
  });

  const { data: presence } = useQuery<PresenceRow[]>({
    queryKey: ["presence-all"],
    queryFn: () => listDocs<PresenceRow>(COL.presence, { orderBy: [["last_seen", "desc"]] }),
  });

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles),
  });

  const userMap = useMemo(() => {
    const map: Record<string, Profile> = {};
    (users || []).forEach((u) => { map[u.id] = u; });
    return map;
  }, [users]);

  const onlineCutoff = Date.now() - 5 * 60 * 1000;

  return (
    <div className="space-y-5">
      <GlassPanel className="p-5">
        <SectionLabel>Active sessions</SectionLabel>
        <p className="text-xs text-white/40 mb-4">
          Live presence from the web app. Users appear online if seen in the last 5 minutes.
        </p>
        {presence?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left eyebrow border-b border-white/8">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {presence.map((p) => {
                  const user = userMap[p.user_id];
                  const online = new Date(p.last_seen).getTime() > onlineCutoff;
                  return (
                    <tr key={p.id} className="table-row">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={user?.name || p.name} url={user?.avatar_url || p.avatar_url} size={26} />
                          <div>
                            <p className="text-white/80 text-xs">{user?.name || p.name || "Unknown"}</p>
                            <p className="text-white/35 text-[10px]">{user?.email || p.user_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <StatusDot variant={online ? "bright" : "dim"} />
                          <span className="text-xs text-white/60">{online ? "Online" : "Offline"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-white/40 text-xs">{fmtRelative(p.last_seen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No active sessions" hint="Presence data appears when team members use the app." icon={<Wifi size={28} />} />
        )}
      </GlassPanel>

      <GlassPanel className="p-5">
        <SectionLabel>Registered devices</SectionLabel>
        <p className="text-xs text-white/40 mb-4">
          Devices registered by the productivity agent or session tracker.
        </p>
        {devices?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left eyebrow border-b border-white/8">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Device</th>
                  <th className="py-2 pr-4">OS</th>
                  <th className="py-2 pr-4">Agent</th>
                  <th className="py-2 pr-4">Tracking</th>
                  <th className="py-2 pr-4">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const user = userMap[d.user_id];
                  return (
                    <tr key={d.id} className="table-row">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={user?.name || "?"} url={user?.avatar_url} size={26} />
                          <span className="text-white/80 text-xs">{user?.name || user?.email || d.user_id}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-white/70 text-xs">{d.device_name}</td>
                      <td className="py-2.5 pr-4 text-white/50 text-xs">{d.os || "—"}</td>
                      <td className="py-2.5 pr-4 text-white/50 text-xs mono">{d.agent_version || "—"}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`chip ${d.is_tracking ? "!border-emerald-400/30" : ""}`}>
                          {d.is_tracking ? "On" : "Off"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-white/40 text-xs">{fmtRelative(d.last_seen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No devices registered" hint="Devices appear when users connect the tracking agent." icon={<Monitor size={28} />} />
        )}
      </GlassPanel>
    </div>
  );
}
