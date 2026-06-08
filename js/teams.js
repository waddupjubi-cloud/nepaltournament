(function () {
  let teamsListRealtime = false;
  let teamDetailRealtimeId = null;

  function renderTeamLogo(team, eager = false) {
    const U = window.TPUtils;
    if (team.logo_url) {
      return `<img class="team-logo" src="${U.escapeHtml(team.logo_url)}" alt="${U.escapeHtml(team.team_name)} logo" loading="${eager ? "eager" : "lazy"}" decoding="async">`;
    }
    return `<span class="team-logo team-logo-fallback" aria-hidden="true">${U.escapeHtml(String(team.team_tag || team.team_name || "TP").slice(0, 2).toUpperCase())}</span>`;
  }

  async function loadTeams() {
    const U = window.TPUtils;
    const root = U.qs("#teamList");
    if (!root || !window.currentProfile) return;
    root.innerHTML = U.spinner();
    const { data, error } = await window.tpSupabase.from("teams").select("team_id,team_name,team_tag,logo_url,status,roster,created_at").in("status", ["approved", "recruiting", "pending"]).order("created_at", { ascending: false });
    if (error) return root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    root.innerHTML = (data || []).map((team) => `
      <article class="item-card">
        <div class="team-card-head">${renderTeamLogo(team)}<div><h2>${U.escapeHtml(team.team_name)}</h2><p class="muted">[${U.escapeHtml(team.team_tag)}] - ${(team.roster || []).length} / 8 members</p></div></div>
        <div class="pill-row"><span class="pill">${U.escapeHtml(team.status)}</span></div>
        <a class="secondary-button" href="team.html?id=${team.team_id}" style="margin-top:12px">Open team</a>
      </article>`).join("") || '<p class="muted">No teams yet.</p>';
  }

  async function createTeam(event) {
    event.preventDefault();
    const U = window.TPUtils;
    const teamName = U.qs("#teamName").value.trim();
    if (!confirm(`Create team "${teamName}"?`)) return;
    const file = U.qs("#teamLogo").files[0];
    let logoUrl = null;
    if (file) {
      if (!file.type.startsWith("image/")) return alert("Choose a valid image file.");
      if (file.size > 2 * 1024 * 1024) return alert("Keep the team logo under 2 MB for faster loading.");
      const extension = String(file.name.split(".").pop() || "img").replace(/[^a-z0-9]/gi, "").toLowerCase() || "img";
      const path = `${window.currentProfile.id}/${Date.now()}.${extension}`;
      const uploaded = await window.tpSupabase.storage.from("team-logos").upload(path, file, { cacheControl: "31536000", upsert: false });
      if (uploaded.error) return alert(uploaded.error.message);
      logoUrl = window.tpSupabase.storage.from("team-logos").getPublicUrl(path).data.publicUrl;
    }
    const roster = [{ player_id: window.currentProfile.id, role: "founder", joined_at: new Date().toISOString() }];
    const { data, error } = await window.tpSupabase.from("teams").insert({
      team_name: teamName,
      team_tag: U.qs("#teamTag").value.trim().toUpperCase(),
      logo_url: logoUrl,
      founder_id: window.currentProfile.id,
      team_leader_id: window.currentProfile.id,
      status: "recruiting",
      roster
    }).select("team_id").single();
    if (error) return alert(error.message);
    alert(`Team created: ${teamName}`);
    location.href = `team.html?id=${data.team_id}`;
  }

  async function loadTeamDetail() {
    const U = window.TPUtils;
    const root = U.qs("#teamDetail");
    if (!root) return;
    const id = U.getParam("id");
    if (!id) return root.innerHTML = '<p class="message error">No team was selected.</p>';
    root.innerHTML = U.spinner();
    const { data: team, error } = await window.tpSupabase.from("teams").select("*").eq("team_id", id).single();
    if (error) return root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    U.updateDocumentMeta(team.team_name, `${team.team_name} [${team.team_tag}] roster and team details.`);
    const playerIds = (team.roster || []).map((m) => m.player_id);
    const { data: profiles } = playerIds.length
      ? await window.tpSupabase.from("profiles").select("id, full_name, ign").in("id", playerIds)
      : { data: [] };
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const canManage = [team.founder_id, team.team_leader_id, team.coach_id].includes(window.currentProfile.id);
    root.innerHTML = `
      <div class="section-heading">
        <div class="team-card-head">${renderTeamLogo(team, true)}<div><p class="eyebrow">${U.escapeHtml(team.status)}</p><h1>${U.escapeHtml(team.team_name)} [${U.escapeHtml(team.team_tag)}]</h1></div></div>
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
      if (!confirm("Submit this team for staff approval?")) return;
      const { error: requestError } = await window.tpSupabase.from("team_approval_requests").insert({ team_id: id, requested_by: window.currentProfile.id });
      if (requestError) alert(requestError.message);
      else alert("Team approval request created.");
    });
    window.TPMessages.renderTeamChat(id);
  }

  function startTeamsRealtime() {
    if (teamsListRealtime) return;
    teamsListRealtime = true;
    window.tpSupabase.channel("teams:list")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, loadTeams)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_approval_requests" }, loadTeams)
      .subscribe();
  }

  function startTeamDetailRealtime(teamId) {
    if (teamDetailRealtimeId === teamId) return;
    teamDetailRealtimeId = teamId;
    window.tpSupabase.channel(`teams:detail:${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `team_id=eq.${teamId}` }, loadTeamDetail)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members", filter: `team_id=eq.${teamId}` }, loadTeamDetail)
      .subscribe();
  }

  window.TPUtils.onAuthReady(() => {
    const page = document.body.dataset.page;
    if (page === "teams") {
      loadTeams();
      startTeamsRealtime();
    }
    if (page === "create-team") window.TPUtils.qs("#createTeamForm")?.addEventListener("submit", createTeam);
    if (page === "team") {
      loadTeamDetail();
      startTeamDetailRealtime(window.TPUtils.getParam("id"));
    }
  });
})();
