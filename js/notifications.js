(function () {
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
    window.tpSupabase
      .channel(`notifications:${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, refresh)
      .subscribe();
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(initNotifications, 200));
  window.TPNotifications = { initNotifications };
})();
