(function () {
  let notificationChannel = null;

  async function initNotifications() {
    const U = window.TPUtils;
    const profile = window.currentProfile;
    if (!profile) return;
    const badge = U.qs("#notificationBadge");
    async function refresh() {
      const { count } = await window.tpSupabase
        .from("notifications")
        .select("notification_id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_read", false);
      if (!badge) return;
      badge.textContent = count || 0;
      badge.classList.toggle("hidden", !count);
    }
    await refresh();
    if (notificationChannel) return;
    notificationChannel = window.tpSupabase
      .channel(`notifications:${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, () => {
        refresh();
        renderAlertList();
      })
      .subscribe();
  }
  async function renderAlertList() {
    const U = window.TPUtils;
    const root = U.qs("#alertList");
    if (!root || !window.currentProfile) return;
    const { data, error } = await window.tpSupabase
      .from("notifications")
      .select("notification_id,title,message,link,is_read,created_at")
      .eq("user_id", window.currentProfile.id)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) return root.innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
    root.innerHTML = (data || []).map((item) => `
      <article class="alert-card ${item.is_read ? "" : "is-unread"}">
        <div>
          <strong>${U.escapeHtml(item.title || "Alert")}</strong>
          <p>${U.escapeHtml(item.message || "")}</p>
          <small class="muted">${new Date(item.created_at).toLocaleString()}</small>
        </div>
        ${item.link ? `<a class="secondary-button compact-button" href="${U.escapeHtml(U.safeHref(item.link))}">Open</a>` : ""}
      </article>`).join("") || '<p class="muted">No alerts yet.</p>';
  }
  async function markAlertsRead() {
    if (!window.currentProfile) return;
    await window.tpSupabase.from("notifications").update({ is_read: true }).eq("user_id", window.currentProfile.id).eq("is_read", false);
    renderAlertList();
    initNotifications();
  }
  window.TPUtils.onAuthReady(() => {
    initNotifications();
    renderAlertList();
    window.TPUtils.qs("#markAlertsRead")?.addEventListener("click", markAlertsRead);
  });
  window.TPNotifications = { initNotifications, renderAlertList };
})();
