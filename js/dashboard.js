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

  function hasRole(...roles) {
    return roles.includes(window.currentProfile?.staff_role);
  }

  function renderSidebar() {
    const U = window.TPUtils;
    const modules = roleModules[window.currentProfile.staff_role] || [];
    const root = U.qs("#dashSidebar");
    root.innerHTML = `<div class="dash-brand"><span>Tournament Players</span></div>` + modules.map((mod, index) => `
      <button class="dash-nav-button ${index === 0 ? "is-active" : ""}" type="button" data-module="${mod}">
        <i class="fa-solid ${labels[mod][0]}"></i><span>${labels[mod][1]}</span>
      </button>`).join("");
    U.qsa("[data-module]", root).forEach((button) => {
      button.addEventListener("click", () => {
        U.qsa("[data-module]", root).forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        loadModule(button.dataset.module);
      });
    });
    loadModule(modules[0]);
  }

  async function loadModule(module) {
    const U = window.TPUtils;
    U.qs("#dashTitle").textContent = labels[module]?.[1] || "Dashboard";
    if (module === "overview") return overview();
    if (module === "users") return users();
    if (module === "players") return players();
    if (module === "tournaments") return tournaments();
    if (module === "audit") return audit();
  }

  async function overview() {
    const U = window.TPUtils;
    const root = U.qs("#dashContent");
    root.innerHTML = `<div class="card-grid" id="statCards"></div><section class="wide-panel"><canvas id="overviewChart" height="120"></canvas></section>`;
    const tables = ["profiles", "teams", "tournaments", "matches"];
    const counts = {};
    for (const table of tables) {
      const { count } = await window.tpSupabase.from(table).select("*", { count: "exact", head: true });
      counts[table] = count || 0;
    }
    U.qs("#statCards").innerHTML = `
      <article class="item-card"><h2>${counts.profiles}</h2><p>Users</p></article>
      <article class="item-card"><h2>${counts.teams}</h2><p>Teams</p></article>
      <article class="item-card"><h2>${counts.tournaments}</h2><p>Tournaments</p></article>
      <article class="item-card"><h2>${counts.matches}</h2><p>Matches</p></article>`;
    if (window.Chart) {
      new Chart(U.qs("#overviewChart"), {
        type: "bar",
        data: { labels: ["Users", "Teams", "Tournaments", "Matches"], datasets: [{ label: "Totals", data: [counts.profiles, counts.teams, counts.tournaments, counts.matches], backgroundColor: ["#0066cc", "#ffcc00", "#00cc44", "#8b0000"] }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
  }

  async function users() {
    const U = window.TPUtils;
    const { data, error } = await window.tpSupabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) return U.qs("#dashContent").innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    U.qs("#dashContent").innerHTML = `
      <section class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Staff</th><th>Actions</th></tr></thead><tbody>
      ${data.map((p) => `
        <tr>
          <td>${U.escapeHtml(p.full_name)}<br><span class="muted">${U.escapeHtml(p.ign || p.id)}</span></td>
          <td>${U.escapeHtml(p.role)}</td>
          <td>${U.escapeHtml(p.staff_role || "-")}</td>
          <td>${renderUserActions(p)}</td>
        </tr>`).join("")}
      </tbody></table></section>
      <section class="wide-panel"><h2>Player Appeals</h2><div id="appealsList" class="list-stack"></div></section>`;
    bindUserActions();
    loadAppeals();
  }

  function renderUserActions(p) {
    if (p.staff_role === "superadmin") return '<span class="pill">Protected</span>';
    const admin = hasRole("superadmin", "useradmin", "playeradmin", "tournamentadmin");
    if (!admin) return '<span class="muted">Read only</span>';
    return `
      <select data-staff-role="${p.id}">
        <option value="">No staff</option>
        ${["usermod","playermod","tournamentmod","useradmin","playeradmin","tournamentadmin"].map((r) => `<option value="${r}" ${p.staff_role === r ? "selected" : ""}>${r}</option>`).join("")}
      </select>
      <button class="secondary-button" type="button" data-save-role="${p.id}">Save</button>`;
  }

  function bindUserActions() {
    const U = window.TPUtils;
    U.qsa("[data-save-role]").forEach((button) => button.addEventListener("click", async () => {
      const targetId = button.dataset.saveRole;
      const role = U.qs(`[data-staff-role="${targetId}"]`).value || null;
      const { error } = await window.tpSupabase.from("profiles").update({ staff_role: role }).eq("id", targetId).neq("staff_role", "superadmin");
      if (error) alert(error.message);
      else users();
    }));
  }

  async function loadAppeals() {
    const U = window.TPUtils;
    const root = U.qs("#appealsList");
    if (!root) return;
    const { data } = await window.tpSupabase.from("player_appeals").select("*, profiles(full_name, ign)").eq("status", "pending").order("created_at");
    root.innerHTML = (data || []).map((a) => `
      <div class="item-card">
        <strong>${U.escapeHtml(a.profiles?.full_name || a.user_id)}</strong>
        ${U.rolePills(a.preferred_roles)}
        <p>${U.escapeHtml(a.note || "")}</p>
        ${hasRole("superadmin", "useradmin") ? `<button class="primary-button" type="button" data-approve-appeal="${a.appeal_id}" data-user="${a.user_id}">Approve</button>` : ""}
      </div>`).join("") || '<p class="muted">No pending appeals.</p>';
    U.qsa("[data-approve-appeal]").forEach((button) => button.addEventListener("click", async () => {
      await window.tpSupabase.from("profiles").update({ role: "player", is_player_approved: true }).eq("id", button.dataset.user);
      await window.tpSupabase.from("player_appeals").update({ status: "approved", reviewed_by: window.currentProfile.id }).eq("appeal_id", button.dataset.approveAppeal);
      loadAppeals();
    }));
  }

  async function players() {
    const U = window.TPUtils;
    const { data } = await window.tpSupabase.from("team_approval_requests").select("*, teams(team_name, team_tag)").eq("status", "pending").order("created_at");
    U.qs("#dashContent").innerHTML = `
      <section class="wide-panel"><h2>Team Approvals</h2><div class="list-stack">
      ${(data || []).map((r) => `
        <div class="item-card"><strong>${U.escapeHtml(r.teams?.team_name || r.team_id)}</strong>
        <p class="muted">${U.escapeHtml(r.teams?.team_tag || "")}</p>
        <button class="primary-button" type="button" data-approve-team="${r.request_id}" data-team="${r.team_id}">Approve</button></div>`).join("") || '<p class="muted">No pending team approvals.</p>'}
      </div></section>`;
    U.qsa("[data-approve-team]").forEach((button) => button.addEventListener("click", async () => {
      await window.tpSupabase.from("teams").update({ status: "approved", approved_by: window.currentProfile.id }).eq("team_id", button.dataset.team);
      await window.tpSupabase.from("team_approval_requests").update({ status: "approved", reviewed_by: window.currentProfile.id }).eq("request_id", button.dataset.approveTeam);
      players();
    }));
  }

  async function tournaments() {
    const U = window.TPUtils;
    const canCreate = hasRole("superadmin", "tournamentadmin");
    const { data } = await window.tpSupabase.from("tournaments").select("*").order("created_at", { ascending: false });
    U.qs("#dashContent").innerHTML = `
      ${canCreate ? `<section class="wide-panel"><h2>Create Tournament</h2><form id="createTournamentForm" class="form-grid">
        <label class="field"><input id="tourName" required placeholder=" "><span>Name</span></label>
        <label class="field"><input id="tourGame" required placeholder=" "><span>Game</span></label>
        <label class="field"><select id="tourCapacity"><option>4</option><option>8</option><option>16</option><option>32</option><option>64</option><option>128</option></select><span>Capacity</span></label>
        <label class="field"><input id="tourStart" type="date" required placeholder=" "><span>Start date</span></label>
        <label class="field"><textarea id="tourDescription" placeholder=" "></textarea><span>Description</span></label>
        <button class="primary-button" type="submit">Create</button>
      </form></section>` : ""}
      <section class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Capacity</th><th>Start</th></tr></thead><tbody>
      ${(data || []).map((t) => `<tr><td><a href="tournament.html?id=${t.tournament_id}">${U.escapeHtml(t.name)}</a></td><td>${U.escapeHtml(t.status)}</td><td>${t.team_capacity}</td><td>${U.formatDate(t.start_date)}</td></tr>`).join("")}
      </tbody></table></section>`;
    U.qs("#createTournamentForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const { error } = await window.tpSupabase.from("tournaments").insert({
        name: U.qs("#tourName").value.trim(),
        game: U.qs("#tourGame").value.trim(),
        description: U.qs("#tourDescription").value.trim(),
        team_capacity: Number(U.qs("#tourCapacity").value),
        start_date: U.qs("#tourStart").value,
        registration_deadline: U.qs("#tourStart").value,
        status: "registration",
        created_by: window.currentProfile.id
      });
      if (error) alert(error.message); else tournaments();
    });
  }

  async function audit() {
    const U = window.TPUtils;
    const { data, error } = await window.tpSupabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
    U.qs("#dashContent").innerHTML = error ? `<p class="message error">${U.escapeHtml(error.message)}</p>` : `
      <section class="table-wrap"><table><thead><tr><th>Action</th><th>Target</th><th>Details</th><th>Date</th></tr></thead><tbody>
      ${(data || []).map((log) => `<tr><td>${U.escapeHtml(log.action)}</td><td>${U.escapeHtml(log.target_id)}</td><td><code>${U.escapeHtml(JSON.stringify(log.details || {}))}</code></td><td>${U.formatDate(log.created_at)}</td></tr>`).join("")}
      </tbody></table></section>`;
  }

  async function activity() {
    const U = window.TPUtils;
    const { data } = await window.tpSupabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8);
    U.qs("#activityPanel").innerHTML = `<h2>Activity</h2><div class="list-stack">${(data || []).map((a) => `<div><strong>${U.escapeHtml(a.action)}</strong><p class="muted">${U.formatDate(a.created_at)}</p></div>`).join("") || '<p class="muted">No activity yet.</p>'}</div>`;
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    if (document.body.dataset.page !== "dashboard" || !window.currentProfile) return;
    renderSidebar();
    activity();
    window.TPUtils.qs("#switchUserView")?.addEventListener("click", () => window.open("feed.html", "_blank"));
    window.TPUtils.qs("#staffLogout")?.addEventListener("click", () => window.TPAuth.logout());
  }, 350));
})();
