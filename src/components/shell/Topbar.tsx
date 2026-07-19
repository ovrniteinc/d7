import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, ChevronDown, LogOut, User as UserIcon, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useUIStore } from "../../lib/ui-store";
import { Avatar } from "../ui";
import GlobalFilters from "./GlobalFilters";
import NotificationCenter from "./NotificationCenter";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard", sub: "Team overview" },
  "/projects": { title: "Projects", sub: "Workspace initiatives" },
  "/tasks": { title: "Tasks", sub: "Kanban board" },
  "/calendar": { title: "Calendar", sub: "Events & deadlines" },
  "/blackboard": { title: "Blackboard", sub: "Shared live canvas" },
  "/tracker": { title: "Work Tracker", sub: "Focus & time" },
  "/productivity": { title: "Productivity", sub: "Focus analytics" },
  "/reports": { title: "Reports & Logs", sub: "Audit & time records" },
  "/user-management": { title: "User Management", sub: "Team accounts" },
  "/settings": { title: "Settings", sub: "Workspace configuration" },
  "/profile": { title: "Profile", sub: "Your account" },
};

export default function Topbar({ path }: { path: string }) {
  const { profile, isAdmin, signOut } = useAuth();
  const { setSidebarOpen } = useUIStore();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const meta = TITLES[path] || { title: "District 7", sub: "" };

  return (
    <header className="sticky top-0 z-20 glass border-x-0 border-t-0 px-4 lg:px-6 py-3 flex items-center gap-4">
      <button className="lg:hidden text-white/60" onClick={() => setSidebarOpen(true)}>
        <Menu size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold text-white leading-none truncate">{meta.title}</h1>
        <p className="eyebrow mt-1">{meta.sub}</p>
      </div>

      <GlobalFilters path={path} />

      <NotificationCenter />

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 p-1.5 pr-2 rounded-xl hover:bg-white/5 transition"
        >
          <Avatar name={profile?.name || "User"} url={profile?.avatar_url} size={32} />
          <ChevronDown size={14} className="text-white/40" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-12 glass-strong rounded-2xl p-2 w-52 z-30">
            <button
              onClick={() => { setMenuOpen(false); nav("/profile"); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/80 hover:bg-white/5 transition"
            >
              <UserIcon size={15} /> Profile
            </button>
            {isAdmin && (
              <button
                onClick={() => { setMenuOpen(false); nav("/settings"); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/80 hover:bg-white/5 transition"
              >
                <SettingsIcon size={15} /> Settings
              </button>
            )}
            <div className="h-px bg-white/8 my-1" />
            <button
              onClick={() => { setMenuOpen(false); signOut(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/80 hover:bg-white/5 transition"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
