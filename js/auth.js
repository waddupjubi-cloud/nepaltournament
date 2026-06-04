(function () {
  const db = () => window.tpSupabase;
  const userPages = ["feed", "profile", "teams", "team", "create-team", "tournaments", "tournament"];

  async function getSession() {
    const { data, error } = await db().auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function getProfile(userId) {
    const { data, error } = await db().from("profiles").select("*").eq("id", userId).single();
    if (error) throw error;
    return data;
  }

  async function requireUser() {
    const session = await getSession();
    if (!session) {
      location.href = "index.html";
      return null;
    }
    const profile = await getProfile(session.user.id);
    if (!profile.is_verified) {
      location.href = "index.html";
      return null;
    }
    window.currentSession = session;
    window.currentProfile = profile;
    window.TPUtils.renderNav(profile);
    return { session, profile };
  }

  async function requireStaff() {
    const session = await getSession();
    if (!session) {
      location.href = "staff.html";
      return null;
    }
    const profile = await getProfile(session.user.id);
    if (!profile.staff_role) {
      location.href = "feed.html";
      return null;
    }
    window.currentSession = session;
    window.currentProfile = profile;
    return { session, profile };
  }

  async function logout() {
    await db().auth.signOut();
    location.href = "index.html";
  }

  async function createProfileFromMetadata(user) {
    const meta = user.user_metadata || {};
    const payload = {
      id: user.id,
      full_name: meta.full_name || user.email,
      date_of_birth: meta.date_of_birth || null,
      ign: meta.ign || null,
      game_id: meta.game_id || null,
      server_id: meta.server_id || null,
      is_verified: true
    };
    const { error } = await db().from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw error;
    if (meta.apply_player) {
      await db().from("player_appeals").insert({
        user_id: user.id,
        preferred_roles: ["multirole"],
        note: "Applied during registration."
      });
    }
  }

  function initIndex() {
    const U = window.TPUtils;
    const loginForm = U.qs("#loginForm");
    const registerForm = U.qs("#registerForm");
    const otpForm = U.qs("#otpForm");
    U.qsa("[data-auth-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        U.qsa("[data-auth-tab]").forEach((item) => item.classList.remove("is-active"));
        tab.classList.add("is-active");
        loginForm.classList.toggle("hidden", tab.dataset.authTab !== "login");
        registerForm.classList.toggle("hidden", tab.dataset.authTab !== "register");
        otpForm.classList.add("hidden");
      });
    });

    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      U.setMessage("#authMessage", "Logging in...");
      const email = U.qs("#loginEmail").value.trim();
      const password = U.qs("#loginPassword").value;
      const { data, error } = await db().auth.signInWithPassword({ email, password });
      if (error) return U.setMessage("#authMessage", error.message, "error");
      const profile = await getProfile(data.user.id).catch(() => null);
      if (!profile?.is_verified) return U.setMessage("#authMessage", "Please verify your email first.", "error");
      location.href = "feed.html";
    });

    registerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = U.qs("#registerPassword").value;
      if (password !== U.qs("#confirmPassword").value) return U.setMessage("#authMessage", "Passwords do not match.", "error");
      if (!U.isAtLeast13(U.qs("#dateOfBirth").value)) return U.setMessage("#authMessage", "Users must be at least 13 years old.", "error");
      U.setMessage("#authMessage", "Creating account and sending OTP...");
      const email = U.qs("#registerEmail").value.trim();
      const { error } = await db().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.TP_CONFIG.SITE_URL,
          data: {
            full_name: U.qs("#registerName").value.trim(),
            date_of_birth: U.qs("#dateOfBirth").value,
            ign: U.qs("#ign").value.trim(),
            game_id: U.qs("#gameId").value.trim(),
            server_id: U.qs("#serverId").value.trim(),
            apply_player: U.qs("#applyPlayer").checked
          }
        }
      });
      if (error) return U.setMessage("#authMessage", error.message, "error");
      U.qs("#otpEmail").value = email;
      registerForm.classList.add("hidden");
      loginForm.classList.add("hidden");
      otpForm.classList.remove("hidden");
      U.setMessage("#authMessage", "OTP sent. Check your email.", "success");
    });

    otpForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      U.setMessage("#authMessage", "Verifying...");
      const { data, error } = await db().auth.verifyOtp({
        email: U.qs("#otpEmail").value.trim(),
        token: U.qs("#otpToken").value.trim(),
        type: "signup"
      });
      if (error) return U.setMessage("#authMessage", error.message, "error");
      await createProfileFromMetadata(data.user);
      location.href = "feed.html";
    });
  }

  function initStaff() {
    const U = window.TPUtils;
    U.qs("#staffLoginForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      U.setMessage("#staffMessage", "Checking staff privileges...");
      const { data, error } = await db().auth.signInWithPassword({
        email: U.qs("#staffEmail").value.trim(),
        password: U.qs("#staffPassword").value
      });
      if (error) return U.setMessage("#staffMessage", error.message, "error");
      const profile = await getProfile(data.user.id);
      if (!profile.staff_role) {
        await db().auth.signOut();
        return U.setMessage("#staffMessage", "No staff privileges.", "error");
      }
      location.href = "dashboard.html";
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const page = document.body.dataset.page;
    if (page === "index") initIndex();
    if (page === "staff") initStaff();
    if (userPages.includes(page)) await requireUser().catch((error) => {
      console.error(error);
      location.href = "index.html";
    });
    if (page === "dashboard") await requireStaff().catch((error) => {
      console.error(error);
      location.href = "staff.html";
    });
  });

  window.TPAuth = { getSession, getProfile, requireUser, requireStaff, logout };
})();
