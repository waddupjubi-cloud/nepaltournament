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
    startProfileRealtime(profile.id);
    return { session, profile };
  }

  async function requireStaff() {
    const session = await getSession();
    if (!session) {
      location.href = "staff.html";
      return null;
    }
    const profile = await getProfile(session.user.id);
    const staffRoles = [profile.staff_role, ...(Array.isArray(profile.staff_roles) ? profile.staff_roles : [])].filter(Boolean);
    if (!staffRoles.length) {
      location.href = "feed.html";
      return null;
    }
    window.currentSession = session;
    window.currentProfile = profile;
    startProfileRealtime(profile.id);
    return { session, profile };
  }

  let profileRealtimeId = null;
  function startProfileRealtime(userId) {
    if (profileRealtimeId === userId) return;
    profileRealtimeId = userId;
    db().channel(`profile:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (payload) => {
        window.currentProfile = payload.new;
        if (document.querySelector(".top-nav")) window.TPUtils.renderNav(payload.new);
      })
      .subscribe();
  }

  async function logout() {
    await db().auth.signOut();
    location.href = "index.html";
  }

  function usernameBase(displayName) {
    const first = String(displayName || "user").trim().split(/\s+/)[0] || "user";
    return first.toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
  }

  async function generateUsername(displayName) {
    const base = usernameBase(displayName);
    const { data, error } = await db().from("profiles").select("username").ilike("username", `${base}%`);
    if (error) throw error;
    const used = new Set((data || []).map((profile) => profile.username).filter(Boolean));
    let serial = 1;
    while (used.has(`${base}${serial}`)) serial += 1;
    return `${base}${serial}`;
  }

  async function resolveLoginEmail(identifier) {
    const value = String(identifier || "").trim().toLowerCase();
    if (!value) throw new Error("Enter your email or username.");
    if (value.includes("@")) return value;
    const { data, error } = await db().rpc("resolve_login_email", { login_identifier: value });
    if (error) throw error;
    if (!data) throw new Error("No account uses that username.");
    return data;
  }

  async function createProfileFromMetadata(user) {
    const meta = user.user_metadata || {};
    const existing = await db().from("profiles").select("username").eq("id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    const username = existing.data?.username || meta.username || await generateUsername(meta.full_name || user.email);
    const payload = {
      id: user.id,
      full_name: meta.full_name || user.email,
      username,
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
    return payload;
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
      try {
        U.setMessage("#authMessage", "Logging in...");
        const email = await resolveLoginEmail(U.qs("#loginEmail").value);
        const password = U.qs("#loginPassword").value;
        const { data, error } = await db().auth.signInWithPassword({ email, password });
        if (error) return U.setMessage("#authMessage", error.message, "error");
        const profile = await getProfile(data.user.id).catch(() => null);
        if (!profile?.is_verified) return U.setMessage("#authMessage", "Please verify your email first.", "error");
        location.href = "feed.html";
      } catch (error) {
        U.setMessage("#authMessage", error.message, "error");
      }
    });

    registerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const password = U.qs("#registerPassword").value;
        if (password !== U.qs("#confirmPassword").value) return U.setMessage("#authMessage", "Passwords do not match.", "error");
        if (!U.isAtLeast13(U.qs("#dateOfBirth").value)) return U.setMessage("#authMessage", "Users must be at least 13 years old.", "error");
        const email = U.qs("#registerEmail").value.trim();
        const fullName = U.qs("#registerName").value.trim();
        const username = await generateUsername(fullName);
        if (!confirm(`Create account for ${fullName} with username ${username}?`)) return;
        U.setMessage("#authMessage", "Creating account and sending OTP...");
        const { error } = await db().auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.TP_CONFIG.SITE_URL,
            data: {
              username,
              full_name: fullName,
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
        U.setMessage("#authMessage", `Account created. OTP sent. Username: ${username}`, "success");
        alert(`Account created. Your username is ${username}. Enter the OTP to finish verification.`);
      } catch (error) {
        U.setMessage("#authMessage", error.message, "error");
      }
    });

    otpForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        U.setMessage("#authMessage", "Verifying...");
        const { data, error } = await db().auth.verifyOtp({
          email: U.qs("#otpEmail").value.trim(),
          token: U.qs("#otpToken").value.trim(),
          type: "signup"
        });
        if (error) return U.setMessage("#authMessage", error.message, "error");
        const profile = await createProfileFromMetadata(data.user);
        alert(`Account verified. You can log in with username ${profile.username}.`);
        location.href = "feed.html";
      } catch (error) {
        U.setMessage("#authMessage", error.message, "error");
      }
    });
  }

  function initStaff() {
    const U = window.TPUtils;
    U.qs("#staffLoginForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        U.setMessage("#staffMessage", "Checking staff privileges...");
        const email = await resolveLoginEmail(U.qs("#staffEmail").value);
        const { data, error } = await db().auth.signInWithPassword({
          email,
          password: U.qs("#staffPassword").value
        });
        if (error) return U.setMessage("#staffMessage", error.message, "error");
        const profile = await getProfile(data.user.id);
        const staffRoles = [profile.staff_role, ...(Array.isArray(profile.staff_roles) ? profile.staff_roles : [])].filter(Boolean);
        if (!staffRoles.length) {
          await db().auth.signOut();
          return U.setMessage("#staffMessage", "No staff privileges. Run seed.sql after creating the superadmin user.", "error");
        }
        location.href = "dashboard.html";
      } catch (error) {
        console.error(error);
        U.setMessage("#staffMessage", error.message || "Could not check staff privileges.", "error");
      }
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
