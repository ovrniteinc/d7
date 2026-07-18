import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { logId } = await req.json();
    if (!logId) return errorResponse("Missing logId", 400);

    const { data: log } = await supabase
      .from("time_logs")
      .select("user_id, started_at, ended_at, duration_seconds, source")
      .eq("id", logId)
      .maybeSingle();
    if (!log || !log.ended_at || !log.duration_seconds) {
      return jsonResponse({ ok: true, skipped: true });
    }

    const dateStr = (log.started_at as string).slice(0, 10);
    const focusSeconds = log.source === "timer" ? log.duration_seconds : 0;

    const { data: existing } = await supabase
      .from("sessions_activity")
      .select("id, focus_seconds, idle_seconds, distraction_seconds")
      .eq("user_id", log.user_id)
      .eq("activity_date", dateStr)
      .maybeSingle();

    const focus = (existing?.focus_seconds || 0) + focusSeconds;
    const idle = existing?.idle_seconds || 0;
    const distraction = existing?.distraction_seconds || 0;
    const tracked = focus + idle + distraction;
    const score = tracked > 0 ? Math.round((focus / tracked) * 100) : 0;

    if (existing) {
      await supabase
        .from("sessions_activity")
        .update({ focus_seconds: focus, productivity_score: score, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("sessions_activity").insert({
        user_id: log.user_id,
        activity_date: dateStr,
        focus_seconds: focus,
        idle_seconds: 0,
        distraction_seconds: 0,
        productivity_score: score,
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
