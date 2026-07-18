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
    if (!callerProfile || callerProfile.role !== "admin" || callerProfile.status !== "active") {
      return errorResponse("Admin only", 403);
    }

    const { name, title, email, role, password } = await req.json();
    if (!email || !password || !name || !role) {
      return errorResponse("Missing required fields", 400);
    }
    if (password.length < 8) return errorResponse("Password too short", 400);
    if (!["admin", "staff"].includes(role)) return errorResponse("Invalid role", 400);

    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { name, title },
    });
    if (createErr) return errorResponse(createErr.message, 400);
    if (!newUser.user) return errorResponse("User creation failed", 500);

    const { error: profileErr } = await supabase.from("profiles").insert({
      id: newUser.user.id,
      email,
      name,
      title: title || "",
      role,
      status: "active",
      must_reset_password: true,
    });
    if (profileErr) return errorResponse(profileErr.message, 500);

    await supabase.from("activity_logs").insert({
      user_id: caller.user.id,
      action: "user.create",
      entity_type: "user",
      entity_id: newUser.user.id,
      meta: { email, role, name },
    });

    return jsonResponse({ id: newUser.user.id, email, name, role });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
