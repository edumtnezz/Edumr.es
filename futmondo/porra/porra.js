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
let histJ = null;

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
  intro.appendChild(el("p", "muted", "Nombre y código de 4 o 6 números. Si no tienes cuenta, se crea al entrar."));
  panel.appendChild(intro);
  const go = el("a", "btn-primary big", "Crear cuenta o entrar");
  go.href = "/futmondo/cuenta/?next=" + encodeURIComponent("/futmondo/porra/");
  panel.appendChild(go);
}

var ICO = {
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/>'
};
function ico(name, cls) {
  return '<svg class="ico ' + (cls || "") + '" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[name] + '</svg>';
}
function shortName(n) {
  return String(n || "").replace(/^(FC|RC|CA|UD|SD|CD|RCD)\s+/, "").replace(/\s+(CF|FC|SD|UD)$/, "");
}

function teamCol(name, crest, side) {
  const c = el("div", "pc3-team pc3-" + side);
  c.appendChild(crestEl(crest, name));
  c.appendChild(el("span", "pc3-name", shortName(name)));
  return c;
}

function renderMatch(panel, m) {
  const card = el("div", "porra-card pc3");
  const head = el("div", "pc3-head");
  head.appendChild(el("span", "pc3-comp", "LaLiga" + (m.matchday ? " · J" + m.matchday : "")));
  const when = m.started && m.result
    ? "Final"
    : (m.utcDate ? new Date(m.utcDate).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(",", "").toUpperCase() + " · " + fmtDate(m.utcDate).time : "");
  head.appendChild(el("span", "pc3-when" + (m.started && m.result ? " done" : ""), when));
  card.appendChild(head);

  const row = el("div", "pc3-row");
  row.appendChild(teamCol(m.home, m.homeCrest, "h"));
  const mid = el("div", "pc3-mid");
  const canPredict = state.user && !m.locked && !m.started;
  if (m.result) {
    mid.appendChild(el("div", "pc3-score", m.result.home + " - " + m.result.away));
  } else if (canPredict) {
    const pred = el("div", "porra-pred pc3-pred");
    const hi = el("input"); hi.type = "number"; hi.min = 0; hi.max = 30; hi.id = "poH" + m.matchId; hi.inputMode = "numeric"; hi.setAttribute("aria-label", "Goles de " + m.home);
    hi.value = m.my ? m.my.home : ""; hi.dataset.saved = hi.value;
    const lo = el("input"); lo.type = "number"; lo.min = 0; lo.max = 30; lo.id = "poA" + m.matchId; lo.inputMode = "numeric"; lo.setAttribute("aria-label", "Goles de " + m.away);
    lo.value = m.my ? m.my.away : ""; lo.dataset.saved = lo.value;
    pred.appendChild(hi); pred.appendChild(el("span", "porra-dash", "-")); pred.appendChild(lo);
    mid.appendChild(pred);
  } else {
    mid.appendChild(el("div", "pc3-vs", "VS"));
  }
  row.appendChild(mid);
  row.appendChild(teamCol(m.away, m.awayCrest, "a"));
  card.appendChild(row);

  if (!state.user) {
    // sin sesion no se pronostica
  } else if (m.locked) {
    const l = el("div", "pc3-note"); l.innerHTML = ico("lock") + "<span>Se abre en la jornada " + escapeHtml(m.matchday) + "</span>"; card.appendChild(l);
  } else if (m.started) {
    const l = el("div", "pc3-note"); l.innerHTML = ico("lock") + "<span>" + (m.result ? "Cerrado · ya jugado" : "Cerrado · en juego") + "</span>"; card.appendChild(l);
  } else {
    const save = el("button", "btn-primary pc-save", m.my ? "Actualizar pronóstico" : "Guardar pronóstico");
    save.addEventListener("click", () => guardar(m));
    card.appendChild(save);
    const err = el("p", "error"); err.id = "poErr" + m.matchId; card.appendChild(err);
  }

  const list = el("div", "pe3-list");
  (m.entries || []).forEach((e) => {
    const erow = el("div", "pe3");
    const won = e.prize != null && e.prize > 0;
    if (won) erow.classList.add(e.tipo === "exacto" ? "exacto" : "signo");
    erow.appendChild(el("span", "pe3-name", e.name));
    erow.appendChild(el("span", "pe3-score", e.home + " - " + e.away));
    const tag = el("span", "pe3-tag");
    if (won) tag.textContent = (e.tipo === "exacto" ? "Exacto · " : e.tipo === "signo" ? "Signo · " : "") + money(e.prize) + " €";
    erow.appendChild(tag);
    list.appendChild(erow);
  });
  if (!(m.entries || []).length) list.appendChild(el("p", "empty", "Todavía no hay pronósticos."));
  card.appendChild(list);
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
    timer.textContent = state.matches.length ? "Cerrada" : "–";
    info.textContent = state.matches.length ? "Ya han empezado los partidos" : "Sin partidos de LaLiga en esta jornada.";
    return;
  }
  box.classList.remove("closed");
  const sec = Math.floor((new Date(up[0].utcDate).getTime() - now) / 1000);
  if (sec >= 86400) { const dd = Math.floor(sec / 86400); timer.textContent = dd + (dd === 1 ? " día" : " días"); }
  else {
    const pad = (n) => String(n).padStart(2, "0");
    timer.textContent = pad(Math.floor(sec / 3600)) + ":" + pad(Math.floor((sec % 3600) / 60)) + ":" + pad(sec % 60);
  }
  info.textContent = state.matches.some((m) => m.started) ? "Hasta el próximo partido" : "Se cierra al empezar el primer partido";
}

function jornadaChips(cur, lo, hi, pick, boxId) {
  const box = $(boxId || "jChips");
  if (!box) return;
  box.innerHTML = "";
  if (!cur || !lo || !hi) return;
  let a = Math.max(lo, cur - 1), b = Math.min(hi, a + 2);
  a = Math.max(lo, b - 2);
  const arrow = (txt, to, dis, title) => {
    const c = document.createElement("button");
    c.type = "button"; c.className = "jc-arrow"; c.textContent = txt; c.title = title; c.disabled = dis;
    c.addEventListener("click", () => { if (!dis) pick(to); });
    return c;
  };
  box.appendChild(arrow("‹", cur - 1, cur <= lo, "Jornada anterior"));
  for (let n = a; n <= b; n++) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "jc-chip" + (n === cur ? " on" : "");
    c.textContent = "J" + n;
    c.addEventListener("click", () => { if (n !== cur) pick(n); });
    box.appendChild(c);
  }
  box.appendChild(arrow("›", cur + 1, cur >= hi, "Jornada siguiente"));
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
    panel.appendChild(el("p", "muted", state.jornada ? "Esta jornada no tiene partido de Madrid ni Barça en LaLiga (o está aplazado)." : ""));
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
  const mds = list.map((h) => h.matchday).filter(Boolean);
  if (!mds.length) { box.appendChild(el("p", "empty", "Todavía no hay jornadas pasadas.")); return; }
  if (histJ === null || (mds.length && (histJ < Math.min.apply(null, mds) || histJ > Math.max.apply(null, mds)))) histJ = mds.length ? Math.max.apply(null, mds) : 0;
  if (mds.length) {
    const sel = el("div", "jc-chips hist-chips"); sel.id = "hChips";
    box.appendChild(sel);
    jornadaChips(histJ, Math.min.apply(null, mds), Math.max.apply(null, mds), (n) => { histJ = n; renderHistory(); }, "hChips");
  }
  const shown = list
    .filter((h) => h.matchday === histJ)
    .sort((x, y) => new Date(x.utcDate || 0) - new Date(y.utcDate || 0));
  box.appendChild(el("h3", "hist-jornada", "Jornada " + histJ));
  if (!shown.length) box.appendChild(el("p", "empty", "No hay partidos guardados de esta jornada."));
  const sgn = (x, y) => (x > y ? "H" : x < y ? "A" : "D");
  const sgnTxt = (c, h) => (c === "D" ? "empate" : "victoria del " + shortName(c === "H" ? h.home : h.away));
  shown.forEach((h) => {
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
        if (e.tipo === "exacto") why = ico("check", "ok") + "<span>Clavó el marcador · " + money(e.prize) + " €</span>";
        else if (won) why = ico("minus", "mid") + "<span>Acertó " + escapeHtml(sgnTxt(sgn(e.home, e.away), h)) + " · " + money(e.prize) + " €</span>";
        else why = ico("x", "ko") + "<span>Falló: puso " + escapeHtml(sgnTxt(sgn(e.home, e.away), h)) + "</span>";
      }
      if (why) { const w = el("div", "hx-why"); w.innerHTML = why; row.appendChild(w); }
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
  const isSusp = (m) => /POSTPONED|SUSPENDED|CANCELLED/.test(m.status || "");
  // El premio solo se enseña cuando TODOS los partidos de la jornada han terminado
  // (o están suspendidos/aplazados, que no cuentan). Antes, solo los pronósticos.
  const finished = state.matches.length > 0 && state.matches.every((m) => m.result || isSusp(m));
  const tot = {};
  state.matches.forEach((m) => (m.entries || []).forEach((e) => {
    const t = tot[e.name] || (tot[e.name] = { name: e.name, prize: 0, ex: 0, byMatch: {} });
    t.byMatch[m.matchId] = e;
    if (!isSusp(m) && m.result && e.prize > 0) { t.prize += e.prize; if (e.tipo === "exacto") t.ex++; }
  }));
  const rank = Object.values(tot).sort((x, y) => (finished ? y.prize - x.prize || y.ex - x.ex : 0) || x.name.localeCompare(y.name, "es"));
  const susp = state.matches.filter(isSusp);
  if (hint) hint.textContent = rank.length
    ? rank.length + " participante" + (rank.length === 1 ? "" : "s") + " con porra en esta jornada. " + (finished ? "Ordenados por lo que han ganado." : "Los premios se verán cuando termine la jornada.") + (susp.length ? " Los partidos suspendidos o aplazados no cuentan." : "")
    : "";
  if (!rank.length) { box.appendChild(el("p", "empty", "Todavía no hay participantes.")); return; }
  const medal = ["1º", "2º", "3º"];
  rank.forEach((r, i) => {
    const card = el("div", "porra-card pp");
    const head = el("div", "pp-head");
    head.appendChild(el("span", "pp-av", initials(r.name)));
    const hn = el("div", "pp-hn");
    hn.appendChild(el("div", "pp-name", r.name));
    if (finished) hn.appendChild(el("div", "pp-sub", (medal[i] || (i + 1) + "º") + " · " + money(r.prize) + " €"));
    else hn.appendChild(el("div", "pp-sub", "Pronóstico de la jornada"));
    head.appendChild(hn);
    card.appendChild(head);
    state.matches.forEach((m) => {
      const e = r.byMatch[m.matchId];
      const row = el("div", "pp-match");
      if (isSusp(m)) row.classList.add("susp");
      else if (finished && e && e.prize > 0) row.classList.add(e.tipo === "exacto" ? "exacto" : "signo");
      row.appendChild(el("div", "pp-lbl", m.label));
      const line = el("div", "pp-line");
      const l = el("div", "pp-t"); l.appendChild(crestEl(m.homeCrest, m.home)); l.appendChild(el("span", null, shortName(m.home)));
      const rr = el("div", "pp-t"); rr.appendChild(crestEl(m.awayCrest, m.away)); rr.appendChild(el("span", null, shortName(m.away)));
      line.appendChild(l);
      line.appendChild(el("div", "pp-score", e ? e.home + " - " + e.away : "—"));
      line.appendChild(rr);
      row.appendChild(line);
      if (isSusp(m)) { const pn = el("div", "pp-note"); pn.innerHTML = ico("pause") + "<span>Suspendido o aplazado: no cuenta</span>"; row.appendChild(pn); }
      else if (finished && e && e.prize != null && e.prize > 0) row.appendChild(el("div", "pp-note ok", "Ganó " + money(e.prize) + " €"));
      card.appendChild(row);
    });
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

let lastSig = "";
async function load(auto) {
  try {
    const res = await fetch(API + "/porra" + (viewJornada ? "?jornada=" + viewJornada : ""));
    const fresh = await res.json();
    const sig = JSON.stringify(fresh);
    if (auto && sig === lastSig) { document.documentElement.classList.remove("auth-loading"); return; }
    lastSig = sig;
    state = fresh;
    render();
  } catch (e) {}
  document.documentElement.classList.remove("auth-loading");
}

load();
setInterval(() => {
  if (document.hidden) return;
  const ae = document.activeElement;
  if (ae && ae.tagName === "INPUT") return;
  const dirty = Array.prototype.some.call(document.querySelectorAll(".porra-pred input"), (i) => i.value !== "" && i.dataset.saved !== i.value);
  if (!dirty) load(true);
}, 30000);
