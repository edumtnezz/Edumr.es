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
}

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
