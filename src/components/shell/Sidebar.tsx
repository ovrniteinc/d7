import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FolderKanban, ListTodo, Calendar, StickyNote, Timer,
  BarChart3, ScrollText, Users, Settings, User, X, Monitor,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useUIStore } from "../../lib/ui-store";
import { Avatar } from "../ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/projects", label: "Projects", icon: FolderKanban, adminOnly: false },
  { to: "/tasks", label: "Tasks", icon: ListTodo, adminOnly: false },
  { to: "/calendar", label: "Calendar", icon: Calendar, adminOnly: false },
  { to: "/blackboard", label: "Blackboard", icon: StickyNote, adminOnly: false },
  { to: "/tracker", label: "Work Tracker", icon: Timer, adminOnly: false },
  { to: "/productivity", label: "Productivity", icon: BarChart3, adminOnly: false },
  { to: "/reports", label: "Reports & Logs", icon: ScrollText, adminOnly: true },
  { to: "/sessions", label: "Sessions & Devices", icon: Monitor, adminOnly: true },
  { to: "/user-management", label: "User Management", icon: Users, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
  { to: "/profile", label: "Profile", icon: User, adminOnly: false },
];

export default function Sidebar() {
  const { profile, isAdmin } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const nav = useNavigate();

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-[260px] flex-shrink-0 glass-strong rounded-none lg:rounded-none p-4 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white text-black font-bold">7</div>
            <div>
              <p className="text-white font-semibold tracking-tight leading-none">District 7</p>
              <p className="eyebrow mt-1">{isAdmin ? "Admin" : "Staff"}</p>
            </div>
          </div>
          <button className="lg:hidden text-white/50 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <n.icon size={17} strokeWidth={1.5} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 pt-4 border-t border-white/8">
          <button
            onClick={() => { nav("/profile"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/4 transition"
          >
            <Avatar name={profile?.name || "User"} url={profile?.avatar_url} size={36} />
            <div className="text-left min-w-0">
              <p className="text-sm text-white/90 truncate">{profile?.name}</p>
              <p className="text-xs text-white/40 truncate">{profile?.email}</p>
            </div>
          </button>
          <p className="text-[10px] text-white/25 mt-3 px-2">Consent-based monitoring</p>
        </div>
      </aside>
    </>
  );
}
