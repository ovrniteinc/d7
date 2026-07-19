import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { COL, listDocs } from "../../lib/db";
import { markAllNotificationsRead, markNotificationRead } from "../../lib/notifications";
import { useAuth } from "../../lib/auth";
import { useUIStore } from "../../lib/ui-store";
import { fmtRelative } from "../../lib/format";
import type { AppNotification } from "../../lib/types";

export default function NotificationCenter() {
  const { profile, user } = useAuth();
  const uid = user?.uid;
  const qc = useQueryClient();
  const nav = useNavigate();
  const openTask = useUIStore((s) => s.openTask);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: notifications } = useQuery<AppNotification[]>({
    queryKey: ["notifications", uid],
    queryFn: () =>
      listDocs<AppNotification>(COL.notifications, {
        where: [["user_id", "==", uid!]],
        orderBy: [["created_at", "desc"]],
        limit: 30,
      }),
    enabled: !!uid,
  });

  const unread = (notifications || []).filter((n) => !n.read).length;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const markRead = async (id: string) => {
    if (!uid) return;
    qc.setQueryData<AppNotification[]>(["notifications", uid], (old) =>
      old?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? [],
    );
    try {
      await markNotificationRead(id);
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["notifications", uid] });
      toast.error((e as Error).message);
    }
  };

  const markAllRead = async () => {
    if (!uid) return;
    const unreadRows = (notifications || []).filter((n) => !n.read && n.user_id === uid);
    if (!unreadRows.length) return;

    qc.setQueryData<AppNotification[]>(["notifications", uid], (old) =>
      old?.map((n) => ({ ...n, read: true })) ?? [],
    );

    try {
      await markAllNotificationsRead(unreadRows.map((n) => n.id));
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["notifications", uid] });
      toast.error((e as Error).message);
    }
  };

  const openNotification = async (n: AppNotification) => {
    if (!n.read) await markRead(n.id);
    setOpen(false);
    if (n.entity_type === "task" && n.entity_id) {
      nav("/tasks");
      openTask(n.entity_id);
      return;
    }
    if (n.link) nav(n.link);
  };

  if (!profile) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl hover:bg-white/5 transition text-white/70"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-white text-black text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 glass-strong rounded-2xl w-80 max-h-96 overflow-hidden z-30 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-[11px] text-white/50 hover:text-white">
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {(notifications || []).length ? (
              (notifications || []).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition ${n.read ? "opacity-60" : ""}`}
                >
                  <p className="text-sm text-white/90 font-medium leading-snug">{n.title}</p>
                  <p className="text-xs text-white/45 mt-1 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-white/30 mt-1">{fmtRelative(n.created_at)}</p>
                </button>
              ))
            ) : (
              <p className="text-sm text-white/40 px-4 py-8 text-center">No notifications yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
