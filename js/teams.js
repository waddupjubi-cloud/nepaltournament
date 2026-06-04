(function () {
  async function loadTeams() {
    const U = window.TPUtils;
    const root = U.qs("#teamList");
    if (!root || !window.currentProfile) return;
    root.innerHTML = U.spinner();
    const { data, error } = await window.tpSupabase.from("teams").select("*").in("status", ["approved", "recruiting", "pending"]).order("created_at", { ascending: false });
    if (error) return root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    root.innerHTML = (data || []).map((team) => `
      <article class="item-card">
        <h2>${U.escapeHtml(team.team_name)} <span class="muted">[${U.escapeHtml(team.team_tag)}]</span></h2>
        <p class="muted">${(team.roster || []).length} / 8 members</p>
        <div class="pill-row"><span class="pill">${U.escapeHtml(team.status)}</span></div>
        <a class="secondary-button" href="team.html?id=${team.team_id}" style="margin-top:12px">Open team</a>
      </article>`).join("") || '<p class="muted">No teams yet.</p>';
  }

  async function createTeam(event) {
    event.preventDefault();
    const U = window.TPUtils;
    const file = U.qs("#teamLogo").files[0];
    let logoUrl = null;
    if (file) {
      const path = `${window.currentProfile.id}/${Date.now()}-${file.name}`;
      const uploaded = await window.tpSupabase.storage.from("team-logos").upload(path, file);
      if (uploaded.error) return alert(uploaded.error.message);
      logoUrl = window.tpSupabase.storage.from("team-logos").getPublicUrl(path).data.publicUrl;
    }
    const roster = [{ player_id: window.currentProfile.id, role: "founder", joined_at: new Date().toISOString() }];
    const { data, error } = await window.tpSupabase.from("teams").insert({
      team_name: U.qs("#teamName").value.trim(),
      team_tag: U.qs("#teamTag").value.trim().toUpperCase(),
      logo_url: logoUrl,
      founder_id: window.currentProfile.id,
      team_leader_id: window.currentProfile.id,
      status: "recruiting",
      roster
    }).select("team_id").single();
    if (error) return alert(error.message);
    location.href = `team.html?id=${data.team_id}`;
  }

  async function loadTeamDetail() {
    const U = window.TPUtils;
    const root = U.qs("#teamDetail");
    if (!root) return;
    const id = U.getParam("id");
    const { data: team, error } = await window.tpSupabase.from("teams").select("*").eq("team_id", id).single();
    if (error) return root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    const playerIds = (team.roster || []).map((m) => m.player_id);
    const { data: profiles } = playerIds.length
      ? await window.tpSupabase.from("profiles").select("id, full_name, ign").in("id", playerIds)
      : { data: [] };
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const canManage = [team.founder_id, team.team_leader_id, team.coach_id].includes(window.currentProfile.id);
    root.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">${U.escapeHtml(team.status)}</p><h1>${U.escapeHtml(team.team_name)} [${U.escapeHtml(team.team_tag)}]</h1></div>
        ${canManage && (team.roster || []).length >= 5 ? '<button id="submitTeamApproval" class="primary-button" type="button">Submit approval</button>' : ""}
      </div>
      <h2>Roster</h2>
      <div class="list-stack">
        ${(team.roster || []).map((m) => {
          const p = profileMap.get(m.player_id) || {};
          return `<div class="item-card"><strong>${U.escapeHtml(p.full_name || m.player_id)}</strong><p class="muted">${U.escapeHtml(p.ign || "")}</p><span class="pill">${U.escapeHtml(m.role)}</span></div>`;
        }).join("")}
      </div>`;
    U.qs("#submitTeamApproval")?.addEventListener("click", async () => {
      const { error: requestError } = await window.tpSupabase.from("team_approval_requests").insert({ team_id: id, requested_by: window.currentProfile.id });
      if (requestError) alert(requestError.message);
      else alert("Approval request sent to Player staff.");
    });
    window.TPMessages.renderTeamChat(id);
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    const page = document.body.dataset.page;
    if (page === "teams") loadTeams();
    if (page === "create-team") window.TPUtils.qs("#createTeamForm")?.addEventListener("submit", createTeam);
    if (page === "team") loadTeamDetail();
  }, 250));
})();
