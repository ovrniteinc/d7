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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing auth", 401);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: caller, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller.user) return errorResponse("Unauthorized", 401);

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role,status")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (!callerProfile || callerProfile.role !== "admin") {
      return errorResponse("Admin only", 403);
    }

    const { userId, role } = await req.json();
    if (!userId || !["admin", "staff"].includes(role)) {
      return errorResponse("Invalid request", 400);
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { role },
    });
    if (updateErr) return errorResponse(updateErr.message, 500);

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profileErr) return errorResponse(profileErr.message, 500);

    await supabase.from("activity_logs").insert({
      user_id: caller.user.id,
      action: "user.role_update",
      entity_type: "user",
      entity_id: userId,
      meta: { role },
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
