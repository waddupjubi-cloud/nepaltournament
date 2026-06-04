import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type AdminAction = "createUser" | "deleteUser" | "updatePassword";
const staffRoles = ["usermod", "playermod", "tournamentmod", "useradmin", "playeradmin", "tournamentadmin"];
const playerRoles = ["exp", "jg", "gd", "md", "rm", "coach", "sb1", "sb2", "multirole", "founder", "leader"];

function uniqueStrings(values: unknown[], allowed?: string[]) {
  const result = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  return allowed ? result.filter((value) => allowed.includes(value)) : result;
}

function profileStaffRoles(profile: any) {
  return uniqueStrings([profile?.staff_role, ...(Array.isArray(profile?.staff_roles) ? profile.staff_roles : [])]);
}

function hasStaffRole(profile: any, ...roles: string[]) {
  const current = profileStaffRoles(profile);
  return roles.some((role) => current.includes(role));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function usernameFor(admin: any, userId: string, displayName: string) {
  const { data: existingProfile, error: existingError } = await admin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingProfile?.username) return existingProfile.username;

  const { data, error } = await admin.rpc("generate_username", { display_name: displayName });
  if (error) throw error;
  return data as string;
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

  const { data: callerProfile, error: profileError } = await callerClient
    .from("profiles")
    .select("id, staff_role, staff_roles")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profileStaffRoles(callerProfile).length) return json({ error: "Only staff can manage Auth users." }, 403);

  const canCreateUser = hasStaffRole(callerProfile, "superadmin", "useradmin");
  const canDeleteUser = hasStaffRole(callerProfile, "superadmin");
  const canResetPassword = async (targetUserId: string) => {
    if (hasStaffRole(callerProfile, "superadmin")) return true;
    if (!hasStaffRole(callerProfile, "useradmin", "usermod")) return false;
    const { data: target } = await admin.from("profiles").select("staff_role, staff_roles").eq("id", targetUserId).maybeSingle();
    const targetRoles = profileStaffRoles(target);
    if (targetRoles.includes("superadmin")) return false;
    if (hasStaffRole(callerProfile, "useradmin")) return targetRoles.length === 0 || targetRoles.every((role) => role === "usermod");
    return targetRoles.length === 0;
  };

  const body = await req.json();
  const action = body.action as AdminAction;

  if (action === "createUser") {
    if (!canCreateUser) return json({ error: "Only Superadmin or UserAdmin can create Auth users." }, 403);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    const ign = String(body.ign || "").trim();
    const role = body.role === "player" ? "player" : "user";
    const requestedStaffRoles = uniqueStrings([
      ...(Array.isArray(body.staff_roles) ? body.staff_roles : []),
      body.staff_role
    ]);
    const staffRolesSelected = uniqueStrings([
      ...(Array.isArray(body.staff_roles) ? body.staff_roles : []),
      body.staff_role
    ], staffRoles);
    const staffRole = staffRolesSelected[0] || null;
    const playerRolesSelected = role === "player" ? uniqueStrings(Array.isArray(body.player_roles) ? body.player_roles : [], playerRoles) : [];

    if (!email || !password || !fullName) return json({ error: "Email, password, and full name are required." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (requestedStaffRoles.includes("superadmin")) return json({ error: "Create additional superadmins manually and deliberately." }, 400);
    if (hasStaffRole(callerProfile, "useradmin") && !hasStaffRole(callerProfile, "superadmin") && staffRolesSelected.some((item) => item !== "usermod")) {
      return json({ error: "UserAdmin can only assign UserMod." }, 403);
    }

    const requestedUsername = String(body.username || "").trim().toLowerCase();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, ign, username: requestedUsername || undefined }
    });
    if (created.error) return json({ error: created.error.message }, 400);

    const userId = created.data.user.id;
    let username: string;
    try {
      username = requestedUsername || await usernameFor(admin, userId, fullName || email);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Could not generate username." }, 400);
    }
    const profile = await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      username,
      ign,
      role,
      staff_role: staffRole,
      staff_roles: staffRolesSelected,
      player_roles: playerRolesSelected,
      is_verified: true,
      is_player_approved: role === "player"
    }, { onConflict: "id" });
    if (profile.error) return json({ error: profile.error.message }, 400);

    await admin.from("audit_logs").insert({
      admin_id: callerProfile.id,
      action: "edge_create_user",
      target_id: userId,
      details: { email, username, role, staff_roles: staffRolesSelected, player_roles: playerRolesSelected }
    });

    return json({ ok: true, user_id: userId, username });
  }

  if (action === "deleteUser") {
    if (!canDeleteUser) return json({ error: "Only Superadmin can delete Auth users." }, 403);
    const userId = String(body.user_id || "");
    if (!userId) return json({ error: "user_id is required." }, 400);
    if (userId === callerProfile.id) return json({ error: "Superadmin cannot delete themselves." }, 400);

    const { data: targetProfile } = await admin.from("profiles").select("staff_role, staff_roles").eq("id", userId).maybeSingle();
    if (hasStaffRole(targetProfile, "superadmin")) return json({ error: "Superadmin accounts are protected." }, 400);

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
    if (!(await canResetPassword(userId))) return json({ error: "You cannot reset this user's password." }, 403);

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
