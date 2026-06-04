(function () {
  const roles = ["exp", "jg", "gd", "md", "rm", "coach", "sb1", "sb2", "multirole"];

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "Not set";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
  }

  function isAtLeast13(dateValue) {
    const dob = new Date(dateValue);
    const today = new Date();
    const cutoff = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
    return dob <= cutoff;
  }

  function setMessage(target, text, type) {
    const el = typeof target === "string" ? qs(target) : target;
    if (!el) return;
    el.textContent = text || "";
    el.className = `message ${type || ""}`.trim();
  }

  function spinner() {
    return '<div class="spinner" aria-label="Loading"></div>';
  }

  function initTheme() {
    const saved = localStorage.getItem("tp-theme");
    if (saved === "dark") document.body.classList.add("dark");
    qsa(".theme-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        localStorage.setItem("tp-theme", document.body.classList.contains("dark") ? "dark" : "light");
      });
    });
  }

  function renderNav(profile) {
    const nav = qs(".top-nav");
    if (!nav) return;
    const page = document.body.dataset.page;
    const staffRoles = [profile?.staff_role, ...(Array.isArray(profile?.staff_roles) ? profile.staff_roles : [])].filter(Boolean);
    const isPlayer = ["player", "superadmin"].includes(profile?.role) || profile?.is_player_approved;
    const links = [
      ["feed", "feed.html", "fa-house", "Feed"],
      ["profile", "profile.html", "fa-user", "Profile"],
      ["tournaments", "tournaments.html", "fa-trophy", "Tournaments"],
      ...(isPlayer ? [["teams", "teams.html", "fa-people-group", "Teams"]] : []),
      ["notifications", "profile.html#notifications", "fa-bell", "Alerts"],
      ["messages", "profile.html#messages", "fa-message", "Messages"]
    ];
    nav.innerHTML = `
      <a class="brand" href="feed.html">Tournament Players</a>
      <nav class="nav-links">
        ${links.map(([key, href, icon, label]) => `
          <a class="nav-link ${page === key ? "is-active" : ""}" href="${href}">
            <i class="fa-solid ${icon}"></i><span>${label}</span>
            ${key === "notifications" ? '<span id="notificationBadge" class="badge hidden">0</span>' : ""}
          </a>
        `).join("")}
      </nav>
      <div class="toolbar">
        ${staffRoles.length ? '<a class="secondary-button" href="dashboard.html">Staff</a>' : ""}
        <button class="icon-button theme-toggle" type="button" aria-label="Toggle theme" title="Toggle theme"></button>
        <button id="logoutButton" class="secondary-button" type="button">Logout</button>
      </div>`;
    initTheme();
    qs("#logoutButton")?.addEventListener("click", () => window.TPAuth.logout());
  }

  function openModal(title, bodyHtml, actionsHtml) {
    const root = qs("#modalRoot") || document.body;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true">
        <div class="section-heading">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-button" type="button" data-close-modal aria-label="Close">x</button>
        </div>
        <div>${bodyHtml}</div>
        <div class="toolbar" style="margin-top:16px">${actionsHtml || ""}</div>
      </section>`;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.matches("[data-close-modal]")) backdrop.remove();
    });
    root.appendChild(backdrop);
  }

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function rolePills(values) {
    const list = Array.isArray(values) ? values : String(values || "").split(",").filter(Boolean);
    if (!list.length) return "";
    return `<div class="pill-row">${list.map((role) => `<span class="pill">${escapeHtml(role)}</span>`).join("")}</div>`;
  }

  function drawMatrix(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const chars = "TP0123456789";
    let columns = [];
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Array(Math.ceil(canvas.width / 18)).fill(1);
    }
    function frame() {
      ctx.fillStyle = "rgba(10,10,10,0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00cc44";
      ctx.font = "14px monospace";
      columns.forEach((y, index) => {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, index * 18, y * 18);
        if (y * 18 > canvas.height && Math.random() > 0.975) columns[index] = 0;
        columns[index] = y + 1;
      });
      requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener("resize", resize);
    frame();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    drawMatrix(qs("#matrixCanvas"));
  });

  window.TPUtils = { qs, qsa, escapeHtml, formatDate, isAtLeast13, setMessage, spinner, renderNav, openModal, getParam, rolePills, roles };
})();
