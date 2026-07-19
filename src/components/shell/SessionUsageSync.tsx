import { useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { resumeSessionUsageTrackerIfNeeded, stopSessionUsageTracker } from "../../lib/session-usage-tracker";

/** Keeps browser usage tracking in sync when a Work Tracker session is already running. */
export default function SessionUsageSync() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) {
      stopSessionUsageTracker().catch(() => {});
      return;
    }
    resumeSessionUsageTrackerIfNeeded(profile.id).catch((err) => {
      console.warn("Failed to resume session usage tracker", err);
    });
  }, [profile?.id]);

  return null;
}
