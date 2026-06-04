(function () {
  const roleModules = {
    superadmin: ["overview", "users", "players", "tournaments", "audit"],
    useradmin: ["users", "audit"],
    usermod: ["users"],
    playeradmin: ["players", "users", "audit"],
    playermod: ["players"],
    tournamentadmin: ["tournaments", "players", "audit"],
    tournamentmod: ["tournaments"]
  };

  const labels = {
    overview: ["fa-chart-simple", "Overview"],
    users: ["fa-users", "User Management"],
    players: ["fa-user-shield", "Player Management"],
    tournaments: ["fa-trophy", "Tournament Management"],
    audit: ["fa-clipboard-list", "Audit Logs"]
  };

  const userRoles = ["user", "player"];
  const staffRoles = ["usermod", "playermod", "tournamentmod", "useradmin", "playeradmin", "tournamentadmin"];
  const teamRoles = ["exp", "jg", "gd", "md", "rm", "coach", "sb1", "sb2"];
  const tournamentStatuses = ["draft", "registration", "in_progress", "completed"];
  const matchStatuses = ["scheduled", "checkin_open", "live", "paused", "finished", "forfeit"];
  let activeModule = "overview";
  let realtimeStarted = false;
  let refreshTimer = null;

  function U() {
    return window.TPUtils;
  }

  function db() {
    return window.tpSupabase;
  }

  function me() {
    return window.currentProfile || {};
  }

  function hasRole(...roles) {
    return roles.includes(me().staff_role);
  }

  function canCreateUsers() {
    return hasRole("superadmin");
  }

  function canEditBasicUsers() {
    return hasRole("superadmin", "useradmin", "usermod");
  }

  function canManagePlayerAppeals() {
    return hasRole("superadmin", "useradmin");
  }

  function canDeleteUsers(profile) {
    return hasRole("superadmin") && profile.id !== me().id && profile.staff_role !== "superadmin";
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
    return hasRole("superadmin", "tournamentadmin", "tournamentmod");
  }

  function optionList(options, selected, emptyLabel) {
    const empty = emptyLabel !== undefined ? `<option value="">${emptyLabel}</option>` : "";
    return empty + options.map((option) => `<option value="${option}" ${String(selected || "") === String(option) ? "selected" : ""}>${option}</option>`).join("");
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
    const { data, error } = await db().functions.invoke("admin-users", {
      body: { action, ...payload },
      headers: { Authorization: `Bearer ${token}` }
    });
    if (error) {
      throw new Error(`${error.message}. Deploy the Supabase Edge Function in supabase/functions/admin-users if this keeps happening.`);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function renderSidebar() {
    const modules = roleModules[me().staff_role] || [];
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
    const tables = ["profiles", "teams", "tournaments", "matches"];
    const counts = {};
    for (const table of tables) {
      const { count } = await db().from(table).select("*", { count: "exact", head: true });
      counts[table] = count || 0;
    }
    U().qs("#statCards").innerHTML = `
      <article class="item-card"><h2>${counts.profiles}</h2><p>Users</p></article>
      <article class="item-card"><h2>${counts.teams}</h2><p>Teams</p></article>
      <article class="item-card"><h2>${counts.tournaments}</h2><p>Tournaments</p></article>
      <article class="item-card"><h2>${counts.matches}</h2><p>Matches</p></article>`;
    if (window.Chart) {
      new Chart(U().qs("#overviewChart"), {
        type: "bar",
        data: { labels: ["Users", "Teams", "Tournaments", "Matches"], datasets: [{ label: "Totals", data: [counts.profiles, counts.teams, counts.tournaments, counts.matches], backgroundColor: ["#0066cc", "#ffcc00", "#00cc44", "#8b0000"] }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
  }

  async function users() {
    const { data, error } = await db().from("profiles").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) return U().qs("#dashContent").innerHTML = `<p class="message error">${U().escapeHtml(error.message)}</p>`;
    U().qs("#dashContent").innerHTML = `
      ${canCreateUsers() ? renderCreateUserPanel() : ""}
      <section class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Staff</th><th>Verified</th><th>Actions</th></tr></thead>
          <tbody>${data.map(renderUserRow).join("")}</tbody>
        </table>
      </section>
      <section class="wide-panel"><h2>Player Appeals</h2><div id="appealsList" class="list-stack"></div></section>`;
    bindCreateUser();
    bindUserActions(data);
    loadAppeals();
  }

  function renderCreateUserPanel() {
    return `<section class="wide-panel">
      <div class="section-heading"><h2>Create Auth User</h2><span class="pill good">Superadmin</span></div>
      <form id="createUserForm" class="form-grid">
        <label class="field"><input id="newUserName" required placeholder=" "><span>Full name</span></label>
        <label class="field"><input id="newUserEmail" type="email" required placeholder=" "><span>Email</span></label>
        <label class="field"><input id="newUserPassword" type="password" minlength="8" required placeholder=" "><span>Password</span></label>
        <label class="field"><input id="newUserIgn" placeholder=" "><span>IGN</span></label>
        <label class="field"><select id="newUserRole">${optionList(userRoles, "user")}</select><span>User role</span></label>
        <label class="field"><select id="newUserStaffRole">${optionList(staffRoles, "", "No staff role")}</select><span>Staff role</span></label>
        <button class="primary-button" type="submit">Create user</button>
        <p id="createUserMessage" class="message"></p>
      </form>
    </section>`;
  }

  function renderUserRow(p) {
    return `<tr>
      <td>${U().escapeHtml(p.full_name)}<br><span class="muted">${U().escapeHtml(p.ign || p.id)}</span></td>
      <td>${U().escapeHtml(p.role)}</td>
      <td>${U().escapeHtml(p.staff_role || "-")}</td>
      <td>${p.is_verified ? "Yes" : "No"}</td>
      <td><div class="toolbar">${renderUserActions(p)}</div></td>
    </tr>`;
  }

  function renderUserActions(p) {
    const actions = [];
    if (canEditBasicUsers()) actions.push(`<button class="secondary-button" type="button" data-edit-user="${p.id}">Edit</button>`);
    if (hasRole("superadmin") && p.staff_role !== "superadmin") actions.push(`<button class="secondary-button" type="button" data-reset-password="${p.id}">Password</button>`);
    if (p.staff_role !== "superadmin" && staffRoleChoicesForCurrentUser().length) {
      actions.push(`
        <select data-staff-role="${p.id}">
          <option value="">No staff</option>
          ${staffRoleChoicesForCurrentUser().map((r) => `<option value="${r}" ${p.staff_role === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
        <button class="secondary-button" type="button" data-save-role="${p.id}">Role</button>`);
    }
    if (canDeleteUsers(p)) actions.push(`<button class="secondary-button" type="button" data-delete-user="${p.id}">Delete</button>`);
    if (!actions.length) return '<span class="muted">Read only</span>';
    if (p.staff_role === "superadmin") return '<span class="pill">Protected</span>';
    return actions.join("");
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
        U().setMessage("#createUserMessage", "Creating user...");
        const staffRole = U().qs("#newUserStaffRole").value || null;
        if (staffRole && !canAssignStaffRole(staffRole)) throw new Error("You cannot assign that staff role.");
        const result = await callAdminUsersFunction("createUser", {
          email: U().qs("#newUserEmail").value.trim(),
          password: U().qs("#newUserPassword").value,
          full_name: U().qs("#newUserName").value.trim(),
          ign: U().qs("#newUserIgn").value.trim(),
          role: U().qs("#newUserRole").value,
          staff_role: staffRole
        });
        await logAction("create_user", result.user_id, { email: U().qs("#newUserEmail").value.trim(), staff_role: staffRole });
        U().setMessage("#createUserMessage", "User created.", "success");
        U().qs("#createUserForm").reset();
        users();
      } catch (error) {
        U().setMessage("#createUserMessage", error.message, "error");
      }
    });
  }

  function bindUserActions(profiles) {
    U().qsa("[data-edit-user]").forEach((button) => button.addEventListener("click", () => openUserEditor(profiles.find((p) => p.id === button.dataset.editUser))));
    U().qsa("[data-save-role]").forEach((button) => button.addEventListener("click", async () => {
      const targetId = button.dataset.saveRole;
      const role = U().qs(`[data-staff-role="${targetId}"]`).value || null;
      if (!canAssignStaffRole(role || "")) return alert("You cannot assign that staff role.");
      const { error } = await db().from("profiles").update({ staff_role: role }).eq("id", targetId).neq("staff_role", "superadmin");
      if (error) alert(error.message);
      else {
        await logAction("assign_staff_role", targetId, { staff_role: role });
        users();
      }
    }));
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
        <label class="field"><input id="editFullName" value="${U().escapeHtml(profile.full_name || "")}" required placeholder=" "><span>Full name</span></label>
        <label class="field"><input id="editIgn" value="${U().escapeHtml(profile.ign || "")}" placeholder=" "><span>IGN</span></label>
        <label class="field"><input id="editGameId" value="${U().escapeHtml(profile.game_id || "")}" placeholder=" "><span>Game ID</span></label>
        <label class="field"><input id="editServerId" value="${U().escapeHtml(profile.server_id || "")}" placeholder=" "><span>Server ID</span></label>
        <label class="field"><input id="editDob" type="date" value="${U().escapeHtml(profile.date_of_birth || "")}" placeholder=" "><span>Date of birth</span></label>
        <label class="field"><textarea id="editBio" rows="3" placeholder=" ">${U().escapeHtml(profile.bio || "")}</textarea><span>Bio</span></label>
        ${hasRole("superadmin", "useradmin") ? `<label class="field"><select id="editRole">${optionList(userRoles, profile.role)}</select><span>User role</span></label>` : ""}
        ${hasRole("superadmin", "useradmin") ? `<label class="check-row"><input id="editApproved" type="checkbox" ${profile.is_player_approved ? "checked" : ""}> <span>Player approved</span></label>` : ""}
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
        bio: U().qs("#editBio").value.trim()
      };
      if (hasRole("superadmin", "useradmin")) {
        payload.role = U().qs("#editRole").value;
        payload.is_player_approved = U().qs("#editApproved").checked;
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
    const { data, error } = await db().from("player_appeals").select("*, profiles(full_name, ign)").order("created_at", { ascending: false }).limit(50);
    if (error) return root.innerHTML = `<p class="message error">${U().escapeHtml(error.message)}</p>`;
    root.innerHTML = (data || []).map((a) => `
      <div class="item-card">
        <div class="section-heading">
          <div><strong>${U().escapeHtml(a.profiles?.full_name || a.user_id)}</strong><p class="muted">${U().escapeHtml(a.status)}</p></div>
          ${U().rolePills(a.preferred_roles)}
        </div>
        <p>${U().escapeHtml(a.note || "")}</p>
        ${canManagePlayerAppeals() && a.status === "pending" ? `
          <div class="toolbar">
            <button class="primary-button" type="button" data-approve-appeal="${a.appeal_id}" data-user="${a.user_id}">Approve</button>
            <button class="secondary-button" type="button" data-reject-appeal="${a.appeal_id}">Reject</button>
          </div>` : ""}
      </div>`).join("") || '<p class="muted">No appeals yet.</p>';
    U().qsa("[data-approve-appeal]").forEach((button) => button.addEventListener("click", async () => {
      await db().from("profiles").update({ role: "player", is_player_approved: true }).eq("id", button.dataset.user);
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
    const [requests, teams, playerProfiles] = await Promise.all([
      db().from("team_approval_requests").select("*, teams(team_name, team_tag)").order("created_at", { ascending: false }).limit(100),
      db().from("teams").select("*").order("created_at", { ascending: false }).limit(200),
      db().from("profiles").select("id, full_name, ign, role").in("role", ["player", "superadmin"]).order("full_name")
    ]);
    const players = playerProfiles.data || [];
    U().qs("#dashContent").innerHTML = `
      <section class="wide-panel"><h2>Team Approvals</h2><div class="list-stack">
        ${(requests.data || []).map(renderTeamRequest).join("") || '<p class="muted">No team approval requests.</p>'}
      </div></section>
      <section class="wide-panel">
        <div class="section-heading"><h2>Teams</h2>${canManageTeams() ? '<button id="createStaffTeam" class="primary-button" type="button">Create team</button>' : ""}</div>
        <div class="table-wrap"><table><thead><tr><th>Team</th><th>Status</th><th>Roster</th><th>Actions</th></tr></thead><tbody>
          ${(teams.data || []).map((team) => renderTeamRow(team)).join("")}
        </tbody></table></div>
      </section>`;
    bindTeamRequests();
    bindTeamActions(teams.data || [], players);
  }

  function renderTeamRequest(request) {
    return `<div class="item-card">
      <strong>${U().escapeHtml(request.teams?.team_name || request.team_id)}</strong>
      <p class="muted">${U().escapeHtml(request.status)} · ${U().formatDate(request.created_at)}</p>
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

  function bindTeamActions(teams, playersList) {
    U().qs("#createStaffTeam")?.addEventListener("click", () => openTeamEditor(null, playersList));
    U().qsa("[data-edit-team]").forEach((button) => button.addEventListener("click", () => openTeamEditor(teams.find((t) => t.team_id === button.dataset.editTeam), playersList)));
    U().qsa("[data-delete-team]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Delete this team?")) return;
      const { error } = await db().from("teams").delete().eq("team_id", button.dataset.deleteTeam);
      if (error) alert(error.message);
      else {
        await logAction("delete_team", button.dataset.deleteTeam, {});
        players();
      }
    }));
  }

  function openTeamEditor(team, playersList) {
    const isNew = !team;
    const roster = team?.roster || [];
    U().openModal(isNew ? "Create Team" : "Edit Team", `
      <form id="teamEditorForm" class="stack">
        <div class="form-grid">
          <label class="field"><input id="editTeamName" value="${U().escapeHtml(team?.team_name || "")}" required placeholder=" "><span>Team name</span></label>
          <label class="field"><input id="editTeamTag" value="${U().escapeHtml(team?.team_tag || "")}" maxlength="8" required placeholder=" "><span>Tag</span></label>
          <label class="field"><select id="editTeamStatus">${optionList(["recruiting", "pending", "approved", "disbanded"], team?.status || "recruiting")}</select><span>Status</span></label>
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
    const renderRows = () => {
      U().qs("#rosterEditorRows").innerHTML = workingRoster.map((member, index) => `
        <tr>
          <td>${U().escapeHtml(playerName(member.player_id))}</td>
          <td><select data-roster-role="${index}">${optionList(teamRoles, member.role)}</select></td>
          <td><button class="secondary-button" type="button" data-remove-roster="${index}">Remove</button></td>
        </tr>`).join("") || '<tr><td colspan="3" class="muted">No roster members yet.</td></tr>';
      U().qsa("[data-roster-role]").forEach((select) => select.addEventListener("change", () => workingRoster[Number(select.dataset.rosterRole)].role = select.value));
      U().qsa("[data-remove-roster]").forEach((button) => button.addEventListener("click", () => {
        workingRoster.splice(Number(button.dataset.removeRoster), 1);
        renderRows();
      }));
    };
    U().qs("#addRosterPlayer").innerHTML = optionList(playersList.map((p) => p.id), "", "Select player")
      .replaceAll(/<option value="([^"]+)"/g, (match, id) => `${match} data-label="${U().escapeHtml(playerName(id))}"`);
    Array.from(U().qs("#addRosterPlayer").options).forEach((option) => {
      if (option.value) option.textContent = playerName(option.value);
    });
    U().qs("#addRosterMember").addEventListener("click", () => {
      const playerId = U().qs("#addRosterPlayer").value;
      const role = U().qs("#addRosterRole").value;
      if (!playerId) return;
      if (workingRoster.some((member) => member.player_id === playerId)) return alert("Player already on roster.");
      if (workingRoster.length >= 8) return alert("Roster is already full.");
      workingRoster.push({ player_id: playerId, role, joined_at: new Date().toISOString() });
      renderRows();
    });
    U().qs("#teamEditorForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!workingRoster.length) return U().setMessage("#teamEditorMessage", "Add at least one roster member.", "error");
      const founder = workingRoster[0].player_id;
      const coach = workingRoster.find((member) => member.role === "coach")?.player_id || null;
      const payload = {
        team_name: U().qs("#editTeamName").value.trim(),
        team_tag: U().qs("#editTeamTag").value.trim().toUpperCase(),
        status: U().qs("#editTeamStatus").value,
        roster: workingRoster,
        founder_id: team?.founder_id || founder,
        team_leader_id: team?.team_leader_id || founder,
        coach_id: coach
      };
      const result = isNew
        ? await db().from("teams").insert(payload).select("team_id").single()
        : await db().from("teams").update(payload).eq("team_id", team.team_id).select("team_id").single();
      if (result.error) return U().setMessage("#teamEditorMessage", result.error.message, "error");
      await db().from("team_members").delete().eq("team_id", result.data.team_id);
      await db().from("team_members").insert(workingRoster.map((member) => ({ team_id: result.data.team_id, player_id: member.player_id, role: member.role })));
      await logAction(isNew ? "create_team" : "update_team", result.data.team_id, { team_name: payload.team_name });
      U().setMessage("#teamEditorMessage", "Team saved.", "success");
      players();
    });
    renderRows();
  }

  async function tournaments() {
    const [tournamentResult, teamResult, registrationResult, matchResult] = await Promise.all([
      db().from("tournaments").select("*").order("created_at", { ascending: false }),
      db().from("teams").select("team_id, team_name, team_tag").eq("status", "approved").order("team_name"),
      db().from("tournament_registrations").select("*, tournaments(name), teams(team_name, team_tag)").order("created_at", { ascending: false }).limit(100),
      db().from("matches").select("*, tournaments(name), team_a:teams!matches_team_a_id_fkey(team_name), team_b:teams!matches_team_b_id_fkey(team_name)").order("scheduled_start_utc", { ascending: false }).limit(120)
    ]);
    const tournamentList = tournamentResult.data || [];
    const teamsList = teamResult.data || [];
    U().qs("#dashContent").innerHTML = `
      ${canCreateTournaments() ? renderCreateTournamentPanel() : ""}
      ${canManageMatches() ? renderCreateMatchPanel(tournamentList, teamsList) : ""}
      ${canBroadcast() ? renderBroadcastPanel(tournamentList) : ""}
      <section class="wide-panel"><h2>Tournaments</h2><div class="table-wrap">${renderTournamentTable(tournamentList)}</div></section>
      <section class="wide-panel"><h2>Registrations</h2><div class="list-stack">${(registrationResult.data || []).map(renderRegistration).join("") || '<p class="muted">No registrations yet.</p>'}</div></section>
      <section class="wide-panel"><h2>Matches</h2><div class="table-wrap">${renderMatchTable(matchResult.data || [])}</div></section>`;
    bindTournamentForms();
    bindTournamentActions(tournamentList);
    bindRegistrationActions();
    bindMatchActions(matchResult.data || [], tournamentList, teamsList);
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

  function renderCreateMatchPanel(tournamentList, teamsList) {
    return `<section class="wide-panel"><h2>Create Match</h2><form id="createMatchForm" class="form-grid">
      <label class="field"><select id="matchTournament">${optionList(tournamentList.map((t) => t.tournament_id), "", "Select tournament")}</select><span>Tournament</span></label>
      <label class="field"><input id="matchRound" value="Round 1" required placeholder=" "><span>Round</span></label>
      <label class="field"><select id="matchTeamA">${optionList(teamsList.map((t) => t.team_id), "", "Team A")}</select><span>Team A</span></label>
      <label class="field"><select id="matchTeamB">${optionList(teamsList.map((t) => t.team_id), "", "Team B")}</select><span>Team B</span></label>
      <label class="field"><input id="matchSchedule" type="datetime-local" placeholder=" "><span>Schedule</span></label>
      <button class="primary-button" type="submit">Create match</button>
    </form></section>`;
  }

  function renderBroadcastPanel(tournamentList) {
    return `<section class="wide-panel"><h2>Broadcast To Feed</h2><form id="broadcastForm" class="form-grid">
      <label class="field"><input id="broadcastTitle" required placeholder=" "><span>Title</span></label>
      <label class="field"><select id="broadcastTournament">${optionList(tournamentList.map((t) => t.tournament_id), "", "No tournament link")}</select><span>Tournament link</span></label>
      <label class="field"><textarea id="broadcastContent" required placeholder=" "></textarea><span>Content</span></label>
      <label class="check-row"><input id="broadcastPinned" type="checkbox"> <span>Pin post</span></label>
      <button class="primary-button" type="submit">Post</button>
    </form></section>`;
  }

  function renderTournamentTable(tournamentList) {
    return `<table><thead><tr><th>Name</th><th>Status</th><th>Capacity</th><th>Start</th><th>Actions</th></tr></thead><tbody>
      ${tournamentList.map((t) => `<tr>
        <td><a href="tournament.html?id=${t.tournament_id}">${U().escapeHtml(t.name)}</a><br><span class="muted">${U().escapeHtml(t.game || "")}</span></td>
        <td>${U().escapeHtml(t.status)}</td>
        <td>${t.team_capacity}</td>
        <td>${U().formatDate(t.start_date)}</td>
        <td><div class="toolbar">
          ${canEditTournaments() ? `<button class="secondary-button" type="button" data-edit-tournament="${t.tournament_id}">Edit</button>` : ""}
          ${canDeleteTournaments() ? `<button class="secondary-button" type="button" data-delete-tournament="${t.tournament_id}">Delete</button>` : ""}
        </div></td>
      </tr>`).join("")}
    </tbody></table>`;
  }

  function renderRegistration(registration) {
    return `<div class="item-card">
      <strong>${U().escapeHtml(registration.teams?.team_name || registration.team_id)}</strong>
      <p class="muted">${U().escapeHtml(registration.tournaments?.name || registration.tournament_id)} · ${U().escapeHtml(registration.status)}</p>
      ${canManageMatches() && registration.status === "pending" ? `
        <div class="toolbar">
          <button class="primary-button" type="button" data-approve-registration="${registration.registration_id}">Approve</button>
          <button class="secondary-button" type="button" data-reject-registration="${registration.registration_id}">Reject</button>
        </div>` : ""}
    </div>`;
  }

  function renderMatchTable(matches) {
    return `<table><thead><tr><th>Tournament</th><th>Round</th><th>Teams</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead><tbody>
      ${matches.map((m) => `<tr>
        <td>${U().escapeHtml(m.tournaments?.name || m.tournament_id)}</td>
        <td>${U().escapeHtml(m.round_name)}</td>
        <td>${U().escapeHtml(m.team_a?.team_name || "TBD")} vs ${U().escapeHtml(m.team_b?.team_name || "TBD")}</td>
        <td>${U().escapeHtml(m.status)}</td>
        <td>${m.team_a_score ?? 0} - ${m.team_b_score ?? 0}</td>
        <td><div class="toolbar">
          ${canManageMatches() ? `<button class="secondary-button" type="button" data-edit-match="${m.match_id}">Edit</button>` : ""}
          ${canDeleteMatches() ? `<button class="secondary-button" type="button" data-delete-match="${m.match_id}">Delete</button>` : ""}
        </div></td>
      </tr>`).join("")}
    </tbody></table>`;
  }

  function bindTournamentForms() {
    const teamNameFromOption = async (selector, teamsList) => {
      U().qsa(`${selector} option`).forEach((option) => {
        const team = teamsList.find((t) => t.team_id === option.value);
        if (team) option.textContent = `${team.team_name} [${team.team_tag}]`;
      });
    };
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
        created_by: me().id
      };
      const { data, error } = await db().from("tournaments").insert(payload).select("tournament_id").single();
      if (error) alert(error.message);
      else {
        await logAction("create_tournament", data.tournament_id, payload);
        tournaments();
      }
    });
    U().qs("#createMatchForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        tournament_id: U().qs("#matchTournament").value,
        round_name: U().qs("#matchRound").value.trim(),
        team_a_id: U().qs("#matchTeamA").value || null,
        team_b_id: U().qs("#matchTeamB").value || null,
        scheduled_start_utc: U().qs("#matchSchedule").value ? new Date(U().qs("#matchSchedule").value).toISOString() : null,
        status: "scheduled"
      };
      const { data, error } = await db().from("matches").insert(payload).select("match_id").single();
      if (error) alert(error.message);
      else {
        await logAction("create_match", data.match_id, payload);
        tournaments();
      }
    });
    U().qs("#broadcastForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        author_id: me().id,
        author_role: me().staff_role,
        title: U().qs("#broadcastTitle").value.trim(),
        content: U().qs("#broadcastContent").value.trim(),
        tournament_id: U().qs("#broadcastTournament").value || null,
        is_pinned: U().qs("#broadcastPinned").checked
      };
      const { data, error } = await db().from("feed_posts").insert(payload).select("post_id").single();
      if (error) alert(error.message);
      else {
        await logAction("broadcast_feed_post", data.post_id, payload);
        tournaments();
      }
    });
  }

  function bindTournamentActions(tournamentList) {
    U().qsa("[data-edit-tournament]").forEach((button) => button.addEventListener("click", () => openTournamentEditor(tournamentList.find((t) => t.tournament_id === button.dataset.editTournament))));
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
        registration_deadline: U().qs("#editTourDeadline").value
      };
      const { error } = await db().from("tournaments").update(payload).eq("tournament_id", tournament.tournament_id);
      U().setMessage("#editTournamentMessage", error ? error.message : "Tournament saved.", error ? "error" : "success");
      if (!error) {
        await logAction("update_tournament", tournament.tournament_id, payload);
        tournaments();
      }
    });
  }

  function bindRegistrationActions() {
    U().qsa("[data-approve-registration]").forEach((button) => button.addEventListener("click", async () => {
      await db().from("tournament_registrations").update({ status: "approved", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("registration_id", button.dataset.approveRegistration);
      await logAction("approve_tournament_registration", button.dataset.approveRegistration, {});
      tournaments();
    }));
    U().qsa("[data-reject-registration]").forEach((button) => button.addEventListener("click", async () => {
      await db().from("tournament_registrations").update({ status: "rejected", reviewed_by: me().id, reviewed_at: new Date().toISOString() }).eq("registration_id", button.dataset.rejectRegistration);
      await logAction("reject_tournament_registration", button.dataset.rejectRegistration, {});
      tournaments();
    }));
  }

  function bindMatchActions(matches, tournamentList, teamsList) {
    [U().qs("#matchTournament"), U().qs("#broadcastTournament")].forEach((select) => {
      if (!select) return;
      Array.from(select.options).forEach((option) => {
        const tournament = tournamentList.find((t) => t.tournament_id === option.value);
        if (tournament) option.textContent = tournament.name;
      });
    });
    [U().qs("#matchTeamA"), U().qs("#matchTeamB")].forEach((select) => {
      if (!select) return;
      Array.from(select.options).forEach((option) => {
        const team = teamsList.find((t) => t.team_id === option.value);
        if (team) option.textContent = `${team.team_name} [${team.team_tag}]`;
      });
    });
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
    const { data, error } = await db().from("audit_logs").select("*").order("created_at", { ascending: false }).limit(150);
    U().qs("#dashContent").innerHTML = error ? `<p class="message error">${U().escapeHtml(error.message)}</p>` : `
      <section class="table-wrap"><table><thead><tr><th>Action</th><th>Target</th><th>Details</th><th>Date</th></tr></thead><tbody>
      ${(data || []).map((log) => `<tr><td>${U().escapeHtml(log.action)}</td><td>${U().escapeHtml(log.target_id || "-")}</td><td><code>${U().escapeHtml(JSON.stringify(log.details || {}))}</code></td><td>${U().formatDate(log.created_at)}</td></tr>`).join("")}
      </tbody></table></section>`;
  }

  async function activity() {
    const { data } = await db().from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8);
    U().qs("#activityPanel").innerHTML = `<h2>Activity</h2><div class="list-stack">${(data || []).map((a) => `<div><strong>${U().escapeHtml(a.action)}</strong><p class="muted">${U().formatDate(a.created_at)}</p></div>`).join("") || '<p class="muted">No activity yet.</p>'}</div>`;
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    if (document.body.dataset.page !== "dashboard" || !window.currentProfile) return;
    renderSidebar();
    activity();
    startRealtime();
    U().qs("#switchUserView")?.addEventListener("click", () => window.open("feed.html", "_blank"));
    U().qs("#staffLogout")?.addEventListener("click", () => window.TPAuth.logout());
  }, 350));
})();
