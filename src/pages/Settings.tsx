import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, MonitorSmartphone } from "lucide-react";
import { COL, createDoc, getDocById, listDocs, removeDoc, upsertDoc } from "../lib/db";
import { GlassPanel, SectionLabel, EmptyState, StatusDot } from "../components/ui";
import { DEFAULT_KANBAN_COLUMNS, DEFAULT_IDLE_TIMEOUT, DEFAULT_WORKSPACE_NAME } from "../lib/constants";
import { fmtRelative } from "../lib/format";
import type { Setting, AppCategoryRule, AgentDevice, Profile, KanbanColumn, AppCategory } from "../lib/types";

type Section = "general" | "kanban" | "categories" | "devices" | "compliance";

export default function Settings() {
  const [section, setSection] = useState<Section>("general");

  return (
    <div className="grid lg:grid-cols-[200px_1fr] gap-4">
      <div className="space-y-1">
        {([
          { key: "general", label: "General" },
          { key: "kanban", label: "Kanban" },
          { key: "categories", label: "App Categories" },
          { key: "devices", label: "Agent Devices" },
          { key: "compliance", label: "Compliance" },
        ] as { key: Section; label: string }[]).map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)} className={`nav-item w-full ${section === s.key ? "active" : ""}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div>
        {section === "general" && <GeneralSettings />}
        {section === "kanban" && <KanbanSettings />}
        {section === "categories" && <CategorySettings />}
        {section === "devices" && <DeviceSettings />}
        {section === "compliance" && <ComplianceSection />}
      </div>
    </div>
  );
}

function GeneralSettings() {
  const qc = useQueryClient();
  const [name, setName] = useState(DEFAULT_WORKSPACE_NAME);
  const [idle, setIdle] = useState(DEFAULT_IDLE_TIMEOUT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listDocs<Setting>(COL.settings, {
      where: [["key", "in", ["workspace_name", "idle_timeout_seconds"]]],
    }).then((data) => {
      data.forEach((s) => {
        if (s.key === "workspace_name") setName(s.value);
        if (s.key === "idle_timeout_seconds") setIdle(s.value);
      });
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsertDoc(COL.settings, "workspace_name", { key: "workspace_name", value: name }),
        upsertDoc(COL.settings, "idle_timeout_seconds", { key: "idle_timeout_seconds", value: idle }),
      ]);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassPanel className="p-6 space-y-4">
      <SectionLabel>General</SectionLabel>
      <div>
        <label className="label">Workspace name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Idle timeout (seconds, min 30)</label>
        <input type="number" className="input" value={idle} min={30} onChange={(e) => setIdle(parseInt(e.target.value) || 30)} />
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
    </GlassPanel>
  );
}

function KanbanSettings() {
  const qc = useQueryClient();
  const { data: savedColumns, isPending } = useQuery<KanbanColumn[]>({
    queryKey: ["settings", "kanban_columns"],
    queryFn: async () => {
      const data = await getDocById<Setting>(COL.settings, "kanban_columns");
      return (data?.value as KanbanColumn[]) || DEFAULT_KANBAN_COLUMNS;
    },
  });
  const [columns, setColumns] = useState<KanbanColumn[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (savedColumns) setColumns(savedColumns);
  }, [savedColumns]);

  const save = async () => {
    if (!columns) return;
    setSaving(true);
    try {
      await upsertDoc(COL.settings, "kanban_columns", { key: "kanban_columns", value: columns });
      qc.setQueryData(["settings", "kanban_columns"], columns);
      toast.success("Kanban saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const add = () => setColumns((prev) => [...(prev || []), { id: `col_${Date.now()}`, title: "New Column" }]);
  const remove = (id: string) => setColumns((prev) => (prev || []).filter((c) => c.id !== id));
  const move = (i: number, dir: -1 | 1) => {
    setColumns((prev) => {
      const list = [...(prev || [])];
      const ni = i + dir;
      if (ni < 0 || ni >= list.length) return prev;
      [list[i], list[ni]] = [list[ni], list[i]];
      return list;
    });
  };
  const update = (id: string, title: string) => {
    setColumns((prev) => (prev || []).map((c) => (c.id === id ? { ...c, title } : c)));
  };

  if (isPending || !columns) {
    return (
      <GlassPanel className="p-6 space-y-4">
        <SectionLabel>Kanban columns</SectionLabel>
        <p className="text-sm text-white/40">Loading columns…</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-6 space-y-4">
      <SectionLabel>Kanban columns</SectionLabel>
      <div className="space-y-2">
        {columns.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2">
            <GripVertical size={15} className="text-white/30" />
            <input className="input" value={c.title} onChange={(e) => update(c.id, e.target.value)} />
            <button onClick={() => move(i, -1)} className="btn btn-ghost !p-2 !text-xs">↑</button>
            <button onClick={() => move(i, 1)} className="btn btn-ghost !p-2 !text-xs">↓</button>
            <button onClick={() => remove(c.id)} className="btn btn-danger !p-2"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={add}><Plus size={14} /> Add column</button>
      <div><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
    </GlassPanel>
  );
}

function CategorySettings() {
  const qc = useQueryClient();
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState<AppCategory>("work");

  const { data: rules } = useQuery<AppCategoryRule[]>({
    queryKey: ["app-categories"],
    queryFn: () => listDocs<AppCategoryRule>(COL.appCategories, { orderBy: [["pattern", "asc"]] }),
  });

  const add = async () => {
    if (!pattern.trim()) return;
    const p = pattern.toLowerCase().trim();
    try {
      await createDoc(COL.appCategories, { pattern: p, category }, p);
      setPattern("");
      qc.invalidateQueries({ queryKey: ["app-categories"] });
      toast.success("Category added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (p: string) => {
    try {
      await removeDoc(COL.appCategories, p);
      qc.invalidateQueries({ queryKey: ["app-categories"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <GlassPanel className="p-6 space-y-4">
      <SectionLabel>App categories</SectionLabel>
      <div className="flex gap-2">
        <input className="input" placeholder="app pattern (e.g. vscode)" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <select className="input !w-32" value={category} onChange={(e) => setCategory(e.target.value as AppCategory)}>
          <option value="work">Work</option>
          <option value="neutral">Neutral</option>
          <option value="distraction">Distraction</option>
        </select>
        <button className="btn btn-primary" onClick={add}><Plus size={14} /> Add</button>
      </div>
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {(rules || []).map((r) => (
          <div key={r.pattern} className="flex items-center gap-3 py-2 border-b border-white/5">
            <span className="dot" style={{ background: r.category === "work" ? "rgba(255,255,255,0.85)" : r.category === "distraction" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)" }} />
            <span className="text-sm text-white/80 mono flex-1">{r.pattern}</span>
            <span className="text-xs text-white/40 capitalize">{r.category}</span>
            <button onClick={() => remove(r.pattern)} className="btn btn-danger !p-1.5"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function DeviceSettings() {
  const { data: devices } = useQuery<AgentDevice[]>({
    queryKey: ["agent-devices"],
    queryFn: () => listDocs<AgentDevice>(COL.agentDevices, { orderBy: [["created_at", "desc"]] }),
  });

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles),
  });

  const userMap: Record<string, Profile> = {};
  (users || []).forEach((u) => { userMap[u.id] = u; });

  const remove = async (id: string) => {
    try {
      await removeDoc(COL.agentDevices, id);
      toast.success("Device removed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <GlassPanel className="p-6 space-y-4">
        <SectionLabel>Browser tracking</SectionLabel>
        <div className="space-y-3 text-sm text-white/60 leading-relaxed">
          <p>
            When someone starts <strong className="text-white/85">Work Tracker</strong>, District 7 automatically logs browser activity (page title and tab focus) into app usage. No separate app, install step, or extra login is required — it uses the same signed-in session as the web app.
          </p>
          <p className="text-white/40 text-xs">
            Tracking stops when the Work Tracker timer stops. Other desktop apps (e.g. Cursor, Slack) are not recorded from the browser; only activity in the browser during an active session.
          </p>
        </div>
      </GlassPanel>

      <GlassPanel className="p-6 space-y-4">
        <SectionLabel>Registered devices</SectionLabel>
      {devices?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left eyebrow border-b border-white/8">
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">OS</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Last seen</th>
                <th className="py-2 pr-4">Tracking</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="table-row">
                  <td className="py-2.5 pr-4 text-white/80 text-xs">{d.device_name}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs">{d.os}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs">{d.agent_version || "—"}</td>
                  <td className="py-2.5 pr-4 text-white/60 text-xs">{userMap[d.user_id]?.name || "—"}</td>
                  <td className="py-2.5 pr-4 text-white/40 text-xs">{fmtRelative(d.last_seen)}</td>
                  <td className="py-2.5 pr-4">{d.is_tracking ? <StatusDot variant="pulse" /> : <StatusDot variant="dim" />}</td>
                  <td className="py-2.5 pr-4"><button onClick={() => remove(d.id)} className="btn btn-danger !p-1.5"><Trash2 size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No devices registered" hint="Devices appear when users start Work Tracker in the browser." icon={<MonitorSmartphone size={28} />} />
      )}
      </GlassPanel>
    </div>
  );
}

function ComplianceSection() {
  return (
    <GlassPanel className="p-6 space-y-4">
      <SectionLabel>Compliance & disclosure</SectionLabel>
      <div className="space-y-3 text-sm text-white/60 leading-relaxed">
        <p>District 7 uses <strong className="text-white/85">consent-based, transparent monitoring</strong>. The web application tracks in-browser focus and idle states only — it does not record keystrokes, screen content, or browsing history.</p>
        <p>The Work Tracker records time entries when a user manually starts a session. Idle detection is based on 5 minutes of no input or the browser tab being hidden. No data is collected without an active session.</p>
        <p>The optional desktop agent in <code className="text-white/70">agent/</code> can sync full desktop app usage for advanced setups. By default, browser activity is recorded automatically while Work Tracker is running — no separate install or credentials required.</p>
        <p className="text-white/40 text-xs">This workspace is designed to comply with UK-GDPR and Saudi PDPL principles: lawful basis, transparency, data minimisation, and purpose limitation. Users can view their own data in Profile and Productivity. Contact your administrator for data export or deletion requests.</p>
      </div>
    </GlassPanel>
  );
}
