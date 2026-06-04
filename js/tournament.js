(function () {
  let tournamentListRealtime = false;
  let tournamentDetailRealtimeId = null;

  async function loadTournamentList() {
    const U = window.TPUtils;
    const root = U.qs("#tournamentList");
    if (!root) return;
    const { data, error } = await window.tpSupabase.from("tournaments").select("*").order("start_date", { ascending: true });
    if (error) return root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    root.innerHTML = (data || []).map((t) => `
      <article class="item-card">
        <p class="eyebrow">${U.escapeHtml(t.status)}</p>
        <h2>${U.escapeHtml(t.name)}</h2>
        <p>${U.escapeHtml(t.description || "")}</p>
        <div class="pill-row"><span class="pill">${t.team_capacity} teams</span><span class="pill">${U.formatDate(t.start_date)}</span></div>
        <a class="secondary-button" href="tournament.html?id=${t.tournament_id}" style="margin-top:12px">Details</a>
      </article>`).join("") || '<p class="muted">No tournaments yet.</p>';
  }

  async function loadTournamentDetail() {
    const U = window.TPUtils;
    const id = U.getParam("id");
    const detail = U.qs("#tournamentDetail");
    if (!detail || !id) return;
    const { data: tournament, error } = await window.tpSupabase.from("tournaments").select("*").eq("tournament_id", id).single();
    if (error) return detail.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    detail.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">${U.escapeHtml(tournament.status)}</p><h1>${U.escapeHtml(tournament.name)}</h1></div>
        ${window.currentProfile ? '<button id="registerTournament" class="secondary-button" type="button">Request ticket</button>' : ""}
      </div>
      <p>${U.escapeHtml(tournament.description || "")}</p>
      <div class="pill-row"><span class="pill">${U.escapeHtml(tournament.game || "Game")}</span><span class="pill">${tournament.team_capacity} teams</span><span class="pill">${U.formatDate(tournament.start_date)}</span></div>`;
    U.qs("#registerTournament")?.addEventListener("click", () => registerTeam(tournament.tournament_id));
    await loadMatches(tournament);
    startTournamentDetailRealtime(id, tournament);
  }

  async function loadMatches(tournament) {
    const U = window.TPUtils;
    const { data } = await window.tpSupabase
      .from("matches")
      .select("*, team_a:teams!matches_team_a_id_fkey(team_name,team_tag), team_b:teams!matches_team_b_id_fkey(team_name,team_tag)")
      .eq("tournament_id", tournament.tournament_id)
      .order("scheduled_start_utc", { ascending: true });
    const matches = (data || []).map((m) => ({
      ...m,
      team_a_name: m.team_a?.team_name || "TBD",
      team_b_name: m.team_b?.team_name || "TBD"
    }));
    const rounds = matches.length
      ? window.TPBracket.groupMatchesByRound(matches)
      : window.TPBracket.scheduleMatches(window.TPBracket.generateSingleElimination([], { capacity: tournament.team_capacity }), tournament.start_date, tournament.max_matches_per_day);
    window.TPBracket.renderBracket(U.qs("#bracketRoot"), rounds);
    const list = U.qs("#matchList");
    if (list) list.innerHTML = matches.map((m) => `
      <div class="item-card">
        <strong>${U.escapeHtml(m.round_name)}</strong>
        <p>${U.escapeHtml(m.team_a_name)} ${m.team_a_score ?? "-"} vs ${m.team_b_score ?? "-"} ${U.escapeHtml(m.team_b_name)}</p>
        <div class="pill-row"><span class="pill">${U.escapeHtml(m.status)}</span><span class="pill">${U.escapeHtml(m.phase || "phase")}</span><span class="pill">BO${m.best_of || 1}</span></div>
      </div>`).join("") || '<p class="muted">No tie sheet yet. Approved tickets will appear here automatically.</p>';
  }

  async function registerTeam(tournamentId) {
    const U = window.TPUtils;
    const { data: teams } = await window.tpSupabase.from("teams").select("team_id, team_name").eq("team_leader_id", window.currentProfile.id).eq("status", "approved");
    if (!teams?.length) return alert("You need to lead an approved team before registering.");
    const team = teams[0];
    const { data: existing } = await window.tpSupabase
      .from("tournament_registrations")
      .select("status")
      .eq("tournament_id", tournamentId)
      .eq("team_id", team.team_id)
      .maybeSingle();
    if (existing) return alert(`Your tournament ticket is already ${existing.status}.`);
    if (!confirm(`Request a tournament ticket for ${team.team_name}?`)) return;
    const { error } = await window.tpSupabase.from("tournament_registrations").insert({
      tournament_id: tournamentId,
      team_id: team.team_id,
      requested_by: window.currentProfile.id
    });
    if (error) alert(error.message);
    else alert(`Tournament ticket requested for ${team.team_name}.`);
  }

  function startTournamentListRealtime() {
    if (tournamentListRealtime) return;
    tournamentListRealtime = true;
    window.tpSupabase.channel("tournaments:list")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, loadTournamentList)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, loadTournamentList)
      .subscribe();
  }

  function startTournamentDetailRealtime(id, tournament) {
    if (tournamentDetailRealtimeId === id) return;
    tournamentDetailRealtimeId = id;
    window.tpSupabase.channel(`tournaments:detail:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `tournament_id=eq.${id}` }, loadTournamentDetail)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, () => loadMatches(tournament))
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_registrations", filter: `tournament_id=eq.${id}` }, loadTournamentDetail)
      .subscribe();
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    if (document.body.dataset.page === "tournaments") {
      loadTournamentList();
      startTournamentListRealtime();
    }
    if (document.body.dataset.page === "tournament") loadTournamentDetail();
  }, 250));
})();
