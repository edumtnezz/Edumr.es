const API = "/api/laporra";
const THEME_KEY = "porra_theme";
let state = null;
let picks = {};
let apodo = "";
let authMode = "login";
let sortMode = "hora";
let editing = false;

const $ = (id) => document.getElementById(id);

/* ---------- Tema claro / oscuro ---------- */

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch (e) {}
}

(function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (e) {}
  const prefersLight =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(saved || (prefersLight ? "light" : "dark"));
})();

/* ---------- Saludo ---------- */

function updateWelcome() {
  const h = new Date().getHours();
  let saludo;
  if (h >= 6 && h < 12) saludo = "buenos días";
  else if (h >= 12 && h < 21) saludo = "buenas tardes";
  else saludo = "buenas noches";
  const name = state && state.myName ? state.myName : null;
  const g = $("welcomeGreeting");
  const s = $("welcomeSub");
  if (!g) return;
  g.textContent = `Con permiso, ¡${saludo}${name ? ", " + name : ""}!`;
  if (s) {
    s.textContent = name
      ? "Aquí tienes tu porra: elige 1, X o 2 en cada partido y guárdala antes de que empiece el primer partido. 🥅"
      : "Bienvenido a La Porra de LaLiga. Crea tu cuenta y juega con tus compañeros. Aquí abajo tienes cómo se juega. 🥅";
  }
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
  list.forEach((f) => {
    const el = document.createElement("span");
    el.className = "f " + (f.r === "V" ? "v" : f.r === "E" ? "e" : "d");
    el.textContent = f.r;
    const i = document.createElement("i");
    i.textContent = f.home ? "C" : "F";
    i.title = f.home ? "en casa" : "fuera";
    el.appendChild(i);
    wrap.appendChild(el);
  });
  return wrap;
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

  if (!state.lockTime || state.locked) {
    box.classList.add("closed");
    timer.textContent = "CERRADA";
    if (state.firstMatch) {
      const f = fmtDate(state.firstMatch.utcDate);
      info.innerHTML = `La jornada <strong>${state.matchday}</strong> ya ha empezado (${escapeHtml(
        state.firstMatch.home
      )} - ${escapeHtml(state.firstMatch.away)}).<br>Ya no se pueden modificar los pronósticos.`;
    } else {
      info.textContent = "La jornada ya ha empezado. No se pueden modificar los pronósticos.";
    }
    return;
  }

  const diff = state.lockTime - Date.now();
  if (diff <= 0) {
    box.classList.add("closed");
    timer.textContent = "CERRADA";
    return;
  }
  box.classList.remove("closed");

  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  timer.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  const f = state.firstMatch ? fmtDate(state.firstMatch.utcDate) : null;
  const horas = h === 1 ? "1 hora" : `${h} horas`;
  const mins = m === 1 ? "1 minuto" : `${m} minutos`;
  let txt = `Quedan <strong>${horas} y ${mins}</strong>.`;
  if (f) {
    txt += `<br>La jornada <strong>${state.matchday}</strong> empieza el <strong>${f.date}</strong> con <span class="cd-team">${escapeHtml(
      state.firstMatch.home
    )} - ${escapeHtml(state.firstMatch.away)}</span> a las <strong>${f.time}</strong>.`;
  }
  info.innerHTML = txt;
}

/* ---------- Render ---------- */

function renderHeader() {
  $("jornadaNum").textContent = state.matchday || "–";
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
  else matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  matches.forEach((m) => {
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
      if (locked || !editing) b.disabled = true;
      b.addEventListener("click", () => selectPick(m.id, opt));
      btns.appendChild(b);
    });

    row.appendChild(info);
    row.appendChild(btns);
    list.appendChild(row);
  });

  // Cabecera / botones
  const hasPred = state.hasPrediction;
  $("editBtn").classList.toggle("hidden", locked || editing || !hasPred);
  $("saveBtn").classList.toggle("hidden", locked || !editing);
  $("cancelBtn").classList.toggle("hidden", locked || !editing || !hasPred);
  $("saveBtn").disabled = locked || !editing;

  if (locked) {
    $("picksHint").textContent = state.hasPrediction
      ? "La jornada ya ha empezado: tus pronósticos quedan cerrados."
      : "La jornada ya ha empezado y no registraste pronóstico.";
  } else if (editing) {
    $("picksHint").textContent = hasPred
      ? "Modifica lo que quieras y vuelve a guardar. Debes rellenar todos los partidos."
      : "Elige 1, X o 2 en cada partido. Debes completar todos para poder guardar.";
  } else {
    $("picksHint").textContent = "Tu porra está guardada. Pulsa Editar si quieres cambiarla (hasta el inicio del primer partido).";
  }
}

function selectPick(matchId, opt) {
  if (state.locked || !editing) return;
  picks[matchId] = opt;
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
  $("participantsHint").textContent = state.revealAll
    ? "La jornada ya empezó: aquí están los pronósticos de todos."
    : `Hay ${list.length} participante(s). Los pronósticos se revelan al empezar la jornada.`;

  if (!list.length) {
    wrap.innerHTML = `<p class="empty">Todavía no hay participantes.</p>`;
    return;
  }

  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "participant";
    const head = document.createElement("div");
    head.className = "participant-head";
    head.innerHTML = `<span class="participant-avatar">${escapeHtml(initials(p.name))}</span><span class="participant-name">${escapeHtml(
      p.name
    )}</span>`;
    card.appendChild(head);

    if (!p.picks) {
      const note = document.createElement("div");
      note.className = "hidden-note";
      note.textContent = "Pronóstico oculto hasta que empiece la jornada.";
      card.appendChild(note);
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
      card.appendChild(grid);
    }
    wrap.appendChild(card);
  });
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

function renderAll() {
  updateWelcome();
  renderHeader();
  const logged = !!state.myName;
  $("authPanel").classList.toggle("hidden", logged);
  $("tabsNav").classList.toggle("hidden", !logged);
  if (!logged) {
    $("countdownPanel").classList.remove("hidden");
    renderPrizes();
    return;
  }
  renderMatches();
  renderRanking();
  renderSummary();
  renderParticipants();
  renderPrizes();
}

/* ---------- Red ---------- */

async function loadState() {
  const res = await fetch(API + "/estado", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("No se pudo cargar");
  return res.json();
}

async function refresh() {
  try {
    state = await loadState();
    if (state.myName) apodo = state.myName;
    picks = {};
    Object.entries(state.myPicks || {}).forEach(([k, v]) => (picks[k] = v));
    if (!state.locked && !state.hasPrediction) editing = false;
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
    await refresh();
    switchTab("miPorra");
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
  await refresh();
}

async function save() {
  const msg = $("saveMsg");
  msg.className = "save-msg";

  const missing = state.matches.filter((m) => !picks[m.id]);
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
    editing = false;
    renderAll();
    msg.textContent = "¡Guardado! Tu prima está en juego.";
    msg.classList.add("ok");
  } catch (e) {
    msg.textContent = e.message;
    msg.classList.add("err");
    $("saveBtn").disabled = false;
  }
}

/* ---------- Tabs ---------- */

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
  const panel = $("tab-" + name);
  if (panel) panel.classList.remove("hidden");
}

/* ---------- Eventos ---------- */

$("tabLogin").addEventListener("click", () => {
  authMode = "login";
  $("tabLogin").classList.add("active");
  $("tabRegistro").classList.remove("active");
  $("authTitle").textContent = "Entra en tu cuenta";
  $("authHint").textContent = "Pon tu nombre y tu código secreto de 4 o 6 números.";
  $("authBtn").textContent = "Entrar";
  $("authError").textContent = "";
});
$("tabRegistro").addEventListener("click", () => {
  authMode = "registro";
  $("tabRegistro").classList.add("active");
  $("tabLogin").classList.remove("active");
  $("authTitle").textContent = "Crea tu cuenta";
  $("authHint").textContent = "Elige un nombre y un código secreto de 4 o 6 números. El código queda cifrado y nadie puede verlo.";
  $("authBtn").textContent = "Crear cuenta";
  $("authError").textContent = "";
});
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

$("editBtn").addEventListener("click", () => {
  editing = true;
  $("saveMsg").textContent = "";
  renderMatches();
});

$("cancelBtn").addEventListener("click", () => {
  editing = false;
  picks = {};
  Object.entries(state.myPicks || {}).forEach(([k, v]) => (picks[k] = v));
  renderMatches();
});

$("saveBtn").addEventListener("click", save);

$("themeToggle").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(cur === "light" ? "dark" : "light");
});

$("copyBtn").addEventListener("click", async () => {
  const lines = [`La Porra - Jornada ${state.matchday}`, ""];
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
refresh();
setInterval(updateCountdown, 1000);
setInterval(refresh, 60000);