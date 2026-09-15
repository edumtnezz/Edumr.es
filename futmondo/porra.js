const API = "/api/futmondo";
const STORAGE_KEY = "porra_apodo";

let state = null;
let apodo = localStorage.getItem(STORAGE_KEY) || "";
let picks = {};

const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}h`;
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

function crestHtml(crest, fallback) {
  if (crest) {
    return `<img class="crest" src="${escapeHtml(crest)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'crest-fallback',textContent:'${escapeHtml(fallback || '?').slice(0, 3)}'}))">`;
  }
  return `<div class="crest-fallback">${escapeHtml((fallback || "?").slice(0, 3))}</div>`;
}

function teamHtml(side, name, crest, tla) {
  return `<span class="team ${side}">${crestHtml(crest, tla || name)}<span class="tname">${escapeHtml(name)}</span></span>`;
}

async function loadState() {
  const url = new URL(API + "/state", location.origin);
  url.searchParams.set("jornada", new URLSearchParams(location.search).get("jornada") || "");
  if (apodo) url.searchParams.set("apodo", apodo);
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo cargar la jornada");
  return res.json();
}

function renderHeader() {
  $("jornadaNum").textContent = state.matchday || "–";
  const box = $("lockStatus");
  if (state.locked) {
    box.classList.add("locked");
    $("lockText").textContent = "Apuestas cerradas";
  } else {
    box.classList.remove("locked");
    const t = state.lockTime ? fmtDate(state.lockTime) : "–";
    $("lockText").textContent = "Abierto · cierra " + t;
  }
}

function ensureLogin() {
  if (apodo && apodo.trim().length >= 2) {
    $("loginPanel").classList.add("hidden");
    $("picksPanel").classList.remove("hidden");
    return true;
  }
  $("loginPanel").classList.remove("hidden");
  $("picksPanel").classList.add("hidden");
  return false;
}

function renderMatches() {
  const list = $("matchList");
  list.innerHTML = "";

  if (state.myPicks && state.myPicks.length) {
    for (const p of state.myPicks) picks[p.matchId] = p.pick;
  }

  state.matches.forEach((m) => {
    const row = document.createElement("div");
    row.className = "match-row";

    const info = document.createElement("div");
    info.className = "match-info";

    const teams = document.createElement("div");
    teams.className = "match-teams";
    teams.innerHTML =
      teamHtml("home", m.home, m.homeCrest, m.homeTla) +
      `<span class="vs">VS</span>` +
      teamHtml("away", m.away, m.awayCrest, m.awayTla);

    const meta = document.createElement("div");
    meta.className = "match-meta";
    let metaHtml = `<span>${fmtDate(m.utcDate)}</span><span>${statusLabel(m.status)}</span>`;
    if (m.result) {
      const scoreTxt =
        m.score && m.score.home !== null && m.score.home !== undefined
          ? ` ${m.score.home}-${m.score.away}`
          : "";
      metaHtml += `<span class="result-chip">Resultado: ${m.result}${scoreTxt}</span>`;
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
      if (picks[m.id] === opt) b.classList.add("selected");
      if (state.locked) {
        b.disabled = true;
        if (m.result) {
          if (picks[m.id] === opt) b.classList.add(picks[m.id] === m.result ? "correct" : "wrong");
        }
      }
      b.addEventListener("click", () => selectPick(m.id, opt));
      btns.appendChild(b);
    });

    row.appendChild(info);
    row.appendChild(btns);
    list.appendChild(row);
  });

  $("saveBtn").disabled = state.locked;
  $("picksHint").textContent = state.locked
    ? "La jornada ya ha empezado: solo puedes consultar tus pronósticos."
    : "Elige 1, X o 2 en cada partido. Puedes cambiar tu apuesta hasta el inicio del primer partido.";
}

function selectPick(matchId, opt) {
  if (state.locked) return;
  picks[matchId] = opt;
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
    $("rankingHint").textContent = "Ordenada por aciertos de la jornada.";
    return;
  }
  empty.classList.add("hidden");

  const myKey = apodo ? apodo.toLowerCase() : null;
  const medals = ["🥇", "🥈", "🥉"];
  const top = list.slice(0, 3);
  const maxPoints = Math.max(1, list[0].points);

  const order = [1, 0, 2];
  order.forEach((idx) => {
    const s = top[idx];
    if (!s) return;
    const place = idx + 1;
    const slot = document.createElement("div");
    slot.className = `podium-slot podium-${place}`;
    slot.style.animationDelay = `${idx * 0.08}s`;
    slot.innerHTML = `
      <span class="podium-medal">${medals[idx]}</span>
      <span class="podium-avatar">${escapeHtml(initials(s.name))}</span>
      <span class="podium-name">${escapeHtml(s.name)}</span>
      <span class="podium-points">${s.points}<small> pts</small></span>
      <span class="podium-sub">${s.hits} acierto${s.hits === 1 ? "" : "s"}</span>`;
    podium.appendChild(slot);
  });

  list.forEach((s, i) => {
    const card = document.createElement("div");
    const place = i + 1;
    card.className = "rank-card";
    if (place <= 3) card.classList.add(`player-${place}`);
    if (myKey && s.key === myKey) card.classList.add("me");
    card.style.animationDelay = `${Math.min(i, 8) * 0.04}s`;

    const detail =
      s.played > 0
        ? `${s.hits} acertados · ${s.missed} fallados`
        : `Aún sin resultados (${s.total} pronósticos)`;
    const badge = myKey && s.key === myKey ? '<span class="me-badge">TÚ</span>' : "";
    const pct = Math.round((s.points / maxPoints) * 100);

    card.innerHTML = `
      <span class="rank-num">${medals[i] || place}</span>
      <span class="rank-avatar">${escapeHtml(initials(s.name))}</span>
      <span class="rank-info">
        <span class="rank-name">${escapeHtml(s.name)}${badge}</span>
        <span class="rank-detail">${detail}</span>
      </span>
      <span class="rank-score">
        <span class="rank-points">${s.points}<small>puntos</small></span>
        <span class="rank-bar"><i style="width:${pct}%"></i></span>
      </span>`;
    cards.appendChild(card);
  });

  $("rankingHint").textContent = "Ordenada por aciertos de la jornada.";
}

function renderResults() {
  const panel = $("resultsPanel");
  const grid = $("resultsGrid");
  grid.innerHTML = "";

  const withResult = state.matches.filter((m) => m.result);
  if (!apodo || !state.myPicks || !state.myPicks.length || !withResult.length) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  let hits = 0;
  state.myPicks.forEach((p) => {
    const m = state.matches.find((x) => x.id === p.matchId);
    if (!m || !m.result) return;
    if (p.correct) hits++;
    const line = document.createElement("div");
    line.className = "result-line";
    const tag = p.correct
      ? `<span class="rl-tag ok">Acertaste (${p.pick})</span>`
      : `<span class="rl-tag ko">Fallaste (${p.pick} · salió ${m.result})</span>`;
    line.innerHTML = `<span class="rl-teams">${teamHtml("home", m.home, m.homeCrest, m.homeTla)} <span class="vs">VS</span> ${teamHtml("away", m.away, m.awayCrest, m.awayTla)}</span>${tag}`;
    grid.appendChild(line);
  });

  $("resultsHint").textContent = `Llevas ${hits} acierto(s) de ${withResult.length} partido(s) finalizado(s).`;
}

function renderAll() {
  renderHeader();
  const logged = ensureLogin();
  if (logged) renderMatches();
  renderRanking();
  renderResults();
}

async function refresh() {
  try {
    state = await loadState();
    renderAll();
  } catch (e) {
    $("lockText").textContent = "Error de conexión";
  }
}

async function save() {
  const msg = $("saveMsg");
  msg.className = "save-msg";
  if (!apodo) return;
  const btns = document.querySelectorAll(".pick-btn.selected").length;
  if (!btns) {
    msg.textContent = "Elige al menos un pronóstico.";
    msg.classList.add("err");
    return;
  }
  $("saveBtn").disabled = true;
  try {
    const res = await fetch(API + "/prediccion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apodo, jornada: state.matchday, picks }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al guardar");
    state = data.state;
    renderAll();
    msg.textContent = "¡Guardado! Tu pronóstico queda registrado.";
    msg.classList.add("ok");
  } catch (e) {
    msg.textContent = e.message;
    msg.classList.add("err");
    $("saveBtn").disabled = state.locked;
  }
}

function setApodo() {
  const val = $("apodoInput").value.trim().replace(/\s+/g, " ");
  if (val.length < 2) {
    $("loginError").textContent = "Escribe un apodo de al menos 2 letras.";
    return;
  }
  apodo = val;
  localStorage.setItem(STORAGE_KEY, apodo);
  $("loginError").textContent = "";
  refresh();
}

$("apodoBtn").addEventListener("click", setApodo);
$("apodoInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") setApodo();
});
$("saveBtn").addEventListener("click", save);
$("changeName").addEventListener("click", () => {
  apodo = "";
  localStorage.removeItem(STORAGE_KEY);
  $("apodoInput").value = "";
  state = null;
  ensureLogin();
});

$("apodoInput").value = apodo;
refresh();
setInterval(refresh, 60000);