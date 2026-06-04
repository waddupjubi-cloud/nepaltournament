import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type AdminAction = "createUser" | "deleteUser" | "updatePassword";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceRoleKey;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Function environment is not configured." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing staff session." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid staff session." }, 401);

  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, staff_role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || callerProfile?.staff_role !== "superadmin") return json({ error: "Only Superadmin can manage Auth users." }, 403);

  const body = await req.json();
  const action = body.action as AdminAction;

  if (action === "createUser") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    const ign = String(body.ign || "").trim();
    const role = body.role === "player" ? "player" : "user";
    const staffRole = body.staff_role || null;

    if (!email || !password || !fullName) return json({ error: "Email, password, and full name are required." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (staffRole === "superadmin") return json({ error: "Create additional superadmins manually and deliberately." }, 400);

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, ign }
    });
    if (created.error) return json({ error: created.error.message }, 400);

    const userId = created.data.user.id;
    const profile = await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      ign,
      role,
      staff_role: staffRole,
      is_verified: true,
      is_player_approved: role === "player"
    }, { onConflict: "id" });
    if (profile.error) return json({ error: profile.error.message }, 400);

    await admin.from("audit_logs").insert({
      admin_id: callerProfile.id,
      action: "edge_create_user",
      target_id: userId,
      details: { email, role, staff_role: staffRole }
    });

    return json({ ok: true, user_id: userId });
  }

  if (action === "deleteUser") {
    const userId = String(body.user_id || "");
    if (!userId) return json({ error: "user_id is required." }, 400);
    if (userId === callerProfile.id) return json({ error: "Superadmin cannot delete themselves." }, 400);

    const { data: targetProfile } = await admin.from("profiles").select("staff_role").eq("id", userId).maybeSingle();
    if (targetProfile?.staff_role === "superadmin") return json({ error: "Superadmin accounts are protected." }, 400);

    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) return json({ error: deleted.error.message }, 400);

    await admin.from("audit_logs").insert({
      admin_id: callerProfile.id,
      action: "edge_delete_user",
      target_id: userId,
      details: {}
    });

    return json({ ok: true });
  }

  if (action === "updatePassword") {
    const userId = String(body.user_id || "");
    const password = String(body.password || "");
    if (!userId || password.length < 8) return json({ error: "A user and a password of at least 8 characters are required." }, 400);

    const updated = await admin.auth.admin.updateUserById(userId, { password });
    if (updated.error) return json({ error: updated.error.message }, 400);

    await admin.from("audit_logs").insert({
      admin_id: callerProfile.id,
      action: "edge_update_password",
      target_id: userId,
      details: {}
    });

    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
});
