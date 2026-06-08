(function () {
  function renderProfileForm() {
    const U = window.TPUtils;
    const p = window.currentProfile;
    const form = U.qs("#profileForm");
    if (!form || !p) return;
    form.innerHTML = `
      <label class="field"><input id="profileUsername" value="${U.escapeHtml(p.username || "")}" readonly placeholder=" "><span>Username</span></label>
      <label class="field"><input id="fullName" value="${U.escapeHtml(p.full_name || "")}" required placeholder=" "><span>Full name</span></label>
      <label class="field"><input id="profileIgn" value="${U.escapeHtml(p.ign || "")}" placeholder=" "><span>IGN</span></label>
      <label class="field"><input id="profileGameId" value="${U.escapeHtml(p.game_id || "")}" placeholder=" "><span>Game ID</span></label>
      <label class="field"><input id="profileServerId" value="${U.escapeHtml(p.server_id || "")}" placeholder=" "><span>Server ID</span></label>
      <label class="field"><input id="profileDob" type="date" value="${U.escapeHtml(p.date_of_birth || "")}" required placeholder=" "><span>Date of birth</span></label>
      <label class="field"><input id="profileFavoriteHero" value="${U.escapeHtml(p.favorite_hero || "")}" placeholder=" "><span>Favorite hero</span></label>
      <label class="field"><input id="profileTagline" value="${U.escapeHtml(p.tagline || "")}" placeholder=" "><span>Tagline</span></label>
      <label class="field"><textarea id="profileMotto" rows="3" placeholder=" ">${U.escapeHtml(p.motto || "")}</textarea><span>Main motto</span></label>
      <label class="field"><textarea id="profileFavoriteQuote" rows="3" placeholder=" ">${U.escapeHtml(p.favorite_quote || "")}</textarea><span>Favorite line or quote</span></label>
      <label class="field"><textarea id="profileLikes" rows="3" placeholder=" ">${U.escapeHtml(p.likes || "")}</textarea><span>Likes</span></label>
      <label class="field"><textarea id="profileDislikes" rows="3" placeholder=" ">${U.escapeHtml(p.dislikes || "")}</textarea><span>Dislikes</span></label>
      <label class="field"><textarea id="profileBio" rows="4" placeholder=" ">${U.escapeHtml(p.bio || "")}</textarea><span>Bio</span></label>
      <button class="primary-button" type="submit">Save profile</button>
      <p id="profileMessage" class="message"></p>`;
    form.addEventListener("submit", saveProfile);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const U = window.TPUtils;
    if (!U.isAtLeast13(U.qs("#profileDob").value)) return U.setMessage("#profileMessage", "Users must be at least 13 years old.", "error");
    const { error } = await window.tpSupabase.from("profiles").update({
      full_name: U.qs("#fullName").value.trim(),
      ign: U.qs("#profileIgn").value.trim(),
      game_id: U.qs("#profileGameId").value.trim(),
      server_id: U.qs("#profileServerId").value.trim(),
      date_of_birth: U.qs("#profileDob").value,
      bio: U.qs("#profileBio").value.trim(),
      favorite_hero: U.qs("#profileFavoriteHero").value.trim(),
      favorite_quote: U.qs("#profileFavoriteQuote").value.trim(),
      motto: U.qs("#profileMotto").value.trim(),
      tagline: U.qs("#profileTagline").value.trim(),
      likes: U.qs("#profileLikes").value.trim(),
      dislikes: U.qs("#profileDislikes").value.trim()
    }).eq("id", window.currentProfile.id);
    U.setMessage("#profileMessage", error ? error.message : "Profile saved.", error ? "error" : "success");
  }

  function renderRoles() {
    const U = window.TPUtils;
    const root = U.qs("#preferredRoles");
    if (!root) return;
    root.innerHTML = U.roles.map((role) => `
      <label class="pill"><input type="checkbox" value="${role}"> ${role}</label>
    `).join("");
  }

  async function submitAppeal(event) {
    event.preventDefault();
    const U = window.TPUtils;
    const roles = U.qsa("#preferredRoles input:checked").map((input) => input.value);
    if (!roles.length) return alert("Choose at least one role.");
    if (!confirm("Submit this player appeal for staff review?")) return;
    const { error } = await window.tpSupabase.from("player_appeals").insert({
      user_id: window.currentProfile.id,
      preferred_roles: roles,
      note: U.qs("#appealNote").value.trim()
    });
    if (error) alert(error.message);
    else {
      U.qs("#appealForm").reset();
      alert("Player appeal created.");
    }
  }

  window.TPUtils.onAuthReady(() => {
    if (document.body.dataset.page !== "profile") return;
    renderProfileForm();
    renderRoles();
    window.TPUtils.qs("#appealForm")?.addEventListener("submit", submitAppeal);
  });
})();
