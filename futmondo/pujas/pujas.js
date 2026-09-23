const API = "/api/laquiniela";
let data = { puja: null, user: null, nextTuesday: null };
let timerId = null;

function $(id) { return document.getElementById(id); }
function money(n) { return Number(n || 0).toLocaleString("es-ES"); }

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDots(v) {
  const digits = String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseDots(v) { return Number(String(v == null ? "" : v).replace(/\D/g, "")) || 0; }
let selValue = 0;

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function renderUser() {
  const box = $("userBox");
  if (!box) return;
  box.innerHTML = "";
  const u = data.user;
  if (!u) return;
  const chip = el("span", "user-chip");
  chip.innerHTML = '<span class="user-avatar">' + escapeHtml(initials(u.name)) + "</span><span>" + escapeHtml(u.name) + "</span>";
  const out = el("button", "btn-ghost", "Salir");
  out.addEventListener("click", async () => {
    try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {}
    await load(true);
  });
  box.appendChild(chip);
  box.appendChild(out);
}

function render() {
  const panel = $("pujaPanel");
  panel.innerHTML = "";
  const user = data.user;
  const p = data.puja;
  renderUser();

  // Contador (siempre visible)
  const cd = el("div", "puja-countdown");
  const timer = el("div", "puja-timer"); timer.id = "pjTimer";
  const sub = el("div", "puja-sub"); sub.id = "pjSub";
  cd.appendChild(timer);
  cd.appendChild(sub);
  panel.appendChild(cd);

  if (p) {
    if (p.photo) {
      const img = el("img", "puja-photo");
      img.src = p.photo;
      img.alt = p.player;
      panel.appendChild(img);
    }
    const pl = el("div", "puja-player");
    pl.textContent = p.player;
    panel.appendChild(pl);
    const baseTxt = el("div", "puja-base");
    baseTxt.innerHTML = "Precio de salida: <b>" + money(p.base) + " €</b> · la saca <b>" + escapeHtml(p.creator) + "</b>";
    panel.appendChild(baseTxt);
  } else {
    panel.appendChild(el("div", "puja-player", "Sin subasta activa"));
  }

  if (!user) {
    panel.appendChild(el("p", "muted", "Entra con tu nombre y un código de 4 o 6 dígitos. Si no existes, se crea solo. Tu sesión queda guardada."));
    const f = el("div", "auth-form");
    const name = el("input"); name.id = "pjName"; name.placeholder = "Tu nombre"; name.maxLength = 24;
    const pin = el("input"); pin.id = "pjPin"; pin.type = "password"; pin.placeholder = "Código (4 o 6 números)"; pin.maxLength = 6;
    f.appendChild(name); f.appendChild(pin);
    const b = el("button", "btn-primary big", "Entrar"); f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
    b.addEventListener("click", () => auth("login"));
  } else if (!p) {
    panel.appendChild(el("p", "muted", "Elige el jugador a subasta y el precio de salida. El resto verá la subasta y podrá pujar."));
    const f = el("div", "auth-form");
    const pl = el("input"); pl.id = "pjPlayer"; pl.placeholder = "Elige un jugador en la lista de abajo"; pl.readOnly = true;
    const prev = el("div", "pj-preview"); prev.id = "pjPreview";
    const bi = el("div", "pj-base-info"); bi.id = "pjBaseInfo"; bi.textContent = "Elige un jugador de la lista de abajo.";
    const bs = el("input"); bs.id = "pjBase"; bs.type = "text"; bs.inputMode = "numeric"; bs.placeholder = "Precio de la puja (p. ej. 45.500.000)";
    bs.addEventListener("input", () => { bs.value = formatDots(bs.value); });
    const hid = el("input"); hid.id = "pjPhoto"; hid.type = "hidden";
    f.appendChild(pl); f.appendChild(prev); f.appendChild(bi); f.appendChild(bs); f.appendChild(hid);
    const b = el("button", "btn-primary big", "Sacar a subasta"); f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
    b.addEventListener("click", crear);
  } else {
    if (p.status === "closed") {
      const w = el("div", "winner-box");
      if (p.winner) {
        w.appendChild(el("div", "muted", "Ganador"));
        w.appendChild(el("div", "w-name", p.winner.user));
        w.appendChild(el("div", "w-amount", money(p.winner.amount) + " €"));
      } else {
        w.appendChild(el("div", "muted", "Nadie pujó."));
      }
      panel.appendChild(w);
    } else {
      const f = el("div", "bid-form");
      const inp = el("input"); inp.id = "pjAmount"; inp.type = "number"; inp.placeholder = "Tu puja (ej. " + money(p.base + (p.base >= 10000000 ? 1000000 : 100000)) + ")";
      const b = el("button", "btn-primary", "Pujar");
      f.appendChild(inp); f.appendChild(b);
      panel.appendChild(f);
      const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
      b.addEventListener("click", pujar);
    }
  }

  // Clasificación / participantes (pujas)
  const list = el("div", "bid-list");
  const bids = ((p && p.bids) || []).slice().sort((a, b) => b.amount - a.amount);
  const top = bids[0];
  bids.forEach((bd) => {
    const row = el("div", "bid-row");
    if (top && bd.amount === top.amount) row.classList.add("top");
    row.appendChild(el("span", "bid-user", bd.user));
    row.appendChild(el("span", "bid-amount", money(bd.amount) + " €"));
    list.appendChild(row);
  });
  if (!bids.length) list.appendChild(el("p", "empty", "Todavía no hay pujas."));
  panel.appendChild(list);

  renderParts();
  renderHistory();

  startTimer();
}

function renderHistory() {
  const box = $("pujaHistory");
  if (!box) return;
  box.innerHTML = "";
  const list = data.history || [];
  if (!list.length) {
    box.appendChild(el("p", "empty", "Todavía no hay subastas cerradas."));
    return;
  }
  const wrap = el("div", "hist-list");
  list.forEach((h) => {
    const card = el("div", "hist-card");
    if (h.winner) card.classList.add("winner");
    if (h.photo) {
      const im = el("img", "hist-img");
      im.src = h.photo;
      im.alt = h.player;
      im.loading = "lazy";
      im.addEventListener("error", () => { if (im.parentNode) im.parentNode.replaceChild(el("div", "hist-img", initials(h.player)), im); });
      card.appendChild(im);
    } else {
      card.appendChild(el("div", "hist-img", initials(h.player)));
    }
    const body = el("div", "hist-body");
    body.appendChild(el("div", "hist-player", h.player));
    if (h.value) body.appendChild(el("div", "hist-line", "Valor de mercado: " + money(h.value) + " €"));
    const wl = el("div", "hist-line");
    if (h.winner) wl.innerHTML = "Se lo llevó <b>" + escapeHtml(h.winner) + "</b>";
    else wl.textContent = "Nadie pujó.";
    body.appendChild(wl);
    const nb = (h.bids || []).length;
    body.appendChild(el("div", "hist-tag", nb > 1 ? nb + " pujas" : nb === 1 ? "1 puja" : "sin pujas"));
    card.appendChild(body);
    card.appendChild(el("div", "hist-amount", h.amount ? money(h.amount) + " €" : "—"));
    wrap.appendChild(card);
  });
  box.appendChild(wrap);
}

function renderParts() {
  const box = $("pujaParts");
  const hint = $("pujaPartsHint");
  if (!box) return;
  box.innerHTML = "";
  const p = data.puja;
  const list = [];
  if (p) {
    if (p.creator) list.push({ name: p.creator, amount: null, role: "Saca la subasta" });
    (p.bids || []).forEach((b) => {
      const found = list.find((x) => x.name === b.user);
      if (found) found.amount = Math.max(found.amount || 0, b.amount);
      else list.push({ name: b.user, amount: b.amount, role: "Puja" });
    });
  }
  if (hint) hint.textContent = list.length ? list.length + " participante" + (list.length === 1 ? "" : "s") + " en la subasta actual." : "";
  if (!list.length) {
    box.appendChild(el("p", "empty", "Todavía no hay participantes."));
    return;
  }
  list.forEach((it) => {
    const row = el("div", "partido-entry");
    row.appendChild(el("span", "pe-name", it.name));
    row.appendChild(el("span", "pe-score", it.amount != null ? money(it.amount) + " €" : "—"));
    row.appendChild(el("span", "pe-tag", it.role));
    box.appendChild(row);
  });
}

function startTimer() {
  if (timerId) clearInterval(timerId);
  const tick = () => {
    const t = $("pjTimer");
    const sub = $("pjSub");
    if (!t) return;
    const p = data.puja;
    const open = p && p.status === "open";
    const target = open ? p.closesAt : data.nextTuesday;
    if (sub) sub.textContent = open
      ? (p.extended ? "En prórroga (se amplía con cada puja)" : "Termina a las 22:00 (hora de Madrid)")
      : "Próxima subasta: martes a las 22:00";
    if (!target) { t.textContent = "--:--:--"; return; }
    const diff = target - Date.now();
    if (diff <= 0) { t.classList.add("closed"); t.textContent = "00:00:00"; return; }
    t.classList.remove("closed");
    const s = Math.floor(diff / 1000);
    if (s >= 86400) {
      const d = Math.floor(s / 86400);
      t.textContent = d + (d === 1 ? " día" : " días");
      return;
    }
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    t.textContent = pad(h) + ":" + pad(m) + ":" + pad(sc);
  };
  tick();
  timerId = setInterval(tick, 1000);
}

let lastJson = "";
async function load(force) {
  try {
    const res = await fetch(API + "/puja");
    const d = await res.json();
    const j = JSON.stringify(d);
    if (!force) {
      if (j === lastJson) return;
      const panel = $("pujaPanel");
      const ae = document.activeElement;
      if (panel && ae && panel.contains(ae) && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
    }
    lastJson = j;
    data = d;
    render();
  } catch (e) {}
}

let marketTimer = null;
let marketData = { players: [], updatedAt: null };

function updateMarketTime() {
  const upd = $("mercadoUpdated");
  if (!upd) return;
  if (!marketData.updatedAt) { upd.textContent = ""; return; }
  const mins = Math.max(0, Math.round((Date.now() - marketData.updatedAt) / 60000));
  upd.textContent = mins <= 0 ? "Actualizado ahora" : "Actualizado hace " + mins + " min";
}

function renderMarket() {
  const grid = $("marketGrid");
  if (!grid) return;
  updateMarketTime();
  grid.innerHTML = "";
  const players = marketData.players || [];
  if (!players.length) { grid.appendChild(el("p", "market-empty", "Sin resultados.")); return; }
  players.forEach((p) => {
    const card = el("button", "mcard");
    card.type = "button";
    if (p.photo) {
      const im = el("img", "mcard-img");
      im.src = p.photo;
      im.alt = p.name;
      im.loading = "lazy";
      card.appendChild(im);
    } else {
      card.appendChild(el("div", "mcard-img", initials(p.name)));
    }
    const body = el("div", "mcard-body");
    body.appendChild(el("div", "mcard-name", p.name + (p.status ? " · " + p.status : "")));
    if (p.team) body.appendChild(el("div", "mcard-team", p.team));
    body.appendChild(el("div", "mcard-val", money(p.value) + " €"));
    card.appendChild(body);
    card.addEventListener("click", () => elegirDesdeMercado(p));
    grid.appendChild(card);
  });
}

async function loadMarket(q) {
  const grid = $("marketGrid");
  if (!grid) return;
  try {
    const res = await fetch(API + "/mercado" + (q ? "?q=" + encodeURIComponent(q) : ""));
    const d = await res.json();
    if (!grid.isConnected) return;
    marketData = { players: d.players || [], updatedAt: d.updatedAt || null };
    renderMarket();
  } catch (e) {
    if (grid.isConnected) { grid.innerHTML = ""; grid.appendChild(el("p", "market-empty", "No se pudo cargar la lista.")); }
  }
}

function elegirDesdeMercado(p) {
  const msg = $("mercadoMsg");
  if (!data.user) { if (msg) msg.textContent = "Entra con tu usuario para sacar a un jugador a subasta."; return; }
  if (data.puja && data.puja.status === "open") { if (msg) msg.textContent = "Ya hay una subasta abierta. Espera a que termine para sacar otro jugador."; return; }
  elegirJugador(p);
  const f = $("pjPlayer");
  if (f && f.scrollIntoView) f.scrollIntoView({ behavior: "smooth", block: "center" });
}

function elegirJugador(p) {
  selValue = Number(p.value) || 0;
  const inp = $("pjPlayer"); if (inp) inp.value = p.name;
  const bs = $("pjBase"); if (bs) bs.value = formatDots(p.value);
  const hid = $("pjPhoto"); if (hid) hid.value = p.photo || "";
  const bi = $("pjBaseInfo");
  if (bi) bi.innerHTML = "Valor de mercado: <b>" + money(p.value) + " €</b> · el precio no puede ser menor.";
  const prev = $("pjPreview");
  if (prev) {
    prev.innerHTML = "";
    if (p.photo) { const im = el("img", "puja-photo"); im.src = p.photo; im.alt = p.name; prev.appendChild(im); }
    prev.appendChild(el("div", "pj-preview-name", p.name + (p.team ? " · " + p.team : "")));
  }
  const msg = $("mercadoMsg");
  if (msg) msg.textContent = "Has elegido a " + p.name + ". Escribe el precio de la puja.";
}

async function auth(kind) {
  const err = $("pjErr");
  try {
    const res = await fetch(API + "/" + kind, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: $("pjName").value, pin: $("pjPin").value }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    await load(true);
  } catch (e) { if (err) err.textContent = e.message; }
}

async function crear() {
  const err = $("pjErr");
  const baseVal = $("pjBase") ? parseDots($("pjBase").value) : 0;
  if (!baseVal) { if (err) err.textContent = "Elige un jugador y pon el precio."; return; }
  if (selValue && baseVal < selValue) { if (err) err.textContent = "El precio no puede ser menor que el valor del jugador (" + money(selValue) + " €)."; return; }
  try {
    const res = await fetch(API + "/puja/crear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: $("pjPlayer").value, base: baseVal, photo: $("pjPhoto") ? $("pjPhoto").value : "" }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    await load(true);
  } catch (e) { if (err) err.textContent = e.message; }
}

async function pujar() {
  const err = $("pjErr");
  try {
    const res = await fetch(API + "/puja/pujar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: $("pjAmount").value }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    await load(true);
  } catch (e) { if (err) err.textContent = e.message; }
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
  const order = ["subasta", "historial", "participantes", "instrucciones"];
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
    let i = order.indexOf(active ? active.dataset.tab : "subasta");
    if (i < 0) i = 0;
    if (dx < 0) i = Math.min(order.length - 1, i + 1);
    else i = Math.max(0, i - 1);
    switchTab(order[i]);
  }, { passive: true });
})();

function initMarket() {
  const inp = $("mjSearch");
  if (inp) {
    inp.addEventListener("input", () => {
      clearTimeout(marketTimer);
      marketTimer = setTimeout(() => loadMarket(inp.value.trim()), 300);
    });
  }
  loadMarket("");
  setInterval(updateMarketTime, 30000);
}
initMarket();

load(true);
setInterval(load, 10000);