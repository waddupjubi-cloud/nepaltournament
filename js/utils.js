(function () {
  const roles = ["exp", "jg", "gd", "md", "rm", "coach", "sb1", "sb2", "multirole", "founder", "leader"];
  const roleLabels = {
    exp: "EXP lane menace",
    jg: "Jungle tax collector",
    gd: "Gold lane main character",
    md: "Mid lane yap controller",
    rm: "Roam GPS online",
    coach: "Coach with the notes app",
    sb1: "Sub slot clutch",
    sb2: "Bench aura loaded",
    multirole: "COOL GUY multirole diff",
    founder: "Founder energy",
    leader: "Team lead, no panic"
  };

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
    return '<div class="spinner" role="status" aria-label="Loading"></div>';
  }

  function onAuthReady(callback) {
    if (window.currentProfile) {
      queueMicrotask(() => callback({ profile: window.currentProfile, session: window.currentSession }));
      return;
    }
    document.addEventListener("tp:auth-ready", (event) => callback(event.detail), { once: true });
  }

  function updateDocumentMeta(title, description) {
    if (title) document.title = `${title} | Tournament Players Nepal`;
    const descriptionMeta = qs('meta[name="description"]');
    if (description && descriptionMeta) descriptionMeta.content = description;
  }

  function initTheme() {
    const saved = localStorage.getItem("tp-theme");
    if (saved === "dark") document.body.classList.add("dark");
    const syncButtons = () => {
      const dark = document.body.classList.contains("dark") || document.body.classList.contains("staff-surface");
      qsa(".theme-toggle").forEach((button) => button.setAttribute("aria-pressed", String(dark)));
    };
    qsa(".theme-toggle").forEach((button) => {
      if (button.dataset.themeBound) return;
      button.dataset.themeBound = "true";
      button.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        localStorage.setItem("tp-theme", document.body.classList.contains("dark") ? "dark" : "light");
        syncButtons();
      });
    });
    syncButtons();
  }

  function renderNav(profile) {
    const nav = qs(".top-nav");
    if (!nav) return;
    const page = document.body.dataset.page;
    const activePage = { team: "teams", "create-team": "teams", tournament: "tournaments" }[page] || page;
    const staffRoles = [profile?.staff_role, ...(Array.isArray(profile?.staff_roles) ? profile.staff_roles : [])].filter(Boolean);
    const isPlayer = ["player", "superadmin"].includes(profile?.role) || profile?.is_player_approved;
    const links = [
      ["feed", "feed.html", "fa-house", "Feed"],
      ["profile", "profile.html", "fa-user", "Profile"],
      ["tournaments", "tournaments.html", "fa-trophy", "Tournaments"],
      ...(isPlayer ? [["teams", "teams.html", "fa-people-group", "Teams"]] : []),
      ["alerts", "alerts.html", "fa-bell", "Alerts"],
      ["messages", "messages.html", "fa-message", "Messages"]
    ];
    nav.innerHTML = `
      <a class="brand" href="feed.html">Tournament Players</a>
      <nav class="nav-links" aria-label="Primary navigation">
        ${links.map(([key, href, icon, label]) => `
          <a class="nav-link ${activePage === key ? "is-active" : ""}" href="${href}" ${activePage === key ? 'aria-current="page"' : ""}>
            <i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span>
            ${key === "alerts" ? '<span id="notificationBadge" class="badge hidden">0</span>' : ""}
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
    const activeElement = document.activeElement;
    const backdrop = document.createElement("div");
    const titleId = `modal-title-${Date.now()}`;
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <div class="section-heading">
          <h2 id="${titleId}">${escapeHtml(title)}</h2>
          <button class="icon-button" type="button" data-close-modal aria-label="Close">x</button>
        </div>
        <div>${bodyHtml}</div>
        <div class="toolbar" style="margin-top:16px">${actionsHtml || ""}</div>
      </section>`;
    const close = () => {
      backdrop.remove();
      activeElement?.focus?.();
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.matches("[data-close-modal]")) close();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    root.appendChild(backdrop);
    qs(".modal", backdrop)?.focus();
  }

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function safeHref(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      return url.origin === location.origin ? url.href : "#";
    } catch {
      return "#";
    }
  }

  function rolePills(values) {
    const list = Array.isArray(values) ? values : String(values || "").split(",").filter(Boolean);
    if (!list.length) return "";
    return `<div class="pill-row">${list.map((role) => `<span class="pill role-tag role-${escapeHtml(role)}">${escapeHtml(roleLabels[role] || role)}</span>`).join("")}</div>`;
  }

  function drawMatrix(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const chars = "TP0123456789";
    let columns = [];
    let width = 0;
    let height = 0;
    let frameId = 0;
    let lastFrame = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Array(Math.ceil(width / 18)).fill(1);
    }
    function frame(time = 0) {
      if (!reduceMotion.matches && time - lastFrame < 32) {
        frameId = requestAnimationFrame(frame);
        return;
      }
      lastFrame = time;
      const styles = getComputedStyle(document.body);
      const accent = styles.getPropertyValue("--accent").trim() || "#0066cc";
      const isDark = document.body.classList.contains("dark") || document.body.classList.contains("staff-surface");
      ctx.fillStyle = isDark ? "rgba(9,7,10,0.1)" : "rgba(230,240,255,0.16)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = accent;
      ctx.font = "14px monospace";
      columns.forEach((y, index) => {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, index * 18, y * 18);
        if (y * 18 > height && Math.random() > 0.975) columns[index] = 0;
        columns[index] = y + 1;
      });
      if (!document.hidden && !reduceMotion.matches) frameId = requestAnimationFrame(frame);
    }
    function start() {
      cancelAnimationFrame(frameId);
      if (!document.hidden) frame();
    }
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", start);
    reduceMotion.addEventListener?.("change", start);
    start();
  }

  function drawArena(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let nodes = [];
    let frameId = 0;
    let lastFrame = 0;

    function themeValue(name, fallback) {
      return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
    }

    function makeNodes() {
      const count = Math.min(58, Math.max(26, Math.floor(width / 24)));
      nodes = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.18 + Math.random() * 0.46,
        size: 1.2 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2,
        lane: index % 4
      }));
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width || window.innerWidth;
      height = rect.height || window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      makeNodes();
    }

    function drawGrid(time, accent, accentAlt) {
      ctx.lineWidth = 1;
      ctx.globalAlpha = document.body.classList.contains("dark") ? 0.16 : 0.12;
      ctx.strokeStyle = accent;
      for (let y = 28; y < height; y += 42) {
        const offset = Math.sin(time / 1200 + y / 80) * 8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + offset);
        ctx.stroke();
      }
      ctx.strokeStyle = accentAlt;
      for (let x = -width; x < width * 1.7; x += 96) {
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(time / 1400) * 18, height);
        ctx.lineTo(x + width * 0.36, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawLanes(time, accent, accentAlt) {
      const baseY = height * 0.22;
      for (let index = 0; index < 4; index += 1) {
        const y = baseY + index * height * 0.18 + Math.sin(time / 900 + index) * 14;
        const sweep = ((time / (38 + index * 8)) % (width + 260)) - 130;
        const gradient = ctx.createLinearGradient(sweep - 160, y, sweep + 180, y);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(0.36, index % 2 ? accentAlt : accent);
        gradient.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sweep - 160, y);
        ctx.bezierCurveTo(sweep - 52, y - 72, sweep + 82, y + 72, sweep + 190, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawNodes(time, accent, accentAlt) {
      nodes.forEach((node, index) => {
        if (!reduceMotion.matches) {
          node.x += node.speed;
          node.y += Math.sin(time / 900 + node.phase) * 0.18;
          if (node.x > width + 24) {
            node.x = -24;
            node.y = Math.random() * height;
          }
        }
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = node.lane % 2 ? accentAlt : accent;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.fill();

        for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
          const other = nodes[otherIndex];
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 96) continue;
          ctx.globalAlpha = (1 - distance / 96) * 0.18;
          ctx.strokeStyle = node.lane % 2 ? accentAlt : accent;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
    }

    function frame(time) {
      if (!reduceMotion.matches && time - lastFrame < 32) {
        frameId = requestAnimationFrame(frame);
        return;
      }
      lastFrame = time;
      const accent = themeValue("--accent", "#0066cc");
      const accentAlt = themeValue("--accent-alt", "#ffcc00");
      ctx.clearRect(0, 0, width, height);
      drawGrid(time, accent, accentAlt);
      drawLanes(time, accent, accentAlt);
      drawNodes(time, accent, accentAlt);
      if (!document.hidden && !reduceMotion.matches) frameId = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(frameId);
      if (!document.hidden) frame(performance.now());
    }

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", start);
    reduceMotion.addEventListener?.("change", start);
    start();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    drawMatrix(qs("#matrixCanvas"));
    drawArena(qs("#arenaCanvas"));
  });

  window.TPUtils = { qs, qsa, escapeHtml, safeHref, formatDate, isAtLeast13, setMessage, spinner, onAuthReady, updateDocumentMeta, renderNav, openModal, getParam, rolePills, roles };
})();
