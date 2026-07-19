import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { COL, watchCollection } from "../../lib/db";
import { showBrowserNotification } from "../../lib/notifications";
import type { AppNotification } from "../../lib/types";

/** Live notification delivery: toasts + browser alerts while the app is open. */
export default function NotificationListener() {
  const { profile, user } = useAuth();
  const uid = user?.uid;
  const qc = useQueryClient();
  const seenRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!profile || !uid) return;

    seenRef.current = new Set();
    bootstrappedRef.current = false;

    const unsub = watchCollection<AppNotification>(
      COL.notifications,
      {
        where: [["user_id", "==", uid]],
        orderBy: [["created_at", "desc"]],
        limit: 30,
      },
      (rows) => {
        qc.setQueryData(["notifications", uid], rows);

        if (!bootstrappedRef.current) {
          rows.forEach((row) => seenRef.current.add(row.id));
          bootstrappedRef.current = true;
          return;
        }

        for (const row of rows) {
          if (seenRef.current.has(row.id)) continue;
          seenRef.current.add(row.id);
          toast.info(row.title, { description: row.body, duration: 6000 });
          showBrowserNotification(row.title, row.body, row.link);
        }
      },
      (err) => console.warn("notification listener error", err),
    );

    return () => unsub();
  }, [profile?.id, uid, qc]);

  return null;
}
