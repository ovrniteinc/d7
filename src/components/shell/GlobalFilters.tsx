import { useQuery } from "@tanstack/react-query";
import { COL, listDocs } from "../../lib/db";
import { useAuth } from "../../lib/auth";
import { useUIStore } from "../../lib/ui-store";
import type { Profile, Project } from "../../lib/types";

const FILTER_PATHS = ["/tasks", "/calendar", "/reports", "/productivity"];

export default function GlobalFilters({ path }: { path: string }) {
  const { isAdmin } = useAuth();
  const { personFilter, projectFilter, setPersonFilter, setProjectFilter } = useUIStore();

  const showFilters = FILTER_PATHS.includes(path);

  const { data: users } = useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: () => listDocs<Profile>(COL.profiles, { orderBy: [["name", "asc"]] }),
    enabled: showFilters && isAdmin,
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => listDocs<Project>(COL.projects, { orderBy: [["name", "asc"]] }),
    enabled: showFilters,
  });

  if (!showFilters) return null;

  return (
    <div className="hidden md:flex items-center gap-2">
      {isAdmin && (
        <select
          value={personFilter || ""}
          onChange={(e) => setPersonFilter(e.target.value || null)}
          className="input !py-2 !px-3 !text-xs w-40"
        >
          <option value="">All people</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </select>
      )}
      <select
        value={projectFilter || ""}
        onChange={(e) => setProjectFilter(e.target.value || null)}
        className="input !py-2 !px-3 !text-xs w-40"
      >
        <option value="">All projects</option>
        {projects?.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
