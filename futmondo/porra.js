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
    teams.innerHTML = `<span>${m.home}</span><span class="vs">VS</span><span>${m.away}</span>`;

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
  const body = $("rankingBody");
  body.innerHTML = "";
  if (!state.standings || !state.standings.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Aún no hay pronósticos.</td></tr>`;
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  state.standings.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.className = i < 3 ? `rank-${i + 1}` : "";
    if (apodo && s.key === apodo.toLowerCase()) tr.classList.add("me-row");
    const pos = i < 3 ? `<span class="medal">${medals[i]}</span>` : "";
    tr.innerHTML = `
      <td class="rank-pos">${pos}${i + 1}</td>
      <td>${s.name}</td>
      <td class="num">${s.hits}</td>
      <td class="num points-badge">${s.points}</td>`;
    body.appendChild(tr);
  });
  $("rankingHint").textContent = `${state.standings.length} jugador(es) · ordenada por aciertos de la jornada.`;
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
    line.innerHTML = `<span class="rl-teams">${m.home} vs ${m.away}</span>${tag}`;
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