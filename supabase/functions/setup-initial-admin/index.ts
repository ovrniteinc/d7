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

    const { setupSecret, email, password, name } = await req.json();
    const expectedSecret = Deno.env.get("SETUP_SECRET");
    if (!expectedSecret || setupSecret !== expectedSecret) {
      return errorResponse("Invalid setup secret", 403);
    }

    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (count && count > 0) {
      return errorResponse("Admin already exists", 409);
    }

    const adminEmail = email || "admin@district7.local";
    const adminPassword = password || "District7!2024";
    const adminName = name || "District Admin";

    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { name: adminName },
    });
    if (createErr) return errorResponse(createErr.message, 400);
    if (!newUser.user) return errorResponse("Admin creation failed", 500);

    const { error: profileErr } = await supabase.from("profiles").insert({
      id: newUser.user.id,
      email: adminEmail,
      name: adminName,
      title: "Administrator",
      role: "admin",
      status: "active",
      must_reset_password: false,
    });
    if (profileErr) return errorResponse(profileErr.message, 500);

    await supabase.from("activity_logs").insert({
      user_id: newUser.user.id,
      action: "system.setup_admin",
      entity_type: "user",
      entity_id: newUser.user.id,
      meta: { email: adminEmail },
    });

    return jsonResponse({ ok: true, email: adminEmail, id: newUser.user.id });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
});
