const API = "/api/laquiniela";

// Oculta el widget de cuenta hasta resolver la sesión: evita el parpadeo del
// estado "sin cuenta" en los primeros milisegundos de carga.
document.documentElement.classList.add("auth-loading");
(function () {
  const style = document.createElement("style");
  style.textContent = ".auth-loading #userBox,.auth-loading #exitBox{visibility:hidden}";
  document.head.appendChild(style);
})();

let state = { user: null, matches: [] };
let viewJornada = null;

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
  if (!name) { box.hidden = true; return; }
  box.hidden = false;
  const chip = document.createElement("button"); chip.type = "button"; chip.className = "user-chip";
  chip.innerHTML = '<span class="user-avatar">' + escapeHtml(initials(name)) + '</span><span class="user-name">' + escapeHtml(name) + '</span><span class="user-caret">▾</span>';
  const menu = document.createElement("div"); menu.className = "user-menu";
  const exit = document.createElement("button"); exit.type = "button"; exit.className = "user-menu-exit"; exit.textContent = "Salir";
  exit.onclick = async () => {
    try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {}
    state.user = null;
    await load();
  };
  menu.appendChild(exit);
  box.appendChild(chip); box.appendChild(menu);
  chip.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
  if (!document.__umWired) { document.__umWired = 1; document.addEventListener("click", (e) => { document.querySelectorAll(".user-menu.open").forEach((m) => { if (!m.parentElement.contains(e.target)) m.classList.remove("open"); }); }); }
}

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function renderLogin(panel) {
  const intro = el("div", "auth-intro");
  intro.appendChild(el("h2", null, "Entra o crea tu cuenta"));
  intro.appendChild(el("p", "muted", "Con un nombre y un código de 4 o 6 números juegas a La Porra, La Puja y La Quiniela. Si aún no tienes cuenta, se crea sola. Después entra siempre con lo mismo."));
  panel.appendChild(intro);
  const go = el("a", "btn-primary big", "Crear cuenta o entrar");
  go.href = "/futmondo/cuenta/?next=" + encodeURIComponent("/futmondo/porra/");
  panel.appendChild(go);
}

function shortName(n) {
  return String(n || "").replace(/^(FC|RC|CA|UD|SD|CD|RCD)\s+/, "").replace(/\s+(CF|FC|SD|UD)$/, "");
}

function renderMatch(panel, m) {
  const card = el("div", "porra-card pc2");
  [[m.homeCrest, "pc-bg pc-bg-l"], [m.awayCrest, "pc-bg pc-bg-r"]].forEach((x) => {
    if (!x[0]) return;
    const im = el("img", x[1]); im.src = x[0]; im.alt = ""; im.setAttribute("aria-hidden", "true");
    im.addEventListener("error", () => im.remove());
    card.appendChild(im);
  });
  const body = el("div", "pc-body");
  body.appendChild(el("div", "pc-comp", "LaLiga" + (m.matchday ? " · Jornada " + m.matchday : "")));
  body.appendChild(el("div", "pc-label", m.label));
  const when = m.started && m.result
    ? "Resultado final"
    : (m.utcDate ? new Date(m.utcDate).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(",", "").toUpperCase() + " " + fmtDate(m.utcDate).time : "");
  body.appendChild(el("div", "pc-when", when));
  const row = el("div", "pc-teams");
  row.appendChild(el("span", "pc-t", shortName(m.home)));
  row.appendChild(el("span", "pc-vs", m.result ? (m.result.home + " - " + m.result.away) : "VS"));
  row.appendChild(el("span", "pc-t", shortName(m.away)));
  body.appendChild(row);

  if (!state.user) {
    // sin sesion no se pronostica
  } else if (m.started) {
    body.appendChild(el("div", "porra-locked", m.result ? "Cerrado · ya jugado" : "Cerrado · en juego o empezado"));
  } else {
    const pred = el("div", "porra-pred");
    const hi = el("input"); hi.type = "number"; hi.min = 0; hi.max = 30; hi.id = "poH" + m.matchId; hi.inputMode = "numeric";
    hi.value = m.my ? m.my.home : "";
    const lo = el("input"); lo.type = "number"; lo.min = 0; lo.max = 30; lo.id = "poA" + m.matchId; lo.inputMode = "numeric";
    lo.value = m.my ? m.my.away : "";
    pred.appendChild(hi); pred.appendChild(el("span", "porra-dash", "-")); pred.appendChild(lo);
    body.appendChild(pred);
    const save = el("button", "btn-primary pc-save", m.my ? "Actualizar pronóstico" : "Guardar pronóstico");
    save.addEventListener("click", () => guardar(m));
    body.appendChild(save);
    const err = el("p", "error"); err.id = "poErr" + m.matchId; body.appendChild(err);
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
  body.appendChild(list);
  card.appendChild(body);
  panel.appendChild(card);
}

function updateCountdown() {
  const box = $("countdownPanel");
  if (!box || !state.matches) return;
  const timer = $("cdTimer"), info = $("cdInfo");
  const now = Date.now();
  const up = state.matches.filter((m) => !m.started && new Date(m.utcDate).getTime() > now).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  if (!up.length) {
    box.classList.add("closed");
    timer.textContent = state.matches.length ? "CERRADA" : "–";
    info.textContent = state.matches.length ? "Los partidos de esta jornada ya han empezado." : "Sin partidos de LaLiga en esta jornada.";
    return;
  }
  box.classList.remove("closed");
  const sec = Math.floor((new Date(up[0].utcDate).getTime() - now) / 1000);
  if (sec >= 86400) { const dd = Math.floor(sec / 86400); timer.textContent = dd + (dd === 1 ? " día" : " días"); }
  else {
    const pad = (n) => String(n).padStart(2, "0");
    timer.textContent = pad(Math.floor(sec / 3600)) + ":" + pad(Math.floor((sec % 3600) / 60)) + ":" + pad(sec % 60);
  }
  info.textContent = "Se cierra cuando empiece el primer partido";
}

function jornadaChips(cur, lo, hi, pick) {
  const box = $("jChips");
  if (!box) return;
  box.innerHTML = "";
  if (!cur || !lo || !hi) return;
  let a = Math.max(lo, cur - 2), b = Math.min(hi, a + 4);
  a = Math.max(lo, b - 4);
  for (let n = a; n <= b; n++) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "jc-chip" + (n === cur ? " on" : "");
    c.textContent = "J" + n;
    c.addEventListener("click", () => { if (n !== cur) pick(n); });
    box.appendChild(c);
  }
}

function renderJornadaBar() {
  const jv = $("jView");
  if (jv) jv.textContent = state.jornada || "–";
  const note = $("jNote");
  if (note) note.classList.toggle("hidden", !state.jornada || state.jornada === state.currentJornada);
  jornadaChips(state.jornada, state.minJornada, state.maxJornada, (n) => { viewJornada = n; load(); });
  updateCountdown();
}

setInterval(updateCountdown, 1000);

function render() {
  const panel = $("porraPanel");
  const auth = $("porraAuth");
  if (!panel) return;
  panel.innerHTML = "";
  if (auth) auth.innerHTML = "";
  renderUserBox();

  renderJornadaBar();
  if (!state.matches.length) {
    panel.appendChild(el("p", "muted", state.jornada ? "Esta jornada no tiene partido de Madrid ni Barça en LaLiga (o está aplazado)." : "Cargando partidos…"));
    return;
  }
  if (!state.user && auth) renderLogin(auth);
  state.matches.forEach((m) => renderMatch(panel, m));

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
  let lastMd = "__";
  const sgn = (x, y) => (x > y ? "H" : x < y ? "A" : "D");
  const sgnTxt = (c, h) => (c === "D" ? "empate" : "victoria del " + shortName(c === "H" ? h.home : h.away));
  list.forEach((h) => {
    const md = h.matchday || null;
    if (md !== lastMd) {
      lastMd = md;
      box.appendChild(el("h3", "hist-jornada", md ? "Jornada " + md : "Otras jornadas"));
    }
    const card = el("div", "porra-card hx");
    const day = h.utcDate ? new Date(h.utcDate).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "";
    if (day) card.appendChild(el("div", "hx-date", day));
    const sc = el("div", "hx-score");
    const tl = el("div", "hx-team"); if (h.homeCrest) { const im = el("img", "hx-crest"); im.src = h.homeCrest; im.alt = ""; im.addEventListener("error", () => im.remove()); tl.appendChild(im); }
    tl.appendChild(el("span", null, shortName(h.home)));
    const tr = el("div", "hx-team"); if (h.awayCrest) { const im = el("img", "hx-crest"); im.src = h.awayCrest; im.alt = ""; im.addEventListener("error", () => im.remove()); tr.appendChild(im); }
    tr.appendChild(el("span", null, shortName(h.away)));
    sc.appendChild(tl);
    sc.appendChild(el("div", "hx-res", h.result ? h.result.home + " - " + h.result.away : "vs"));
    sc.appendChild(tr);
    card.appendChild(sc);
    if (h.result) card.appendChild(el("div", "hx-final", "Resultado final · " + (h.result.home === h.result.away ? "empate" : sgnTxt(sgn(h.result.home, h.result.away), h))));
    (h.entries || []).forEach((e) => {
      const row = el("div", "hx-entry");
      const won = e.prize != null && e.prize > 0;
      row.classList.add(e.tipo === "exacto" ? "exacto" : won ? "signo" : "fallo");
      row.appendChild(el("div", "hx-name", e.name));
      row.appendChild(el("div", "hx-pred", "Puso " + e.home + " - " + e.away));
      let why = "";
      if (h.result) {
        if (e.tipo === "exacto") why = "✅ Clavó el marcador exacto · " + money(e.prize) + " €";
        else if (won) why = "🟡 Acertó " + sgnTxt(sgn(e.home, e.away), h) + ", pero no el marcador · " + money(e.prize) + " €";
        else why = "❌ Falló: puso " + sgnTxt(sgn(e.home, e.away), h) + " y fue " + (h.result.home === h.result.away ? "empate" : sgnTxt(sgn(h.result.home, h.result.away), h));
      }
      if (why) row.appendChild(el("div", "hx-why", why));
      card.appendChild(row);
    });
    if (!(h.entries || []).length) card.appendChild(el("p", "empty", "Nadie pronosticó este partido."));
    box.appendChild(card);
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
  const teams = state.matches.map((m) => m.home + " - " + m.away).join("   ·   ");
  if (hint) hint.textContent = (teams ? "La porra de esta jornada es sobre: " + teams + ". " : "") + (names.length ? names.length + " participante" + (names.length === 1 ? "" : "s") + "." : "");
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

/* El cambio de pestaña deslizando con el dedo se quitó: en móvil daba
   saltos sin querer al hacer scroll. Las pestañas se cambian con su botón. */

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
      body: JSON.stringify({ matchId: m.matchId, home: h.value, away: a.value, jornada: state.jornada }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    state = d.state;
    render();
  } catch (e) { if (err) err.textContent = e.message; }
}

async function load() {
  try {
    const res = await fetch(API + "/porra" + (viewJornada ? "?jornada=" + viewJornada : ""));
    state = await res.json();
    render();
  } catch (e) {}
  document.documentElement.classList.remove("auth-loading");
}

load();
setInterval(load, 60000);
