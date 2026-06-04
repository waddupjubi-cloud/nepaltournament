(function () {
  function renderProfileForm() {
    const U = window.TPUtils;
    const p = window.currentProfile;
    const form = U.qs("#profileForm");
    if (!form || !p) return;
    form.innerHTML = `
      <label class="field"><input id="fullName" value="${U.escapeHtml(p.full_name || "")}" required placeholder=" "><span>Full name</span></label>
      <label class="field"><input id="profileIgn" value="${U.escapeHtml(p.ign || "")}" placeholder=" "><span>IGN</span></label>
      <label class="field"><input id="profileGameId" value="${U.escapeHtml(p.game_id || "")}" placeholder=" "><span>Game ID</span></label>
      <label class="field"><input id="profileServerId" value="${U.escapeHtml(p.server_id || "")}" placeholder=" "><span>Server ID</span></label>
      <label class="field"><input id="profileDob" type="date" value="${U.escapeHtml(p.date_of_birth || "")}" required placeholder=" "><span>Date of birth</span></label>
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
      bio: U.qs("#profileBio").value.trim()
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
    const { error } = await window.tpSupabase.from("player_appeals").insert({
      user_id: window.currentProfile.id,
      preferred_roles: roles,
      note: U.qs("#appealNote").value.trim()
    });
    if (error) alert(error.message);
    else {
      U.qs("#appealForm").reset();
      alert("Appeal submitted.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
    if (document.body.dataset.page !== "profile") return;
    renderProfileForm();
    renderRoles();
    window.TPUtils.qs("#appealForm")?.addEventListener("submit", submitAppeal);
  }, 250));
})();
