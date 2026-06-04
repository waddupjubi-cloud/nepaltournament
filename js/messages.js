(function () {
  const teamChannels = new Map();
  let directChannel = null;

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
    if (teamChannels.has(teamId)) {
      window.tpSupabase.removeChannel(teamChannels.get(teamId));
    }
    const channel = window.tpSupabase.channel(`messages:${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `team_id=eq.${teamId}` }, load)
      .subscribe();
    teamChannels.set(teamId, channel);
  }
  function initials(profile) {
    const value = profile?.full_name || profile?.username || profile?.ign || "?";
    return String(value).slice(0, 2).toUpperCase();
  }

  async function ensureDirectConversation(otherUserId) {
    const { data, error } = await window.tpSupabase.rpc("ensure_direct_conversation", { other_user_id: otherUserId });
    if (error) throw error;
    return data;
  }

  async function renderMessenger(rootId) {
    const U = window.TPUtils;
    const root = U.qs(rootId || "#messengerRoot");
    if (!root || !window.currentProfile) return;
    root.innerHTML = `
      <div class="messenger-shell">
        <aside class="messenger-sidebar">
          <label class="field"><input id="peopleSearch" type="search" placeholder=" "><span>Find people</span></label>
          <div id="peopleList" class="people-list"></div>
          <div class="messenger-divider"></div>
          <div id="directConversationList" class="people-list"></div>
        </aside>
        <section class="messenger-chat">
          <div id="directChatHeader" class="messenger-chat-header"><p class="muted">Pick someone to start chatting.</p></div>
          <div id="directChatLog" class="direct-chat-log"></div>
          <form id="directChatForm" class="messenger-compose hidden">
            <label class="field"><input id="directChatInput" required placeholder=" "><span>Message</span></label>
            <button class="primary-button" type="submit"><i class="fa-solid fa-paper-plane"></i> Send</button>
          </form>
        </section>
      </div>`;
    const { data: profiles, error: profileError } = await window.tpSupabase.from("profiles").select("id, full_name, username, ign, role, player_roles").neq("id", window.currentProfile.id).order("full_name").limit(500);
    if (profileError) return root.innerHTML = `<p class="message error">${U.escapeHtml(profileError.message)}</p>`;
    const allProfiles = profiles || [];
    const profileMap = new Map(allProfiles.map((profile) => [profile.id, profile]));
    let activeConversationId = null;
    let activeOtherUserId = null;

    async function loadConversations() {
      const { data: mine } = await window.tpSupabase.from("conversation_participants").select("conversation_id").eq("user_id", window.currentProfile.id);
      const ids = [...new Set((mine || []).map((row) => row.conversation_id))];
      if (!ids.length) {
        U.qs("#directConversationList").innerHTML = '<p class="muted">No chats yet.</p>';
        return;
      }
      const [{ data: conversations }, { data: participants }] = await Promise.all([
        window.tpSupabase.from("conversations").select("*").in("conversation_id", ids).eq("type", "direct").order("created_at", { ascending: false }),
        window.tpSupabase.from("conversation_participants").select("*").in("conversation_id", ids)
      ]);
      const otherIds = [...new Set((participants || []).filter((row) => row.user_id !== window.currentProfile.id).map((row) => row.user_id))];
      const { data: others } = otherIds.length
        ? await window.tpSupabase.from("profiles").select("id, full_name, username, ign, role, player_roles").in("id", otherIds)
        : { data: [] };
      (others || []).forEach((profile) => profileMap.set(profile.id, profile));
      U.qs("#directConversationList").innerHTML = (conversations || []).map((conversation) => {
        const participant = (participants || []).find((row) => row.conversation_id === conversation.conversation_id && row.user_id !== window.currentProfile.id);
        const other = profileMap.get(participant?.user_id);
        return `<button class="person-row ${activeConversationId === conversation.conversation_id ? "is-active" : ""}" type="button" data-open-conversation="${conversation.conversation_id}" data-user="${participant?.user_id || ""}">
          <span class="chat-avatar">${U.escapeHtml(initials(other))}</span>
          <span><strong>${U.escapeHtml(other?.full_name || "Direct chat")}</strong><small>@${U.escapeHtml(other?.username || "user")}</small></span>
        </button>`;
      }).join("") || '<p class="muted">No chats yet.</p>';
      U.qsa("[data-open-conversation]").forEach((button) => button.addEventListener("click", () => openConversation(button.dataset.openConversation, button.dataset.user)));
    }

    function renderPeople(list) {
      U.qs("#peopleList").innerHTML = list.map((profile) => `
        <button class="person-row" type="button" data-start-chat="${profile.id}">
          <span class="chat-avatar">${U.escapeHtml(initials(profile))}</span>
          <span><strong>${U.escapeHtml(profile.full_name || "Unnamed")}</strong><small>@${U.escapeHtml(profile.username || "user")} - ${U.escapeHtml(profile.ign || "No IGN")}</small></span>
        </button>`).join("") || '<p class="muted">No users found.</p>';
      U.qsa("[data-start-chat]").forEach((button) => button.addEventListener("click", async () => {
        try {
          const conversationId = await ensureDirectConversation(button.dataset.startChat);
          activeOtherUserId = button.dataset.startChat;
          await openConversation(conversationId, button.dataset.startChat);
          await loadConversations();
        } catch (error) {
          alert(`${error.message}. Run supabase/direct-messaging.sql if this keeps happening.`);
        }
      }));
    }

    async function openConversation(conversationId, otherUserId) {
      activeConversationId = conversationId;
      activeOtherUserId = otherUserId;
      const other = profileMap.get(otherUserId);
      U.qs("#directChatHeader").innerHTML = `
        <span class="chat-avatar">${U.escapeHtml(initials(other))}</span>
        <div><strong>${U.escapeHtml(other?.full_name || "Direct chat")}</strong><p class="muted">@${U.escapeHtml(other?.username || "user")}</p></div>`;
      U.qs("#directChatForm").classList.remove("hidden");
      await loadMessages();
      if (directChannel) window.tpSupabase.removeChannel(directChannel);
      directChannel = window.tpSupabase.channel(`direct:${conversationId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          loadMessages();
          if (payload.new.sender_id !== window.currentProfile.id) showChatToast(other, payload.new.content);
        })
        .subscribe();
    }

    async function loadMessages() {
      if (!activeConversationId) return;
      const { data, error } = await window.tpSupabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(160);
      if (error) return U.qs("#directChatLog").innerHTML = `<p class="message error">${U.escapeHtml(error.message)}</p>`;
      U.qs("#directChatLog").innerHTML = (data || []).map((message) => `
        <div class="direct-bubble ${message.sender_id === window.currentProfile.id ? "mine" : "theirs"}">
          <p>${U.escapeHtml(message.content)}</p>
          <small>${new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
        </div>`).join("") || '<p class="muted">No messages yet. Say hi nicely.</p>';
      U.qs("#directChatLog").scrollTop = U.qs("#directChatLog").scrollHeight;
    }

    U.qs("#peopleSearch")?.addEventListener("input", (event) => {
      const term = event.target.value.trim().toLowerCase();
      renderPeople(allProfiles.filter((profile) => [profile.full_name, profile.username, profile.ign, profile.role, ...(profile.player_roles || [])].filter(Boolean).join(" ").toLowerCase().includes(term)).slice(0, 80));
    });
    U.qs("#directChatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = U.qs("#directChatInput");
      const content = input.value.trim();
      if (!content || !activeConversationId) return;
      input.value = "";
      const { error } = await window.tpSupabase.from("messages").insert({
        conversation_id: activeConversationId,
        sender_id: window.currentProfile.id,
        receiver_id: activeOtherUserId || null,
        content
      });
      if (error) alert(error.message);
    });
    renderPeople(allProfiles.slice(0, 80));
    await loadConversations();
  }

  function showChatToast(profile, content) {
    const U = window.TPUtils;
    const toast = document.createElement("div");
    toast.className = "chat-toast";
    toast.innerHTML = `<span class="chat-avatar">${U.escapeHtml(initials(profile))}</span><div><strong>${U.escapeHtml(profile?.full_name || "New message")}</strong><p>${U.escapeHtml(content || "")}</p></div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("is-visible"), 20);
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 220);
    }, 3600);
  }

  window.TPMessages = { renderTeamChat, renderMessenger };
})();
