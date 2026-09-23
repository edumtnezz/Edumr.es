const API = "/api/laquiniela";
let state = { user: null, matches: [] };

function $(id) { return document.getElementById(id); }
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function money(n) { return Number(n || 0).toLocaleString("es-ES"); }
function fmtDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return { date, time };
}
function crestEl(crest, fallback) {
  const fb = document.createElement("div");
  fb.className = "crest-fallback";
  fb.textContent = String(fallback || "?").slice(0, 3).toUpperCase();
  if (!crest) return fb;
  const img = document.createElement("img");
  img.className = "crest";
  img.src = crest;
  img.alt = "";
  img.addEventListener("error", () => { if (img.parentNode) img.parentNode.replaceChild(fb, img); });
  return img;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function renderUserBox() {
  const box = $("userBox");
  if (!box) return;
  box.innerHTML = "";
  const name = state.user && state.user.name;
  if (!name) return;
  const chip = document.createElement("span");
  chip.className = "user-chip";
  chip.innerHTML = '<span class="user-avatar">' + escapeHtml(initials(name)) + '</span><span>' + escapeHtml(name) + '</span>';
  const out = document.createElement("button");
  out.className = "btn-ghost";
  out.textContent = "Salir";
  out.addEventListener("click", async () => {
    try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {}
    state.user = null;
    await load();
  });
  box.appendChild(chip);
  box.appendChild(out);
}

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function renderLogin(panel) {
  panel.appendChild(el("p", "muted", "Entra con tu nombre y un código de 4 o 6 dígitos para pronosticar el marcador. Si no existes, se crea solo."));
  const f = el("div", "auth-form");
  const name = el("input"); name.id = "poName"; name.placeholder = "Tu nombre"; name.maxLength = 24;
  const pin = el("input"); pin.id = "poPin"; pin.type = "password"; pin.placeholder = "Código (4 o 6 números)"; pin.maxLength = 6;
  const b = el("button", "btn-primary", "Entrar");
  f.appendChild(name); f.appendChild(pin); f.appendChild(b);
  panel.appendChild(f);
  const err = el("p", "error"); err.id = "poErr"; panel.appendChild(err);
  b.addEventListener("click", async () => {
    try {
      const res = await fetch(API + "/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: name.value, pin: pin.value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      await load();
    } catch (e) { err.textContent = e.message; }
  });
}

function renderMatch(panel, m) {
  const card = el("div", "porra-card");
  const head = el("div", "porra-card-head");
  head.appendChild(el("span", "porra-team-label", m.label));
  const meta = m.started && m.result
    ? "Resultado final"
    : (m.utcDate ? fmtDate(m.utcDate).date + " · " + fmtDate(m.utcDate).time : "");
  head.appendChild(el("span", "porra-comp", (m.competition ? m.competition + " · " : "") + meta));
  card.appendChild(head);

  const row = el("div", "pm-row");
  const home = el("span", "pm-team");
  home.appendChild(crestEl(m.homeCrest, m.home));
  home.appendChild(el("span", null, m.home));
  const mid = el("span", "vs", m.result ? (m.result.home + " - " + m.result.away) : "VS");
  const away = el("span", "pm-team");
  away.appendChild(crestEl(m.awayCrest, m.away));
  away.appendChild(el("span", null, m.away));
  row.appendChild(home); row.appendChild(mid); row.appendChild(away);
  card.appendChild(row);

  if (!state.user) {
    // sin sesion no se pronostica
  } else if (m.started) {
    card.appendChild(el("div", "porra-locked", m.result ? "Cerrado · ya jugado" : "Cerrado · en juego o empezado"));
  } else {
    const pred = el("div", "porra-pred");
    const hi = el("input"); hi.type = "number"; hi.min = 0; hi.max = 30; hi.id = "poH" + m.matchId;
    hi.value = m.my ? m.my.home : "";
    const lo = el("input"); lo.type = "number"; lo.min = 0; lo.max = 30; lo.id = "poA" + m.matchId;
    lo.value = m.my ? m.my.away : "";
    const save = el("button", "btn-primary", "Guardar");
    save.addEventListener("click", () => guardar(m));
    pred.appendChild(hi); pred.appendChild(el("span", "porra-dash", "-")); pred.appendChild(lo); pred.appendChild(save);
    card.appendChild(pred);
    const err = el("p", "error"); err.id = "poErr" + m.matchId; card.appendChild(err);
  }

  const list = el("div", "partido-list");
  (m.entries || []).forEach((e) => {
    const erow = el("div", "partido-entry");
    if (e.prize != null && e.prize > 0) erow.classList.add("winner");
    erow.appendChild(el("span", "pe-name", e.name));
    erow.appendChild(el("span", "pe-score", e.home + " - " + e.away));
    const tag = el("span", "pe-tag");
    if (e.prize != null && e.prize > 0) {
      const pref = e.tipo === "exacto" ? "Exacto · " : e.tipo === "signo" ? "Signo · " : "";
      tag.textContent = pref + money(e.prize) + " €";
    }
    erow.appendChild(tag);
    list.appendChild(erow);
  });
  if (!(m.entries || []).length) list.appendChild(el("p", "empty", "Todavía no hay pronósticos."));
  card.appendChild(list);

  panel.appendChild(card);
}

function render() {
  const panel = $("porraPanel");
  if (!panel) return;
  panel.innerHTML = "";
  renderUserBox();

  if (!state.matches.length) {
    panel.appendChild(el("p", "muted", "Cargando partidos…"));
    return;
  }
  if (!state.user) renderLogin(panel);
  state.matches.forEach((m) => renderMatch(panel, m));

  renderRank();
  renderParts();
  renderHistory();
}

function renderHistory() {
  const box = $("porraHistory");
  if (!box) return;
  box.innerHTML = "";
  const list = (state && state.history) || [];
  if (!list.length) {
    box.appendChild(el("p", "empty", "Todavía no hay jornadas pasadas."));
    return;
  }
  list.forEach((h) => {
    const card = el("div", "porra-card");
    const head = el("div", "porra-card-head");
    const r = h.result ? h.result.home + " - " + h.result.away : "";
    head.appendChild(el("span", "porra-team-label", h.home + (r ? "  " + r + "  " : " vs ") + h.away));
    head.appendChild(el("span", "porra-comp", h.utcDate ? fmtDate(h.utcDate).date : ""));
    card.appendChild(head);
    const plist = el("div", "partido-list");
    (h.entries || []).forEach((e) => {
      const row = el("div", "partido-entry");
      if (e.prize != null && e.prize > 0) row.classList.add("winner");
      row.appendChild(el("span", "pe-name", e.name));
      row.appendChild(el("span", "pe-score", e.home + " - " + e.away));
      const tag = el("span", "pe-tag");
      if (e.prize != null && e.prize > 0) {
        const pref = e.tipo === "exacto" ? "Exacto · " : e.tipo === "signo" ? "Signo · " : "";
        tag.textContent = pref + money(e.prize) + " €";
      }
      row.appendChild(tag);
      plist.appendChild(row);
    });
    card.appendChild(plist);
    box.appendChild(card);
  });
}

function renderRank() {
  const box = $("porraRank");
  const hint = $("porraRankHint");
  if (!box) return;
  box.innerHTML = "";
  const agg = {};
  state.matches.forEach((m) => {
    (m.entries || []).forEach((e) => {
      if (!agg[e.name]) agg[e.name] = { name: e.name, total: 0, exactos: 0, signos: 0 };
      if (e.tipo === "exacto") agg[e.name].exactos++;
      else if (e.tipo === "signo") agg[e.name].signos++;
      agg[e.name].total += e.prize || 0;
    });
  });
  const list = Object.values(agg).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  if (!list.length) {
    if (hint) hint.textContent = "Todavía no hay pronósticos.";
    box.appendChild(el("p", "empty", "Sin pronósticos todavía."));
    return;
  }
  if (hint) hint.textContent = "Ordenada por premio: quien acierta el marcador exacto, primero.";
  list.forEach((s, i) => {
    const row = el("div", "partido-entry");
    if (s.total > 0) row.classList.add("winner");
    row.appendChild(el("span", "pe-name", (i + 1) + ". " + s.name));
    row.appendChild(el("span", "pe-score", money(s.total) + " €"));
    const aciertos = [];
    if (s.exactos) aciertos.push(s.exactos + " exacto" + (s.exactos === 1 ? "" : "s"));
    if (s.signos) aciertos.push(s.signos + " signo" + (s.signos === 1 ? "" : "s"));
    row.appendChild(el("span", "pe-tag", aciertos.length ? aciertos.join(" · ") : "—"));
    box.appendChild(row);
  });
}

function renderParts() {
  const box = $("porraParts");
  const hint = $("porraPartsHint");
  if (!box) return;
  box.innerHTML = "";
  const names = [];
  const seen = {};
  state.matches.forEach((m) => {
    (m.entries || []).forEach((e) => {
      if (!seen[e.name]) { seen[e.name] = true; names.push(e.name); }
    });
  });
  if (hint) hint.textContent = names.length ? names.length + " participante" + (names.length === 1 ? "" : "s") + "." : "";
  if (!names.length) {
    box.appendChild(el("p", "empty", "Todavía no hay participantes."));
    return;
  }
  names.forEach((n) => {
    const card = el("div", "porra-card");
    card.appendChild(el("div", "porra-team-label", n));
    const list = el("div", "partido-list");
    state.matches.forEach((m) => {
      const e = (m.entries || []).find((x) => x.name === n);
      const row = el("div", "partido-entry");
      row.appendChild(el("span", "pe-name", m.label + " · " + m.home + " - " + m.away));
      row.appendChild(el("span", "pe-score", e ? e.home + " - " + e.away : "—"));
      const tag = el("span", "pe-tag");
      if (e && e.prize != null && e.prize > 0) tag.textContent = money(e.prize) + " €";
      row.appendChild(tag);
      list.appendChild(row);
    });
    card.appendChild(list);
    box.appendChild(card);
  });
}

function switchTab(name, scroll) {
  if (scroll === undefined) scroll = true;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
  const panel = $("tab-" + name);
  if (panel) {
    panel.classList.remove("hidden");
    if (scroll) {
      const bar = document.querySelector(".appbar");
      const off = (bar ? bar.offsetHeight : 0) + 12;
      const y = panel.getBoundingClientRect().top + window.scrollY - off;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
  }
}

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});

(function initSwipe() {
  const order = ["porra", "historial", "clasificacion", "participantes", "instrucciones"];
  const main = document.querySelector(".quiniela-main") || document.body;
  let sx = 0, sy = 0, st = 0;
  main.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  main.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Date.now() - st > 900) return;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const hit = document.elementFromPoint(sx, sy);
    if (hit && hit.closest("button, a, input, select")) return;
    const active = document.querySelector(".tab.active");
    let i = order.indexOf(active ? active.dataset.tab : "porra");
    if (i < 0) i = 0;
    if (dx < 0) i = Math.min(order.length - 1, i + 1);
    else i = Math.max(0, i - 1);
    switchTab(order[i]);
  }, { passive: true });
})();

async function guardar(m) {
  const err = $("poErr" + m.matchId);
  const h = $("poH" + m.matchId);
  const a = $("poA" + m.matchId);
  if (err) err.textContent = "";
  if (h.value === "" || a.value === "") { if (err) err.textContent = "Pon el marcador."; return; }
  try {
    const res = await fetch(API + "/porra/predecir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId: m.matchId, home: h.value, away: a.value }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    state = d.state;
    render();
  } catch (e) { if (err) err.textContent = e.message; }
}

async function load() {
  try {
    const res = await fetch(API + "/porra");
    state = await res.json();
    render();
  } catch (e) {}
}

load();
setInterval(load, 60000);
