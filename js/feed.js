(function () {
  async function loadFeed() {
    const U = window.TPUtils;
    const root = U.qs("#feedPosts");
    if (!root || !window.currentProfile) return;
    root.innerHTML = U.spinner();
    const [{ data, error }, { data: teams }] = await Promise.all([
      window.tpSupabase
      .from("feed_posts")
      .select("*, tournaments(tournament_id,name,status,start_date)")
      .order("is_pinned", { ascending: false })
      .order("pin_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
      window.tpSupabase.from("teams").select("team_id, team_name, team_tag").eq("status", "approved")
    ]);
    if (error) {
      root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
      return;
    }
    const teamMap = new Map((teams || []).map((team) => [team.team_id, team]));
    const audienceLabel = (post) => {
      const team = teamMap.get(post.target_team_id);
      return post.audience_type === "team" && team
        ? `team - ${team.team_name} [${team.team_tag}]`
        : post.audience_type || "all";
    };
    root.innerHTML = (data || []).map((post) => `
      <article class="post-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${U.escapeHtml(post.author_role || "admin")}</p>
            <h2>${U.escapeHtml(post.title)}</h2>
          </div>
          ${post.is_pinned ? `<span class="pill warn">Pinned #${post.pin_order || 1}</span>` : ""}
        </div>
        <p>${U.escapeHtml(post.content)}</p>
        <p class="muted">${U.escapeHtml(audienceLabel(post))} - ${new Date(post.created_at).toLocaleString()}</p>
        ${post.media_url ? `<img src="${U.escapeHtml(post.media_url)}" alt="" style="width:100%;border-radius:8px">` : ""}
        ${post.tournament_id ? `<button class="secondary-button" type="button" data-view-tournament="${post.tournament_id}">View Tournament</button>` : ""}
      </article>`).join("") || '<p class="muted">No feed posts yet.</p>';
    U.qsa("[data-view-tournament]", root).forEach((button) => {
      button.addEventListener("click", () => openTournamentModal(button.dataset.viewTournament));
    });
  }

  async function openTournamentModal(id) {
    const U = window.TPUtils;
    const { data, error } = await window.tpSupabase.from("tournaments").select("*").eq("tournament_id", id).single();
    if (error) return U.openModal("Tournament", `<p class="message error">${U.escapeHtml(error.message)}</p>`);
    U.openModal(data.name, `
      <p>${U.escapeHtml(data.description || "No description yet.")}</p>
      <div class="pill-row">
        <span class="pill">${U.escapeHtml(data.status)}</span>
        <span class="pill">${data.team_capacity} teams</span>
        <span class="pill">${U.formatDate(data.start_date)}</span>
      </div>`,
      `<a class="primary-button" href="tournament.html?id=${data.tournament_id}">See more</a>`);
  }

  function renderProfileSummary() {
    const U = window.TPUtils;
    const root = U.qs("#profileSummary");
    const p = window.currentProfile;
    if (!root || !p) return;
    const staffRoles = [p.staff_role, ...(Array.isArray(p.staff_roles) ? p.staff_roles : [])].filter(Boolean);
    root.innerHTML = `
      <h2>${U.escapeHtml(p.full_name)}</h2>
      <p class="muted">@${U.escapeHtml(p.username || "username")} - ${U.escapeHtml(p.ign || "No IGN set")}</p>
      <div class="pill-row">
        <span class="pill good">${U.escapeHtml(p.role)}</span>
        ${[...new Set(staffRoles)].map((role) => `<span class="pill">${U.escapeHtml(role)}</span>`).join("")}
      </div>
      ${staffRoles.length ? '<p class="message success">You have staff privileges. Open the Staff button in the nav.</p>' : ""}`;
  }

  function initRealtime() {
    window.tpSupabase
      .channel("feed_posts")
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, loadFeed)
      .subscribe();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      if (document.body.dataset.page !== "feed") return;
      renderProfileSummary();
      loadFeed();
      initRealtime();
      window.TPUtils.qs("#refreshFeed")?.addEventListener("click", loadFeed);
    }, 250);
  });
})();
