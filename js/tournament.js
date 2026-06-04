(function () {
  let tournamentListRealtime = false;
  let tournamentDetailRealtimeId = null;
  let phaseSwiper = null;
  let alertTimer = null;
  const alertedMatches = new Set(JSON.parse(localStorage.getItem("tp-match-alerted") || "[]"));

  function U() {
    return window.TPUtils;
  }

  function db() {
    return window.tpSupabase;
  }

  function saveAlertState() {
    localStorage.setItem("tp-match-alerted", JSON.stringify([...alertedMatches].slice(-80)));
  }

  function phasePlans(capacity) {
    const plans = {
      128: [
        ["round_128", "Phase 1", "128 teams - BO1 single elimination", "64 survive"],
        ["round_64", "Phase 2", "64 teams - BO1 single elimination", "32 survive"],
        ["group_stage", "Phase 3", "32 teams - groups of 4", "Top 1 from each group"],
        ["double_elim", "Phase 4", "8 teams - BO3 double elimination", "Upper and lower bracket"],
        ["grand_final", "Final", "Grand Final", "Champion decided"]
      ],
      64: [
        ["round_64", "Phase 1", "64 teams - BO1 single elimination", "32 survive"],
        ["group_stage", "Phase 2", "32 teams - groups of 4", "Top 1 from each group"],
        ["double_elim", "Phase 3", "8 teams - BO3 double elimination", "Upper and lower bracket"],
        ["grand_final", "Final", "Grand Final", "Champion decided"]
      ],
      32: [
        ["group_stage", "Phase 1", "32 teams - groups of 4", "Top 1 from each group"],
        ["double_elim", "Phase 2", "8 teams - BO3 double elimination", "Upper and lower bracket"],
        ["grand_final", "Final", "Grand Final", "Champion decided"]
      ],
      16: [
        ["round_16", "Phase 1", "16 teams - BO1 knockout filter", "8 survive"],
        ["double_elim", "Phase 2", "8 teams - BO3 double elimination", "Upper and lower bracket"],
        ["grand_final", "Final", "Grand Final", "Champion decided"]
      ],
      8: [
        ["double_elim", "Phase 1", "8 teams - BO3 double elimination", "Upper and lower bracket"],
        ["grand_final", "Final", "Grand Final", "Champion decided"]
      ]
    };
    return plans[capacity] || plans[16];
  }

  function matchPhaseKey(match) {
    if (match.phase === "playoff_upper_r1" || match.phase === "playoff_continuation") return "double_elim";
    if (match.phase === "round_32") return "group_stage";
    return match.phase || "scheduled";
  }

  function currentPhaseIndex(plan, matches, tournament) {
    if (tournament.status === "completed") return plan.length - 1;
    const now = Date.now();
    const liveIndex = plan.findIndex(([key]) => matches.some((match) => phaseMatchesKey(key, match) && ["checkin_open", "live", "paused"].includes(match.status)));
    if (liveIndex >= 0) return liveIndex;
    const started = plan.map(([key], index) => ({
      index,
      time: Math.min(...matches.filter((match) => phaseMatchesKey(key, match) && match.scheduled_start_utc).map((match) => new Date(match.scheduled_start_utc).getTime()))
    })).filter((entry) => Number.isFinite(entry.time) && entry.time <= now);
    if (started.length) return started[started.length - 1].index;
    const upcoming = plan.findIndex(([key]) => matches.some((match) => phaseMatchesKey(key, match) && match.scheduled_start_utc));
    return Math.max(0, upcoming);
  }

  function phaseMatchesKey(key, match) {
    if (key === "double_elim") return ["playoff_upper_r1", "playoff_continuation"].includes(match.phase);
    if (key === "round_16") return match.phase === "round_16" || /16/.test(match.round_name || "");
    return matchPhaseKey(match) === key;
  }

  function phaseWindow(key, matches) {
    const times = matches.filter((match) => phaseMatchesKey(key, match) && match.scheduled_start_utc).map((match) => new Date(match.scheduled_start_utc).getTime()).sort((a, b) => a - b);
    if (!times.length) return "Dates pending";
    const start = U().formatDate(times[0]);
    const end = U().formatDate(times[times.length - 1]);
    return start === end ? start : `${start} - ${end}`;
  }

  function teamName(team, fallback = "TBD") {
    return team ? `${team.team_name} [${team.team_tag}]` : fallback;
  }

  function teamForId(teamMap, id) {
    return id ? teamMap.get(id) : null;
  }

  function scoreRows(match) {
    const raw = Array.isArray(match.game_scores) ? match.game_scores : [];
    return raw.flatMap((game) => Array.isArray(game.players) ? game.players : Array.isArray(game.stats) ? game.stats : []).filter(Boolean);
  }

  function playerStatsFor(match, playerId) {
    const row = scoreRows(match).find((entry) => String(entry.player_id || entry.id || "") === String(playerId || ""));
    return {
      kills: Number(row?.kills || 0),
      deaths: Number(row?.deaths || 0),
      assists: Number(row?.assists || 0),
      gold: Number(row?.gold || row?.gold_acquired || 0)
    };
  }

  function teamMatchStats(match, teamId, teamMap) {
    const rosterIds = new Set((teamForId(teamMap, teamId)?.roster || []).map((member) => String(member.player_id)));
    const rows = scoreRows(match).filter((entry) => String(entry.team_id || "") === String(teamId || "") || rosterIds.has(String(entry.player_id || entry.id || "")));
    if (!rows.length) return { kills: 0, deaths: 0, assists: 0, gold: 0 };
    return rows.reduce((sum, row) => ({
      kills: sum.kills + Number(row.kills || 0),
      deaths: sum.deaths + Number(row.deaths || 0),
      assists: sum.assists + Number(row.assists || 0),
      gold: sum.gold + Number(row.gold || row.gold_acquired || 0)
    }), { kills: 0, deaths: 0, assists: 0, gold: 0 });
  }

  function renderMatchCard(match, teamMap) {
    const teamA = teamForId(teamMap, match.team_a_id);
    const teamB = teamForId(teamMap, match.team_b_id);
    const aWinner = match.winner_team_id === match.team_a_id;
    const bWinner = match.winner_team_id === match.team_b_id;
    return `<button class="match-card phase-card" type="button" data-match-detail="${match.match_id}">
      <div class="match-card-top">
        <span class="pill">${U().escapeHtml(match.round_name || "Match")}</span>
        <span class="pill ${match.status === "finished" ? "good" : match.status === "live" ? "warn" : ""}">${U().escapeHtml(match.status || "scheduled")}</span>
      </div>
      <div class="versus-row">
        <span class="${aWinner ? "winner-text" : ""}">${U().escapeHtml(teamName(teamA))}</span>
        <strong>${match.team_a_score ?? 0}</strong>
        <em>vs</em>
        <strong>${match.team_b_score ?? 0}</strong>
        <span class="${bWinner ? "winner-text" : ""}">${U().escapeHtml(teamName(teamB))}</span>
      </div>
      <div class="match-card-meta">
        <span>BO${match.best_of || 1}</span>
        <span>${match.scheduled_start_utc ? new Date(match.scheduled_start_utc).toLocaleString() : "Time pending"}</span>
      </div>
    </button>`;
  }

  function renderKnockoutSlide(phase, matches, teamMap) {
    return `<div class="phase-card-grid">
      ${matches.map((match) => renderMatchCard(match, teamMap)).join("") || '<p class="muted">No matches generated for this phase yet.</p>'}
    </div>`;
  }

  function groupStandings(matches, groupRows, teamMap) {
    const groups = {};
    groupRows.forEach((row) => {
      if (!groups[row.group_name]) groups[row.group_name] = {};
      groups[row.group_name][row.team_id] = {
        team_id: row.team_id,
        team: teamForId(teamMap, row.team_id),
        wins: Number(row.wins || 0),
        losses: Number(row.losses || 0),
        points: Number(row.points || 0),
        played: Number(row.matches_played || 0),
        kills: 0,
        deaths: 0,
        assists: 0,
        gold: 0
      };
    });
    matches.filter((match) => match.phase === "group_stage").forEach((match) => {
      const group = groups[match.group_name] || {};
      [match.team_a_id, match.team_b_id].filter(Boolean).forEach((teamId) => {
        if (!group[teamId]) group[teamId] = { team_id: teamId, team: teamForId(teamMap, teamId), wins: 0, losses: 0, points: 0, played: 0, kills: 0, deaths: 0, assists: 0, gold: 0 };
        const stats = teamMatchStats(match, teamId, teamMap);
        group[teamId].kills += stats.kills;
        group[teamId].deaths += stats.deaths;
        group[teamId].assists += stats.assists;
        group[teamId].gold += stats.gold;
        if (match.winner_team_id) {
          group[teamId].played += 1;
          if (match.winner_team_id === teamId) {
            group[teamId].wins += 1;
            group[teamId].points += 3;
          } else {
            group[teamId].losses += 1;
          }
        }
      });
      groups[match.group_name] = group;
    });
    return Object.fromEntries(Object.entries(groups).map(([groupName, teams]) => [
      groupName,
      Object.values(teams).sort((a, b) => b.points - a.points || b.wins - a.wins || b.kills - a.kills)
    ]));
  }

  function renderGroupSlide(matches, groupRows, teamMap) {
    const standings = groupStandings(matches, groupRows, teamMap);
    return `<div class="group-stage-grid">
      ${Object.entries(standings).map(([groupName, teams]) => `<article class="group-stage-card">
        <div class="section-heading"><strong>${U().escapeHtml(groupName)}</strong><span class="pill good">Top 1 advances</span></div>
        <div class="group-team-list">
          ${teams.map((entry, index) => `<button class="group-team-row ${index === 0 ? "advancing" : ""}" type="button" data-team-phase-detail="${entry.team_id}">
            <span>${index === 0 ? '<i class="fa-solid fa-circle-check"></i>' : index + 1}</span>
            <strong>${U().escapeHtml(teamName(entry.team))}</strong>
            <small>${entry.wins}W ${entry.losses}L</small>
            <b>${entry.points} pts</b>
          </button>`).join("")}
        </div>
      </article>`).join("") || '<p class="muted">Group assignments appear after approved teams are placed.</p>'}
    </div>`;
  }

  function renderDoubleElimSlide(matches, teamMap) {
    const upper = matches.filter((match) => match.phase === "playoff_upper_r1");
    const lower = matches.filter((match) => match.phase === "playoff_continuation");
    const upperRounds = [
      upper.slice(0, 4),
      lower.slice(0, 2),
      lower.slice(2, 3)
    ];
    const lowerRounds = [
      lower.slice(3, 5),
      lower.slice(5, 7),
      lower.slice(7, 8)
    ];
    const renderNode = (match, label) => match
      ? `<button class="de-node" type="button" data-match-detail="${match.match_id}">
          <small>${U().escapeHtml(label)}</small>
          <span>${U().escapeHtml(teamName(teamForId(teamMap, match.team_a_id)))}</span>
          <b>${match.team_a_score ?? 0} - ${match.team_b_score ?? 0}</b>
          <span>${U().escapeHtml(teamName(teamForId(teamMap, match.team_b_id)))}</span>
        </button>`
      : `<div class="de-node is-empty"><small>${U().escapeHtml(label)}</small><span>TBD</span><b>-</b><span>TBD</span></div>`;
    const renderRound = (round, title, size) => `<div class="de-round ${size || ""}">
      <em>${U().escapeHtml(title)}</em>
      ${(round.length ? round : [null]).map((match, index) => renderNode(match, `${title} ${index + 1}`)).join("")}
    </div>`;
    return `<div class="double-elim-stage">
      <div class="de-title-row">
        <div><h3>Double Elimination</h3><p class="muted">A team is eliminated only after two match losses.</p></div>
        <span class="pill good">BO3 bracket</span>
      </div>
      <section class="de-board upper-board">
        <div class="de-band">Winner's Bracket</div>
        ${upperRounds.map((round, index) => renderRound(round, ["Round 1", "Semis", "Upper Final"][index], index === 0 ? "wide" : "")).join("")}
      </section>
      <section class="de-board lower-board">
        <div class="de-band">Loser's Bracket</div>
        ${lowerRounds.map((round, index) => renderRound(round, ["Lower R1", "Lower Semis", "Lower Final"][index], index === 0 ? "wide" : "")).join("")}
      </section>
    </div>`;
  }

  function renderFinalSlide(matches, teamMap, standings) {
    const finals = matches.filter((match) => match.phase === "grand_final");
    const champion = standings.find((entry) => entry.rank === 1);
    return `<div class="final-stage">
      <section class="champion-panel">
        <p class="eyebrow">Champion Projection</p>
        <h2>${U().escapeHtml(champion?.team ? teamName(champion.team) : "Champion pending")}</h2>
        <div class="metric-grid">
          <span><strong>${champion?.wins || 0}</strong><small>Wins</small></span>
          <span><strong>${champion?.kills || 0}</strong><small>Kills</small></span>
          <span><strong>${champion?.assists || 0}</strong><small>Assists</small></span>
          <span><strong>${champion?.gold || 0}</strong><small>Gold</small></span>
        </div>
      </section>
      <section class="final-match-list">${finals.map((match) => renderMatchCard(match, teamMap)).join("") || '<p class="muted">Grand final waits at the end of the road.</p>'}</section>
    </div>`;
  }

  function rosterForTeam(team, profileMap) {
    return (team?.roster || []).map((member) => ({
      ...member,
      profile: profileMap.get(member.player_id)
    }));
  }

  function renderRosterSide(team, match, profileMap, sideLabel) {
    const roster = rosterForTeam(team, profileMap);
    return `<section class="roster-side">
      <div class="section-heading"><h3>${U().escapeHtml(sideLabel)}</h3><span class="pill">${U().escapeHtml(teamName(team))}</span></div>
      <div class="roster-card-list">
        ${roster.map((member) => {
          const stats = playerStatsFor(match, member.player_id);
          const name = member.profile?.full_name || member.profile?.ign || member.player_id;
          return `<article class="roster-stat-card">
            <div class="player-avatar">${U().escapeHtml(String(name || "?").slice(0, 2).toUpperCase())}</div>
            <div><strong>${U().escapeHtml(name)}</strong><p class="muted">${U().escapeHtml(member.profile?.ign || "No IGN")} - ${U().escapeHtml(member.role || "-")}</p></div>
            <dl><div><dt>K</dt><dd>${stats.kills}</dd></div><div><dt>D</dt><dd>${stats.deaths}</dd></div><div><dt>A</dt><dd>${stats.assists}</dd></div><div><dt>Gold</dt><dd>${stats.gold}</dd></div></dl>
          </article>`;
        }).join("") || '<p class="muted">Roster data pending.</p>'}
      </div>
    </section>`;
  }

  function openMatchModal(match, teamMap, profileMap) {
    if (!match) return;
    const teamA = teamForId(teamMap, match.team_a_id);
    const teamB = teamForId(teamMap, match.team_b_id);
    U().openModal(match.round_name || "Match", `
      <div class="match-detail-modal">
        ${renderRosterSide(teamA, match, profileMap, "Team 1")}
        <section class="match-center-card">
          <span class="pill">BO${match.best_of || 1}</span>
          <h3>${match.team_a_score ?? 0} - ${match.team_b_score ?? 0}</h3>
          <p class="muted">${match.scheduled_start_utc ? new Date(match.scheduled_start_utc).toLocaleString() : "Time pending"}</p>
          <p>${U().escapeHtml(match.match_notes || "Match stats appear here once staff records the game.")}</p>
        </section>
        ${renderRosterSide(teamB, match, profileMap, "Team 2")}
      </div>`);
  }

  function openTeamPhaseModal(teamId, matches, teamMap, profileMap) {
    const team = teamForId(teamMap, teamId);
    const played = matches.filter((match) => match.team_a_id === teamId || match.team_b_id === teamId);
    const aggregate = played.reduce((sum, match) => {
      const stats = teamMatchStats(match, teamId, teamMap);
      return { kills: sum.kills + stats.kills, deaths: sum.deaths + stats.deaths, assists: sum.assists + stats.assists, gold: sum.gold + stats.gold };
    }, { kills: 0, deaths: 0, assists: 0, gold: 0 });
    U().openModal(`${teamName(team)} Phase Details`, `
      <div class="detail-grid">
        <section class="mini-card">
          <div class="metric-grid"><span><strong>${aggregate.kills}</strong><small>Kills</small></span><span><strong>${aggregate.deaths}</strong><small>Deaths</small></span><span><strong>${aggregate.assists}</strong><small>Assists</small></span><span><strong>${aggregate.gold}</strong><small>Gold</small></span></div>
        </section>
        <section class="mini-card-grid">
          ${played.map((match) => `<article class="mini-card"><strong>${U().escapeHtml(match.round_name)}</strong><p class="muted">${match.winner_team_id === teamId ? "Win" : match.winner_team_id ? "Loss" : "Pending"} - MVP ${U().escapeHtml(profileMap.get(match.mvp_player_id)?.full_name || "TBD")}</p></article>`).join("") || '<p class="muted">No phase matches yet.</p>'}
        </section>
      </div>`);
  }

  function computeStandings(teams, matches) {
    const teamLookup = new Map(teams.map((team) => [team.team_id, team]));
    const stats = new Map(teams.map((team) => [team.team_id, { team, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, gold: 0, points: 0, eliminated: false, champion: false, bestPhase: 0 }]));
    const phaseRank = { round_128: 64, round_64: 32, group_stage: 16, playoff_upper_r1: 8, playoff_continuation: 4, grand_final: 1 };
    matches.forEach((match) => {
      [match.team_a_id, match.team_b_id].filter(Boolean).forEach((teamId) => {
        if (!stats.has(teamId)) stats.set(teamId, { team: null, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, gold: 0, points: 0, eliminated: false, champion: false, bestPhase: 0 });
        const entry = stats.get(teamId);
        const values = teamMatchStats(match, teamId, teamLookup);
        entry.kills += values.kills;
        entry.deaths += values.deaths;
        entry.assists += values.assists;
        entry.gold += values.gold;
        entry.bestPhase = Math.max(entry.bestPhase, phaseRank[match.phase] || 0);
        if (match.winner_team_id) {
          if (match.winner_team_id === teamId) {
            entry.wins += 1;
            entry.points += match.phase === "group_stage" ? 3 : 1;
            if (match.phase === "grand_final") entry.champion = true;
          } else {
            entry.losses += 1;
            if (["round_128", "round_64", "round_16", "playoff_continuation", "grand_final"].includes(match.phase)) entry.eliminated = true;
          }
        }
      });
    });
    return [...stats.values()].sort((a, b) => b.wins - a.wins || b.points - a.points || b.kills - a.kills).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  function standingClass(entry) {
    if (entry.champion) return "champion-row";
    if (entry.rank <= 4) return "top-four-row";
    if ([16, 32, 64].includes(entry.bestPhase)) return "milestone-row";
    if (entry.eliminated) return "eliminated-row";
    return "";
  }

  function renderStandings(root, standings) {
    root.innerHTML = `<div class="section-heading"><h2>Tournament Team Table</h2><span class="pill">${standings.length} teams</span></div>
      <div class="table-wrap"><table class="tournament-stat-table"><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>Pts</th><th>K</th><th>D</th><th>A</th><th>Gold</th></tr></thead><tbody>
        ${standings.map((entry) => `<tr class="${standingClass(entry)}"><td>${entry.rank}</td><td>${U().escapeHtml(teamName(entry.team, "Unknown"))}</td><td>${entry.wins}</td><td>${entry.losses}</td><td>${entry.points}</td><td>${entry.kills}</td><td>${entry.deaths}</td><td>${entry.assists}</td><td>${entry.gold}</td></tr>`).join("") || '<tr><td colspan="9" class="muted">Teams appear once tickets are approved.</td></tr>'}
      </tbody></table></div>`;
  }

  async function loadTournamentList() {
    const root = U().qs("#tournamentList");
    if (!root) return;
    const { data, error } = await db().from("tournaments").select("*").order("start_date", { ascending: true });
    if (error) return root.innerHTML = `<p class="message error">${U().escapeHtml(error.message)}</p>`;
    root.innerHTML = (data || []).map((t) => `
      <article class="item-card">
        <p class="eyebrow">${U().escapeHtml(t.status)}</p>
        <h2>${U().escapeHtml(t.name)}</h2>
        <p>${U().escapeHtml(t.description || "")}</p>
        <div class="pill-row"><span class="pill">${t.team_capacity} teams</span><span class="pill">${U().formatDate(t.start_date)}</span></div>
        <a class="secondary-button" href="tournament.html?id=${t.tournament_id}" style="margin-top:12px">Details</a>
      </article>`).join("") || '<p class="muted">No tournaments yet.</p>';
  }

  async function loadTournamentDetail() {
    const id = U().getParam("id");
    const detail = U().qs("#tournamentDetail");
    const arena = U().qs("#phaseArena");
    const standingsRoot = U().qs("#tournamentStandings");
    if (!detail || !arena || !standingsRoot || !id) return;
    const [tournamentResult, matchesResult, registrationsResult, groupsResult] = await Promise.all([
      db().from("tournaments").select("*").eq("tournament_id", id).single(),
      db().from("matches").select("*").eq("tournament_id", id).order("scheduled_start_utc", { ascending: true }).order("bracket_position", { ascending: true }),
      db().from("tournament_registrations").select("team_id, status").eq("tournament_id", id),
      db().from("group_stage_tables").select("*").eq("tournament_id", id)
    ]);
    if (tournamentResult.error) return detail.innerHTML = `<p class="message error">${U().escapeHtml(tournamentResult.error.message)}</p>`;
    const tournament = tournamentResult.data;
    const matches = matchesResult.data || [];
    const approvedTeamIds = (registrationsResult.data || []).filter((row) => row.status === "approved").map((row) => row.team_id);
    const matchTeamIds = matches.flatMap((match) => [match.team_a_id, match.team_b_id]).filter(Boolean);
    const teamIds = [...new Set([...approvedTeamIds, ...matchTeamIds])];
    const { data: teams } = teamIds.length ? await db().from("teams").select("*").in("team_id", teamIds) : { data: [] };
    const playerIds = [...new Set((teams || []).flatMap((team) => (team.roster || []).map((member) => member.player_id)).filter(Boolean))];
    const { data: profiles } = playerIds.length ? await db().from("profiles").select("id, full_name, ign, username, player_roles").in("id", playerIds) : { data: [] };
    const teamMap = new Map((teams || []).map((team) => [team.team_id, team]));
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const standings = computeStandings(teams || [], matches);
    const plan = phasePlans(Number(tournament.team_capacity || 16));
    const activePhase = currentPhaseIndex(plan, matches, tournament);

    detail.innerHTML = `
      <div class="tournament-hero">
        <div>
          <p class="eyebrow">${U().escapeHtml(tournament.status)}</p>
          <h1>${U().escapeHtml(tournament.name)}</h1>
          <p>${U().escapeHtml(tournament.description || "")}</p>
        </div>
        <div class="tournament-hero-actions">
          <div class="pill-row"><span class="pill">${U().escapeHtml(tournament.game || "Game")}</span><span class="pill">${tournament.team_capacity} teams</span><span class="pill">${U().formatDate(tournament.start_date)}</span></div>
          ${window.currentProfile ? '<button id="registerTournament" class="secondary-button" type="button">Request ticket</button>' : ""}
        </div>
      </div>
      <div class="phase-progress">${plan.map(([key, label], index) => `<button class="${index === activePhase ? "is-current" : ""}" type="button" data-go-phase="${index}"><span>${label}</span><small>${U().escapeHtml(phaseWindow(key, matches))}</small></button>`).join("")}</div>`;
    U().qs("#registerTournament")?.addEventListener("click", () => registerTeam(tournament.tournament_id));

    arena.innerHTML = `<div class="swiper tournament-swiper"><div class="swiper-wrapper">
      ${plan.map(([key, label, title, subtitle], index) => {
        const phaseMatches = matches.filter((match) => phaseMatchesKey(key, match));
        const body = key === "group_stage"
          ? renderGroupSlide(matches, groupsResult.data || [], teamMap)
          : key === "double_elim"
            ? renderDoubleElimSlide(phaseMatches, teamMap)
            : key === "grand_final"
              ? renderFinalSlide(phaseMatches, teamMap, standings)
              : renderKnockoutSlide(key, phaseMatches, teamMap);
        return `<section class="swiper-slide phase-slide ${index === activePhase ? "is-active-phase" : ""}">
          <div class="phase-slide-head"><div><p class="eyebrow">${U().escapeHtml(label)}</p><h2>${U().escapeHtml(title)}</h2><p class="muted">${U().escapeHtml(subtitle)} - ${U().escapeHtml(phaseWindow(key, matches))}</p></div><span class="pill ${index === activePhase ? "good" : ""}">${index === activePhase ? "Current phase" : "Phase"}</span></div>
          ${body}
        </section>`;
      }).join("")}
    </div><div class="swiper-pagination"></div><div class="swiper-button-prev"></div><div class="swiper-button-next"></div></div>`;

    if (phaseSwiper) phaseSwiper.destroy(true, true);
    if (window.Swiper) {
      phaseSwiper = new Swiper(".tournament-swiper", {
        initialSlide: activePhase,
        slidesPerView: 1,
        spaceBetween: 18,
        speed: 420,
        pagination: { el: ".swiper-pagination", clickable: true },
        navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" }
      });
      U().qsa("[data-go-phase]").forEach((button) => button.addEventListener("click", () => phaseSwiper.slideTo(Number(button.dataset.goPhase || 0))));
    }
    U().qsa("[data-match-detail]").forEach((button) => button.addEventListener("click", () => openMatchModal(matches.find((match) => match.match_id === button.dataset.matchDetail), teamMap, profileMap)));
    U().qsa("[data-team-phase-detail]").forEach((button) => button.addEventListener("click", () => openTeamPhaseModal(button.dataset.teamPhaseDetail, matches, teamMap, profileMap)));
    renderStandings(standingsRoot, standings);
    setupMatchAlerts(tournament, matches, teamMap);
    startTournamentDetailRealtime(id);
  }

  async function registerTeam(tournamentId) {
    const { data: teams } = await db().from("teams").select("team_id, team_name").eq("team_leader_id", window.currentProfile.id).eq("status", "approved");
    if (!teams?.length) return alert("You need to lead an approved team before registering.");
    const team = teams[0];
    const { data: existing } = await db().from("tournament_registrations").select("status").eq("tournament_id", tournamentId).eq("team_id", team.team_id).maybeSingle();
    if (existing) return alert(`Your tournament ticket is already ${existing.status}.`);
    if (!confirm(`Request a tournament ticket for ${team.team_name}?`)) return;
    const { error } = await db().from("tournament_registrations").insert({ tournament_id: tournamentId, team_id: team.team_id, requested_by: window.currentProfile.id });
    if (error) alert(error.message);
    else alert(`Tournament ticket requested for ${team.team_name}.`);
  }

  function setupMatchAlerts(tournament, matches, teamMap) {
    clearInterval(alertTimer);
    if (!window.currentProfile) return;
    const profileId = window.currentProfile.id;
    const isMyMatch = (match) => {
      const teams = [teamForId(teamMap, match.team_a_id), teamForId(teamMap, match.team_b_id)].filter(Boolean);
      return teams.some((team) => (team.roster || []).some((member) => member.player_id === profileId));
    };
    const check = () => {
      const now = Date.now();
      matches.filter(isMyMatch).forEach((match) => {
        if (!match.scheduled_start_utc) return;
        const ms = new Date(match.scheduled_start_utc).getTime() - now;
        const link = `tournament.html?id=${tournament.tournament_id}`;
        const send = async (kind, title, message) => {
          const key = `${kind}:${match.match_id}`;
          if (alertedMatches.has(key)) return;
          alertedMatches.add(key);
          saveAlertState();
          await db().from("notifications").insert({ user_id: profileId, type: "match_alert", title, message, link });
          alert(message);
        };
        if (ms > 29 * 60 * 1000 && ms <= 30 * 60 * 1000) send("30m", "Match in 30 minutes", `${match.round_name} starts in about 30 minutes. Live link: ${link}`);
        if (ms > -30 * 1000 && ms <= 30 * 1000) send("live", "Match is live", `${match.round_name} is live now. Open: ${link}`);
      });
    };
    check();
    alertTimer = setInterval(check, 60 * 1000);
  }

  function startTournamentListRealtime() {
    if (tournamentListRealtime) return;
    tournamentListRealtime = true;
    db().channel("tournaments:list").on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, loadTournamentList).on("postgres_changes", { event: "*", schema: "public", table: "matches" }, loadTournamentList).subscribe();
  }

  function startTournamentDetailRealtime(id) {
    if (tournamentDetailRealtimeId === id) return;
    tournamentDetailRealtimeId = id;
    db().channel(`tournaments:detail:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `tournament_id=eq.${id}` }, loadTournamentDetail)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, loadTournamentDetail)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_stage_tables", filter: `tournament_id=eq.${id}` }, loadTournamentDetail)
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
