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

    const { action, entityType, entityId, meta } = await req.json();
    if (!action) return errorResponse("Missing action", 400);

    const { error } = await supabase.from("activity_logs").insert({
      user_id: caller.user.id,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      meta: meta || {},
    });
    if (error) return errorResponse(error.message, 500);

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
