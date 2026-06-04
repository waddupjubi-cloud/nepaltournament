(function () {
  function nextPowerOfTwo(value) {
    return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
  }

  function seedTeams(teams, capacity) {
    const size = nextPowerOfTwo(capacity || teams.length || 2);
    const seeded = [...teams];
    while (seeded.length < size) seeded.push({ team_id: null, team_name: "BYE" });
    return seeded;
  }

  function generateSingleElimination(teams, options) {
    const seeded = seedTeams(teams, options?.capacity);
    const rounds = [];
    let current = seeded;
    let roundIndex = 1;
    while (current.length > 1) {
      const round = [];
      for (let i = 0; i < current.length; i += 2) {
        round.push({
          temp_id: `r${roundIndex}m${i / 2 + 1}`,
          round_number: roundIndex,
          round_name: current.length === 2 ? "Grand Final" : `Round of ${current.length}`,
          team_a: current[i],
          team_b: current[i + 1],
          status: "scheduled",
          best_of: current.length === 2 ? (options?.grandFinalBestOf || 5) : 1
        });
      }
      rounds.push(round);
      current = round.map((match) => ({ team_id: null, team_name: `Winner ${match.temp_id}` }));
      roundIndex += 1;
    }
    return rounds;
  }

  function scheduleMatches(rounds, startDate, maxPerDay) {
    const start = startDate ? new Date(startDate) : new Date();
    let dayOffset = 0;
    let dailyCount = 0;
    return rounds.map((round) => round.map((match) => {
      if (dailyCount >= (maxPerDay || 6)) {
        dayOffset += 1;
        dailyCount = 0;
      }
      const scheduled = new Date(start);
      scheduled.setUTCDate(scheduled.getUTCDate() + dayOffset);
      scheduled.setUTCHours(12 + (dailyCount % (maxPerDay || 6)), 0, 0, 0);
      dailyCount += 1;
      return { ...match, scheduled_start_utc: scheduled.toISOString() };
    }));
  }

  function renderBracket(root, rounds) {
    const U = window.TPUtils;
    if (!root) return;
    root.innerHTML = `
      <div class="bracket">
        ${rounds.map((round) => `
          <section class="bracket-round">
            <div class="round-title">${U.escapeHtml(round[0]?.round_name || "Round")}</div>
            ${round.map((match) => {
              const aWin = match.winner_team_id && match.winner_team_id === (match.team_a_id || match.team_a?.team_id);
              const bWin = match.winner_team_id && match.winner_team_id === (match.team_b_id || match.team_b?.team_id);
              const aName = match.team_a_name || match.team_a?.team_name || match.team_a?.team_tag || "TBD";
              const bName = match.team_b_name || match.team_b?.team_name || match.team_b?.team_tag || "TBD";
              return `
                <article class="bracket-match">
                  <div class="bracket-team ${aWin ? "winner" : ""}"><span>${U.escapeHtml(aName)}</span><strong>${match.team_a_score ?? ""}</strong></div>
                  <div class="bracket-team ${bWin ? "winner" : ""}"><span>${U.escapeHtml(bName)}</span><strong>${match.team_b_score ?? ""}</strong></div>
                  <div class="match-meta">BO${match.best_of || 1} - ${U.formatDate(match.scheduled_start_utc)}</div>
                </article>`;
            }).join("")}
          </section>`).join("")}
      </div>`;
  }

  function groupMatchesByRound(matches) {
    const groups = new Map();
    (matches || []).forEach((match) => {
      const key = match.round_name || `Round ${match.round_number || 1}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(match);
    });
    return Array.from(groups.values());
  }

  window.TPBracket = { generateSingleElimination, scheduleMatches, renderBracket, groupMatchesByRound };
})();
