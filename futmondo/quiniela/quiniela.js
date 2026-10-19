const API = "/api/laquiniela";
// Minuto/parte de los partidos en juego (dato real de Comuniate vía /jornada), por escudo del local.
const liveMinByCrest = {};
async function refreshLiveMinutes() {
  try {
    const d = await (await fetch(API + "/jornada", { cache: "no-store" })).json();
    (d.matches || []).forEach((x) => { if (x.live && x.live.state === "live" && x.live.minute && x.live.minute !== "EN JUEGO") liveMinByCrest[x.homeCrest] = x.live.minute; else delete liveMinByCrest[x.homeCrest]; });
    document.querySelectorAll(".bq-meta[data-crest]").forEach((w) => {
      const lm = liveMinByCrest[w.dataset.crest], st = w.querySelector(".bq-st");
      if (lm && st && /(En juego|Descanso|ª parte|Min\.)/.test(st.textContent)) st.textContent = lm;
    });
  } catch (e) {}
}
refreshLiveMinutes();
setInterval(refreshLiveMinutes, 60000);
const THEME_KEY = "theme";
window.__themeHandled = true;
let state = null;
let picks = {};
let apodo = "";
let authMode = "registro";
let editing = false;
let viewJornada = null;
let currentJornada = null;
let rankMode = "jornada";
let globalData = null;
let tabInitialized = false;
let picksDirty = false;

const $ = (id) => document.getElementById(id);

/* ---------- Tema claro / oscuro (compartido con toda la web) ---------- */

function setThemeAttr(t) {
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

function saveTheme(t) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch (e) {}
}

(function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (e) {}
  setThemeAttr(saved === "dark" ? "dark" : "light");
})();

/* ---------- Saludo ---------- */

function updateWelcome() {
  const h = new Date().getHours();
  let saludo;
  if (h >= 6 && h < 12) saludo = "Buenos Días";
  else if (h >= 12 && h < 21) saludo = "Buenas Tardes";
  else saludo = "Buenas Noches";
  const name = state && state.myName ? state.myName : null;
  const g = $("welcomeGreeting");
  const s = $("welcomeSub");
  if (!g) return;
  g.textContent = `Con permiso, ¡${saludo}${name ? ", " + name : ""}!`;
  if (s) {
    s.textContent = name
      ? "Aquí tienes tu quiniela: elige 1, X o 2 en cada partido y guárdala antes de que empiece el primer partido."
      : "Juega la quiniela de LaLiga con tus compañeros. Es rápido y gratis.";
  }
  const steps = $("welcomeSteps");
  if (steps) {
    let seen = false;
    try {
      seen = localStorage.getItem("quiniela_seen") === "1";
    } catch (e) {}
    steps.classList.toggle("hidden", seen);
  }
}

function markSeen() {
  try {
    localStorage.setItem("quiniela_seen", "1");
  } catch (e) {}
  const steps = $("welcomeSteps");
  if (steps) steps.classList.add("hidden");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function money(n) {
  return Number(n || 0).toLocaleString("es-ES");
}

function fmtDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return { date, time, short: `${d.getDate()} ${d.toLocaleDateString("es-ES", { month: "short" })} · ${time}h` };
}

function statusLabel(status) {
  const map = {
    SCHEDULED: "Por jugar",
    TIMED: "Por jugar",
    IN_PLAY: "En juego",
    PAUSED: "Descanso",
    FINISHED: "Finalizado",
    POSTPONED: "Aplazado",
    SUSPENDED: "Suspendido",
    CANCELED: "Cancelado",
  };
  return map[status] || status || "";
}

/* ---------- Piezas de UI ---------- */

function crestEl(crest, fallback) {
  const fb = document.createElement("div");
  fb.className = "crest-fallback";
  fb.textContent = String(fallback || "?").slice(0, 3).toUpperCase();
  if (!crest) return fb;
  const img = document.createElement("img");
  img.className = "crest";
  img.src = crest;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => {
    if (img.parentNode) img.parentNode.replaceChild(fb, img);
  });
  return img;
}

function formEl(list) {
  const wrap = document.createElement("div");
  wrap.className = "form";
  if (!list || !list.length) {
    const e = document.createElement("span");
    e.className = "form-empty";
    e.textContent = "sin datos";
    wrap.appendChild(e);
    return wrap;
  }
  list
    .slice()
    .reverse()
    .forEach((f) => {
      const el = document.createElement("span");
      el.className = "f " + (f.r === "V" ? "v" : f.r === "E" ? "e" : "d");
      el.textContent = f.r;
      const i = document.createElement("i");
      i.textContent = f.home ? "C" : "F";
      i.title = f.home ? "jugó en casa" : "jugó fuera";
      el.appendChild(i);
      el.title = `${f.r === "V" ? "Victoria" : f.r === "E" ? "Empate" : "Derrota"}${
        f.home ? " en casa" : " fuera"
      }`;
      wrap.appendChild(el);
    });
  const arrow = document.createElement("span");
  arrow.className = "form-arrow";
  arrow.textContent = "→";
  arrow.title = "la flecha señala el partido más reciente";
  wrap.appendChild(arrow);
  return wrap;
}

function dayLabel(d) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd - today) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function teamEl(side, match, team) {
  const span = document.createElement("span");
  span.className = "team " + side;
  const main = document.createElement("span");
  main.className = "team-main";
  main.appendChild(crestEl(team.crest, team.tla || team.name));
  const t = document.createElement("span");
  t.className = "tname";
  t.textContent = team.name;
  main.appendChild(t);
  span.appendChild(main);
  span.appendChild(formEl(side === "home" ? match.homeForm : match.awayForm));
  return span;
}

function vsEl() {
  const v = document.createElement("span");
  v.className = "vs";
  v.textContent = "VS";
  return v;
}

/* ---------- Countdown ---------- */

function updateCountdown() {
  if (!state) return;
  const box = $("countdownPanel");
  const timer = $("cdTimer");
  const info = $("cdInfo");

  if (!state.openCount || state.openCount === 0 || !state.nextMatch) {
    box.classList.add("closed");
    timer.textContent = "CERRADA";
    info.textContent = "Todos los partidos de esta jornada ya han empezado.";
    return;
  }

  const nm = state.nextMatch;
  const diff = new Date(nm.utcDate).getTime() - Date.now();
  if (diff <= 0) {
    box.classList.add("closed");
    timer.textContent = "CERRADA";
    return;
  }
  box.classList.remove("closed");

  const totalSec = Math.floor(diff / 1000);
  if (totalSec >= 86400) {
    const days = Math.floor(totalSec / 86400);
    timer.textContent = days + (days === 1 ? " día" : " días");
  } else {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    timer.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  info.textContent = "Se cierra cuando empiece el primer partido";
}

/* ---------- Render ---------- */

function renderHeader() {
  const jn = $("jornadaNum");
  if (jn) jn.textContent = state.matchday || "–";
  const box = $("userBox");
  if (box) {
    box.innerHTML = "";
    if (state.myName) {
      apodo = state.myName;
      box.hidden = false;
      const chip = document.createElement("button"); chip.type = "button"; chip.className = "user-chip";
      chip.innerHTML = `<span class="user-avatar">${escapeHtml(initials(state.myName))}</span><span class="user-name">${escapeHtml(state.myName)}</span><span class="user-caret">▾</span>`;
      const menu = document.createElement("div"); menu.className = "user-menu";
      const exit = document.createElement("button"); exit.type = "button"; exit.className = "user-menu-exit"; exit.textContent = "Salir";
      exit.onclick = logout;
      menu.appendChild(exit);
      box.appendChild(chip); box.appendChild(menu);
      chip.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
      if (!document.__umWired) { document.__umWired = 1; document.addEventListener("click", (e) => { document.querySelectorAll(".user-menu.open").forEach((m) => { if (!m.parentElement.contains(e.target)) m.classList.remove("open"); }); }); }
    } else {
      box.hidden = true;
    }
  }
}

function renderMatches() {
  const list = $("matchList");
  list.innerHTML = "";
  const locked = state.locked;

  const matches = state.matches.slice();
  matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  let lastDay = null;
  matches.forEach((m) => {
    {
      const d = new Date(m.utcDate);
      const key = d.toDateString();
      if (key !== lastDay) {
        lastDay = key;
        const head = document.createElement("div");
        head.className = "day-head";
        head.textContent = dayLabel(d);
        list.appendChild(head);
      }
    }

    const row = document.createElement("div");
    row.className = "match-row bq";
    row.dataset.match = m.id;
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const hasScore = m.score && m.score.home !== null && m.score.home !== undefined;
    const main = mk("div", "bq-main");
    const f = fmtDate(m.utcDate);
    const stale = /^(IN_PLAY|PAUSED)$/.test(m.status || "") && m.utcDate && Date.now() - new Date(m.utcDate).getTime() > 3 * 3600 * 1000;
    const myPickM = picks[m.id];
    const verdict = m.result && myPickM ? (myPickM === m.result ? "hit" : "miss") : "";
    if (verdict) row.classList.add(verdict);
    const stTxt = verdict === "hit" ? "Acertado" : verdict === "miss" ? "Fallado" : stale ? "Pendiente de resultado" : (/^IN_PLAY$/.test(m.status || "") && liveMinByCrest[m.homeCrest]) || statusLabel(m.status);
    // Cabecera tocable: abre el detalle (forma de los equipos y pronósticos de todos)
    const head = mk("button", "bq-head");
    head.type = "button";
    head.setAttribute("aria-expanded", "false");
    const meta = mk("div", "bq-meta");
    meta.dataset.crest = m.homeCrest || "";
    meta.appendChild(mk("span", "bq-time", f.short));
    const live = /^(IN_PLAY|PAUSED)$/.test(m.status || "") && !stale;
    const stEl = mk("span", "bq-st" + (live ? " live" : verdict ? " " + verdict : m.result ? " fin" : ""), stTxt);
    meta.appendChild(stEl);
    const chev = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chev.setAttribute("viewBox", "0 0 24 24"); chev.setAttribute("class", "bq-chev"); chev.setAttribute("aria-hidden", "true");
    chev.setAttribute("fill", "none"); chev.setAttribute("stroke", "currentColor"); chev.setAttribute("stroke-width", "2.2"); chev.setAttribute("stroke-linecap", "round"); chev.setAttribute("stroke-linejoin", "round");
    const chp = document.createElementNS("http://www.w3.org/2000/svg", "path"); chp.setAttribute("d", "M6 9l6 6 6-6"); chev.appendChild(chp);
    meta.appendChild(chev);
    head.appendChild(meta);
    const teams = mk("div", "bq-teams");
    const side = (name, crest, tla, cls) => {
      const t = mk("div", "bq-team " + cls);
      t.appendChild(crestEl(crest, tla || name));
      t.appendChild(mk("span", "bq-name", name));
      return t;
    };
    teams.appendChild(side(m.home, m.homeCrest, m.homeTla, "h"));
    teams.appendChild(mk("div", "bq-mid" + (hasScore ? " score" : ""), hasScore ? `${m.score.home} - ${m.score.away}` : "VS"));
    teams.appendChild(side(m.away, m.awayCrest, m.awayTla, "a"));
    head.appendChild(teams);
    main.appendChild(head);
    const btns = mk("div", "bq-picks");
    [["1", "Local"], ["X", "Empate"], ["2", "Visitante"]].forEach(([opt, lab]) => {
      const b = mk("button", "bq-pick");
      b.type = "button";
      b.appendChild(mk("b", null, opt)); b.appendChild(mk("small", null, lab));
      b.dataset.match = m.id;
      b.dataset.pick = opt;
      const myPick = picks[m.id] === opt;
      if (myPick) b.classList.add("selected");
      if (m.result) {
        if (myPick) b.classList.remove("selected");
        if (opt === m.result) b.classList.add("correct");
        else if (myPick) b.classList.add("wrong");
        else b.classList.add("dim");
      }
      if (m.started || !editing) b.disabled = true;
      b.addEventListener("click", () => selectPick(m.id, opt));
      btns.appendChild(b);
    });
    main.appendChild(btns);
    // Detalle plegado
    const more = mk("div", "bq-more");
    const fr = mk("div", "bq-forms");
    [[m.homeTla || m.home, m.homeForm], [m.awayTla || m.away, m.awayForm]].forEach(([nm, fm]) => {
      const c = mk("div", "bq-form"); c.appendChild(mk("span", "bq-form-n", nm)); c.appendChild(formEl(fm)); fr.appendChild(c);
    });
    more.appendChild(fr);
    more.appendChild(mk("p", "bq-form-note", "Últimos 5 partidos, el más reciente a la derecha."));
    const others = (state.participants || []).filter((p) => p.picks && p.picks[m.id]);
    if (others.length) {
      const ow = mk("div", "bq-others");
      others.forEach((p) => {
        const pk = p.picks[m.id];
        const chip = mk("span", "bq-oth" + (m.result ? (pk === m.result ? " ok" : " ko") : ""));
        chip.appendChild(mk("span", "bq-oth-n", p.name));
        chip.appendChild(mk("b", null, pk));
        ow.appendChild(chip);
      });
      more.appendChild(ow);
    }
    main.appendChild(more);
    head.addEventListener("click", () => {
      const on = row.classList.toggle("open");
      head.setAttribute("aria-expanded", on ? "true" : "false");
    });
    row.appendChild(main);
    list.appendChild(row);
  });

  // Cabecera / botones
  const hasPred = state.hasPrediction;
  const openCount = state.openCount || 0;
  const canEdit = openCount > 0;
  $("saveBtn").classList.toggle("hidden", !canEdit);
  $("saveBtn").disabled = false;

  if (!canEdit) {
    $("picksHint").textContent = hasPred ? "" : "No registraste pronóstico en esta jornada.";
    $("picksHint").hidden = !!hasPred;
  } else {
    $("picksHint").hidden = false;
    $("picksHint").textContent = hasPred
      ? "Puedes cambiar los partidos que aún no han empezado y volver a guardar."
      : "Elige 1, X o 2 en los partidos que aún no han empezado. Pulsa Guardar al terminar.";
  }
}

function selectPick(matchId, opt) {
  if (!editing) return;
  const mm = state.matches.find((x) => x.id === matchId);
  if (mm && mm.started) return;
  picks[matchId] = opt;
  picksDirty = true;
  const row = document.querySelector(`.match-row[data-match="${matchId}"]`);
  if (row) row.classList.remove("missing");
  document.querySelectorAll(`.bq-pick[data-match="${matchId}"]`).forEach((b) => {
    b.classList.toggle("selected", b.dataset.pick === opt);
  });
  $("saveMsg").textContent = "";
}

function renderRanking() {
  const podium = $("podium");
  const cards = $("rankCards");
  const empty = $("rankEmpty");
  podium.innerHTML = "";
  cards.innerHTML = "";

  const list = state.standings || [];
  $("playersChip").textContent = `${list.length} jugador${list.length === 1 ? "" : "es"}`;
  if (!list.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const myKey = apodo ? apodo.toLowerCase() : null;
  const medals = ["🥇", "🥈", "🥉"];
  const top = list.slice(0, 3);
  (list.length >= 3 ? [1, 0, 2] : []).forEach((idx) => {
    const s = top[idx];
    if (!s) return;
    const place = idx + 1;
    const slot = document.createElement("div");
    slot.className = `podium-slot podium-${place}`;
    slot.innerHTML = `
      <span class="podium-medal">${medals[idx]}</span>
      <span class="podium-avatar">${escapeHtml(initials(s.name))}</span>
      <span class="podium-name">${escapeHtml(s.name)}</span>
      <span class="podium-prize">${money(s.prize)}</span>
      <span class="podium-sub">${s.hits} acierto${s.hits === 1 ? "" : "s"}</span>`;
    podium.appendChild(slot);
  });

  const maxPrize = Math.max(1, list[0].prize || 0);
  list.forEach((s, i) => {
    const place = i + 1;
    const card = document.createElement("div");
    card.className = "rank-card";
    if (place <= 3) card.classList.add(`player-${place}`);
    if (myKey && s.key === myKey) card.classList.add("me");
    const detail =
      s.played > 0
        ? `${s.hits} acertados · ${s.missed} fallados`
        : `Aún sin resultados (${s.total} pronósticos)`;
    const badge = myKey && s.key === myKey ? '<span class="me-badge">TÚ</span>' : "";
    card.innerHTML = `
      <span class="rank-num">${medals[i] || place}</span>
      <span class="rank-avatar">${escapeHtml(initials(s.name))}</span>
      <span class="rank-info">
        <span class="rank-name">${escapeHtml(s.name)}${badge}</span>
        <span class="rank-detail">${detail}</span>
      </span>
      <span class="rank-score">
        <span class="rank-prize">${money(s.prize)}<small>prima</small></span>
      </span>`;
    const wrapC = document.createElement("div");
    wrapC.className = "rank-item";
    wrapC.dataset.pkey = s.key;
    wrapC.appendChild(card);
    const det = document.createElement("div");
    det.className = "rank-det hidden";
    wrapC.appendChild(det);
    cards.appendChild(wrapC);
    card.title = "Ver sus pronósticos";
    card.addEventListener("click", () => {
      if (det.classList.contains("hidden") && !det.firstChild) det.appendChild(picksGrid((state.participants || []).find((p) => p.key === s.key)));
      det.classList.toggle("hidden");
      card.classList.toggle("open", !det.classList.contains("hidden"));
    });
  });
}

/* Pronósticos de un participante: acierto en verde, fallo en rojo */
function picksGrid(p) {
  const grid = document.createElement("div");
  grid.className = "participant-picks";
  if (!p || !p.picks) { const n = document.createElement("div"); n.className = "hidden-note"; n.textContent = "Sin pronóstico en esta jornada."; return n; }
  sortedMatches().forEach((m) => {
    const pick = p.picks[m.id];
    const chip = document.createElement("span");
    chip.className = "ppick";
    if (m.result && pick) chip.classList.add(pick === m.result ? "ok" : "ko");
    const c1 = crestEl(m.homeCrest, m.homeTla); c1.classList.add("pc");
    const c2 = crestEl(m.awayCrest, m.awayTla); c2.classList.add("pc");
    const txt = document.createElement("span"); txt.className = "pt"; txt.textContent = `${m.homeTla || ""} - ${m.awayTla || ""}`;
    const val = document.createElement("span"); val.className = "pv"; val.textContent = pick || "–";
    chip.appendChild(c1); chip.appendChild(txt); chip.appendChild(c2); chip.appendChild(val);
    grid.appendChild(chip);
  });
  return grid;
}

async function loadGlobal() {
  try {
    globalData = await (await fetch(API + "/global")).json();
    renderGlobalRanking(globalData);
    $("summaryPanel").classList.add("hidden");
  } catch (e) {
    const h = $("rankingHint");
    if (h) h.textContent = "No se pudo cargar la clasificación general.";
  }
}

function renderGlobalRanking(data) {
  const podium = $("podium");
  const cards = $("rankCards");
  const empty = $("rankEmpty");
  podium.innerHTML = "";
  cards.innerHTML = "";
  const list = data.standings || [];
  const hist = $("rankingHint");
  if (hist) hist.textContent = `Clasificación general: suma de aciertos de ${data.jornadas.length} jornada(s).`;
  $("playersChip").textContent = `${list.length} jugador${list.length === 1 ? "" : "es"}`;
  if (!list.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const myKey = apodo ? apodo.toLowerCase() : null;
  const medals = ["🥇", "🥈", "🥉"];
  const top = list.slice(0, 3);
  [1, 0, 2].forEach((idx) => {
    const s = top[idx];
    if (!s) return;
    const place = idx + 1;
    const slot = document.createElement("div");
    slot.className = `podium-slot podium-${place}`;
    slot.innerHTML = `
      <span class="podium-medal">${medals[idx]}</span>
      <span class="podium-avatar">${escapeHtml(initials(s.name))}</span>
      <span class="podium-name">${escapeHtml(s.name)}</span>
      <span class="podium-prize">${s.total} pts</span>
      <span class="podium-sub">${s.jornadas} jornada${s.jornadas === 1 ? "" : "s"}</span>`;
    podium.appendChild(slot);
  });

  list.forEach((s, i) => {
    const place = i + 1;
    const card = document.createElement("div");
    card.className = "rank-card";
    if (place <= 3) card.classList.add(`player-${place}`);
    if (myKey && s.key === myKey) card.classList.add("me");
    const badge = myKey && s.key === myKey ? '<span class="me-badge">TÚ</span>' : "";
    const chips = (data.jornadas || [])
      .map((j) => {
        const h = s.byJornada[j];
        if (h === undefined) return "";
        return `<span class="jchip">J${j} <b>${h}</b></span>`;
      })
      .join("");
    card.innerHTML = `
      <span class="rank-num">${medals[i] || place}</span>
      <span class="rank-avatar">${escapeHtml(initials(s.name))}</span>
      <span class="rank-info">
        <span class="rank-name">${escapeHtml(s.name)}${badge}</span>
        <span class="jchips">${chips}</span>
      </span>
      <span class="rank-score"><span class="rank-prize">${s.total}<small>total</small></span></span>`;
    cards.appendChild(card);
    card.title = "Ver sus aciertos y fallos";
    card.addEventListener("click", () => openParticipant(s.key));
  });
}

function renderSummary() {
  const panel = $("summaryPanel");
  const allFinished = state.matches.length && state.matches.every((m) => m.result);
  if (!allFinished || !state.standings.length) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const chart = $("summaryChart");
  chart.innerHTML = "";
  const maxPrize = Math.max(1, state.standings[0].prize || 0);
  state.standings.forEach((s) => {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.innerHTML = `
      <span class="summary-name">${escapeHtml(s.name)} (${s.hits})</span>
      <span class="summary-bar"><i style="width:${Math.round((s.prize / maxPrize) * 100)}%"></i></span>
      <span class="summary-amount">${money(s.prize)}</span>`;
    chart.appendChild(row);
  });
}


/* Resumen de tu jornada: aciertos, premio y puesto de un vistazo */
function renderMyRecap() {
  const panel = $("picksPanel");
  if (!panel) return;
  let box = $("myRecap");
  if (!box) { box = document.createElement("div"); box.id = "myRecap"; box.className = "my-recap"; panel.insertBefore(box, panel.firstChild); }
  box.innerHTML = "";
  const key = (apodo || "").toLowerCase();
  const list = state.standings || [];
  const idx = list.findIndex((x) => x.key === key);
  const played = state.matches.filter((m) => m.result).length;
  if (idx < 0 || !played) { box.hidden = true; return; }
  box.hidden = false;
  const me = list[idx];
  const cell = (big, small) => { const c = document.createElement("div"); c.className = "rc-cell"; const b = document.createElement("b"); b.textContent = big; const sm = document.createElement("small"); sm.textContent = small; c.appendChild(b); c.appendChild(sm); return c; };
  box.appendChild(cell(`${me.hits}/${played}`, "aciertos"));
  box.appendChild(cell(money(me.prize), "prima"));
  box.appendChild(cell(`${idx + 1}º de ${list.length}`, "puesto"));
}

function sortedMatches() {
  return (state.matches || []).slice().sort((x, y) => new Date(x.utcDate) - new Date(y.utcDate));
}

function renderParticipants() {
  const wrap = $("participantsList");
  if (!wrap) return;
  wrap.innerHTML = "";
  const hitsOf = (p) => {
    let h = 0;
    sortedMatches().forEach((m) => { const pk = p.picks && p.picks[m.id]; if (pk && m.result && pk === m.result) h++; });
    return h;
  };
  const list = (state.participants || []).slice().sort((a, b) => hitsOf(b) - hitsOf(a) || String(a.name).localeCompare(String(b.name), "es"));
  const jornadaDone = state.matches.length > 0 && state.matches.every((m) => m.result || /POSTPONED|SUSPENDED|CANCELLED/.test(m.status || ""));
  const nSusp = state.matches.filter((m) => /POSTPONED|SUSPENDED|CANCELLED/.test(m.status || "")).length;
  $("participantsHint").textContent = `${list.length} participante${list.length === 1 ? "" : "s"}.` +
    (nSusp ? ` ${nSusp === 1 ? "Un partido suspendido o aplazado no cuenta." : nSusp + " partidos suspendidos o aplazados no cuentan."}` : "");

  if (!list.length) {
    wrap.innerHTML = `<p class="empty">Todavía no hay participantes.</p>`;
    return;
  }

  list.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "participant";
    card.dataset.pkey = p.key;

    let hits = 0;
    let played = 0;
    if (p.picks) {
      sortedMatches().forEach((m) => {
        const pick = p.picks[m.id];
        if (pick && m.result) {
          played++;
          if (pick === m.result) hits++;
        }
      });
    }
    const count = p.picks ? Object.keys(p.picks).length : 0;

    const head = document.createElement("button");
    head.type = "button";
    head.className = "participant-head";
    const av = document.createElement("span");
    av.className = "participant-avatar";
    av.textContent = initials(p.name);
    const info = document.createElement("span");
    info.className = "participant-info";
    const nm = document.createElement("span");
    nm.className = "participant-name";
    nm.textContent = ((["🥇", "🥈", "🥉"])[idx] || (idx + 1) + "º") + " " + p.name;
    const meta = document.createElement("span");
    meta.className = "participant-meta";
    meta.textContent = p.picks
      ? `${count} pronóstico${count === 1 ? "" : "s"}${played ? ` · ${hits} acierto${hits === 1 ? "" : "s"}` : ""}`
      : "Sin pronóstico";
    info.appendChild(nm);
    info.appendChild(meta);
    head.appendChild(av);
    head.appendChild(info);
    if (played) {
      const badge = document.createElement("span");
      badge.className = "participant-badge";
      badge.textContent = jornadaDone ? `${money(hits * ((state && state.prizePerHit) || 150000))} €` : `${hits} ✓`;
      head.appendChild(badge);
    }
    const chev = document.createElement("span");
    chev.className = "participant-chevron";
    chev.textContent = "▾";
    head.appendChild(chev);

    const bodyEl = document.createElement("div");
    bodyEl.className = "participant-body hidden";
    head.addEventListener("click", () => {
      bodyEl.classList.toggle("hidden");
      head.classList.toggle("open", !bodyEl.classList.contains("hidden"));
    });

    card.appendChild(head);

    if (played) {
      const okList = [];
      const koList = [];
      sortedMatches().forEach((m) => {
        const pick = p.picks && p.picks[m.id];
        if (!pick || !m.result) return;
        const label = `${m.home} - ${m.away}`;
        if (pick === m.result) okList.push(label);
        else koList.push(label);
      });
      const sum = document.createElement("div");
      sum.className = "participant-summary";
      const pills = (list) => list.map((t) => `<i>${escapeHtml(t)}</i>`).join("");
      if (okList.length) {
        const okSpan = document.createElement("span");
        okSpan.className = "ps-ok";
        okSpan.innerHTML = `<b>✓ Acertó</b><em class="ps-pills">${pills(okList)}</em>`;
        sum.appendChild(okSpan);
      }
      if (koList.length) {
        const koSpan = document.createElement("span");
        koSpan.className = "ps-ko";
        koSpan.innerHTML = `<b>✗ Falló</b><em class="ps-pills">${pills(koList)}</em>`;
        sum.appendChild(koSpan);
      }
      if (!okList.length && !koList.length) sum.classList.add("hidden");
      bodyEl.appendChild(sum);
    }

    if (!p.picks) {
      const note = document.createElement("div");
      note.className = "hidden-note";
      note.textContent = "Sin pronóstico en esta jornada.";
      bodyEl.appendChild(note);
    } else {
      const grid = document.createElement("div");
      grid.className = "participant-picks";
      sortedMatches().forEach((m) => {
        const pick = p.picks[m.id];
        const chip = document.createElement("span");
        chip.className = "ppick";
        if (m.result && pick) chip.classList.add(pick === m.result ? "ok" : "ko");
        const c1 = crestEl(m.homeCrest, m.homeTla);
        c1.classList.add("pc");
        const c2 = crestEl(m.awayCrest, m.awayTla);
        c2.classList.add("pc");
        const txt = document.createElement("span");
        txt.className = "pt";
        txt.textContent = `${m.homeTla || ""} - ${m.awayTla || ""}`;
        const val = document.createElement("span");
        val.className = "pv";
        val.textContent = pick || "–";
        chip.appendChild(c1);
        chip.appendChild(txt);
        chip.appendChild(c2);
        chip.appendChild(val);
        grid.appendChild(chip);
      });
      bodyEl.appendChild(grid);
    }
    card.appendChild(bodyEl);
    wrap.appendChild(card);
  });
}

function renderPartido(data) {
  const match = $("partidoMatch");
  const list = $("partidoList");
  if (!match || !list) return;
  match.innerHTML = "";
  list.innerHTML = "";

  const row = document.createElement("div");
  row.className = "pm-row";
  const home = document.createElement("span");
  home.className = "pm-team";
  home.appendChild(crestEl(data.homeCrest, "ATM"));
  const hn = document.createElement("span");
  hn.textContent = data.home;
  home.appendChild(hn);
  const vs = document.createElement("span");
  vs.className = "vs";
  vs.textContent = "VS";
  const away = document.createElement("span");
  away.className = "pm-team";
  away.appendChild(crestEl(data.awayCrest, "RMA"));
  const an = document.createElement("span");
  an.textContent = data.away;
  away.appendChild(an);
  row.appendChild(home);
  row.appendChild(vs);
  row.appendChild(away);
  match.appendChild(row);

  const r = data.result;
  if (r && r.home != null && r.away != null) {
    const res = document.createElement("div");
    res.className = "pm-result";
    res.textContent = `Resultado final: ${r.home} - ${r.away}`;
    match.appendChild(res);
  } else {
    const pend = document.createElement("div");
    pend.className = "pm-pending";
    const f = data.utcDate ? fmtDate(data.utcDate) : null;
    pend.textContent = f ? `Se juega el ${f.date} a las ${f.time}` : "Resultado por decidir";
    match.appendChild(pend);
  }

  const sign = (h, a) => (h > a ? 1 : h < a ? 2 : 0);
  const rOk = r && r.home != null && r.away != null;

  (data.entries || []).forEach((e) => {
    let prize = null;
    let tipo = "";
    if (typeof e.prize === "number") {
      prize = e.prize;
      tipo = e.tipo || "";
    } else if (rOk) {
      if (e.home === r.home && e.away === r.away) {
        prize = 1000000;
        tipo = "exacto";
      } else if (sign(e.home, e.away) === sign(r.home, r.away)) {
        prize = 500000;
        tipo = "signo";
      } else {
        prize = 0;
      }
    }

    const erow = document.createElement("div");
    erow.className = "partido-entry";
    if (prize != null && prize > 0) erow.classList.add("winner");
    const nm = document.createElement("span");
    nm.className = "pe-name";
    nm.textContent = e.name;
    const sc = document.createElement("span");
    sc.className = "pe-score";
    sc.textContent = `${e.home} - ${e.away}`;
    const tag = document.createElement("span");
    tag.className = "pe-tag";
    if (prize != null && prize > 0) {
      const pref = tipo === "exacto" ? "Exacto · " : tipo === "signo" ? "Signo · " : "";
      tag.textContent = pref + money(prize) + " €";
    }
    erow.appendChild(nm);
    erow.appendChild(sc);
    erow.appendChild(tag);
    list.appendChild(erow);
  });
}

async function loadPartido() {
  try {
    const data = await (await fetch(API + "/partido")).json();
    renderPartido(data);
  } catch (e) {}
}

function renderPrizes() {
  const ul = $("prizeList");
  if (!ul) return;
  ul.innerHTML = "";
  const perHit = (state && state.prizePerHit) || 150000;
  const li = document.createElement("li");
  li.innerHTML = `<span>Cada partido acertado</span><b>${money(perHit)} €</b>`;
  ul.appendChild(li);
}

function jornadaChips(cur, lo, hi, pick) {
  const box = $("jChips");
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
  if (jv) jv.textContent = state.matchday;
  const sg = $("segJNum");
  if (sg) sg.textContent = state.matchday;
  const isPast = currentJornada !== null && state.matchday < currentJornada;
  const note = $("jNote");
  if (note) note.classList.toggle("hidden", !isPast);
  jornadaChips(state.matchday, 1, currentJornada || state.matchday, (n) => { viewJornada = n; refresh(); });
}

function updateCtas() {
  const logged = !!(state && state.myName);
  const cta = $("goPlayBtn2");
  if (cta) cta.textContent = logged ? "Ir a mi quiniela" : "Crear cuenta y hacer la quiniela";
  const cta1 = $("goPlayBtn");
  if (cta1) cta1.textContent = logged ? "Ir a mi quiniela" : "Crear cuenta y hacer la quiniela";
}

function renderAll() {
  updateWelcome();
  renderHeader();
  renderJornadaBar();
  const logged = !!state.myName;
  $("authPanel").hidden = logged;
  $("picksPanel").hidden = !logged;
  updateCtas();
  if (!tabInitialized) {
    tabInitialized = true;
    switchTab("miQuiniela", false);
  }
  if (logged) { renderMatches(); renderMyRecap(); }
  if (rankMode === "global") loadGlobal();
  else {
    renderRanking();
    renderSummary();
  }
  renderParticipants();
  renderPrizes();
  loadPartido();
  adjustAppbar();
}

function adjustAppbar() {
  const bar = document.querySelector(".appbar");
  if (!bar) return;
  document.body.style.paddingTop = "";
}

/* ---------- Red ---------- */

async function loadState() {
  const url = new URL(API + "/estado", location.origin);
  if (viewJornada) url.searchParams.set("jornada", viewJornada);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("No se pudo cargar");
  return res.json();
}

let lastSig = "";
async function refresh(auto) {
  try {
    const fresh = await loadState();
    const sig = JSON.stringify(fresh);
    // Si no ha cambiado nada, no se repinta: así la página no "se reinicia" sola.
    if (auto && state && sig === lastSig) return;
    lastSig = sig;
    state = fresh;
    if (currentJornada === null && !viewJornada) currentJornada = state.matchday;
    if (state.myName) apodo = state.myName;
    if (!picksDirty) {
      picks = {};
      Object.entries(state.myPicks || {}).forEach(([k, v]) => (picks[k] = v));
    }
    if (state.openCount > 0) editing = true;
    renderAll();
    updateCountdown();
  } catch (e) {
    $("cdInfo").textContent = "Error de conexión. Reintentando…";
  }
}

async function submitAuth() {
  const name = $("authName").value.trim();
  const pin = $("authPin").value.trim();
  const err = $("authError");
  err.textContent = "";
  if (name.length < 2) return (err.textContent = "Escribe tu nombre (2-24 caracteres).");
  if (!/^\d{4}$|^\d{6}$/.test(pin)) return (err.textContent = "El código debe tener 4 o 6 números.");

  const btn = $("authBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Un momento…";
  try {
    const res = await fetch(`${API}/${authMode === "login" ? "login" : "registro"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: name, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo completar");
    $("authPin").value = "";
    picksDirty = false;
    await refresh();
    switchTab("miQuiniela");
    if (authMode === "registro") {
      const m = $("saveMsg");
      if (m) {
        m.className = "save-msg ok";
        m.textContent = "Cuenta creada ✔ Guarda tu código: no se puede restablecer.";
      }
    }
  } catch (e) {
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function logout() {
  await fetch(API + "/logout", { method: "POST" });
  state = null;
  picks = {};
  apodo = "";
  editing = false;
  picksDirty = false;
  await refresh();
}

async function save() {
  const msg = $("saveMsg");
  msg.className = "save-msg";

  const missing = state.matches.filter((m) => !m.started && !picks[m.id]);
  if (missing.length) {
    document.querySelectorAll(".match-row.missing").forEach((r) => r.classList.remove("missing"));
    missing.forEach((m) => {
      const row = document.querySelector(`.match-row[data-match="${m.id}"]`);
      if (row) row.classList.add("missing");
    });
    document.querySelector(`.match-row[data-match="${missing[0].id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    msg.textContent = `Te faltan ${missing.length} partido(s) por elegir.`;
    msg.classList.add("err");
    return;
  }

  $("saveBtn").disabled = true;
  try {
    const res = await fetch(API + "/prediccion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jornada: state.matchday, picks }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al guardar");
    state = data.state;
    state.myName = apodo;
    picksDirty = false;
    renderAll();
    msg.textContent = "¡Guardado! Tu prima está en juego.";
    msg.classList.add("ok");
    $("saveBtn").disabled = false;
  } catch (e) {
    msg.textContent = e.message;
    msg.classList.add("err");
    $("saveBtn").disabled = false;
  }
}

/* ---------- Tabs ---------- */

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

function openParticipant(key) {
  switchTab("clasificacion");
  setTimeout(() => {
    const it = document.querySelector('.rank-item[data-pkey="' + key + '"] .rank-card');
    if (it && !it.classList.contains("open")) it.click();
  }, 160);
}

/* ---------- Eventos ---------- */

function setAuthMode(mode) {
  if (!$("authBtn")) return;
  authMode = mode;
  const isLogin = mode === "login";
  $("tabLogin").classList.toggle("active", isLogin);
  $("tabRegistro").classList.toggle("active", !isLogin);
  $("authTitle").textContent = isLogin ? "Entra en tu cuenta" : "Crea tu cuenta";
  $("authHint").textContent = isLogin
    ? "Pon tu nombre y tu código secreto de 4 o 6 números."
    : "Elige un nombre y un código secreto de 4 o 6 números. El código queda cifrado y nadie puede verlo.";
  $("authBtn").textContent = isLogin ? "Entrar" : "Crear cuenta";
  $("authPin").setAttribute("autocomplete", isLogin ? "current-password" : "new-password");
  const warn = $("authWarn");
  if (warn) warn.classList.toggle("hidden", isLogin);
  $("authError").textContent = "";
}

if ($("authBtn")) {
  $("tabLogin").addEventListener("click", () => setAuthMode("login"));
  $("tabRegistro").addEventListener("click", () => setAuthMode("registro"));
  $("authBtn").addEventListener("click", submitAuth);
  $("authPin").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAuth();
  });
  $("authName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("authPin").focus();
  });
}

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});

/* El cambio de pestaña deslizando con el dedo se quitó: en móvil daba
   saltos sin querer al hacer scroll. Las pestañas se cambian con su botón. */

$("saveBtn").addEventListener("click", save);

$("themeToggle").addEventListener("click", () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const next = isLight ? "dark" : "light";
  setThemeAttr(next);
  saveTheme(next);
});

function goToCreateAccount() {
  markSeen();
  const logged = !!(state && state.myName);
  if (!logged) setAuthMode("registro");
  switchTab("miQuiniela");
  setTimeout(() => {
    const target = logged ? $("picksPanel") : $("authPanel");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!logged) {
      const n = $("authName");
      if (n) setTimeout(() => n.focus(), 320);
    }
  }, 80);
}
$("goPlayBtn").addEventListener("click", goToCreateAccount);
if ($("goPlayBtn2")) $("goPlayBtn2").addEventListener("click", goToCreateAccount);
if ($("howToBtn")) $("howToBtn").addEventListener("click", () => {
  markSeen();
  switchTab("instrucciones");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("segJornada").addEventListener("click", () => {
  rankMode = "jornada";
  $("segJornada").classList.add("active");
  $("segGlobal").classList.remove("active");
  renderRanking();
  renderSummary();
});
$("segGlobal").addEventListener("click", () => {
  rankMode = "global";
  $("segGlobal").classList.add("active");
  $("segJornada").classList.remove("active");
  loadGlobal();
});

$("copyBtn").addEventListener("click", async () => {
  const lines = [`La Quiniela - Jornada ${state.matchday}`, ""];
  state.standings.forEach((s) => {
    lines.push(`${s.rank}. ${s.name} — ${s.hits} aciertos — prima ${money(s.prize)}`);
  });
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    $("copyBtn").textContent = "¡Copiado!";
    setTimeout(() => ($("copyBtn").textContent = "Copiar"), 2000);
  } catch (e) {
    prompt("Copia el resumen:", text);
  }
});

/* ---------- Arranque ---------- */

updateWelcome();
setAuthMode("registro");
adjustAppbar();
window.addEventListener("resize", adjustAppbar);
refresh();
setInterval(updateCountdown, 1000);
setInterval(() => {
  if (document.hidden) return;
  const ae = document.activeElement;
  if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
  if (picksDirty) return;
  refresh(true);
}, 60000);
