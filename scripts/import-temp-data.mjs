import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("PowerShell example:");
  console.error("$env:SUPABASE_URL='https://your-project.supabase.co'");
  console.error("$env:SUPABASE_SERVICE_ROLE_KEY='your-service-role-or-secret-key'");
  console.error("npm run import:temp");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function getUsersByEmail() {
  const users = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) users.set(user.email?.toLowerCase(), user);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return users;
}

async function ensureAuthUsers(seedUsers) {
  const existing = await getUsersByEmail();
  const byEmail = new Map();

  for (const seed of seedUsers) {
    const email = seed.email.toLowerCase();
    const requestedUsername = seed.username ? seed.username.toLowerCase() : null;
    let user = existing.get(email);
    if (!user) {
      const username = requestedUsername || await generateUsername(seed.full_name);
      const created = await supabase.auth.admin.createUser({
        email,
        password: seed.password,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: seed.full_name,
          ign: seed.ign,
          temp_seed_account: true
        }
      });
      if (created.error) throw created.error;
      user = created.data.user;
      console.log(`Created auth user: ${email}`);
    } else {
      console.log(`Auth user exists: ${email}`);
    }

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;
    const profile = {
      id: user.id,
      full_name: seed.full_name,
      username: existingProfile?.username || requestedUsername || await generateUsername(seed.full_name),
      ign: seed.ign,
      role: seed.role || "user",
      staff_role: seed.staff_role || null,
      is_verified: true,
      is_player_approved: seed.role === "player" || Boolean(seed.staff_role?.includes("player"))
    };
    const { error } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
    if (error) throw error;
    byEmail.set(email, { ...seed, id: user.id });
  }

  return byEmail;
}

async function generateUsername(displayName) {
  const { data, error } = await supabase.rpc("generate_username", { display_name: displayName });
  if (error) throw error;
  return data;
}

async function upsertTeams(seedTeams, usersByEmail) {
  for (const team of seedTeams) {
    const founder = usersByEmail.get(team.founder_email.toLowerCase());
    const leader = usersByEmail.get(team.leader_email.toLowerCase());
    const coach = usersByEmail.get(team.coach_email.toLowerCase());
    const roster = team.roster.map((member) => {
      const user = usersByEmail.get(member.email.toLowerCase());
      if (!user) throw new Error(`Missing roster user: ${member.email}`);
      return {
        player_id: user.id,
        role: member.role,
        joined_at: new Date().toISOString()
      };
    });

    const existing = await supabase
      .from("teams")
      .select("team_id")
      .eq("team_tag", team.team_tag)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const payload = {
      team_name: team.team_name,
      team_tag: team.team_tag,
      founder_id: founder.id,
      team_leader_id: leader.id,
      coach_id: coach.id,
      status: team.status || "approved",
      roster
    };

    let teamId = existing.data?.team_id;
    if (teamId) {
      const { error } = await supabase.from("teams").update(payload).eq("team_id", teamId);
      if (error) throw error;
      await supabase.from("team_members").delete().eq("team_id", teamId);
      console.log(`Updated team: ${team.team_name}`);
    } else {
      const { data, error } = await supabase.from("teams").insert(payload).select("team_id").single();
      if (error) throw error;
      teamId = data.team_id;
      console.log(`Created team: ${team.team_name}`);
    }

    const memberRows = roster.map((member) => ({
      team_id: teamId,
      player_id: member.player_id,
      role: member.role
    }));
    const { error: memberError } = await supabase.from("team_members").insert(memberRows);
    if (memberError) throw memberError;
  }
}

async function insertFeedPosts(seedPosts, usersByEmail) {
  async function nextPinOrder() {
    const { data, error } = await supabase.from("feed_posts").select("pin_order").eq("is_pinned", true);
    if (error) throw error;
    const used = new Set((data || []).map((post) => post.pin_order).filter(Boolean));
    for (let index = 1; index <= 5; index += 1) {
      if (!used.has(index)) return index;
    }
    return null;
  }

  for (const post of seedPosts) {
    const author = usersByEmail.get(post.author_email.toLowerCase());
    const existing = await supabase.from("feed_posts").select("post_id").eq("title", post.title).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      console.log(`Feed post exists: ${post.title}`);
      continue;
    }
    const pinOrder = post.is_pinned ? (post.pin_order || await nextPinOrder()) : null;
    const { error } = await supabase.from("feed_posts").insert({
      author_id: author.id,
      author_role: post.author_role,
      title: post.title,
      content: post.content,
      is_pinned: Boolean(pinOrder),
      pin_order: pinOrder,
      audience_type: post.audience_type || "all"
    });
    if (error) throw error;
    console.log(`Created feed post: ${post.title}`);
  }
}

async function main() {
  const users = await readJson("data/temp-users.json");
  const teams = await readJson("data/temp-teams.json");
  const feedPosts = await readJson("data/temp-feed-posts.json");

  const usersByEmail = await ensureAuthUsers(users);
  await upsertTeams(teams, usersByEmail);
  await insertFeedPosts(feedPosts, usersByEmail);

  console.log("Temporary JSON data import complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
