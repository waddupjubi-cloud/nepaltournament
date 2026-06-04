(function () {
  async function renderTeamChat(teamId, rootId) {
    const U = window.TPUtils;
    const root = U.qs(rootId || "#teamChat");
    if (!root) return;
    root.innerHTML = `
      <h2>Team Chat</h2>
      <div id="chatLog" class="chat-log"></div>
      <form id="chatForm" class="two-grid">
        <label class="field"><input id="chatInput" required placeholder=" "><span>Message</span></label>
        <button class="primary-button" type="submit">Send</button>
      </form>`;
    async function load() {
      const { data } = await window.tpSupabase
        .from("messages")
        .select("*, profiles!messages_sender_id_fkey(full_name)")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true })
        .limit(100);
      U.qs("#chatLog").innerHTML = (data || []).map((m) => `
        <div class="chat-message"><strong>${U.escapeHtml(m.profiles?.full_name || "Player")}</strong><br>${U.escapeHtml(m.content)}</div>
      `).join("");
      U.qs("#chatLog").scrollTop = U.qs("#chatLog").scrollHeight;
    }
    await load();
    U.qs("#chatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = U.qs("#chatInput");
      await window.tpSupabase.from("messages").insert({
        conversation_id: teamId,
        sender_id: window.currentProfile.id,
        team_id: teamId,
        content: input.value.trim()
      });
      input.value = "";
    });
    window.tpSupabase.channel(`messages:${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `team_id=eq.${teamId}` }, load)
      .subscribe();
  }
  window.TPMessages = { renderTeamChat };
})();
