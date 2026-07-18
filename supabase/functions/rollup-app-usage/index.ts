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

    const { usageId } = await req.json();
    if (!usageId) return errorResponse("Missing usageId", 400);

    const { data: usage } = await supabase
      .from("app_usage")
      .select("user_id, started_at, ended_at, duration_seconds, category, app_name")
      .eq("id", usageId)
      .maybeSingle();
    if (!usage || !usage.ended_at || !usage.duration_seconds) {
      return jsonResponse({ ok: true, skipped: true });
    }

    const dateStr = (usage.started_at as string).slice(0, 10);
    const category = usage.category as "work" | "neutral" | "distraction";
    const duration = usage.duration_seconds;

    const { data: existing } = await supabase
      .from("sessions_activity")
      .select("id, focus_seconds, idle_seconds, distraction_seconds")
      .eq("user_id", usage.user_id)
      .eq("activity_date", dateStr)
      .maybeSingle();

    let focus = existing?.focus_seconds || 0;
    let idle = existing?.idle_seconds || 0;
    let distraction = existing?.distraction_seconds || 0;
    if (category === "work") focus += duration;
    else if (category === "distraction") distraction += duration;
    else idle += duration;

    const tracked = focus + idle + distraction;
    const score = tracked > 0 ? Math.round((focus / tracked) * 100) : 0;

    if (existing) {
      await supabase
        .from("sessions_activity")
        .update({ focus_seconds: focus, idle_seconds: idle, distraction_seconds: distraction, productivity_score: score, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("sessions_activity").insert({
        user_id: usage.user_id,
        activity_date: dateStr,
        focus_seconds: focus,
        idle_seconds: idle,
        distraction_seconds: distraction,
        productivity_score: score,
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
