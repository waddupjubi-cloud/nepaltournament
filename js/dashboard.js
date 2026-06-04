(function () {
  const roleModules = {
    superadmin: ["overview", "broadcasts", "users", "players", "tournaments", "audit"],
    useradmin: ["broadcasts", "users", "audit"],
    usermod: ["broadcasts", "users"],
    playeradmin: ["broadcasts", "players", "users", "audit"],
    playermod: ["broadcasts", "players"],
    tournamentadmin: ["broadcasts", "tournaments", "players", "audit"],
    tournamentmod: ["broadcasts", "tournaments"]
  };

  const labels = {
    overview: ["fa-chart-simple", "Overview"],
    users: ["fa-users", "User Management"],
    players: ["fa-user-shield", "Player Management"],
    tournaments: ["fa-trophy", "Tournament Management"],
    broadcasts: ["fa-bullhorn", "Broadcasts"],
    audit: ["fa-clipboard-list", "Audit Logs"]
  };

  const userRoles = ["user", "player"];
  const staffRoles = ["usermod", "playermod", "tournamentmod", "useradmin", "playeradmin", "tournamentadmin"];
  const protectedStaffRoles = ["superadmin", ...staffRoles];
  const adminStaffRoles = ["useradmin", "playeradmin", "tournamentadmin"];
  const modStaffRoles = ["usermod", "playermod", "tournamentmod"];
  const playerRoles = ["exp", "jg", "gd", "md", "rm", "coach", "sb1", "sb2", "multirole", "founder", "leader"];
  const teamRoles = ["exp", "jg", "gd", "md", "rm", "coach", "sb1", "sb2"];
  const staffRolePriority = ["superadmin", "useradmin", "playeradmin", "tournamentadmin", "usermod", "playermod", "tournamentmod"];
  const previewRoleStorageKey = "tp-dashboard-preview-role";
  const tournamentStatuses = ["draft", "registration", "in_progress", "completed"];
  const matchStatuses = ["scheduled", "checkin_open", "live", "paused", "finished", "forfeit"];
  const audienceTypes = ["all", "users", "players", "staff", "role", "individual", "team"];
  let activeModule = "overview";
  let realtimeStarted = false;
  let refreshTimer = null;
  let overviewChart = null;

  function U() {
    return window.TPUtils;
  }

  function db() {
    return window.tpSupabase;
  }

  function me() {
    return window.currentProfile || {};
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function rawStaffRolesFor(profile = me()) {
    const roles = uniqueValues([profile?.staff_role, ...(Array.isArray(profile?.staff_roles) ? profile.staff_roles : [])]);
    return roles.sort((a, b) => staffRolePriority.indexOf(a) - staffRolePriority.indexOf(b));
  }

  function staffRolesFor(profile = me()) {
    const previewRole = localStorage.getItem(previewRoleStorageKey) || "";
    if (previewRole && rawStaffRolesFor(profile).includes("superadmin")) {
      return [previewRole].filter(Boolean);
    }
    return rawStaffRolesFor(profile);
  }

  function playerRolesFor(profile = {}) {
    return uniqueValues(Array.isArray(profile.player_roles) ? profile.player_roles : []);
  }

  function hasStaffRole(profile, ...roles) {
    const current = staffRolesFor(profile);
    return roles.some((role) => current.includes(role));
  }

  function hasRealStaffRole(profile, ...roles) {
    const current = rawStaffRolesFor(profile);
    return roles.some((role) => current.includes(role));
  }

  function previewRoleLabel() {
    const previewRole = localStorage.getItem(previewRoleStorageKey) || "";
    if (!previewRole) return "";
    const previewMap = {
      useradmin: "User Admin",
      usermod: "User Mod",
      playeradmin: "Player Admin",
      playermod: "Player Mod",
      tournamentadmin: "Tournament Admin",
      tournamentmod: "Tournament Mod"
    };
    return `Preview: ${previewMap[previewRole] || previewRole}`;
  }

  function primaryStaffRole(profile = me()) {
    return staffRolesFor(profile)[0] || null;
  }

  function staffRoleLabel(profile = me()) {
    const roles = staffRolesFor(profile);
    return roles.length ? roles.join(", ") : "-";
  }

  function modulesFor(profile = me()) {
    return uniqueValues(staffRolesFor(profile).flatMap((role) => roleModules[role] || []));
  }

  function hasRole(...roles) {
    return hasStaffRole(me(), ...roles);
  }

  function canCreateUsers() {
    return hasRole("superadmin", "useradmin");
  }

  function canEditBasicUsers() {
    return hasRole("superadmin", "useradmin", "usermod", "playeradmin");
  }

  function canManagePlayerAppeals() {
    return hasRole("superadmin", "useradmin");
  }

  function canEditPlayerRoles() {
    return hasRole("superadmin", "useradmin", "playeradmin");
  }

  function canDeleteUsers(profile) {
    return hasRole("superadmin") && profile.id !== me().id && !hasStaffRole(profile, "superadmin");
  }

  function canResetPassword(profile) {
    if (hasStaffRole(profile, "superadmin")) return false;
    if (hasRole("superadmin")) return true;
    if (hasRole("useradmin")) return staffRolesFor(profile).every((role) => role === "usermod");
    if (hasRole("usermod")) return !staffRolesFor(profile).length;
    return false;
  }

  function canAssignStaffRole(role) {
    if (hasRole("superadmin")) return role !== "superadmin";
    if (hasRole("useradmin")) return role === "" || role === "usermod";
    if (hasRole("playeradmin")) return role === "" || role === "playermod";
    if (hasRole("tournamentadmin")) return role === "" || role === "tournamentmod";
    return false;
  }

  function canManageTeams() {
    return hasRole("superadmin", "playeradmin", "playermod");
  }

  function canDeleteTeams() {
    return hasRole("superadmin", "playeradmin");
  }

  function canCreateTournaments() {
    return hasRole("superadmin", "tournamentadmin");
  }

  function canEditTournaments() {
    return hasRole("superadmin", "tournamentadmin");
  }

  function canDeleteTournaments() {
    return hasRole("superadmin", "tournamentadmin");
  }

  function canManageMatches() {
    return hasRole("superadmin", "tournamentadmin", "tournamentmod");
  }

  function canDeleteMatches() {
    return hasRole("superadmin", "tournamentadmin");
  }

  function canBroadcast() {
    return Boolean(staffRolesFor().length);
  }

  function canDeleteBroadcast(post) {
    const mine = staffRolesFor();
    if (mine.includes("superadmin")) return true;
    if (post.author_role === "superadmin") return false;
    if (mine.some((role) => adminStaffRoles.includes(role)) && [...adminStaffRoles, ...modStaffRoles].includes(post.author_role)) return true;
    if (post.author_id === me().id) return true;
    return false;
  }

  function canEditBroadcast(post) {
    return canDeleteBroadcast(post);
  }

  function actionDepartment(action = "") {
    const value = String(action).toLowerCase();
    if (/broadcast|feed|post|pin/.test(value)) return "Broadcast";
    if (/user|password|profile|appeal|verify/.test(value)) return "User Management";
    if (/team|player|member|approval/.test(value)) return "Player Management";
    if (/tournament|match|bracket|registration/.test(value)) return "Tournament";
    return "General";
  }

  function actionLabel(action = "") {
    return String(action || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function optionList(options, selected, emptyLabel) {
    const empty = emptyLabel !== undefined ? `<option value="">${emptyLabel}</option>` : "";
    return empty + options.map((option) => `<option value="${option}" ${String(selected || "") === String(option) ? "selected" : ""}>${option}</option>`).join("");
  }

  function checkboxGroup(name, options, selected = []) {
    const picked = new Set(selected);
    return `<div class="check-grid">${options.map((option) => `
      <label class="check-row"><input type="checkbox" name="${name}" value="${option}" ${picked.has(option) ? "checked" : ""}> <span>${option}</span></label>
    `).join("")}</div>`;
  }

  function checkedValues(name, root = document) {
    return U().qsa(`input[name="${name}"]:checked`, root).map((input) => input.value);
  }

  function relativeTime(value) {
    if (!value) return "not yet";
    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const units = [
      ["year", 31536000],
      ["month", 2592000],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
      ["second", 1]
    ];
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    for (const [unit, amount] of units) {
      if (Math.abs(seconds) >= amount || unit === "second") {
        return formatter.format(Math.round(seconds / amount), unit);
      }
    }
    return "just now";
  }

  function confirmCreate(kind, name) {
    return confirm(`Create ${kind}${name ? ` "${name}"` : ""}?`);
  }

  function createdPopup(kind, name, extra) {
    alert(`${kind} created${name ? `: ${name}` : ""}${extra ? `\n${extra}` : ""}`);
  }

  function shuffleList(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  async function logAction(action, targetId, details) {
    await db().from("audit_logs").insert({
      admin_id: me().id,
      action,
      target_id: targetId || null,
      details: details || {}
    });
  }

  async function callAdminUsersFunction(action, payload) {
    const { data: sessionData } = await db().auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Staff session expired. Please log in again.");
    const cfg = window.TP_CONFIG || {};
    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action, ...payload })
    });
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
    if (!response.ok) throw new Error(data?.error || data?.message || `Edge Function returned ${response.status}. Deploy or redeploy admin-users in Supabase.`);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function renderSidebar() {
    const modules = modulesFor();
    const root = U().qs("#dashSidebar");
    root.innerHTML = `<div class="dash-brand"><span>Tournament Players</span></div>` + modules.map((mod, index) => `
      <button class="dash-nav-button ${index === 0 ? "is-active" : ""}" type="button" data-module="${mod}">
        <i class="fa-solid ${labels[mod][0]}"></i><span>${labels[mod][1]}</span>
      </button>`).join("");
    U().qsa("[data-module]", root).forEach((button) => {
      button.addEventListener("click", () => {
        U().qsa("[data-module]", root).forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        loadModule(button.dataset.module);
      });
    });
    loadModule(modules[0] || "overview");
  }

  async function loadModule(module) {
    activeModule = module;
    U().qs("#dashTitle").textContent = labels[module]?.[1] || "Dashboard";
    if (module === "overview") return overview();
    if (module === "users") return users();
    if (module === "players") return players();
    if (module === "tournaments") return tournaments();
    if (module === "broadcasts") return broadcasts();
    if (module === "audit") return audit();
  }

  function refreshActiveSoon() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      loadModule(activeModule);
      activity();
    }, 350);
  }

  function startRealtime() {
    if (realtimeStarted) return;
    realtimeStarted = true;
    ["profiles", "player_appeals", "teams", "team_approval_requests", "team_members", "tournaments", "tournament_registrations", "matches", "feed_posts", "notifications", "audit_logs"].forEach((table) => {
      db().channel(`dashboard:${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, refreshActiveSoon)
        .subscribe();
    });
  }

  async function overview() {
    const root = U().qs("#dashContent");
    root.innerHTML = `<div class="card-grid" id="statCards"></div><section class="wide-panel"><canvas id="overviewChart" height="120"></canvas></section>`;
    const [profilesResult, teamsResult, tournamentsResult, matchesResult] = await Promise.all([
      db().from("profiles").select("id, role, staff_role, staff_roles, player_roles"),
      db().from("teams").select("*", { count: "exact", head: true }),
      db().from("tournaments").select("*", { count: "exact", head: true }),
      db().from("matches").select("*", { count: "exact", head: true })
    ]);
    const loadError = profilesResult.error || teamsResult.error || tournamentsResult.error || matchesResult.error;
    if (loadError) return root.innerHTML = `<p class="message error">${U().escapeHtml(loadError.message)}</p>`;
    const profiles = profilesResult.data || [];
    const counts = {
      users: profiles.length,
      players: profiles.filter((profile) => profile.role === "player" || profile.role === "superadmin" || playerRolesFor(profile).length).length,
      admins: profiles.filter((profile) => staffRolesFor(profile).some((role) => adminStaffRoles.includes(role))).length,
      mods: profiles.filter((profile) => staffRolesFor(profile).some((role) => modStaffRoles.includes(role))).length,
      superadmins: profiles.filter((profile) => hasStaffRole(profile, "superadmin")).length,
      teams: teamsResult.count || 0,
      tournaments: tournamentsResult.count || 0,
      matches: matchesResult.count || 0
    };
    const statCards = [
      ["users", "Users", counts.users, "fa-users"],
      ["players", "Players", counts.players, "fa-user-ninja"],
      ["admins", "Admins", counts.admins, "fa-user-tie"],
      ["mods", "Mods", counts.mods, "fa-user-shield"],
      ["superadmins", "Superadmins", counts.superadmins, "fa-crown"],
      ["teams", "Teams", counts.teams, "fa-people-group"],
      ["tournaments", "Tournaments", counts.tournaments, "fa-trophy"],
      ["matches", "Matches", counts.matches, "fa-gamepad"]
    ];
    U().qs("#statCards").innerHTML = `
      ${statCards.map(([key, label, value, icon]) => `
        <button class="item-card stat-card" type="button" data-drilldown="${key}">
          <i class="fa-solid ${icon}"></i>
          <span>${U().escapeHtml(label)}</span>
          <strong>${value}</strong>
        </button>`).join("")}`;
    bindOverviewDrilldowns();
    if (window.Chart) {
      if (overviewChart) overviewChart.destroy();
      overviewChart = new Chart(U().qs("#overviewChart"), {
        type: "bar",
        data: {
          labels: statCards.map(([, label]) => label),
          datasets: [{
            label: "Dashboard totals",
            data: statCards.map(([, , value]) => value),
            backgroundColor: ["#0066cc", "#00a65a", "#8b5cf6", "#f59e0b", "#8b0000", "#ffcc00", "#00cc44", "#2563eb"]
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true }, tooltip: { callbacks: { label: (item) => `${item.label}: ${item.raw}` } } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
  }

  function bindOverviewDrilldowns() {
    U().qsa("[data-drilldown]").forEach((button) => button.addEventListener("click", () => {
      const type = button.dataset.drilldown;
      if (["users", "players", "admins", "mods", "superadmins"].includes(type)) return openProfileCardBrowser(type);
      if (type === "teams") return openTeamCardBrowser();
      if (type === "tournaments") return openTournamentCardBrowser();
      if (type === "matches") return openMatchBrowser();
    }));
  }

  function profileMatchesFilter(type, profile) {
    if (type === "players") return profile.role === "player" || profile.role === "superadmin" || playerRolesFor(profile).length;
    if (type === "admins") return staffRolesFor(profile).some((role) => adminStaffRoles.includes(role));
    if (type === "mods") return staffRolesFor(profile).some((role) => modStaffRoles.includes(role));
    if (type === "superadmins") return hasStaffRole(profile, "superadmin");
    return true;
  }

  function profileBrowserTitle(type) {
    return {
      users: "User Cards",
      players: "Player Cards",
      admins: "Admin Cards",
      mods: "Moderator Cards",
      superadmins: "Superadmin Cards"
    }[type] || "User Cards";
  }

  function teamMembershipsForProfile(profileId, teams) {
    return (teams || []).filter((team) => (team.roster || []).some((member) => member.player_id === profileId));
  }

  async function openProfileCardBrowser(type) {
    const [{ data: profiles, error }, { data: teams }] = await Promise.all([
      db().from("profiles").select("*").order("full_name").limit(500),
      db().from("teams").select("team_id, team_name, team_tag, roster").order("team_name").limit(500)
    ]);
    if (error) return alert(error.message);
    const filtered = (profiles || []).filter((profile) => profileMatchesFilter(type, profile));
    U().openModal(profileBrowserTitle(type), `
      <div class="browser-grid player-browser">
        ${filtered.map((profile) => renderProfileFlipCard(profile, teamMembershipsForProfile(profile.id, teams || []))).join("") || '<p class="muted">No profiles found.</p>'}
      </div>`);
    U().qsa("[data-flip-profile]").forEach((card) => card.addEventListener("click", () => card.classList.toggle("is-flipped")));
  }

  function renderProfileFlipCard(profile, teams) {
    const teamLabels = teams.map((team) => `${team.team_name} [${team.team_tag}]`);
    return `<article class="flip-card" data-flip-profile="${profile.id}" tabindex="0">
      <div class="flip-card-inner">
        <div class="flip-face flip-front">
          <div class="section-heading">
            <div><strong>${U().escapeHtml(profile.full_name || "Unnamed")}</strong><p class="muted">@${U().escapeHtml(profile.username || "username")}</p></div>
            <span class="pill good">${U().escapeHtml(profile.role || "user")}</span>
          </div>
          <dl class="detail-list">
            <div><dt>IGN</dt><dd>${U().escapeHtml(profile.ign || "-")}</dd></div>
            <div><dt>Game ID</dt><dd>${U().escapeHtml(profile.game_id || "-")}</dd></div>
            <div><dt>Server ID</dt><dd>${U().escapeHtml(profile.server_id || "-")}</dd></div>
            <div><dt>DOB</dt><dd>${U().formatDate(profile.date_of_birth)}</dd></div>
          </dl>
          <p>${U().escapeHtml(profile.bio || "No bio yet.")}</p>
          <div>${U().rolePills(playerRolesFor(profile)) || '<span class="muted">No player roles</span>'}</div>
        </div>
        <div class="flip-face flip-back">
          <strong>${U().escapeHtml(profile.tagline || "No tagline yet")}</strong>
          <dl class="detail-list">
            <div><dt>Favorite hero</dt><dd>${U().escapeHtml(profile.favorite_hero || "-")}</dd></div>
            <div><dt>Motto</dt><dd>${U().escapeHtml(profile.motto || "-")}</dd></div>
            <div><dt>Favorite line</dt><dd>${U().escapeHtml(profile.favorite_quote || "-")}</dd></div>
            <div><dt>Likes</dt><dd>${U().escapeHtml(profile.likes || "-")}</dd></div>
            <div><dt>Dislikes</dt><dd>${U().escapeHtml(profile.dislikes || "-")}</dd></div>
            <div><dt>Teams</dt><dd>${U().escapeHtml(teamLabels.join(", ") || "-")}</dd></div>
            <div><dt>Staff</dt><dd>${U().escapeHtml(staffRoleLabel(profile))}</dd></div>
          </dl>
        </div>
      </div>
    </article>`;
  }

  function teamStats(teamId, registrations = [], matches = []) {
    const approvedRegs = registrations.filter((registration) => registration.team_id === teamId && registration.status === "approved");
    const teamMatches = matches.filter((match) => match.team_a_id === teamId || match.team_b_id === teamId);
    const completed = teamMatches.filter((match) => match.winner_team_id);
    return {
      tournaments: uniqueValues(approvedRegs.map((registration) => registration.tournament_id)).length,
      matches: teamMatches.length,
      wins: completed.filter((match) => match.winner_team_id === teamId).length,
      losses: completed.filter((match) => match.winner_team_id !== teamId).length
    };
  }

  async function openTeamCardBrowser() {
    const [teamsResult, profilesResult, registrationsResult, matchesResult] = await Promise.all([
      db().from("teams").select("*").order("team_name").limit(500),
      db().from("profiles").select("id, full_name, username, ign, game_id, server_id, player_roles").limit(800),
      db().from("tournament_registrations").select("*, tournaments(name)").limit(1000),
      db().from("matches").select("match_id, tournament_id, team_a_id, team_b_id, winner_team_id, status, round_name").limit(2000)
    ]);
    if (teamsResult.error) return alert(teamsResult.error.message);
    const teams = teamsResult.data || [];
    const profiles = profilesResult.data || [];
    const registrations = registrationsResult.data || [];
    const matches = matchesResult.data || [];
    U().openModal("Team Cards", `
      <div class="browser-grid">
        ${teams.map((team) => renderTeamDataCard(team, teamStats(team.team_id, registrations, matches))).join("") || '<p class="muted">No teams found.</p>'}
      </div>`);
    U().qsa("[data-view-team]").forEach((button) => button.addEventListener("click", () => {
      const team = teams.find((item) => item.team_id === button.dataset.viewTeam);
      openTeamDetailModal(team, profiles, registrations, matches);
    }));
  }

  function renderTeamDataCard(team, stats) {
    return `<button class="data-card" type="button" data-view-team="${team.team_id}">
      <div class="section-heading"><strong>${U().escapeHtml(team.team_name)}</strong><span class="pill">${U().escapeHtml(team.team_tag)}</span></div>
      <p class="muted">${U().escapeHtml(team.status)} - ${(team.roster || []).length} / 8 members</p>
      <div class="metric-grid">
        <span><strong>${stats.wins}</strong><small>Wins</small></span>
        <span><strong>${stats.losses}</strong><small>Losses</small></span>
        <span><strong>${stats.tournaments}</strong><small>Tournaments</small></span>
        <span><strong>${stats.matches}</strong><small>Matches</small></span>
      </div>
    </button>`;
  }

  function openTeamDetailModal(team, profiles, registrations, matches) {
    if (!team) return;
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const stats = teamStats(team.team_id, registrations, matches);
    const approvedRegs = registrations.filter((registration) => registration.team_id === team.team_id && registration.status === "approved");
    const teamMatches = matches.filter((match) => match.team_a_id === team.team_id || match.team_b_id === team.team_id);
    U().openModal(`${team.team_name} Details`, `
      <div class="detail-grid">
        <section>
          <div class="metric-grid">
            <span><strong>${stats.wins}</strong><small>Won</small></span>
            <span><strong>${stats.losses}</strong><small>Lost</small></span>
            <span><strong>${stats.tournaments}</strong><small>Tournaments</small></span>
            <span><strong>${stats.matches}</strong><small>Total matches</small></span>
          </div>
          <p>${U().escapeHtml(team.bio || "")}</p>
        </section>
        <section>
          <h3>Members</h3>
          <div class="mini-card-grid">
            ${(team.roster || []).map((member) => {
              const profile = profileMap.get(member.player_id);
              return `<article class="mini-card">
                <strong>${U().escapeHtml(profile?.full_name || member.player_id)}</strong>
                <p class="muted">${U().escapeHtml(profile?.ign || "No IGN")} - ${U().escapeHtml(member.role || "-")}</p>
                ${U().rolePills(playerRolesFor(profile || {}))}
              </article>`;
            }).join("") || '<p class="muted">No roster members.</p>'}
          </div>
        </section>
        <section>
          <h3>Approved Tournaments</h3>
          <div class="list-stack">${approvedRegs.map((registration) => `<div class="mini-card"><strong>${U().escapeHtml(registration.tournaments?.name || registration.tournament_id)}</strong><p class="muted">${U().formatDate(registration.reviewed_at || registration.created_at)}</p></div>`).join("") || '<p class="muted">No approved tournament tickets.</p>'}</div>
        </section>
        <section>
          <h3>Match History</h3>
          <div class="list-stack">${teamMatches.slice(0, 12).map((match) => `<div class="mini-card"><strong>${U().escapeHtml(match.round_name || "Match")}</strong><p class="muted">${match.winner_team_id === team.team_id ? "Won" : match.winner_team_id ? "Lost" : U().escapeHtml(match.status || "scheduled")}</p></div>`).join("") || '<p class="muted">No matches yet.</p>'}</div>
        </section>
      </div>`);
  }

  async function openTournamentCardBrowser() {
    const [tournamentsResult, registrationsResult, matchesResult] = await Promise.all([
      db().from("tournaments").select("*").order("start_date", { ascending: false }).limit(500),
      db().from("tournament_registrations").select("*, teams(team_name, team_tag)").limit(2000),
      db().from("matches").select("*, team_a:teams!matches_team_a_id_fkey(team_name, team_tag), team_b:teams!matches_team_b_id_fkey(team_name, team_tag)").order("scheduled_start_utc", { ascending: true }).limit(3000)
    ]);
    if (tournamentsResult.error) return alert(tournamentsResult.error.message);
    const tournamentsList = tournamentsResult.data || [];
    const registrations = registrationsResult.data || [];
    const matches = matchesResult.data || [];
    U().openModal("Tournament Cards", `
      <div class="browser-grid">
        ${tournamentsList.map((tournament) => renderTournamentDataCard(tournament, registrations)).join("") || '<p class="muted">No tournaments found.</p>'}
      </div>`);
    U().qsa("[data-view-tournament]").forEach((button) => button.addEventListener("click", () => {
      const tournament = tournamentsList.find((item) => item.tournament_id === button.dataset.viewTournament);
      openTournamentDetailModal(tournament, registrations, matches);
    }));
  }

  function renderTournamentDataCard(tournament, registrations) {
    const approved = registrations.filter((registration) => registration.tournament_id === tournament.tournament_id && registration.status === "approved").length;
    const pending = registrations.filter((registration) => registration.tournament_id === tournament.tournament_id && registration.status === "pending").length;
    return `<button class="data-card" type="button" data-view-tournament="${tournament.tournament_id}">
      <div class="section-heading"><strong>${U().escapeHtml(tournament.name)}</strong><span class="pill">${U().escapeHtml(tournament.status)}</span></div>
      <p>${U().escapeHtml(tournament.description || "")}</p>
      <div class="pill-row"><span class="pill">${U().escapeHtml(tournament.game || "Game")}</span><span class="pill">${tournament.team_capacity} teams</span><span class="pill">${U().formatDate(tournament.start_date)}</span></div>
      <div class="metric-grid"><span><strong>${approved}</strong><small>Approved</small></span><span><strong>${pending}</strong><small>Pending</small></span></div>
    </button>`;
  }

  function openTournamentDetailModal(tournament, registrations, matches) {
    if (!tournament) return;
    const approvedRegs = registrations.filter((registration) => registration.tournament_id === tournament.tournament_id && registration.status === "approved");
    const tournamentMatches = matches.filter((match) => match.tournament_id === tournament.tournament_id);
    const phaseGroups = tournamentMatches.reduce((groups, match) => {
      const key = match.phase || match.round_name || "Unplanned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(match);
      return groups;
    }, {});
    U().openModal(`${tournament.name} Details`, `
      <div class="detail-grid">
        <section class="mini-card">
          <div class="pill-row"><span class="pill good">${U().escapeHtml(tournament.status)}</span><span class="pill">${U().escapeHtml(tournament.game || "Game")}</span><span class="pill">${tournament.team_capacity} teams</span></div>
          <dl class="detail-list">
            <div><dt>Starts</dt><dd>${U().formatDate(tournament.start_date)}</dd></div>
            <div><dt>Registration deadline</dt><dd>${U().formatDate(tournament.registration_deadline)}</dd></div>
            <div><dt>Format</dt><dd>${U().escapeHtml((tournament.format_spec?.phases || []).join(" -> ") || "MLBB")}</dd></div>
          </dl>
          <p>${U().escapeHtml(tournament.description || "")}</p>
        </section>
        <section>
          <h3>Approved Teams</h3>
          <div class="mini-card-grid">${approvedRegs.map((registration) => `<article class="mini-card"><strong>${U().escapeHtml(registration.teams?.team_name || registration.team_id)}</strong><p class="muted">${U().escapeHtml(registration.teams?.team_tag || "")}</p></article>`).join("") || '<p class="muted">No approved teams yet.</p>'}</div>
        </section>
        <section>
          <h3>Bracket Phases</h3>
          <div class="list-stack">
            ${Object.entries(phaseGroups).map(([phase, phaseMatches]) => `
              <div class="mini-card">
                <div class="section-heading"><strong>${U().escapeHtml(phase)}</strong><span class="pill">${phaseMatches.length} matches</span></div>
                ${phaseMatches.slice(0, 10).map((match) => {
                  const a = match.team_a?.team_name || "TBD";
                  const b = match.team_b?.team_name || "TBD";
                  const winner = match.winner_team_id === match.team_a_id ? a : match.winner_team_id === match.team_b_id ? b : "TBD";
                  return `<p class="muted">${U().escapeHtml(match.round_name)}: ${U().escapeHtml(a)} vs ${U().escapeHtml(b)} - winner ${U().escapeHtml(winner)}</p>`;
                }).join("")}
              </div>`).join("") || '<p class="muted">No generated tie sheet yet.</p>'}
          </div>
        </section>
      </div>`);
  }

  async function openMatchBrowser() {
    const { data, error } = await db().from("matches").select("*, tournaments(name), team_a:teams!matches_team_a_id_fkey(team_name), team_b:teams!matches_team_b_id_fkey(team_name)").order("scheduled_start_utc", { ascending: false }).limit(300);
    if (error) return alert(error.message);
    U().openModal("Match Cards", `
      <div class="browser-grid">
        ${(data || []).map((match) => `<article class="data-card static-card">
          <strong>${U().escapeHtml(match.tournaments?.name || match.tournament_id)}</strong>
          <p>${U().escapeHtml(match.round_name || "Match")}</p>
          <p class="muted">${U().escapeHtml(match.team_a?.team_name || "TBD")} ${match.team_a_score ?? 0} - ${match.team_b_score ?? 0} ${U().escapeHtml(match.team_b?.team_name || "TBD")}</p>
          <div class="pill-row"><span class="pill">${U().escapeHtml(match.status)}</span><span class="pill">BO${match.best_of || 1}</span></div>
        </article>`).join("") || '<p class="muted">No matches found.</p>'}
      </div>`);
  }

  async function users() {
    const { data, error } = await db().from("profiles").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) return U().qs("#dashContent").innerHTML = `<p class="message error">${U().escapeHtml(error.message)}</p>`;
    U().qs("#dashContent").innerHTML = `
      ${canCreateUsers() ? renderCreateUserPanel() : ""}
      <section class="table-wrap">
        <div class="filter-grid dashboard-filter-bar">
          <label class="field"><input id="userSearch" placeholder=" "><span>Search users by name, username, IGN, or role</span></label>
          <label class="field"><select id="userPlayerStatusFilter"><option value="all">All player states</option><option value="approved">Player approved</option><option value="pending">Player pending</option><option value="verified">Verified users</option><option value="unverified">Unverified users</option></select><span>Status</span></label>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Player Roles</th><th>Staff</th><th>Verified</th><th>Actions</th></tr></thead>
          <tbody id="userRows">${renderUserRows(data)}</tbody>
        </table>
      </section>
      <section class="wide-panel"><h2>Player Appeals</h2><div id="appealsList" class="list-stack"></div></section>`;
    bindCreateUser();
    bindUserActions(data);
    const applyUserFilters = () => {
      U().qs("#userRows").innerHTML = renderUserRows(data, U().qs("#userSearch")?.value || "", U().qs("#userPlayerStatusFilter")?.value || "all");
      bindUserActions(data);
    };
    U().qs("#userSearch")?.addEventListener("input", applyUserFilters);
    U().qs("#userPlayerStatusFilter")?.addEventListener("change", applyUserFilters);
    loadAppeals();
  }

  function renderCreateUserPanel() {
    return `<section class="wide-panel">
      <div class="section-heading"><h2>Create Auth User</h2><span class="pill good">${hasRole("superadmin") ? "Superadmin" : "UserAdmin"}</span></div>
      <form id="createUserForm" class="form-grid">
        <label class="field"><input id="newUserName" required placeholder=" "><span>Full name</span></label>
        <label class="field"><input id="newUserEmail" type="email" required placeholder=" "><span>Email</span></label>
        <label class="field"><input id="newUserPassword" type="password" minlength="8" required placeholder=" "><span>Password</span></label>
        <label class="field"><input id="newUserIgn" placeholder=" "><span>IGN</span></label>
        <label class="field"><select id="newUserRole">${optionList(userRoles, "user")}</select><span>User role</span></label>
        <div><span class="muted">Player roles</span>${checkboxGroup("newUserPlayerRoles", playerRoles)}</div>
        <div><span class="muted">Staff roles</span>${checkboxGroup("newUserStaffRoles", staffRoleChoicesForCurrentUser())}</div>
        <button class="primary-button" type="submit">Create user</button>
        <p id="createUserMessage" class="message"></p>
      </form>
    </section>`;
  }

  function renderUserRows(profiles, query = "", status = "all") {
    const term = query.trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
      const matchesTerm = !term || [
        profile.full_name,
        profile.username,
        profile.ign,
        profile.role,
        ...playerRolesFor(profile),
        ...staffRolesFor(profile)
      ].filter(Boolean).join(" ").toLowerCase().includes(term);
      const matchesStatus = status === "all"
        || (status === "approved" && profile.is_player_approved)
        || (status === "pending" && (profile.role === "player" || playerRolesFor(profile).length) && !profile.is_player_approved)
        || (status === "verified" && profile.is_verified)
        || (status === "unverified" && !profile.is_verified);
      return matchesTerm && matchesStatus;
    });
    return filtered.map(renderUserRow).join("") || `<tr><td colspan="6" class="muted">No users match that search.</td></tr>`;
  }

  function renderUserRow(p) {
    return `<tr>
      <td>${U().escapeHtml(p.full_name)}<br><span class="muted">@${U().escapeHtml(p.username || "username")}${p.ign ? ` - ${U().escapeHtml(p.ign)}` : ""}</span></td>
      <td>${U().escapeHtml(p.role)}</td>
      <td>${U().rolePills(playerRolesFor(p)) || '<span class="muted">-</span>'}</td>
      <td>${U().escapeHtml(staffRoleLabel(p))}</td>
      <td>${p.is_verified ? "Yes" : "No"}</td>
      <td><div class="toolbar">${renderUserActions(p)}</div></td>
    </tr>`;
  }

  function renderUserActions(p) {
    const actions = [];
    if (canManageUserVerification(p)) {
      actions.push(`<button class="secondary-button" type="button" data-toggle-verify-user="${p.id}">${p.is_verified ? "Unverify" : "Verify"}</button>`);
    }
    if (canEditBasicUsers()) actions.push(`<button class="secondary-button" type="button" data-edit-user="${p.id}">Edit</button>`);
    if (canResetPassword(p)) actions.push(`<button class="secondary-button" type="button" data-reset-password="${p.id}">Password</button>`);
    if (canDeleteUsers(p)) actions.push(`<button class="secondary-button" type="button" data-delete-user="${p.id}">Delete</button>`);
    if (!actions.length) return '<span class="muted">Read only</span>';
    if (hasStaffRole(p, "superadmin")) return '<span class="pill">Protected</span>';
    return actions.join("");
  }

  function canManageUserVerification(profile) {
    return !hasStaffRole(profile, "superadmin") && hasRole("superadmin", "useradmin");
  }

  function staffRoleChoicesForCurrentUser() {
    if (hasRole("superadmin")) return staffRoles;
    if (hasRole("useradmin")) return ["usermod"];
    if (hasRole("playeradmin")) return ["playermod"];
    if (hasRole("tournamentadmin")) return ["tournamentmod"];
    return [];
  }

  function bindCreateUser() {
    U().qs("#createUserForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const form = U().qs("#createUserForm");
        const staffRolesSelected = checkedValues("newUserStaffRoles", form).filter(canAssignStaffRole);
        if (checkedValues("newUserStaffRoles", form).length !== staffRolesSelected.length) throw new Error("You cannot assign one of those staff roles.");
        const staffRole = staffRolesSelected[0] || null;
        const fullName = U().qs("#newUserName").value.trim();
        const email = U().qs("#newUserEmail").value.trim();
        const role = U().qs("#newUserRole").value;
        const selectedPlayerRoles = checkedValues("newUserPlayerRoles", form);
        if (!confirmCreate(role === "player" ? "player user" : "user", fullName)) return;
        U().setMessage("#createUserMessage", "Creating user...");
        const result = await callAdminUsersFunction("createUser", {
          email,
          password: U().qs("#newUserPassword").value,
          full_name: fullName,
          ign: U().qs("#newUserIgn").value.trim(),
          role,
          staff_role: staffRole,
          staff_roles: staffRolesSelected,
          player_roles: role === "player" ? selectedPlayerRoles : []
        });
        await logAction("create_user", result.user_id, { email, username: result.username, staff_roles: staffRolesSelected });
        U().setMessage("#createUserMessage", `User created. Username: ${result.username}`, "success");
        createdPopup(role === "player" ? "Player user" : "User", fullName, `Username: ${result.username}`);
        U().qs("#createUserForm").reset();
        users();
      } catch (error) {
        U().setMessage("#createUserMessage", error.message, "error");
      }
    });
  }

  function bindUserActions(profiles) {
    U().qsa("[data-edit-user]").forEach((button) => button.addEventListener("click", () => openUserEditor(profiles.find((p) => p.id === button.dataset.editUser))));
    U().qsa("[data-delete-user]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this Auth user and profile?")) return;
      try {
        await callAdminUsersFunction("deleteUser", { user_id: button.dataset.deleteUser });
        await logAction("delete_user", button.dataset.deleteUser, {});
        users();
      } catch (error) {
        alert(error.message);
      }
    }));
    U().qsa("[data-reset-password]").forEach((button) => button.addEventListener("click", () => openPasswordReset(button.dataset.resetPassword)));
    U().qsa("[data-toggle-verify-user]").forEach((button) => button.addEventListener("click", async () => {
      const profile = profiles.find((p) => p.id === button.dataset.toggleVerifyUser);
      if (!profile || !canManageUserVerification(profile)) return;
      const nextValue = !profile.is_verified;
      if (!confirm(`${nextValue ? "Verify" : "Unverify"} ${profile.full_name || profile.username || "this user"}?`)) return;
      const { error } = await db().from("profiles").update({ is_verified: nextValue }).eq("id", profile.id);
      if (error) return alert(error.message);
      await logAction(nextValue ? "verify_user" : "unverify_user", profile.id, { username: profile.username, full_name: profile.full_name });
      users();
    }));
  }

  function openPasswordReset(userId) {
    U().openModal("Reset Password", `
      <form id="resetPasswordForm" class="stack">
        <label class="field"><input id="resetPasswordValue" type="password" minlength="8" required placeholder=" "><span>New password</span></label>
        <button class="primary-button" type="submit">Update password</button>
        <p id="resetPasswordMessage" class="message"></p>
      </form>`);
    U().qs("#resetPasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await callAdminUsersFunction("updatePassword", { user_id: userId, password: U().qs("#resetPasswordValue").value });
        await logAction("reset_user_password", userId, {});
        U().setMessage("#resetPasswordMessage", "Password updated.", "success");
      } catch (error) {
        U().setMessage("#resetPasswordMessage", error.message, "error");
      }
    });
  }

  function openUserEditor(profile) {
    if (!profile) return;
    U().openModal("Edit User", `
      <form id="editUserForm" class="form-grid">
        <label class="field"><input id="editUsername" value="${U().escapeHtml(profile.username || "")}" readonly placeholder=" "><span>Username</span></label>
        <label class="field"><input id="editFullName" value="${U().escapeHtml(profile.full_name || "")}" required placeholder=" "><span>Full name</span></label>
        <label class="field"><input id="editIgn" value="${U().escapeHtml(profile.ign || "")}" placeholder=" "><span>IGN</span></label>
        <label class="field"><input id="editGameId" value="${U().escapeHtml(profile.game_id || "")}" placeholder=" "><span>Game ID</span></label>
        <label class="field"><input id="editServerId" value="${U().escapeHtml(profile.server_id || "")}" placeholder=" "><span>Server ID</span></label>
        <label class="field"><input id="editDob" type="date" value="${U().escapeHtml(profile.date_of_birth || "")}" placeholder=" "><span>Date of birth</span></label>
        <label class="field"><input id="editFavoriteHero" value="${U().escapeHtml(profile.favorite_hero || "")}" placeholder=" "><span>Favorite hero</span></label>
        <label class="field"><input id="editTagline" value="${U().escapeHtml(profile.tagline || "")}" placeholder=" "><span>Tagline</span></label>
        <label class="field"><textarea id="editMotto" rows="3" placeholder=" ">${U().escapeHtml(profile.motto || "")}</textarea><span>Main motto</span></label>
        <label class="field"><textarea id="editFavoriteQuote" rows="3" placeholder=" ">${U().escapeHtml(profile.favorite_quote || "")}</textarea><span>Favorite line or quote</span></label>
        <label class="field"><textarea id="editLikes" rows="3" placeholder=" ">${U().escapeHtml(profile.likes || "")}</textarea><span>Likes</span></label>
        <label class="field"><textarea id="editDislikes" rows="3" placeholder=" ">${U().escapeHtml(profile.dislikes || "")}</textarea><span>Dislikes</span></label>
        <label class="field"><textarea id="editBio" rows="3" placeholder=" ">${U().escapeHtml(profile.bio || "")}</textarea><span>Bio</span></label>
        ${hasRole("superadmin", "useradmin") ? `<label class="field"><select id="editRole">${optionList(userRoles, profile.role)}</select><span>User role</span></label>` : ""}
        ${hasRole("superadmin", "useradmin") ? `<label class="check-row"><input id="editApproved" type="checkbox" ${profile.is_player_approved ? "checked" : ""}> <span>Player approved</span></label>` : ""}
        ${canEditPlayerRoles() ? `<div><span class="muted">Player roles</span>${checkboxGroup("editPlayerRoles", playerRoles, playerRolesFor(profile))}</div>` : ""}
        ${staffRoleChoicesForCurrentUser().length && !hasStaffRole(profile, "superadmin") ? `<div><span class="muted">Staff permissions</span>${checkboxGroup("editStaffRoles", staffRoleChoicesForCurrentUser(), staffRolesFor(profile))}</div>` : ""}
        <button class="primary-button" type="submit">Save user</button>
        <p id="editUserMessage" class="message"></p>
      </form>`);
    U().qs("#editUserForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        full_name: U().qs("#editFullName").value.trim(),
        ign: U().qs("#editIgn").value.trim(),
        game_id: U().qs("#editGameId").value.trim(),
        server_id: U().qs("#editServerId").value.trim(),
        date_of_birth: U().qs("#editDob").value || null,
        bio: U().qs("#editBio").value.trim(),
        favorite_hero: U().qs("#editFavoriteHero").value.trim(),
        favorite_quote: U().qs("#editFavoriteQuote").value.trim(),
        motto: U().qs("#editMotto").value.trim(),
        tagline: U().qs("#editTagline").value.trim(),
        likes: U().qs("#editLikes").value.trim(),
        dislikes: U().qs("#editDislikes").value.trim()
      };
      if (hasRole("superadmin", "useradmin")) {
        payload.role = U().qs("#editRole").value;
        payload.is_player_approved = U().qs("#editApproved").checked;
      }
      if (canEditPlayerRoles()) {
        const roleValue = U().qs("#editRole")?.value || profile.role;
        const approvedValue = U().qs("#editApproved")?.checked ?? profile.is_player_approved;
        payload.player_roles = roleValue === "player" || approvedValue ? checkedValues("editPlayerRoles", U().qs("#editUserForm")) : [];
      }
      if (staffRoleChoicesForCurrentUser().length && !hasStaffRole(profile, "superadmin")) {
        const selectedStaffRoles = checkedValues("editStaffRoles", U().qs("#editUserForm")).filter(canAssignStaffRole);
        if (selectedStaffRoles.length !== checkedValues("editStaffRoles", U().qs("#editUserForm")).length) {
          return U().setMessage("#editUserMessage", "You cannot assign one of those staff roles.", "error");
        }
        payload.staff_roles = selectedStaffRoles;
        payload.staff_role = selectedStaffRoles[0] || null;
      }
      const { error } = await db().from("profiles").update(payload).eq("id", profile.id);
      U().setMessage("#editUserMessage", error ? error.message : "User saved.", error ? "error" : "success");
      if (!error) {
        await logAction("update_user", profile.id, payload);
        users();
      }
    });
  }

  async function loadAppeals() {
    const root = U().qs("#appealsList");
    if (!root) return;
    const { data: appeals, error } = await db().from("player_appeals").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) return root.innerHTML = `<p class="message error">${U().escapeHtml(error.message)}</p>`;
    const applicantIds = uniqueValues((appeals || []).map((appeal) => appeal.user_id));
    const { data: applicants } = applicantIds.length
      ? await db().from("profiles").select("id, full_name, ign, username").in("id", applicantIds)
      : { data: [] };
    const applicantMap = new Map((applicants || []).map((profile) => [profile.id, profile]));
    root.innerHTML = (appeals || []).map((a) => {
      const applicant = applicantMap.get(a.user_id);
      return `
      <div class="item-card">
        <div class="section-heading">
          <div><strong>${U().escapeHtml(applicant?.full_name || a.user_id)}</strong><p class="muted">@${U().escapeHtml(applicant?.username || "username")} - ${U().escapeHtml(a.status)}</p></div>
          ${U().rolePills(a.preferred_roles)}
        </div>
        <p>${U().escapeHtml(a.note || "")}</p>
        ${canManagePlayerAppeals() && a.status === "pending" ? `
          <div class="toolbar">
            <button class="primary-button" type="button" data-approve-appeal="${a.appeal_id}" data-user="${a.user_id}">Approve</button>
            <button class="secondary-button" type="button" data-reject-appeal="${a.appeal_id}">Reject</button>
          </div>` : ""}
      </div>`;
    }).join("") || '<p class="muted">No appeals yet.</p>';
    U().qsa("[data-approve-appeal]").forEach((button) => button.addEventListener("click", async () => {
      const appeal = (appeals || []).find((item) => item.appeal_id === button.dataset.approveAppeal);
      await db().from("profiles").update({ role: "player", is_player_approved: true, player_roles: appeal?.preferred_roles || ["multirole"] }).eq("id", button.dataset.user);
      await db().from("player_appeals").update({ status: "approved", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("appeal_id", button.dataset.approveAppeal);
      await logAction("approve_player_appeal", button.dataset.user, {});
      loadAppeals();
    }));
    U().qsa("[data-reject-appeal]").forEach((button) => button.addEventListener("click", async () => {
      await db().from("player_appeals").update({ status: "rejected", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("appeal_id", button.dataset.rejectAppeal);
      await logAction("reject_player_appeal", button.dataset.rejectAppeal, {});
      loadAppeals();
    }));
  }

  async function players() {
    const [requests, teams, playerProfiles, membershipsResult] = await Promise.all([
      db().from("team_approval_requests").select("*, teams(team_name, team_tag)").order("created_at", { ascending: false }).limit(100),
      db().from("teams").select("*").order("created_at", { ascending: false }).limit(200),
      db().from("profiles").select("id, full_name, ign, role, player_roles").in("role", ["player", "superadmin"]).order("full_name"),
      db().from("team_members").select("team_id, player_id, left_at").is("left_at", null).limit(1000)
    ]);
    const players = playerProfiles.data || [];
    const teamRequests = requests.data || [];
    const pendingRequests = teamRequests.filter((request) => request.status === "pending");
    const approvedRequests = teamRequests.filter((request) => request.status === "approved");
    const rejectedRequests = teamRequests.filter((request) => request.status === "rejected");
    U().qs("#dashContent").innerHTML = `
      <section class="wide-panel">
        <div class="section-heading"><h2>Team Approval Search</h2><span class="pill">${teamRequests.length} requests</span></div>
        <div class="filter-grid dashboard-filter-bar">
          <label class="field"><input id="teamApprovalSearch" type="search" placeholder=" "><span>Search team approvals</span></label>
          <label class="field"><select id="teamApprovalStatusFilter"><option value="all">All statuses</option><option value="pending">Pending only</option><option value="approved">Approved only</option><option value="rejected">Rejected only</option></select><span>Status</span></label>
        </div>
      </section>
      <section class="wide-panel">
        <div class="section-heading"><h2>Pending Team Approvals</h2><span class="pill warn">${pendingRequests.length} waiting</span></div>
        <div id="pendingTeamRequests" class="list-stack">${pendingRequests.map(renderTeamRequest).join("") || '<p class="muted">No pending team approval requests.</p>'}</div>
      </section>
      <section class="wide-panel">
        <div class="section-heading"><h2>Approved Teams</h2><span class="pill good">${approvedRequests.length} approved</span></div>
        <div id="approvedTeamRequests" class="list-stack">
          ${approvedRequests.map(renderTeamRequest).join("") || '<p class="muted">No approved team requests yet.</p>'}
        </div>
        <details class="mini-card" ${rejectedRequests.length ? "" : "open"}><summary>Rejected requests (${rejectedRequests.length})</summary><div id="rejectedTeamRequests" class="list-stack" style="margin-top:12px;">${rejectedRequests.map(renderTeamRequest).join("") || '<p class="muted">No rejected team requests.</p>'}</div></details>
      </section>
      <section class="wide-panel">
        <div class="section-heading"><h2>Teams</h2>${canManageTeams() ? '<button id="createStaffTeam" class="primary-button" type="button">Create team</button>' : ""}</div>
        <div class="filter-grid dashboard-filter-bar">
          <label class="field"><input id="teamSearch" type="search" placeholder=" "><span>Search teams</span></label>
          <label class="field"><select id="teamStatusFilter"><option value="all">All team states</option><option value="recruiting">Recruiting</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="disbanded">Disbanded</option></select><span>Status</span></label>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Team</th><th>Status</th><th>Roster</th><th>Actions</th></tr></thead><tbody id="teamRows">
          ${(teams.data || []).map((team) => renderTeamRow(team)).join("")}
        </tbody></table></div>
      </section>`;
    bindTeamRequests();
    bindTeamActions(teams.data || [], players, membershipsResult.data || []);
    bindTeamApprovalFilters(teamRequests);
    bindTeamTableFilters(teams.data || [], players, membershipsResult.data || []);
  }

  function bindTeamTableFilters(teams, playersList, memberships) {
    const applyFilters = () => {
      const term = (U().qs("#teamSearch")?.value || "").trim().toLowerCase();
      const status = U().qs("#teamStatusFilter")?.value || "all";
      const filtered = teams.filter((team) => {
        const text = `${team.team_name || ""} ${team.team_tag || ""} ${team.status || ""}`.toLowerCase();
        return (!term || text.includes(term)) && (status === "all" || team.status === status);
      });
      U().qs("#teamRows").innerHTML = filtered.map(renderTeamRow).join("") || '<tr><td colspan="4" class="muted">No teams match that search.</td></tr>';
      bindTeamActions(teams, playersList, memberships);
    };
    U().qs("#teamSearch")?.addEventListener("input", applyFilters);
    U().qs("#teamStatusFilter")?.addEventListener("change", applyFilters);
  }

  function bindTeamApprovalFilters(requests) {
    const applyFilters = () => {
      const term = (U().qs("#teamApprovalSearch")?.value || "").trim().toLowerCase();
      const status = U().qs("#teamApprovalStatusFilter")?.value || "all";
      const matches = (request) => {
        const text = `${request.teams?.team_name || ""} ${request.teams?.team_tag || ""} ${request.team_id || ""} ${request.status || ""}`.toLowerCase();
        return (!term || text.includes(term)) && (status === "all" || request.status === status);
      };
      const filtered = requests.filter(matches);
      const byStatus = (value) => filtered.filter((request) => request.status === value);
      U().qs("#pendingTeamRequests").innerHTML = byStatus("pending").map(renderTeamRequest).join("") || '<p class="muted">No pending team approval requests match.</p>';
      U().qs("#approvedTeamRequests").innerHTML = byStatus("approved").map(renderTeamRequest).join("") || '<p class="muted">No approved team requests match.</p>';
      U().qs("#rejectedTeamRequests").innerHTML = byStatus("rejected").map(renderTeamRequest).join("") || '<p class="muted">No rejected team requests match.</p>';
      bindTeamRequests();
    };
    U().qs("#teamApprovalSearch")?.addEventListener("input", applyFilters);
    U().qs("#teamApprovalStatusFilter")?.addEventListener("change", applyFilters);
  }

  function renderTeamRequest(request) {
    return `<div class="item-card">
      <strong>${U().escapeHtml(request.teams?.team_name || request.team_id)}</strong>
      <p class="muted">${U().escapeHtml(request.status)} - ${U().formatDate(request.created_at)}</p>
      ${canManageTeams() && request.status === "pending" ? `
        <div class="toolbar">
          <button class="primary-button" type="button" data-approve-team="${request.request_id}" data-team="${request.team_id}">Approve</button>
          <button class="secondary-button" type="button" data-reject-team="${request.request_id}">Reject</button>
        </div>` : ""}
    </div>`;
  }

  function renderTeamRow(team) {
    return `<tr>
      <td>${U().escapeHtml(team.team_name)}<br><span class="muted">[${U().escapeHtml(team.team_tag)}]</span></td>
      <td>${U().escapeHtml(team.status)}</td>
      <td>${(team.roster || []).length} / 8</td>
      <td><div class="toolbar">
        ${canManageTeams() ? `<button class="secondary-button" type="button" data-edit-team="${team.team_id}">Edit</button>` : ""}
        ${canDeleteTeams() ? `<button class="secondary-button" type="button" data-delete-team="${team.team_id}">Delete</button>` : ""}
      </div></td>
    </tr>`;
  }

  function bindTeamRequests() {
    U().qsa("[data-approve-team]").forEach((button) => button.addEventListener("click", async () => {
      await db().from("teams").update({ status: "approved", approved_by: me().id }).eq("team_id", button.dataset.team);
      await db().from("team_approval_requests").update({ status: "approved", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("request_id", button.dataset.approveTeam);
      await logAction("approve_team", button.dataset.team, {});
      players();
    }));
    U().qsa("[data-reject-team]").forEach((button) => button.addEventListener("click", async () => {
      await db().from("team_approval_requests").update({ status: "rejected", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("request_id", button.dataset.rejectTeam);
      await logAction("reject_team", button.dataset.rejectTeam, {});
      players();
    }));
  }

  function bindTeamActions(teams, playersList, memberships) {
    U().qs("#createStaffTeam")?.addEventListener("click", () => openTeamEditor(null, playersList, memberships, teams));
    U().qsa("[data-edit-team]").forEach((button) => button.addEventListener("click", () => openTeamEditor(teams.find((t) => t.team_id === button.dataset.editTeam), playersList, memberships, teams)));
    U().qsa("[data-delete-team]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this team?")) return;
      const { error } = await db().rpc("admin_delete_team", { target_team_id: button.dataset.deleteTeam });
      if (error) alert(`${error.message}. Run supabase/dashboard-crud-policies.sql in Supabase SQL Editor if this keeps happening.`);
      else {
        await logAction("delete_team", button.dataset.deleteTeam, {});
        players();
      }
    }));
  }

  function openTeamEditor(team, playersList, memberships = [], teams = []) {
    const isNew = !team;
    const roster = team?.roster || [];
    const occupiedPlayerIds = new Set((memberships || [])
      .filter((member) => member.team_id !== team?.team_id)
      .map((member) => member.player_id));
    (teams || []).filter((item) => item.team_id !== team?.team_id).forEach((item) => {
      (item.roster || []).forEach((member) => occupiedPlayerIds.add(member.player_id));
    });
    U().openModal(isNew ? "Create Team" : "Edit Team", `
      <form id="teamEditorForm" class="stack">
        <div class="form-grid">
          <label class="field"><input id="editTeamName" value="${U().escapeHtml(team?.team_name || "")}" required placeholder=" "><span>Team name</span></label>
          <label class="field"><input id="editTeamTag" value="${U().escapeHtml(team?.team_tag || "")}" maxlength="8" required placeholder=" "><span>Tag</span></label>
          <label class="field"><select id="editTeamStatus">${optionList(["recruiting", "pending", "approved", "disbanded"], team?.status || "recruiting")}</select><span>Status</span></label>
          <label class="field"><select id="editTeamFounder"></select><span>Founder</span></label>
          <label class="field"><select id="editTeamLeader"></select><span>Team leader</span></label>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Player</th><th>Role</th><th></th></tr></thead><tbody id="rosterEditorRows"></tbody></table>
        </div>
        <div class="two-grid">
          <label class="field"><select id="addRosterPlayer">${optionList(playersList.map((p) => p.id), "", "Select player")}</select><span>Add player</span></label>
          <label class="field"><select id="addRosterRole">${optionList(teamRoles, "exp")}</select><span>Role</span></label>
        </div>
        <button id="addRosterMember" class="secondary-button" type="button">Add member</button>
        <button class="primary-button" type="submit">Save team</button>
        <p id="teamEditorMessage" class="message"></p>
      </form>`);
    let workingRoster = roster.map((member) => ({ ...member }));
    const playerName = (id) => {
      const p = playersList.find((player) => player.id === id);
      return p ? `${p.full_name} (${p.ign || "no IGN"})` : id;
    };
    const roleCounts = () => workingRoster.reduce((counts, member) => {
      counts[member.role] = (counts[member.role] || 0) + 1;
      return counts;
    }, {});
    const missingRoles = () => {
      const counts = roleCounts();
      return teamRoles.filter((role) => !counts[role]);
    };
    const eligiblePlayers = () => playersList.filter((player) => !occupiedPlayerIds.has(player.id) && !workingRoster.some((member) => member.player_id === player.id));
    const refreshAddControls = () => {
      const playerSelect = U().qs("#addRosterPlayer");
      const roleSelect = U().qs("#addRosterRole");
      const founderSelect = U().qs("#editTeamFounder");
      const leaderSelect = U().qs("#editTeamLeader");
      if (playerSelect) {
        playerSelect.innerHTML = optionList(eligiblePlayers().map((p) => p.id), "", "Select player");
        Array.from(playerSelect.options).forEach((option) => {
          if (option.value) option.textContent = playerName(option.value);
        });
      }
      if (roleSelect) roleSelect.innerHTML = optionList(missingRoles(), missingRoles()[0] || "", missingRoles().length ? undefined : "Roster roles filled");
      const rosterPlayerIds = workingRoster.map((member) => member.player_id);
      const fallback = rosterPlayerIds[0] || "";
      const founderValue = rosterPlayerIds.includes(founderSelect?.value) ? founderSelect.value : team?.founder_id || fallback;
      const leaderValue = rosterPlayerIds.includes(leaderSelect?.value) ? leaderSelect.value : team?.team_leader_id || fallback;
      if (founderSelect) {
        founderSelect.innerHTML = optionList(rosterPlayerIds, founderValue, rosterPlayerIds.length ? undefined : "Add roster first");
        Array.from(founderSelect.options).forEach((option) => {
          if (option.value) option.textContent = playerName(option.value);
        });
      }
      if (leaderSelect) {
        leaderSelect.innerHTML = optionList(rosterPlayerIds, leaderValue, rosterPlayerIds.length ? undefined : "Add roster first");
        Array.from(leaderSelect.options).forEach((option) => {
          if (option.value) option.textContent = playerName(option.value);
        });
      }
    };
    const renderRows = () => {
      U().qs("#rosterEditorRows").innerHTML = workingRoster.map((member, index) => `
        <tr>
          <td>${U().escapeHtml(playerName(member.player_id))}</td>
          <td><select data-roster-role="${index}">${optionList(uniqueValues([member.role, ...missingRoles()]), member.role)}</select></td>
          <td><button class="secondary-button" type="button" data-remove-roster="${index}">Remove</button></td>
        </tr>`).join("") || '<tr><td colspan="3" class="muted">No roster members yet.</td></tr>';
      U().qsa("[data-roster-role]").forEach((select) => select.addEventListener("change", () => {
        workingRoster[Number(select.dataset.rosterRole)].role = select.value;
        renderRows();
      }));
      U().qsa("[data-remove-roster]").forEach((button) => button.addEventListener("click", () => {
        workingRoster.splice(Number(button.dataset.removeRoster), 1);
        renderRows();
      }));
      refreshAddControls();
    };
    U().qs("#addRosterMember").addEventListener("click", () => {
      const playerId = U().qs("#addRosterPlayer").value;
      const role = U().qs("#addRosterRole").value;
      if (!playerId) return;
      if (!role) return alert("This team already has every required role.");
      if (occupiedPlayerIds.has(playerId)) return alert("Player is already active in another team.");
      if (workingRoster.some((member) => member.player_id === playerId)) return alert("Player already on roster.");
      if (workingRoster.length >= 8) return alert("Roster is already full.");
      if (!missingRoles().includes(role)) return alert("Only missing team roles can be added.");
      workingRoster.push({ player_id: playerId, role, joined_at: new Date().toISOString() });
      renderRows();
    });
    U().qs("#teamEditorForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!workingRoster.length) return U().setMessage("#teamEditorMessage", "Add at least one roster member.", "error");
      const rosterIds = workingRoster.map((member) => member.player_id);
      const founder = U().qs("#editTeamFounder").value || rosterIds[0];
      const leader = U().qs("#editTeamLeader").value || founder;
      if (!rosterIds.includes(founder) || !rosterIds.includes(leader)) return U().setMessage("#teamEditorMessage", "Founder and leader must be roster members.", "error");
      const duplicateRole = teamRoles.find((role) => workingRoster.filter((member) => member.role === role).length > 1);
      if (duplicateRole) return U().setMessage("#teamEditorMessage", `${duplicateRole.toUpperCase()} is already assigned. Use each team role once.`, "error");
      const coach = workingRoster.find((member) => member.role === "coach")?.player_id || null;
      const payload = {
        team_name: U().qs("#editTeamName").value.trim(),
        team_tag: U().qs("#editTeamTag").value.trim().toUpperCase(),
        status: U().qs("#editTeamStatus").value,
        roster: workingRoster,
        founder_id: founder,
        team_leader_id: leader,
        coach_id: coach
      };
      if (isNew && !confirmCreate("team", payload.team_name)) return;
      const result = isNew
        ? await db().from("teams").insert(payload).select("team_id").single()
        : await db().from("teams").update(payload).eq("team_id", team.team_id).select("team_id").single();
      if (result.error) return U().setMessage("#teamEditorMessage", result.error.message, "error");
      await db().from("team_members").delete().eq("team_id", result.data.team_id);
      await db().from("team_members").insert(workingRoster.map((member) => ({ team_id: result.data.team_id, player_id: member.player_id, role: member.role })));
      const metaRolesByPlayer = { [founder]: ["founder"], [leader]: founder === leader ? ["founder", "leader"] : ["leader"] };
      await Promise.all(Object.entries(metaRolesByPlayer).filter(([playerId]) => Boolean(playerId)).map(async ([playerId, metaRoles]) => {
        const profile = playersList.find((player) => player.id === playerId);
        if (!profile) return;
        const nextRoles = uniqueValues([...playerRolesFor(profile), ...metaRoles]);
        await db().from("profiles").update({ player_roles: nextRoles }).eq("id", playerId);
      }));
      await logAction(isNew ? "create_team" : "update_team", result.data.team_id, { team_name: payload.team_name, founder_id: founder, team_leader_id: leader, roster: workingRoster });
      U().setMessage("#teamEditorMessage", isNew ? "Team created." : "Team saved.", "success");
      if (isNew) createdPopup("Team", payload.team_name);
      players();
    });
    renderRows();
  }

  async function broadcasts() {
    const [postResult, profileResult, tournamentResult, teamResult] = await Promise.all([
      db().from("feed_posts").select("*").order("is_pinned", { ascending: false }).order("pin_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(150),
      db().from("profiles").select("id, full_name, username, ign, role, staff_role, staff_roles, player_roles").order("full_name").limit(500),
      db().from("tournaments").select("tournament_id, name").order("created_at", { ascending: false }).limit(200),
      db().from("teams").select("team_id, team_name, team_tag").eq("status", "approved").order("team_name").limit(300)
    ]);
    if (postResult.error) return U().qs("#dashContent").innerHTML = `<p class="message error">${U().escapeHtml(postResult.error.message)}</p>`;
    const profiles = profileResult.data || [];
    const tournamentsList = tournamentResult.data || [];
    const teamsList = teamResult.data || [];
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const tournamentMap = new Map(tournamentsList.map((tournament) => [tournament.tournament_id, tournament]));
    const posts = postResult.data || [];
    const pinnedCount = posts.filter((post) => post.is_pinned).length;
    U().qs("#dashContent").innerHTML = `
      ${canBroadcast() ? renderBroadcastComposer(tournamentsList, profiles, teamsList, pinnedCount) : ""}
      <section class="wide-panel">
        <div class="section-heading"><h2>Broadcast History</h2><span class="pill">${pinnedCount} / 5 pinned</span></div>
        <div class="table-wrap">${renderBroadcastTable(posts, profileMap, tournamentMap, teamsList)}</div>
      </section>`;
    bindBroadcastComposer(tournamentsList, profiles, teamsList);
    bindBroadcastActions(posts, tournamentsList, profiles, teamsList);
    bindBroadcastHistoryFilters(posts, profileMap, tournamentMap, teamsList, tournamentsList, profiles);
  }

  function renderBroadcastComposer(tournamentsList, profiles, teamsList, pinnedCount) {
    return `<section class="wide-panel">
      <div class="section-heading"><h2>Create Broadcast</h2><span class="pill good">${U().escapeHtml(staffRoleLabel())}</span></div>
      <form id="broadcastForm" class="form-grid">
        <label class="field"><input id="broadcastTitle" required placeholder=" "><span>Title</span></label>
        <label class="field"><select id="broadcastAudience">${optionList(audienceTypes, "all")}</select><span>Audience</span></label>
        <label class="field"><select id="broadcastTargetRole">${optionList([...userRoles, ...protectedStaffRoles, ...playerRoles], "", "Only for role audience")}</select><span>Target role</span></label>
        <label class="field"><select id="broadcastTargetUser">${optionList(profiles.map((profile) => profile.id), "", "Only for individual audience")}</select><span>Target user</span></label>
        <label class="field"><select id="broadcastTargetTeam">${optionList(teamsList.map((team) => team.team_id), "", "Only for team audience")}</select><span>Target team</span></label>
        <label class="field"><select id="broadcastTournament">${optionList(tournamentsList.map((t) => t.tournament_id), "", "No tournament link")}</select><span>Tournament link</span></label>
        <label class="field"><select id="broadcastPinOrder">${optionList([1, 2, 3, 4, 5], 1)}</select><span>Pin order</span></label>
        <label class="field"><textarea id="broadcastContent" required placeholder=" "></textarea><span>Content</span></label>
        <label class="check-row"><input id="broadcastPinned" type="checkbox" ${pinnedCount >= 5 ? "" : ""}> <span>Pin broadcast</span></label>
        <button class="primary-button" type="submit">Post broadcast</button>
        <p id="broadcastMessage" class="message"></p>
      </form>
    </section>`;
  }

  function renderBroadcastTable(posts, profileMap, tournamentMap, teamsList = []) {
    const teamMap = new Map(teamsList.map((team) => [team.team_id, team]));
    const rows = (items) => items.map((post) => {
      const author = profileMap.get(post.author_id);
      const target = profileMap.get(post.target_user_id);
      const tournament = tournamentMap.get(post.tournament_id);
      const targetTeam = teamMap.get(post.target_team_id);
      const audience = post.audience_type === "individual"
        ? `individual: ${target?.full_name || post.target_user_id || "unknown"}`
        : post.audience_type === "role"
          ? `role: ${post.target_role || "unknown"}`
          : post.audience_type === "team"
            ? `team: ${targetTeam ? `${targetTeam.team_name} [${targetTeam.team_tag}]` : post.target_team_id || "unknown"}`
          : post.audience_type;
      return `<tr>
        <td><strong>${U().escapeHtml(post.title)}</strong><br><span class="muted">${U().escapeHtml(author?.full_name || "Unknown")} - ${U().escapeHtml(post.author_role || "")}${tournament ? ` - ${U().escapeHtml(tournament.name)}` : ""}</span></td>
        <td>${U().escapeHtml(audience)}</td>
        <td>${post.is_pinned ? `<span class="pill warn">#${post.pin_order || "-"}</span>` : '<span class="muted">No</span>'}</td>
        <td>${U().escapeHtml(relativeTime(post.created_at))}<br><span class="muted">${new Date(post.created_at).toLocaleString()}</span></td>
        <td>${post.updated_at ? `${U().escapeHtml(relativeTime(post.updated_at))}<br><span class="muted">${new Date(post.updated_at).toLocaleString()}</span>` : '<span class="muted">Never</span>'}</td>
        <td><div class="toolbar">
          ${canEditBroadcast(post) ? `<button class="secondary-button" type="button" data-edit-broadcast="${post.post_id}">Edit</button>` : ""}
          ${canDeleteBroadcast(post) ? `<button class="secondary-button" type="button" data-delete-broadcast="${post.post_id}">Delete</button>` : ""}
        </div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="6" class="muted">No broadcasts match that search.</td></tr>';
    return `<table>
      <caption class="table-caption">
        <div class="filter-grid dashboard-filter-bar">
          <label class="field"><input id="broadcastHistorySearch" type="search" placeholder=" "><span>Search broadcasts</span></label>
          <label class="field"><select id="broadcastHistoryAudience"><option value="all">All audiences</option>${audienceTypes.map((type) => `<option value="${type}">${type}</option>`).join("")}</select><span>Audience</span></label>
          <label class="field"><select id="broadcastHistoryPin"><option value="all">Pinned and unpinned</option><option value="pinned">Pinned only</option><option value="unpinned">Unpinned only</option></select><span>Pin state</span></label>
        </div>
      </caption>
      <thead><tr><th>Broadcast</th><th>Audience</th><th>Pin</th><th>Posted</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody id="broadcastHistoryRows">${rows(posts)}</tbody>
    </table>`;
  }

  function renderBroadcastHistoryRows(posts, profileMap, tournamentMap, teamsList) {
    const tempTable = document.createElement("div");
    tempTable.innerHTML = renderBroadcastTable(posts, profileMap, tournamentMap, teamsList);
    return tempTable.querySelector("tbody")?.innerHTML || "";
  }

  function bindBroadcastHistoryFilters(posts, profileMap, tournamentMap, teamsList, tournamentsList, profiles) {
    const teamMap = new Map(teamsList.map((team) => [team.team_id, team]));
    const textFor = (post) => {
      const author = profileMap.get(post.author_id);
      const target = profileMap.get(post.target_user_id);
      const tournament = tournamentMap.get(post.tournament_id);
      const team = teamMap.get(post.target_team_id);
      return [post.title, post.content, post.author_role, post.audience_type, post.target_role, author?.full_name, author?.username, target?.full_name, tournament?.name, team?.team_name, team?.team_tag].filter(Boolean).join(" ").toLowerCase();
    };
    const applyFilters = () => {
      const term = (U().qs("#broadcastHistorySearch")?.value || "").trim().toLowerCase();
      const audience = U().qs("#broadcastHistoryAudience")?.value || "all";
      const pin = U().qs("#broadcastHistoryPin")?.value || "all";
      const filtered = posts.filter((post) => {
        const matchesTerm = !term || textFor(post).includes(term);
        const matchesAudience = audience === "all" || post.audience_type === audience;
        const matchesPin = pin === "all" || (pin === "pinned" ? post.is_pinned : !post.is_pinned);
        return matchesTerm && matchesAudience && matchesPin;
      });
      U().qs("#broadcastHistoryRows").innerHTML = renderBroadcastHistoryRows(filtered, profileMap, tournamentMap, teamsList);
      bindBroadcastActions(posts, tournamentsList, profiles, teamsList);
    };
    U().qs("#broadcastHistorySearch")?.addEventListener("input", applyFilters);
    U().qs("#broadcastHistoryAudience")?.addEventListener("change", applyFilters);
    U().qs("#broadcastHistoryPin")?.addEventListener("change", applyFilters);
  }

  function labelBroadcastSelects(tournamentsList, profiles, teamsList = []) {
    const labelOptions = (selector, items, idKey, labeler) => {
      const select = U().qs(selector);
      if (!select) return;
      Array.from(select.options).forEach((option) => {
        const item = items.find((entry) => entry[idKey] === option.value);
        if (item) option.textContent = labeler(item);
      });
    };
    labelOptions("#broadcastTournament", tournamentsList, "tournament_id", (item) => item.name);
    labelOptions("#broadcastTargetUser", profiles, "id", (item) => `${item.full_name} (@${item.username || "username"})`);
    labelOptions("#broadcastTargetTeam", teamsList, "team_id", (item) => `${item.team_name} [${item.team_tag}]`);
    labelOptions("#editBroadcastTournament", tournamentsList, "tournament_id", (item) => item.name);
    labelOptions("#editBroadcastTargetUser", profiles, "id", (item) => `${item.full_name} (@${item.username || "username"})`);
    labelOptions("#editBroadcastTargetTeam", teamsList, "team_id", (item) => `${item.team_name} [${item.team_tag}]`);
  }

  async function freePinSlot(pinOrder, postId) {
    const { data: occupied, error: lookupError } = await db().from("feed_posts").select("*").eq("is_pinned", true).eq("pin_order", pinOrder);
    if (lookupError) throw lookupError;
    const blockers = (occupied || []).filter((post) => post.post_id !== postId);
    if (!blockers.length) return;
    if (blockers.some((post) => !canEditBroadcast(post))) {
      throw new Error(`Pin slot ${pinOrder} is occupied by a broadcast you cannot replace.`);
    }
    let query = db().from("feed_posts").update({ is_pinned: false, pin_order: null }).eq("is_pinned", true).eq("pin_order", pinOrder);
    if (postId) query = query.neq("post_id", postId);
    const { error } = await query;
    if (error) throw new Error(`Pin slot ${pinOrder} is occupied by a broadcast you cannot replace.`);
  }

  function readBroadcastForm(prefix) {
    const audience = U().qs(`#${prefix}Audience`).value;
    const isPinned = U().qs(`#${prefix}Pinned`).checked;
    return {
      title: U().qs(`#${prefix}Title`).value.trim(),
      content: U().qs(`#${prefix}Content`).value.trim(),
      tournament_id: U().qs(`#${prefix}Tournament`).value || null,
      audience_type: audience,
      target_role: audience === "role" ? U().qs(`#${prefix}TargetRole`).value || null : null,
      target_user_id: audience === "individual" ? U().qs(`#${prefix}TargetUser`).value || null : null,
      target_team_id: audience === "team" ? U().qs(`#${prefix}TargetTeam`).value || null : null,
      is_pinned: isPinned,
      pin_order: isPinned ? Number(U().qs(`#${prefix}PinOrder`).value) : null
    };
  }

  function validateBroadcastPayload(payload) {
    if (payload.audience_type === "role" && !payload.target_role) throw new Error("Choose a target role.");
    if (payload.audience_type === "individual" && !payload.target_user_id) throw new Error("Choose a target user.");
    if (payload.audience_type === "team" && !payload.target_team_id) throw new Error("Choose an approved team.");
    if (payload.is_pinned && (!payload.pin_order || payload.pin_order < 1 || payload.pin_order > 5)) throw new Error("Pinned broadcasts must use pin order 1 to 5.");
  }

  function bindBroadcastComposer(tournamentsList, profiles, teamsList) {
    labelBroadcastSelects(tournamentsList, profiles, teamsList);
    U().qs("#broadcastForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = {
          ...readBroadcastForm("broadcast"),
          author_id: me().id,
          author_role: primaryStaffRole()
        };
        validateBroadcastPayload(payload);
        if (!confirmCreate("broadcast", payload.title)) return;
        U().setMessage("#broadcastMessage", "Posting broadcast...");
        if (payload.is_pinned) await freePinSlot(payload.pin_order);
        const { data, error } = await db().from("feed_posts").insert(payload).select("post_id").single();
        if (error) throw error;
        await logAction("create_broadcast", data.post_id, payload);
        U().setMessage("#broadcastMessage", "Broadcast posted.", "success");
        createdPopup("Broadcast", payload.title);
        U().qs("#broadcastForm").reset();
        broadcasts();
      } catch (error) {
        U().setMessage("#broadcastMessage", error.message, "error");
      }
    });
  }

  function bindBroadcastActions(posts, tournamentsList, profiles, teamsList) {
    U().qsa("[data-edit-broadcast]").forEach((button) => button.addEventListener("click", () => openBroadcastEditor(posts.find((post) => post.post_id === button.dataset.editBroadcast), tournamentsList, profiles, teamsList)));
    U().qsa("[data-delete-broadcast]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this broadcast?")) return;
      const { error } = await db().from("feed_posts").delete().eq("post_id", button.dataset.deleteBroadcast);
      if (error) alert(error.message);
      else {
        await logAction("delete_broadcast", button.dataset.deleteBroadcast, {});
        broadcasts();
      }
    }));
  }

  function openBroadcastEditor(post, tournamentsList, profiles, teamsList = []) {
    if (!post) return;
    U().openModal("Edit Broadcast", `
      <form id="editBroadcastForm" class="form-grid">
        <label class="field"><input id="editBroadcastTitle" value="${U().escapeHtml(post.title)}" required placeholder=" "><span>Title</span></label>
        <label class="field"><select id="editBroadcastAudience">${optionList(audienceTypes, post.audience_type || "all")}</select><span>Audience</span></label>
        <label class="field"><select id="editBroadcastTargetRole">${optionList([...userRoles, ...protectedStaffRoles, ...playerRoles], post.target_role || "", "Only for role audience")}</select><span>Target role</span></label>
        <label class="field"><select id="editBroadcastTargetUser">${optionList(profiles.map((profile) => profile.id), post.target_user_id || "", "Only for individual audience")}</select><span>Target user</span></label>
        <label class="field"><select id="editBroadcastTargetTeam">${optionList(teamsList.map((team) => team.team_id), post.target_team_id || "", "Only for team audience")}</select><span>Target team</span></label>
        <label class="field"><select id="editBroadcastTournament">${optionList(tournamentsList.map((t) => t.tournament_id), post.tournament_id || "", "No tournament link")}</select><span>Tournament link</span></label>
        <label class="field"><select id="editBroadcastPinOrder">${optionList([1, 2, 3, 4, 5], post.pin_order || 1)}</select><span>Pin order</span></label>
        <label class="field"><textarea id="editBroadcastContent" required placeholder=" ">${U().escapeHtml(post.content)}</textarea><span>Content</span></label>
        <label class="check-row"><input id="editBroadcastPinned" type="checkbox" ${post.is_pinned ? "checked" : ""}> <span>Pin broadcast</span></label>
        <button class="primary-button" type="submit">Save broadcast</button>
        <p id="editBroadcastMessage" class="message"></p>
      </form>`);
    labelBroadcastSelects(tournamentsList, profiles, teamsList);
    const userSelect = U().qs("#editBroadcastTargetUser");
    if (userSelect) {
      Array.from(userSelect.options).forEach((option) => {
        const profile = profiles.find((entry) => entry.id === option.value);
        if (profile) option.textContent = `${profile.full_name} (@${profile.username || "username"})`;
      });
    }
    const tournamentSelect = U().qs("#editBroadcastTournament");
    if (tournamentSelect) {
      Array.from(tournamentSelect.options).forEach((option) => {
        const tournament = tournamentsList.find((entry) => entry.tournament_id === option.value);
        if (tournament) option.textContent = tournament.name;
      });
    }
    U().qs("#editBroadcastForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        U().setMessage("#editBroadcastMessage", "Saving broadcast...");
        const payload = readBroadcastForm("editBroadcast");
        validateBroadcastPayload(payload);
        if (payload.is_pinned) await freePinSlot(payload.pin_order, post.post_id);
        const { error } = await db().from("feed_posts").update(payload).eq("post_id", post.post_id);
        if (error) throw error;
        await logAction("update_broadcast", post.post_id, payload);
        U().setMessage("#editBroadcastMessage", "Broadcast saved.", "success");
        broadcasts();
      } catch (error) {
        U().setMessage("#editBroadcastMessage", error.message, "error");
      }
    });
  }

  async function tournaments() {
    const [tournamentResult, teamResult, registrationResult, matchResult] = await Promise.all([
      db().from("tournaments").select("*").order("created_at", { ascending: false }),
      db().from("teams").select("team_id, team_name, team_tag").eq("status", "approved").order("team_name"),
      db().from("tournament_registrations").select("*, tournaments(name), teams(team_name, team_tag)").order("created_at", { ascending: false }).limit(1000),
      db().from("matches").select("*, tournaments(name), team_a:teams!matches_team_a_id_fkey(team_name), team_b:teams!matches_team_b_id_fkey(team_name)").order("scheduled_start_utc", { ascending: false }).limit(120)
    ]);
    const tournamentList = tournamentResult.data || [];
    const teamsList = teamResult.data || [];
    const registrationStats = summarizeRegistrationStats(registrationResult.data || []);
    U().qs("#dashContent").innerHTML = `
      ${canCreateTournaments() ? renderCreateTournamentPanel() : ""}
      <section class="wide-panel"><h2>Tournaments</h2><div class="table-wrap">${renderTournamentTable(tournamentList, registrationStats)}</div></section>
      <section class="wide-panel">
        <div class="section-heading"><h2>Registrations</h2><span class="pill">${(registrationResult.data || []).length} tickets</span></div>
        <div class="filter-grid dashboard-filter-bar">
          <label class="field"><input id="registrationSearch" type="search" placeholder=" "><span>Search teams or tournaments</span></label>
          <label class="field"><select id="registrationStatusFilter"><option value="all">All registrations</option><option value="pending">Pending only</option><option value="approved">Approved only</option><option value="rejected">Rejected only</option></select><span>Status</span></label>
        </div>
        <div id="registrationList" class="list-stack">${renderRegistrationList(registrationResult.data || [])}</div>
      </section>
      <section class="wide-panel"><h2>Tie Sheet</h2><div class="table-wrap">${renderMatchTable(matchResult.data || [])}</div></section>`;
    bindTournamentForms();
    bindTournamentActions(tournamentList);
    bindRegistrationActions();
    bindRegistrationFilters(registrationResult.data || []);
    bindMatchActions(matchResult.data || [], tournamentList, teamsList);
  }

  function summarizeRegistrationStats(registrations) {
    return registrations.reduce((stats, registration) => {
      const entry = stats[registration.tournament_id] || { total: 0, pending: 0, approved: 0, rejected: 0 };
      entry.total += 1;
      entry[registration.status] = (entry[registration.status] || 0) + 1;
      stats[registration.tournament_id] = entry;
      return stats;
    }, {});
  }

  function renderCreateTournamentPanel() {
    return `<section class="wide-panel"><h2>Create Tournament</h2><form id="createTournamentForm" class="form-grid">
      <label class="field"><input id="tourName" required placeholder=" "><span>Name</span></label>
      <label class="field"><input id="tourGame" required placeholder=" "><span>Game</span></label>
      <label class="field"><select id="tourCapacity">${optionList([4, 8, 16, 32, 64, 128], 16)}</select><span>Capacity</span></label>
      <label class="field"><input id="tourStart" type="date" required placeholder=" "><span>Start date</span></label>
      <label class="field"><input id="tourDeadline" type="date" required placeholder=" "><span>Registration deadline</span></label>
      <label class="field"><select id="tourStatus">${optionList(tournamentStatuses, "registration")}</select><span>Status</span></label>
      <label class="field"><textarea id="tourDescription" placeholder=" "></textarea><span>Description</span></label>
      <button class="primary-button" type="submit">Create</button>
    </form></section>`;
  }

  function renderTournamentTable(tournamentList, registrationStats = {}) {
    return `<table><thead><tr><th>Name</th><th>Status</th><th>Capacity</th><th>Tickets</th><th>Start</th><th>Actions</th></tr></thead><tbody>
      ${tournamentList.map((t) => {
        const stats = registrationStats[t.tournament_id] || { total: 0, pending: 0, approved: 0, rejected: 0 };
        return `<tr>
        <td><a href="tournament.html?id=${t.tournament_id}">${U().escapeHtml(t.name)}</a><br><span class="muted">${U().escapeHtml(t.game || "")}</span></td>
        <td>${U().escapeHtml(t.status)}</td>
        <td>${t.team_capacity}</td>
        <td><span class="pill">${stats.total} tried</span> <span class="pill good">${stats.approved} approved</span> <span class="pill warn">${stats.pending} pending</span> <span class="pill bad">${stats.rejected} rejected</span></td>
        <td>${U().formatDate(t.start_date)}</td>
        <td><div class="toolbar">
          ${canEditTournaments() ? `<button class="secondary-button" type="button" data-edit-tournament="${t.tournament_id}">Edit</button>` : ""}
          ${canManageMatches() ? `<button class="secondary-button" type="button" data-build-bracket="${t.tournament_id}">Tie sheet</button>` : ""}
          ${canDeleteTournaments() ? `<button class="secondary-button" type="button" data-delete-tournament="${t.tournament_id}">Delete</button>` : ""}
        </div></td>
      </tr>`;
      }).join("")}
    </tbody></table>`;
  }

  function renderRegistration(registration) {
    return `<div class="item-card">
      <strong>${U().escapeHtml(registration.teams?.team_name || registration.team_id)}</strong>
      <p class="muted">${U().escapeHtml(registration.tournaments?.name || registration.tournament_id)} - ${U().escapeHtml(registration.status)}</p>
      ${canManageMatches() && registration.status === "pending" ? `
        <div class="toolbar">
          <button class="primary-button" type="button" data-approve-registration="${registration.registration_id}" data-tournament="${registration.tournament_id}">Approve</button>
          <button class="secondary-button" type="button" data-reject-registration="${registration.registration_id}">Reject</button>
        </div>` : ""}
    </div>`;
  }

  function renderRegistrationList(registrations) {
    const pending = registrations.filter((registration) => registration.status === "pending");
    const approved = registrations.filter((registration) => registration.status === "approved");
    const rejected = registrations.filter((registration) => registration.status === "rejected");
    return `
      <div class="status-lane-grid">
        <section class="status-lane"><div class="section-heading"><strong>Pending</strong><span class="pill warn">${pending.length}</span></div>${pending.map(renderRegistration).join("") || '<p class="muted">No pending registrations.</p>'}</section>
        <section class="status-lane"><div class="section-heading"><strong>Approved</strong><span class="pill good">${approved.length}</span></div>${approved.map(renderRegistration).join("") || '<p class="muted">No approved registrations.</p>'}</section>
        <section class="status-lane"><div class="section-heading"><strong>Rejected</strong><span class="pill bad">${rejected.length}</span></div>${rejected.map(renderRegistration).join("") || '<p class="muted">No rejected registrations.</p>'}</section>
      </div>`;
  }

  function bindRegistrationFilters(registrations) {
    const applyFilters = () => {
      const term = (U().qs("#registrationSearch")?.value || "").trim().toLowerCase();
      const status = U().qs("#registrationStatusFilter")?.value || "all";
      const filtered = registrations.filter((registration) => {
        const text = `${registration.teams?.team_name || ""} ${registration.teams?.team_tag || ""} ${registration.tournaments?.name || ""} ${registration.status || ""}`.toLowerCase();
        return (!term || text.includes(term)) && (status === "all" || registration.status === status);
      });
      U().qs("#registrationList").innerHTML = renderRegistrationList(filtered);
      bindRegistrationActions();
    };
    U().qs("#registrationSearch")?.addEventListener("input", applyFilters);
    U().qs("#registrationStatusFilter")?.addEventListener("change", applyFilters);
  }

  function renderMatchTable(matches) {
    return `<table><thead><tr><th>Tournament</th><th>Phase</th><th>Round</th><th>Teams</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead><tbody>
      ${matches.map((m) => `<tr>
        <td>${U().escapeHtml(m.tournaments?.name || m.tournament_id)}</td>
        <td>${U().escapeHtml(m.phase || "-")}<br><span class="muted">${m.best_of ? `BO${m.best_of}` : ""}${m.group_name ? ` - ${U().escapeHtml(m.group_name)}` : ""}</span></td>
        <td>${U().escapeHtml(m.round_name)}<br><span class="muted">${U().formatDate(m.scheduled_start_utc)}</span></td>
        <td>${U().escapeHtml(m.team_a?.team_name || "TBD")} vs ${U().escapeHtml(m.team_b?.team_name || "TBD")}</td>
        <td>${U().escapeHtml(m.status)}</td>
        <td>${m.team_a_score ?? 0} - ${m.team_b_score ?? 0}</td>
        <td><div class="toolbar">
          ${canManageMatches() ? `<button class="secondary-button" type="button" data-edit-match="${m.match_id}">Edit</button>` : ""}
          ${canDeleteMatches() ? `<button class="secondary-button" type="button" data-delete-match="${m.match_id}">Delete</button>` : ""}
        </div></td>
      </tr>`).join("") || '<tr><td colspan="7" class="muted">No tie sheet has been generated yet.</td></tr>'}
    </tbody></table>`;
  }

  function bindTournamentForms() {
    U().qs("#createTournamentForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: U().qs("#tourName").value.trim(),
        game: U().qs("#tourGame").value.trim(),
        description: U().qs("#tourDescription").value.trim(),
        team_capacity: Number(U().qs("#tourCapacity").value),
        start_date: U().qs("#tourStart").value,
        registration_deadline: U().qs("#tourDeadline").value,
        status: U().qs("#tourStatus").value,
        created_by: me().id,
        max_matches_per_day: 6
      };
      payload.format_spec = mlbbFormatSpec(payload.team_capacity);
      if (!confirmCreate("tournament", payload.name)) return;
      const { data, error } = await db().from("tournaments").insert(payload).select("tournament_id").single();
      if (error) alert(error.message);
      else {
        await logAction("create_tournament", data.tournament_id, payload);
        createdPopup("Tournament", payload.name);
        tournaments();
      }
    });
  }

  function bindTournamentActions(tournamentList) {
    U().qsa("[data-edit-tournament]").forEach((button) => button.addEventListener("click", () => openTournamentEditor(tournamentList.find((t) => t.tournament_id === button.dataset.editTournament))));
    U().qsa("[data-build-bracket]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Build or update the tie sheet from approved tournament tickets?")) return;
      try {
        const placement = await ensureTournamentBracket(button.dataset.buildBracket);
        await logAction("build_tournament_tie_sheet", button.dataset.buildBracket, placement);
        alert(placement.placed ? `${placement.placed} team(s) placed into the tie sheet.` : "Tie sheet is already up to date.");
        tournaments();
      } catch (error) {
        alert(error.message);
      }
    }));
    U().qsa("[data-delete-tournament]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this tournament and its matches?")) return;
      const { error } = await db().from("tournaments").delete().eq("tournament_id", button.dataset.deleteTournament);
      if (error) alert(error.message);
      else {
        await logAction("delete_tournament", button.dataset.deleteTournament, {});
        tournaments();
      }
    }));
  }

  function openTournamentEditor(tournament) {
    if (!tournament) return;
    U().openModal("Edit Tournament", `
      <form id="editTournamentForm" class="form-grid">
        <label class="field"><input id="editTourName" value="${U().escapeHtml(tournament.name)}" required placeholder=" "><span>Name</span></label>
        <label class="field"><input id="editTourGame" value="${U().escapeHtml(tournament.game || "")}" placeholder=" "><span>Game</span></label>
        <label class="field"><select id="editTourCapacity">${optionList([4, 8, 16, 32, 64, 128], tournament.team_capacity)}</select><span>Capacity</span></label>
        <label class="field"><select id="editTourStatus">${optionList(tournamentStatuses, tournament.status)}</select><span>Status</span></label>
        <label class="field"><input id="editTourStart" type="date" value="${U().escapeHtml(tournament.start_date || "")}" required placeholder=" "><span>Start date</span></label>
        <label class="field"><input id="editTourDeadline" type="date" value="${U().escapeHtml(tournament.registration_deadline || "")}" required placeholder=" "><span>Registration deadline</span></label>
        <label class="field"><textarea id="editTourDescription" placeholder=" ">${U().escapeHtml(tournament.description || "")}</textarea><span>Description</span></label>
        <button class="primary-button" type="submit">Save tournament</button>
        <p id="editTournamentMessage" class="message"></p>
      </form>`);
    U().qs("#editTournamentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: U().qs("#editTourName").value.trim(),
        game: U().qs("#editTourGame").value.trim(),
        description: U().qs("#editTourDescription").value.trim(),
        team_capacity: Number(U().qs("#editTourCapacity").value),
        status: U().qs("#editTourStatus").value,
        start_date: U().qs("#editTourStart").value,
        registration_deadline: U().qs("#editTourDeadline").value,
        format_spec: mlbbFormatSpec(Number(U().qs("#editTourCapacity").value))
      };
      const { error } = await db().from("tournaments").update(payload).eq("tournament_id", tournament.tournament_id);
      U().setMessage("#editTournamentMessage", error ? error.message : "Tournament saved.", error ? "error" : "success");
      if (!error) {
        await logAction("update_tournament", tournament.tournament_id, payload);
        tournaments();
      }
    });
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function mlbbFormatSpec(capacity) {
    const common = {
      game_style: "MLBB",
      preparation_days: 2,
      early_match_cap_per_day: 6,
      early_best_of: 1,
      playoff_best_of: 3,
      grand_final_best_of: "BO5_or_BO7_poll",
      lower_final_break_days: 3
    };
    const plans = {
      128: { ...common, phases: ["round_128", "round_64", "group_stage_32_to_8", "double_elim_8", "grand_final"] },
      64: { ...common, phases: ["round_64", "group_stage_32_to_8", "double_elim_8", "grand_final"] },
      32: { ...common, phases: ["group_stage_32_to_8", "double_elim_8", "grand_final"] },
      16: { ...common, phases: ["round_16_to_8", "double_elim_8", "grand_final"] },
      8: { ...common, phases: ["double_elim_8", "grand_final"] },
      4: { ...common, phases: ["double_elim_4", "grand_final"] }
    };
    return plans[capacity] || plans[16];
  }

  function firstPlayablePhase(capacity) {
    if (capacity === 128) return "round_128";
    if (capacity === 64) return "round_64";
    if (capacity === 32) return "group_stage";
    if (capacity === 16) return "round_16";
    return "playoff_upper_r1";
  }

  function groupNamesForCapacity(capacity) {
    return Array.from({ length: capacity === 16 ? 4 : 8 }, (_, index) => `Group ${String.fromCharCode(65 + index)}`);
  }

  function addScheduledRows(rows, tournament, cursor, config) {
    const maxPerDay = Number(config.maxPerDay || tournament.max_matches_per_day || 6);
    for (let index = 0; index < config.count; index += 1) {
      const dayOffset = Math.floor(index / maxPerDay);
      const dailySlot = index % maxPerDay;
      const scheduled = addDays(cursor.date, dayOffset);
      scheduled.setUTCHours(12 + dailySlot, 0, 0, 0);
      rows.push({
        tournament_id: tournament.tournament_id,
        round_name: typeof config.roundName === "function" ? config.roundName(index) : config.roundName,
        round_number: config.roundNumber,
        phase: config.phase,
        best_of: config.bestOf,
        bracket_position: config.positionOffset + index + 1,
        group_name: typeof config.groupName === "function" ? config.groupName(index) : config.groupName || null,
        status: "scheduled",
        scheduled_start_utc: scheduled.toISOString(),
        match_notes: config.notes || null
      });
    }
    cursor.date = addDays(cursor.date, Math.ceil(config.count / maxPerDay) + Number(config.graceDays || 0));
  }

  function addGroupStageRows(rows, tournament, cursor, roundNumber, groupNames, positionOffset) {
    const pairings = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    const startCount = rows.length;
    groupNames.forEach((groupName, groupIndex) => {
      pairings.forEach((pair, pairIndex) => {
        rows.push({
          tournament_id: tournament.tournament_id,
          round_name: `${groupName} - BO1`,
          round_number: roundNumber,
          phase: "group_stage",
          best_of: 1,
          bracket_position: positionOffset + (groupIndex * 100) + pairIndex + 1,
          group_name: groupName,
          status: "scheduled",
          match_notes: `Group slots ${pair[0] + 1} vs ${pair[1] + 1}`
        });
      });
    });
    const maxPerDay = 6;
    rows.slice(startCount).forEach((row, index) => {
      const scheduled = addDays(cursor.date, Math.floor(index / maxPerDay));
      scheduled.setUTCHours(12 + (index % maxPerDay), 0, 0, 0);
      row.scheduled_start_utc = scheduled.toISOString();
    });
    cursor.date = addDays(cursor.date, Math.ceil((rows.length - startCount) / maxPerDay) + 1);
  }

  function addPlayoffRows(rows, tournament, cursor, teams, roundNumber, positionOffset) {
    const firstRoundCount = teams / 2;
    addScheduledRows(rows, tournament, cursor, {
      count: firstRoundCount,
      maxPerDay: 6,
      roundName: "Upper Bracket Round 1 - BO3",
      roundNumber,
      phase: "playoff_upper_r1",
      bestOf: 3,
      positionOffset,
      notes: `${teams}-team double elimination begins`
    });
    const continuationCount = Math.max(0, (teams * 2 - 2) - firstRoundCount);
    addScheduledRows(rows, tournament, cursor, {
      count: continuationCount,
      maxPerDay: 6,
      roundName: (index) => `Double Elimination BO3 - Series ${index + 1}`,
      roundNumber: roundNumber + 1,
      phase: "playoff_continuation",
      bestOf: 3,
      positionOffset: positionOffset + firstRoundCount,
      notes: "Continuous playoffs until lower-bracket final"
    });
    cursor.date = addDays(cursor.date, 3);
    addScheduledRows(rows, tournament, cursor, {
      count: 1,
      maxPerDay: 1,
      roundName: "Grand Final - BO5/BO7",
      roundNumber: roundNumber + 2,
      phase: "grand_final",
      bestOf: 5,
      positionOffset: positionOffset + firstRoundCount + continuationCount,
      notes: "Grand final format is BO5 or BO7 by poll"
    });
  }

  function buildMlbbTieSheetRows(tournament) {
    const rows = [];
    const capacity = Number(tournament.team_capacity || 16);
    const firstMatchDate = addDays(tournament.start_date ? new Date(tournament.start_date) : new Date(), 2);
    firstMatchDate.setUTCHours(0, 0, 0, 0);
    const cursor = { date: firstMatchDate };
    let roundNumber = 1;
    let positionOffset = 0;

    if (capacity === 128) {
      addScheduledRows(rows, tournament, cursor, { count: 64, maxPerDay: 6, roundName: "Round of 128 - BO1", roundNumber: roundNumber++, phase: "round_128", bestOf: 1, positionOffset, graceDays: 1 });
      positionOffset += 64;
    }
    if (capacity >= 64) {
      addScheduledRows(rows, tournament, cursor, { count: 32, maxPerDay: 6, roundName: "Round of 64 - BO1", roundNumber: roundNumber++, phase: "round_64", bestOf: 1, positionOffset, graceDays: 1 });
      positionOffset += 32;
    }
    if (capacity === 128 || capacity === 64) {
      addGroupStageRows(rows, tournament, cursor, roundNumber++, groupNamesForCapacity(32), positionOffset);
      positionOffset += 48;
      addPlayoffRows(rows, tournament, cursor, 8, roundNumber, positionOffset);
    } else if (capacity === 32) {
      addGroupStageRows(rows, tournament, cursor, roundNumber++, groupNamesForCapacity(32), positionOffset);
      positionOffset += 48;
      addPlayoffRows(rows, tournament, cursor, 8, roundNumber, positionOffset);
    } else if (capacity === 16) {
      addScheduledRows(rows, tournament, cursor, { count: 8, maxPerDay: 6, roundName: "Round of 16 - BO1", roundNumber: roundNumber++, phase: "round_16", bestOf: 1, positionOffset, graceDays: 1 });
      positionOffset += 8;
      addPlayoffRows(rows, tournament, cursor, 8, roundNumber, positionOffset);
    } else if (capacity === 8) {
      addPlayoffRows(rows, tournament, cursor, 8, roundNumber, positionOffset);
    } else if (capacity === 4) {
      addPlayoffRows(rows, tournament, cursor, 4, roundNumber, positionOffset);
    }

    return rows;
  }

  async function getTournamentMatches(tournamentId) {
    const { data, error } = await db().from("matches").select("match_id, tournament_id, round_name, round_number, phase, best_of, bracket_position, group_name, team_a_id, team_b_id, team_a_score, team_b_score, winner_team_id, status, scheduled_start_utc, match_notes").eq("tournament_id", tournamentId).order("scheduled_start_utc", { ascending: true }).order("bracket_position", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function rebuildLegacyTieSheetIfSafe(tournament, matches) {
    const hasLegacyRows = matches.some((match) => !match.phase);
    if (!hasLegacyRows) return matches;
    const hasResults = matches.some((match) => match.winner_team_id || Number(match.team_a_score || 0) || Number(match.team_b_score || 0) || !["scheduled", "checkin_open"].includes(match.status));
    if (hasResults) throw new Error("This tournament has legacy match rows with results. Clear them manually before rebuilding the MLBB tie sheet.");
    const { error: deleteError } = await db().from("matches").delete().eq("tournament_id", tournament.tournament_id);
    if (deleteError) throw deleteError;
    const rows = buildMlbbTieSheetRows(tournament);
    const { error: insertError } = await db().from("matches").insert(rows);
    if (insertError) throw insertError;
    return getTournamentMatches(tournament.tournament_id);
  }

  async function ensureTieSheetRows(tournament) {
    let matches = await getTournamentMatches(tournament.tournament_id);
    if (!matches.length) {
      const rows = buildMlbbTieSheetRows(tournament);
      const { error } = await db().from("matches").insert(rows);
      if (error) throw error;
      matches = await getTournamentMatches(tournament.tournament_id);
    }
    return rebuildLegacyTieSheetIfSafe(tournament, matches);
  }

  function slotFromGroupNote(note) {
    const match = String(note || "").match(/slots\s+(\d+)\s+vs\s+(\d+)/i);
    return match ? [Number(match[1]) - 1, Number(match[2]) - 1] : [0, 1];
  }

  function groupSlotNumber(assignment) {
    const match = String(assignment.tiebreaker_note || "").match(/slot:(\d+)/);
    return match ? Number(match[1]) : 99;
  }

  async function placeGroupStageTeams(tournament, matches, approvedTeamIds) {
    const groupMatches = matches.filter((match) => match.phase === "group_stage");
    const groupNames = uniqueValues(groupMatches.map((match) => match.group_name)).sort();
    const { data: existingRows, error: tableError } = await db().from("group_stage_tables").select("group_id, group_name, team_id, tiebreaker_note").eq("tournament_id", tournament.tournament_id);
    if (tableError) throw tableError;

    const assignments = existingRows || [];
    const assigned = new Set(assignments.map((row) => row.team_id));
    const shuffled = shuffleList(approvedTeamIds.filter((teamId) => !assigned.has(teamId)));
    const inserts = [];
    groupNames.forEach((groupName) => {
      const current = assignments.filter((row) => row.group_name === groupName);
      for (let slot = current.length + 1; slot <= 4 && shuffled.length; slot += 1) {
        const teamId = shuffled.shift();
        inserts.push({ tournament_id: tournament.tournament_id, group_name: groupName, team_id: teamId, tiebreaker_note: `slot:${slot}` });
        assignments.push({ group_name: groupName, team_id: teamId, tiebreaker_note: `slot:${slot}` });
      }
    });
    if (inserts.length) {
      const { error } = await db().from("group_stage_tables").insert(inserts);
      if (error) throw error;
    }

    const updates = [];
    for (const match of groupMatches) {
      const groupTeams = assignments.filter((row) => row.group_name === match.group_name).sort((a, b) => groupSlotNumber(a) - groupSlotNumber(b));
      const [slotA, slotB] = slotFromGroupNote(match.match_notes);
      const teamA = groupTeams[slotA]?.team_id || null;
      const teamB = groupTeams[slotB]?.team_id || null;
      if (match.team_a_id !== teamA || match.team_b_id !== teamB) {
        updates.push(db().from("matches").update({ team_a_id: teamA, team_b_id: teamB }).eq("match_id", match.match_id));
      }
    }
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    return { placed: inserts.length, approved: approvedTeamIds.length, capacity: Number(tournament.team_capacity || 0), unplaced: shuffled.length };
  }

  async function ensureTournamentBracket(tournamentId) {
    const { data: tournament, error: tournamentError } = await db().from("tournaments").select("*").eq("tournament_id", tournamentId).single();
    if (tournamentError) throw tournamentError;

    let matches = await ensureTieSheetRows(tournament);

    const { data: registrations, error: registrationError } = await db()
      .from("tournament_registrations")
      .select("team_id, reviewed_at, created_at")
      .eq("tournament_id", tournamentId)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (registrationError) throw registrationError;

    const approvedTeamIds = (registrations || []).slice(0, Number(tournament.team_capacity || 0)).map((registration) => registration.team_id);
    if (firstPlayablePhase(Number(tournament.team_capacity)) === "group_stage") {
      return placeGroupStageTeams(tournament, matches, approvedTeamIds);
    }

    const firstRound = matches.filter((match) => match.phase === firstPlayablePhase(Number(tournament.team_capacity)));
    const assignedTeams = new Set(firstRound.flatMap((match) => [match.team_a_id, match.team_b_id]).filter(Boolean));
    const unplacedTeamIds = approvedTeamIds.filter((teamId) => !assignedTeams.has(teamId));
    const availableSlots = shuffleList(firstRound.flatMap((match) => [
      match.team_a_id ? null : { match_id: match.match_id, side: "team_a_id" },
      match.team_b_id ? null : { match_id: match.match_id, side: "team_b_id" }
    ]).filter(Boolean));

    let placed = 0;
    for (const teamId of unplacedTeamIds) {
      const slot = availableSlots.pop();
      if (!slot) break;
      const { error } = await db().from("matches").update({ [slot.side]: teamId }).eq("match_id", slot.match_id);
      if (error) throw error;
      placed += 1;
    }

    return {
      placed,
      approved: approvedTeamIds.length,
      capacity: Number(tournament.team_capacity || 0),
      unplaced: Math.max(0, unplacedTeamIds.length - placed)
    };
  }

  function bindRegistrationActions() {
    U().qsa("[data-approve-registration]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Approve this tournament ticket and place the team into the tie sheet?")) return;
      const { data: tournament, error: tournamentError } = await db().from("tournaments").select("team_capacity").eq("tournament_id", button.dataset.tournament).single();
      if (tournamentError) return alert(tournamentError.message);
      const { count, error: countError } = await db().from("tournament_registrations").select("*", { count: "exact", head: true }).eq("tournament_id", button.dataset.tournament).eq("status", "approved");
      if (countError) return alert(countError.message);
      if ((count || 0) >= Number(tournament.team_capacity || 0)) return alert("Tournament capacity is already full.");
      const { error } = await db().from("tournament_registrations").update({ status: "approved", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("registration_id", button.dataset.approveRegistration);
      if (error) return alert(error.message);
      try {
        const placement = await ensureTournamentBracket(button.dataset.tournament);
        await logAction("approve_tournament_registration", button.dataset.approveRegistration, placement);
        alert(placement.placed ? "Tournament ticket approved and team placed into the tie sheet." : "Tournament ticket approved. The tie sheet is already full or already placed.");
        tournaments();
      } catch (error) {
        alert(error.message);
        tournaments();
      }
    }));
    U().qsa("[data-reject-registration]").forEach((button) => button.addEventListener("click", async () => {
      await db().from("tournament_registrations").update({ status: "rejected", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("registration_id", button.dataset.rejectRegistration);
      await logAction("reject_tournament_registration", button.dataset.rejectRegistration, {});
      tournaments();
    }));
  }

  function bindMatchActions(matches, tournamentList, teamsList) {
    U().qsa("[data-edit-match]").forEach((button) => button.addEventListener("click", () => openMatchEditor(matches.find((m) => m.match_id === button.dataset.editMatch), teamsList)));
    U().qsa("[data-delete-match]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this match?")) return;
      const { error } = await db().from("matches").delete().eq("match_id", button.dataset.deleteMatch);
      if (error) alert(error.message);
      else {
        await logAction("delete_match", button.dataset.deleteMatch, {});
        tournaments();
      }
    }));
  }

  function openMatchEditor(match, teamsList) {
    if (!match) return;
    U().openModal("Edit Match", `
      <form id="editMatchForm" class="form-grid">
        <label class="field"><input id="editMatchRound" value="${U().escapeHtml(match.round_name)}" required placeholder=" "><span>Round</span></label>
        <label class="field"><select id="editMatchStatus">${optionList(matchStatuses, match.status)}</select><span>Status</span></label>
        <label class="field"><select id="editMatchTeamA">${optionList(teamsList.map((t) => t.team_id), match.team_a_id, "TBD")}</select><span>Team A</span></label>
        <label class="field"><select id="editMatchTeamB">${optionList(teamsList.map((t) => t.team_id), match.team_b_id, "TBD")}</select><span>Team B</span></label>
        <label class="field"><input id="editMatchScoreA" type="number" min="0" value="${match.team_a_score ?? 0}" placeholder=" "><span>Team A score</span></label>
        <label class="field"><input id="editMatchScoreB" type="number" min="0" value="${match.team_b_score ?? 0}" placeholder=" "><span>Team B score</span></label>
        <label class="field"><select id="editMatchWinner"><option value="">No winner</option><option value="${match.team_a_id || ""}" ${match.winner_team_id === match.team_a_id ? "selected" : ""}>Team A</option><option value="${match.team_b_id || ""}" ${match.winner_team_id === match.team_b_id ? "selected" : ""}>Team B</option></select><span>Winner</span></label>
        <label class="field"><textarea id="editMatchNotes" placeholder=" ">${U().escapeHtml(match.match_notes || "")}</textarea><span>Notes</span></label>
        <button class="primary-button" type="submit">Save match</button>
        <p id="editMatchMessage" class="message"></p>
      </form>`);
    [U().qs("#editMatchTeamA"), U().qs("#editMatchTeamB")].forEach((select) => {
      Array.from(select.options).forEach((option) => {
        const team = teamsList.find((t) => t.team_id === option.value);
        if (team) option.textContent = `${team.team_name} [${team.team_tag}]`;
      });
    });
    U().qs("#editMatchForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        round_name: U().qs("#editMatchRound").value.trim(),
        status: U().qs("#editMatchStatus").value,
        team_a_id: U().qs("#editMatchTeamA").value || null,
        team_b_id: U().qs("#editMatchTeamB").value || null,
        team_a_score: Number(U().qs("#editMatchScoreA").value || 0),
        team_b_score: Number(U().qs("#editMatchScoreB").value || 0),
        winner_team_id: U().qs("#editMatchWinner").value || null,
        match_notes: U().qs("#editMatchNotes").value.trim()
      };
      const { error } = await db().from("matches").update(payload).eq("match_id", match.match_id);
      U().setMessage("#editMatchMessage", error ? error.message : "Match saved.", error ? "error" : "success");
      if (!error) {
        await logAction("update_match", match.match_id, payload);
        tournaments();
      }
    });
  }

  async function audit() {
    const root = U().qs("#dashContent");
    root.innerHTML = '<p class="muted">Loading audit activity...</p>';

    const [{ data, error }, { data: profiles }] = await Promise.all([
      db().from("audit_logs").select("*, profiles!admin_id(id, full_name, username, role, staff_role, staff_roles)").order("created_at", { ascending: false }).limit(250),
      db().from("profiles").select("id, full_name, username, role, staff_role, staff_roles").limit(500)
    ]);

    if (error) return root.innerHTML = `<p class="message error">${U().escapeHtml(error.message)}</p>`;

    const actorMap = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
    const currentRole = staffRolesFor(me());
    const isSuperAdmin = currentRole.includes("superadmin");

    const baseLogs = (data || []).filter((log) => {
      const actor = actorMap[log.admin_id] || {};
      if (!isSuperAdmin && hasRealStaffRole(actor, "superadmin")) return false;
      const department = actionDepartment(log.action);
      if (!isSuperAdmin) {
        if (currentRole.includes("useradmin") || currentRole.includes("usermod")) return department === "User Management";
        if (currentRole.includes("playeradmin") || currentRole.includes("playermod")) return department === "Player Management";
        if (currentRole.includes("tournamentadmin") || currentRole.includes("tournamentmod")) return department === "Tournament";
      }
      return true;
    });

    function renderRows(logs) {
      const teamActivity = logs.filter((log) => /team|player|member|approval/.test(String(log.action).toLowerCase()));
      const actorSummary = [...new Set(logs.map((log) => actorMap[log.admin_id]?.full_name || "Unknown"))].slice(0, 8);
      root.innerHTML = `
        <section class="card-grid" style="margin-bottom:16px;">
          <article class="item-card"><strong>${logs.length}</strong><span>Visible audit entries</span></article>
          <article class="item-card"><strong>${teamActivity.length}</strong><span>Team activity items</span></article>
          <article class="item-card"><strong>${actorSummary.length}</strong><span>Visible actors</span></article>
        </section>
        <section class="wide-panel" style="margin-bottom:16px;">
          <div class="section-heading"><h2>Audit Filters</h2><span class="pill good">${isSuperAdmin ? "Superadmin view" : "Scoped view"}</span></div>
          <div class="filter-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
            <label class="field"><input id="auditSearch" type="search" placeholder=" "><span>Search</span></label>
            <label class="field"><select id="auditDepartmentFilter"><option value="all">All departments</option><option value="User">User</option><option value="Player">Player</option><option value="Tournament">Tournament</option><option value="General">General</option></select><span>Department</span></label>
            <label class="field"><select id="auditActorFilter"><option value="all">All actors</option>${[...new Set(baseLogs.map((log) => actorMap[log.admin_id]?.full_name || actorMap[log.admin_id]?.username || "Unknown"))].map((name) => `<option value="${U().escapeHtml(name)}">${U().escapeHtml(name)}</option>`).join("")}</select><span>Actor</span></label>
          </div>
          <div class="pill-row" style="margin-top:10px;">
            <span class="pill">Visible: ${isSuperAdmin ? "All departments" : "Department scoped"}</span>
            <span class="pill">Superadmin activity: ${isSuperAdmin ? "Visible" : "Hidden"}</span>
            <span class="pill">Team activity: ${teamActivity.length}</span>
          </div>
        </section>
        <section class="wide-panel" style="margin-bottom:16px;">
          <div class="section-heading"><h2>Team Activity</h2><span class="pill warn">Department tracking</span></div>
          <div class="list-stack">${teamActivity.slice(0, 8).map((log) => {
            const actor = actorMap[log.admin_id] || {};
            return `<article class="item-card"><strong>${U().escapeHtml(actionLabel(log.action))}</strong><p class="muted">${U().escapeHtml(actor.full_name || "Unknown actor")} · ${U().formatDate(log.created_at)}</p><p>${U().escapeHtml(JSON.stringify(log.details || {}).slice(0, 160))}</p></article>`;
          }).join("") || '<p class="muted">No team activity in the current filter.</p>'}</div>
        </section>
        <section class="table-wrap"><table><thead><tr><th>Actor</th><th>Department</th><th>Action</th><th>Target</th><th>Details</th><th>Date</th></tr></thead><tbody id="auditRows">${logs.map((log) => {
          const actor = actorMap[log.admin_id] || {};
          const staffRoles = [actor.staff_role, ...(Array.isArray(actor.staff_roles) ? actor.staff_roles : [])].filter(Boolean);
          return `<tr>
            <td>${U().escapeHtml(actor.full_name || actor.username || "Unknown")}<br><span class="muted">${U().escapeHtml(staffRoles.join(", ") || actor.role || "user")}</span></td>
            <td>${U().escapeHtml(actionDepartment(log.action))}</td>
            <td>${U().escapeHtml(actionLabel(log.action))}</td>
            <td>${U().escapeHtml(log.target_id || "-")}</td>
            <td><code>${U().escapeHtml(JSON.stringify(log.details || {}))}</code></td>
            <td>${U().formatDate(log.created_at)}</td>
          </tr>`;
        }).join("")}</tbody></table></section>`;

      const searchInput = U().qs("#auditSearch");
      const departmentFilter = U().qs("#auditDepartmentFilter");
      const actorFilter = U().qs("#auditActorFilter");
      const applyFilters = () => {
        const query = (searchInput?.value || "").toLowerCase();
        const department = departmentFilter?.value || "all";
        const actor = actorFilter?.value || "all";
        const filtered = baseLogs.filter((log) => {
          const actorName = actorMap[log.admin_id]?.full_name || actorMap[log.admin_id]?.username || "Unknown";
          const text = `${actionLabel(log.action)} ${actorName} ${JSON.stringify(log.details || "")} ${log.target_id || ""}`.toLowerCase();
          const matchesQuery = !query || text.includes(query);
          const matchesDepartment = department === "all" || actionDepartment(log.action) === department;
          const matchesActor = actor === "all" || actorName === actor;
          return matchesQuery && matchesDepartment && matchesActor;
        });
        const rows = U().qs("#auditRows");
        if (!rows) return;
        rows.innerHTML = filtered.map((log) => {
          const actor = actorMap[log.admin_id] || {};
          const staffRoles = [actor.staff_role, ...(Array.isArray(actor.staff_roles) ? actor.staff_roles : [])].filter(Boolean);
          return `<tr>
            <td>${U().escapeHtml(actor.full_name || actor.username || "Unknown")}<br><span class="muted">${U().escapeHtml(staffRoles.join(", ") || actor.role || "user")}</span></td>
            <td>${U().escapeHtml(actionDepartment(log.action))}</td>
            <td>${U().escapeHtml(actionLabel(log.action))}</td>
            <td>${U().escapeHtml(log.target_id || "-")}</td>
            <td><code>${U().escapeHtml(JSON.stringify(log.details || {}))}</code></td>
            <td>${U().formatDate(log.created_at)}</td>
          </tr>`;
        }).join("") || '<tr><td colspan="6"><p class="muted">No audit entries match the current filters.</p></td></tr>';
      };
      searchInput?.addEventListener("input", applyFilters);
      departmentFilter?.addEventListener("change", applyFilters);
      actorFilter?.addEventListener("change", applyFilters);
    }

    renderRows(baseLogs);
  }

  async function audit() {
    const root = U().qs("#dashContent");
    root.innerHTML = '<p class="muted">Loading audit activity...</p>';

    const [{ data, error }, { data: profiles }] = await Promise.all([
      db().from("audit_logs").select("*, profiles!admin_id(id, full_name, username, role, staff_role, staff_roles)").order("created_at", { ascending: false }).limit(250),
      db().from("profiles").select("id, full_name, username, role, staff_role, staff_roles").limit(500)
    ]);
    if (error) return root.innerHTML = `<p class="message error">${U().escapeHtml(error.message)}</p>`;

    const actorMap = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
    const currentRole = staffRolesFor(me());
    const isSuperAdmin = currentRole.includes("superadmin");
    const visibleLogs = (data || []).filter((log) => {
      const actor = actorMap[log.admin_id] || {};
      if (!isSuperAdmin && hasRealStaffRole(actor, "superadmin")) return false;
      const department = actionDepartment(log.action);
      if (!isSuperAdmin) {
        if (currentRole.includes("useradmin") || currentRole.includes("usermod")) return department === "User Management";
        if (currentRole.includes("playeradmin") || currentRole.includes("playermod")) return department === "Player Management";
        if (currentRole.includes("tournamentadmin") || currentRole.includes("tournamentmod")) return department === "Tournament";
      }
      return true;
    });

    const departments = ["User Management", "Player Management", "Tournament", "Broadcast", "General"];
    const actorName = (log) => actorMap[log.admin_id]?.full_name || actorMap[log.admin_id]?.username || "Unknown";
    const staffLabel = (actor) => [actor.staff_role, ...(Array.isArray(actor.staff_roles) ? actor.staff_roles : [])].filter(Boolean).join(", ") || actor.role || "user";
    const logText = (log) => `${actionLabel(log.action)} ${actionDepartment(log.action)} ${actorName(log)} ${log.target_id || ""} ${JSON.stringify(log.details || {})}`.toLowerCase();

    function openAuditDetail(log) {
      if (!log) return;
      const actor = actorMap[log.admin_id] || {};
      U().openModal("Audit Details", `
        <section class="detail-grid">
          <div class="mini-card">
            <div class="section-heading"><strong>${U().escapeHtml(actionLabel(log.action))}</strong><span class="pill">${U().escapeHtml(actionDepartment(log.action))}</span></div>
            <dl class="detail-list">
              <div><dt>Actor</dt><dd>${U().escapeHtml(actorName(log))}</dd></div>
              <div><dt>Actor role</dt><dd>${U().escapeHtml(staffLabel(actor))}</dd></div>
              <div><dt>Target</dt><dd>${U().escapeHtml(log.target_id || "-")}</dd></div>
              <div><dt>Date</dt><dd>${U().formatDate(log.created_at)}</dd></div>
            </dl>
          </div>
          <pre class="code-block">${U().escapeHtml(JSON.stringify(log.details || {}, null, 2))}</pre>
        </section>`);
    }

    function bindAuditDetailButtons() {
      U().qsa("[data-audit-detail]").forEach((button) => button.addEventListener("click", () => {
        openAuditDetail(visibleLogs.find((log) => String(log.log_id) === String(button.dataset.auditDetail)));
      }));
    }

    function renderAuditTable(logs) {
      return logs.map((log) => {
        const actor = actorMap[log.admin_id] || {};
        return `<tr>
          <td>${U().escapeHtml(actorName(log))}<br><span class="muted">${U().escapeHtml(staffLabel(actor))}</span></td>
          <td>${U().escapeHtml(actionDepartment(log.action))}</td>
          <td>${U().escapeHtml(actionLabel(log.action))}</td>
          <td>${U().escapeHtml(log.target_id || "-")}</td>
          <td><button class="secondary-button compact-button" type="button" data-audit-detail="${log.log_id}">Open</button></td>
          <td>${U().formatDate(log.created_at)}</td>
        </tr>`;
      }).join("") || '<tr><td colspan="6"><p class="muted">No audit entries match the current filters.</p></td></tr>';
    }

    function renderAuditGroups(logs) {
      return departments.map((department) => {
        const entries = logs.filter((log) => actionDepartment(log.action) === department);
        return `<article class="audit-group-card">
          <div class="section-heading"><strong>${U().escapeHtml(department)}</strong><span class="pill">${entries.length}</span></div>
          <div class="list-stack">${entries.slice(0, 4).map((log) => `<button class="audit-mini-row" type="button" data-audit-detail="${log.log_id}">
            <span>${U().escapeHtml(actionLabel(log.action))}</span>
            <small>${U().escapeHtml(actorName(log))} - ${U().formatDate(log.created_at)}</small>
          </button>`).join("") || '<p class="muted">No matching activity.</p>'}</div>
        </article>`;
      }).join("");
    }

    function render(logs, state = {}) {
      const counts = logs.reduce((memo, log) => {
        const department = actionDepartment(log.action);
        memo[department] = (memo[department] || 0) + 1;
        return memo;
      }, {});
      const actors = [...new Set(logs.map(actorName))].slice(0, 8);
      root.innerHTML = `
        <section class="card-grid audit-stat-grid">
          <article class="item-card"><strong>${logs.length}</strong><span>Filtered entries</span></article>
          <article class="item-card"><strong>${counts["User Management"] || 0}</strong><span>User management</span></article>
          <article class="item-card"><strong>${counts["Player Management"] || 0}</strong><span>Player management</span></article>
          <article class="item-card"><strong>${actors.length}</strong><span>Active actors</span></article>
        </section>
        <section class="wide-panel audit-filter-panel">
          <div class="section-heading"><h2>Audit Filters</h2><span class="pill good">${isSuperAdmin ? "Superadmin view" : "Scoped view"}</span></div>
          <div class="filter-grid audit-filter-grid">
            <label class="field"><input id="auditSearch" type="search" value="${U().escapeHtml(state.query || "")}" placeholder=" "><span>Search action, actor, target, or details</span></label>
            <label class="field"><select id="auditDepartmentFilter"><option value="all">All departments</option>${departments.map((department) => `<option value="${department}" ${state.department === department ? "selected" : ""}>${department}</option>`).join("")}</select><span>Department</span></label>
            <label class="field"><select id="auditActorFilter"><option value="all">All actors</option>${[...new Set(visibleLogs.map(actorName))].map((name) => `<option value="${U().escapeHtml(name)}" ${state.actor === name ? "selected" : ""}>${U().escapeHtml(name)}</option>`).join("")}</select><span>Actor</span></label>
            <button id="applyAuditFilters" class="primary-button" type="button"><i class="fa-solid fa-filter"></i> Apply</button>
            <button id="resetAuditFilters" class="secondary-button" type="button">Reset</button>
          </div>
          <div class="pill-row" style="margin-top:10px;"><span class="pill">Filtered from ${visibleLogs.length}</span><span class="pill">Superadmin activity: ${isSuperAdmin ? "Visible" : "Hidden"}</span></div>
        </section>
        <section class="wide-panel">
          <div class="section-heading"><h2>Grouped Audit</h2><span class="pill warn">Open any item for details</span></div>
          <div class="audit-group-grid">${renderAuditGroups(logs)}</div>
        </section>
        <section class="table-wrap"><table><thead><tr><th>Actor</th><th>Department</th><th>Action</th><th>Target</th><th>Details</th><th>Date</th></tr></thead><tbody>${renderAuditTable(logs)}</tbody></table></section>`;

      const applyFilters = () => {
        const query = (U().qs("#auditSearch")?.value || "").trim().toLowerCase();
        const department = U().qs("#auditDepartmentFilter")?.value || "all";
        const actor = U().qs("#auditActorFilter")?.value || "all";
        const filtered = visibleLogs.filter((log) => {
          return (!query || logText(log).includes(query))
            && (department === "all" || actionDepartment(log.action) === department)
            && (actor === "all" || actorName(log) === actor);
        });
        render(filtered, { query, department, actor });
      };
      U().qs("#applyAuditFilters")?.addEventListener("click", applyFilters);
      U().qs("#resetAuditFilters")?.addEventListener("click", () => render(visibleLogs, {}));
      U().qs("#auditSearch")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") applyFilters();
      });
      bindAuditDetailButtons();
    }

    render(visibleLogs);
  }

  async function activity() {
    const { data } = await db().from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8);
    const logs = data || [];
    const counts = logs.reduce((memo, log) => {
      const department = actionDepartment(log.action);
      memo[department] = (memo[department] || 0) + 1;
      return memo;
    }, {});
    U().qs("#activityPanel").innerHTML = `
      <div class="activity-header">
        <p class="eyebrow">Live Desk</p>
        <h2>Activity Pulse</h2>
      </div>
      <div class="activity-metrics">
        <span><strong>${logs.length}</strong><small>latest</small></span>
        <span><strong>${counts["Player Management"] || 0}</strong><small>player</small></span>
        <span><strong>${counts.Tournament || 0}</strong><small>event</small></span>
      </div>
      <div class="activity-timeline">${logs.map((log) => `
        <article class="activity-item">
          <span class="activity-dot"></span>
          <strong>${U().escapeHtml(actionLabel(log.action))}</strong>
          <p>${U().escapeHtml(actionDepartment(log.action))}</p>
          <small>${U().formatDate(log.created_at)}</small>
        </article>
      `).join("") || '<p class="muted">No activity yet.</p>'}</div>`;
  }

  function updatePreviewBadge() {
    U().qs("#staffPreviewLabel")?.remove();
    const labelText = previewRoleLabel();
    if (!labelText) return;
    const label = document.createElement("span");
    label.id = "staffPreviewLabel";
    label.className = "pill warn";
    label.textContent = labelText;
    document.querySelector(".toolbar")?.prepend(label);
  }

  function setupPreviewControls() {
    const previewSelect = U().qs("#staffViewPreview");
    const resetButton = U().qs("#resetStaffViewPreview");
    if (!previewSelect || !resetButton) return;

    const isSuperAdmin = rawStaffRolesFor(me()).includes("superadmin");
    previewSelect.disabled = !isSuperAdmin;
    resetButton.disabled = !isSuperAdmin;

    if (!isSuperAdmin) {
      localStorage.removeItem(previewRoleStorageKey);
      previewSelect.value = "";
      updatePreviewBadge();
      return;
    }

    const saved = localStorage.getItem(previewRoleStorageKey) || "";
    previewSelect.value = saved;
    updatePreviewBadge();

    previewSelect.addEventListener("change", () => {
      const value = previewSelect.value;
      if (value) localStorage.setItem(previewRoleStorageKey, value);
      else localStorage.removeItem(previewRoleStorageKey);
      renderSidebar();
      loadModule(activeModule);
      updatePreviewBadge();
    });

    resetButton.addEventListener("click", () => {
      localStorage.removeItem(previewRoleStorageKey);
      previewSelect.value = "";
      renderSidebar();
      loadModule(activeModule);
      updatePreviewBadge();
    });
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    if (document.body.dataset.page !== "dashboard" || !window.currentProfile) return;
    renderSidebar();
    activity();
    startRealtime();
    setupPreviewControls();
    U().qs("#switchUserView")?.addEventListener("click", () => window.open("feed.html", "_blank"));
    U().qs("#staffLogout")?.addEventListener("click", () => window.TPAuth.logout());
  }, 350));
})();
