(function () {
  async function loadFeed() {
    const U = window.TPUtils;
    const root = U.qs("#feedPosts");
    if (!root || !window.currentProfile) return;
    root.innerHTML = U.spinner();
    const { data, error } = await window.tpSupabase
      .from("feed_posts")
      .select("*, tournaments(tournament_id,name,status,start_date)")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
      return;
    }
    root.innerHTML = (data || []).map((post) => `
      <article class="post-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${U.escapeHtml(post.author_role || "admin")}</p>
            <h2>${U.escapeHtml(post.title)}</h2>
          </div>
          ${post.is_pinned ? '<span class="pill warn">Pinned</span>' : ""}
        </div>
        <p>${U.escapeHtml(post.content)}</p>
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
    root.innerHTML = `
      <h2>${U.escapeHtml(p.full_name)}</h2>
      <p class="muted">${U.escapeHtml(p.ign || "No IGN set")}</p>
      <div class="pill-row">
        <span class="pill good">${U.escapeHtml(p.role)}</span>
        ${p.staff_role ? `<span class="pill">${U.escapeHtml(p.staff_role)}</span>` : ""}
      </div>
      ${p.staff_role ? '<p class="message success">You have staff privileges. Open the Staff button in the nav.</p>' : ""}`;
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
