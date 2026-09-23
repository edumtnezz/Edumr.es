const API = "/api/laquiniela";
const THEME_KEY = "theme";
window.__themeHandled = true;
let state = null;
let picks = {};
let apodo = "";
let authMode = "registro";
let sortMode = "hora";
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
  span.appendChild(crestEl(team.crest, team.tla || team.name));
  const t = document.createElement("span");
  t.className = "tname";
  t.textContent = team.name;
  span.appendChild(t);
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

  const f = fmtDate(nm.utcDate);
  info.innerHTML = `Próximo partido: <span class="cd-team">${escapeHtml(nm.home)} - ${escapeHtml(
    nm.away
  )}</span> · ${f.date} a las <strong>${f.time}</strong>.`;
}

/* ---------- Render ---------- */

function renderHeader() {
  const jn = $("jornadaNum");
  if (jn) jn.textContent = state.matchday || "–";
  const box = $("userBox");
  box.innerHTML = "";
  if (state.myName) {
    apodo = state.myName;
    const chip = document.createElement("span");
    chip.className = "user-chip";
    chip.innerHTML = `<span class="user-avatar">${escapeHtml(initials(state.myName))}</span><span>${escapeHtml(
      state.myName
    )}</span>`;
    const out = document.createElement("button");
    out.className = "btn-ghost";
    out.textContent = "Salir";
    out.addEventListener("click", logout);
    box.appendChild(chip);
    box.appendChild(out);
  }
}

function renderMatches() {
  const list = $("matchList");
  list.innerHTML = "";
  const locked = state.locked;

  const matches = state.matches.slice();
  if (sortMode === "local") matches.sort((a, b) => a.home.localeCompare(b.home));
  else if (sortMode === "visitante") matches.sort((a, b) => a.away.localeCompare(b.away));
  else if (sortMode === "porjugar")
    matches.sort(
      (a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0) || new Date(a.utcDate) - new Date(b.utcDate)
    );
  else matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  let lastDay = null;
  matches.forEach((m) => {
    if (sortMode === "hora" || sortMode === "porjugar") {
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
    row.className = "match-row";
    row.dataset.match = m.id;

    const info = document.createElement("div");
    info.className = "match-info";

    const teams = document.createElement("div");
    teams.className = "match-teams";
    teams.appendChild(
      teamEl("home", m, { name: m.home, crest: m.homeCrest, tla: m.homeTla })
    );
    teams.appendChild(vsEl());
    teams.appendChild(
      teamEl("away", m, { name: m.away, crest: m.awayCrest, tla: m.awayTla })
    );

    const meta = document.createElement("div");
    meta.className = "match-meta";
    const f = fmtDate(m.utcDate);
    let metaHtml = `<span>${f.short}</span><span>${statusLabel(m.status)}</span>`;
    if (m.score && m.score.home !== null && m.score.home !== undefined) {
      metaHtml += `<span class="score-chip">${m.score.home} - ${m.score.away}</span>`;
    }
    meta.innerHTML = metaHtml;

    info.appendChild(teams);
    info.appendChild(meta);

    const btns = document.createElement("div");
    btns.className = "pick-buttons";
    ["1", "X", "2"].forEach((opt) => {
      const b = document.createElement("button");
      b.className = "pick-btn";
      b.textContent = opt;
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

    row.appendChild(info);
    row.appendChild(btns);
    list.appendChild(row);
  });

  // Cabecera / botones
  const hasPred = state.hasPrediction;
  const openCount = state.openCount || 0;
  const canEdit = openCount > 0;
  $("saveBtn").classList.toggle("hidden", !canEdit);
  $("saveBtn").disabled = false;

  if (!canEdit) {
    $("picksHint").textContent = hasPred
      ? "La jornada ya ha empezado: tus pronósticos quedan cerrados."
      : "La jornada ya ha empezado y no registraste pronóstico.";
  } else {
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
  document.querySelectorAll(`.pick-btn[data-match="${matchId}"]`).forEach((b) => {
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
    cards.appendChild(card);
    card.title = "Ver sus aciertos y fallos";
    card.addEventListener("click", () => openParticipant(s.key));
  });
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

function renderParticipants() {
  const wrap = $("participantsList");
  wrap.innerHTML = "";
  const list = state.participants || [];
  $("participantsHint").textContent = `Aquí están los pronósticos de todos (${list.length} participante${
    list.length === 1 ? "" : "s"
  }). Se pueden ver desde el principio; solo se bloquean al empezar el primer partido.`;

  if (!list.length) {
    wrap.innerHTML = `<p class="empty">Todavía no hay participantes.</p>`;
    return;
  }

  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "participant";
    card.dataset.pkey = p.key;

    let hits = 0;
    let played = 0;
    if (p.picks) {
      state.matches.forEach((m) => {
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
    nm.textContent = p.name;
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
      badge.textContent = `${hits} pts`;
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
      state.matches.forEach((m) => {
        const pick = p.picks && p.picks[m.id];
        if (!pick || !m.result) return;
        const label = `${m.home} - ${m.away}`;
        if (pick === m.result) okList.push(label);
        else koList.push(label);
      });
      const sum = document.createElement("div");
      sum.className = "participant-summary";
      const okSpan = document.createElement("span");
      okSpan.className = "ps-ok";
      okSpan.innerHTML = `<b>✓ Acertó</b> ${okList.length ? escapeHtml(okList.join(" · ")) : "—"}`;
      const koSpan = document.createElement("span");
      koSpan.className = "ps-ko";
      koSpan.innerHTML = `<b>✗ Falló</b> ${koList.length ? escapeHtml(koList.join(" · ")) : "—"}`;
      sum.appendChild(okSpan);
      sum.appendChild(koSpan);
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
      state.matches.forEach((m) => {
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
  ul.innerHTML = "";
  (state.prizes || []).forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${i + 1}º puesto</span><b>${money(p)}</b>`;
    ul.appendChild(li);
  });
}

function renderJornadaBar() {
  const jv = $("jView");
  if (jv) jv.textContent = state.matchday;
  const sg = $("segJNum");
  if (sg) sg.textContent = state.matchday;
  const isPast = currentJornada !== null && state.matchday < currentJornada;
  const prev = $("jPrev");
  const next = $("jNext");
  const note = $("jNote");
  if (prev) prev.disabled = state.matchday <= 1;
  if (next) next.disabled = currentJornada === null || state.matchday >= currentJornada;
  if (note) note.classList.toggle("hidden", !isPast);
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
  $("authPanel").classList.toggle("hidden", logged);
  $("picksPanel").classList.toggle("hidden", !logged);
  updateCtas();
  if (!tabInitialized) {
    tabInitialized = true;
    switchTab("miQuiniela", false);
  }
  if (logged) renderMatches();
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
  document.body.style.paddingTop = bar.offsetHeight + 14 + "px";
}

/* ---------- Red ---------- */

async function loadState() {
  const url = new URL(API + "/estado", location.origin);
  if (viewJornada) url.searchParams.set("jornada", viewJornada);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("No se pudo cargar");
  return res.json();
}

async function refresh() {
  try {
    state = await loadState();
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
  switchTab("participantes");
  setTimeout(() => {
    const card = document.querySelector('.participant[data-pkey="' + key + '"]');
    if (!card) return;
    const head = card.querySelector(".participant-head");
    const body = card.querySelector(".participant-body");
    if (body) {
      body.classList.remove("hidden");
      if (head) head.classList.add("open");
    }
    const bar = document.querySelector(".appbar");
    const off = (bar ? bar.offsetHeight : 0) + 12;
    const y = card.getBoundingClientRect().top + window.scrollY - off;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }, 160);
}

/* ---------- Eventos ---------- */

function setAuthMode(mode) {
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

$("tabLogin").addEventListener("click", () => setAuthMode("login"));
$("tabRegistro").addEventListener("click", () => setAuthMode("registro"));
$("authBtn").addEventListener("click", submitAuth);
$("authPin").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitAuth();
});
$("authName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("authPin").focus();
});

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});

$("sortSelect").addEventListener("change", (e) => {
  sortMode = e.target.value;
  if (state && state.myName) renderMatches();
});

/* ---------- Deslizar lateral para cambiar de pestaña ---------- */
(function initSwipe() {
  const order = ["miQuiniela", "clasificacion", "participantes", "instrucciones"];
  const main = document.querySelector(".quiniela-main") || document.body;
  let sx = 0;
  let sy = 0;
  let st = 0;
  main.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX;
      sy = t.clientY;
      st = Date.now();
    },
    { passive: true }
  );
  main.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Date.now() - st > 900) return;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const el = document.elementFromPoint(sx, sy);
      if (el && el.closest("button, a, input, select, .pick-btn, .participant-head")) return;
      const active = document.querySelector(".tab.active");
      let i = order.indexOf(active ? active.dataset.tab : "miQuiniela");
      if (i < 0) i = 0;
      if (dx < 0) i = Math.min(order.length - 1, i + 1);
      else i = Math.max(0, i - 1);
      switchTab(order[i]);
    },
    { passive: true }
  );
})();

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
$("goPlayBtn2").addEventListener("click", goToCreateAccount);
$("howToBtn").addEventListener("click", () => {
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

$("jPrev").addEventListener("click", () => {
  if (!state) return;
  viewJornada = Math.max(1, state.matchday - 1);
  refresh();
});
$("jNext").addEventListener("click", () => {
  if (!state || !currentJornada) return;
  if (state.matchday < currentJornada) {
    viewJornada = state.matchday + 1;
    refresh();
  }
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
setInterval(refresh, 60000);