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
let iWasLeading = false;
let suppressOutbid = false;

function statusInfo(s) {
  if (!s) return null;
  if (s === "redcard") return { cls: "st-red", label: "" };
  if (String(s).indexOf("injured") === 0) return { cls: "st-inj", label: "+" };
  if (s === "doubt") return { cls: "st-doubt", label: "?" };
  return null;
}
function fmtDia(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtFechaLarga(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function renderUser() {
  const box = $("userBox");
  const exit = $("exitBox");
  if (box) box.innerHTML = "";
  if (exit) { exit.hidden = true; exit.onclick = null; }
  const u = data.user;
  if (!u) return;
  if (box) {
    const chip = el("span", "user-chip");
    chip.innerHTML = '<span class="user-avatar">' + escapeHtml(initials(u.name)) + "</span><span>" + escapeHtml(u.name) + "</span>";
    box.appendChild(chip);
  }
  if (exit) {
    exit.hidden = false;
    exit.onclick = async () => {
      try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {}
      await load(true);
    };
  }
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
    const shareBtn = el("button", "btn-ghost share-btn", "📲 Compartir por WhatsApp");
    shareBtn.addEventListener("click", () => shareWhatsApp(p));
    panel.appendChild(shareBtn);
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
    const pl = el("input"); pl.id = "pjPlayer"; pl.placeholder = "Escribe el jugador (ej. Diomande)"; pl.autocomplete = "off";
    const sug = el("div", "pj-suggest hidden"); sug.id = "pjSuggest";
    const sw = el("div", "pj-suggest-wrap"); sw.appendChild(pl); sw.appendChild(sug);
    const prev = el("div", "pj-preview"); prev.id = "pjPreview";
    const bi = el("div", "pj-base-info"); bi.id = "pjBaseInfo"; bi.textContent = "Escribe o elige un jugador abajo.";
    const bs = el("input"); bs.id = "pjBase"; bs.type = "text"; bs.inputMode = "numeric"; bs.placeholder = "Precio de la puja (p. ej. 45.500.000)";
    bs.addEventListener("input", () => { bs.value = formatDots(bs.value); });
    const hid = el("input"); hid.id = "pjPhoto"; hid.type = "hidden";
    f.appendChild(sw); f.appendChild(prev); f.appendChild(bi); f.appendChild(bs); f.appendChild(hid);
    const b = el("button", "btn-primary big", "Sacar a subasta"); f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
    b.addEventListener("click", crear);
    attachPlayerSearch();
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
      const step = p.base >= 10000000 ? 1000000 : 100000;
      const curBids = (p.bids || []).slice().sort((a, b) => b.amount - a.amount);
      const leader = curBids[0] || null;
      const minFirst = Math.ceil(p.base / step) * step;
      const min = leader ? leader.amount + step : minFirst;

      const iLead = !!(leader && data.user && leader.user === data.user.name);
      if (data.user && leader && iWasLeading && !iLead && !suppressOutbid) {
        const ob = el("div", "outbid");
        ob.appendChild(el("div", "outbid-title", "🔔 ¡Te han superado!"));
        ob.appendChild(el("div", "outbid-sub", "Para ir primero: " + money(min) + " €"));
        const obBtn = el("button", "btn-primary", "Superar por " + money(min) + " €");
        obBtn.addEventListener("click", () => doPujar(min));
        ob.appendChild(obBtn);
        panel.appendChild(ob);
      }
      iWasLeading = iLead;
      suppressOutbid = false;

      const lead = el("div", "bid-lead");
      if (leader) lead.innerHTML = "Va primero <b>" + escapeHtml(leader.user) + "</b> con <b>" + money(leader.amount) + " €</b>";
      else lead.textContent = "Aún no hay pujas. ¡Sé el primero!";
      panel.appendChild(lead);
      panel.appendChild(el("p", "bid-note", "⚠️ Al pujar no se puede retirar ni bajar la puja. Piénsalo antes de pujar."));

      const big = el("button", "btn-primary big", "Pujar " + money(min) + " €");
      big.addEventListener("click", () => doPujar(min));
      panel.appendChild(big);

      const extras = el("div", "bid-extras");
      [min + step, min + 2 * step].forEach((amt) => {
        const eb = el("button", "btn-ghost", "Pujar " + money(amt) + " €");
        eb.addEventListener("click", () => doPujar(amt));
        extras.appendChild(eb);
      });
      panel.appendChild(extras);

      panel.appendChild(el("p", "muted small", "O escribe otra cantidad:"));
      const f = el("div", "bid-form");
      const inp = el("input"); inp.id = "pjAmount"; inp.type = "number"; inp.inputMode = "numeric"; inp.placeholder = "Cantidad (€)";
      const b = el("button", "btn-ghost", "Pujar");
      f.appendChild(inp); f.appendChild(b);
      panel.appendChild(f);
      const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
      b.addEventListener("click", () => doPujar(Math.floor(Number(inp.value))));
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
    const fecha = fmtFechaLarga(h.closedAt);
    if (fecha) card.appendChild(el("div", "hist-date", fecha));
    const main = el("div", "hist-main");
    if (h.photo) {
      const im = el("img", "hist-img");
      im.src = h.photo;
      im.alt = h.player;
      im.loading = "lazy";
      im.addEventListener("error", () => { if (im.parentNode) im.parentNode.replaceChild(el("div", "hist-img", initials(h.player)), im); });
      main.appendChild(im);
    } else {
      main.appendChild(el("div", "hist-img", initials(h.player)));
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
    main.appendChild(body);
    main.appendChild(el("div", "hist-amount", h.amount ? money(h.amount) + " €" : "—"));
    card.appendChild(main);
    const hbids = (h.bids || []).slice().sort((a, b) => b.amount - a.amount);
    if (hbids.length) {
      const bl = el("div", "hist-bids");
      hbids.forEach((bd, i) => {
        const row = el("div", "hist-bid");
        row.appendChild(el("span", "hb-name", (i + 1) + ". " + bd.user));
        row.appendChild(el("span", "hb-amt", money(bd.amount) + " €"));
        bl.appendChild(row);
      });
      card.appendChild(bl);
    }
    wrap.appendChild(card);
  });
  box.appendChild(wrap);
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

let marketShown = 60;

function renderMarket() {
  const grid = $("marketGrid");
  if (!grid) return;
  updateMarketTime();
  grid.innerHTML = "";
  const all = marketData.players || [];
  if (!all.length) { grid.appendChild(el("p", "market-empty", "Sin resultados.")); return; }
  const players = all.slice(0, marketShown);
  players.forEach((p) => {
    const card = el("button", "mcard");
    card.type = "button";
    const photoWrap = el("div", "mcard-photo");
    if (p.photo) {
      const im = el("img", "mcard-img");
      im.src = p.photo;
      im.alt = p.name;
      im.loading = "lazy";
      photoWrap.appendChild(im);
    } else {
      photoWrap.appendChild(el("div", "mcard-img", initials(p.name)));
    }
    const st = statusInfo(p.status);
    if (st) photoWrap.appendChild(el("span", "mcard-badge " + st.cls, st.label));
    card.appendChild(photoWrap);
    const body = el("div", "mcard-body");
    body.appendChild(el("div", "mcard-name", p.name));
    if (p.team) {
      const teamRow = el("div", "mcard-team");
      if (p.logo) {
        const lg = el("img", "mcard-crest");
        lg.src = p.logo;
        lg.alt = "";
        lg.loading = "lazy";
        teamRow.appendChild(lg);
      }
      teamRow.appendChild(el("span", null, p.team));
      body.appendChild(teamRow);
    }
    body.appendChild(el("div", "mcard-val", money(p.value) + " €"));
    const chg = Number(p.change) || 0;
    if (chg > 0) body.appendChild(el("div", "mcard-trend up", "▲ " + formatDots(chg) + " €"));
    else if (chg < 0) body.appendChild(el("div", "mcard-trend down", "▼ " + formatDots(-chg) + " €"));
    else body.appendChild(el("div", "mcard-trend flat", "—"));
    card.appendChild(body);
    card.addEventListener("click", () => elegirDesdeMercado(p));
    grid.appendChild(card);
  });
  if (all.length > players.length) {
    const more = el("button", "btn-ghost market-more", "Ver más jugadores (" + (all.length - players.length) + ")");
    more.addEventListener("click", () => { marketShown += 60; renderMarket(); });
    grid.appendChild(more);
  }
}

async function loadMarket(q) {
  const grid = $("marketGrid");
  if (!grid) return;
  try {
    const res = await fetch(API + "/mercado" + (q ? "?q=" + encodeURIComponent(q) : ""));
    const d = await res.json();
    if (!grid.isConnected) return;
    marketData = { players: d.players || [], updatedAt: d.updatedAt || null };
    marketShown = 60;
    renderMarket();
  } catch (e) {
    if (grid.isConnected) { grid.innerHTML = ""; grid.appendChild(el("p", "market-empty", "No se pudo cargar la lista.")); }
  }
}

let playerTimer = null;

function attachPlayerSearch() {
  const inp = $("pjPlayer");
  if (!inp) return;
  inp.addEventListener("input", () => {
    clearTimeout(playerTimer);
    const q = inp.value.trim();
    const box = $("pjSuggest");
    if (q.length < 2) { if (box) { box.innerHTML = ""; box.classList.add("hidden"); } return; }
    playerTimer = setTimeout(() => buscarSugerencias(q), 250);
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const box = $("pjSuggest");
      const first = box && box.querySelector(".pj-sug-row");
      if (first) first.click();
    }
  });
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".pj-suggest-wrap");
    const box = $("pjSuggest");
    if (box && wrap && !wrap.contains(e.target)) box.classList.add("hidden");
  });
}

async function buscarSugerencias(q) {
  const box = $("pjSuggest");
  if (!box) return;
  try {
    const res = await fetch(API + "/mercado?q=" + encodeURIComponent(q));
    const d = await res.json();
    if (!box.isConnected) return;
    box.innerHTML = "";
    const players = (d.players || []).slice(0, 8);
    if (!players.length) { box.classList.add("hidden"); return; }
    players.forEach((p) => {
      const row = el("button", "pj-sug-row");
      row.type = "button";
      if (p.photo) { const im = el("img", "pj-sug-img"); im.src = p.photo; im.alt = ""; im.loading = "lazy"; row.appendChild(im); }
      const info = el("div", "pj-sug-info");
      info.appendChild(el("div", "pj-sug-name", p.name));
      if (p.team) info.appendChild(el("div", "pj-sug-meta", p.team));
      row.appendChild(info);
      row.appendChild(el("div", "pj-sug-val", money(p.value) + " €"));
      row.addEventListener("click", () => {
        elegirJugador(p);
        box.innerHTML = "";
        box.classList.add("hidden");
      });
      box.appendChild(row);
    });
    box.classList.remove("hidden");
  } catch (e) { if (box) box.classList.add("hidden"); }
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
    if (p.photo) {
      const wrap = el("div", "pj-preview-photo");
      const im = el("img", "puja-photo"); im.src = p.photo; im.alt = p.name; wrap.appendChild(im);
      const st = statusInfo(p.status);
      if (st) wrap.appendChild(el("span", "mcard-badge " + st.cls, st.label));
      prev.appendChild(wrap);
    }
    prev.appendChild(el("div", "pj-preview-name", p.name + (p.team ? " · " + p.team : "")));
  }
  const msg = $("mercadoMsg");
  if (msg) msg.textContent = "Has elegido a " + p.name + ". Escribe el precio de la puja.";
  const sug = $("pjSuggest");
  if (sug) { sug.innerHTML = ""; sug.classList.add("hidden"); }
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
    toast("¡Subasta creada! 🟢");
  } catch (e) { if (err) err.textContent = e.message; }
}

let toastTimer = null;
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function shareWhatsApp(p) {
  if (!p) return;
  const url = "https://edumr.es/futmondo/pujas/";
  const txt = "🟢 Subasta en Futmondo MR\n\nJugador: " + p.player + "\nPrecio de salida: " + money(p.base) + " €\n\n¡Entra y puja! 👉 " + url;
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

let bidding = false;
async function doPujar(amount) {
  const err = $("pjErr");
  if (bidding) return;
  if (err) err.textContent = "";
  if (!Number.isFinite(amount) || amount <= 0) { if (err) err.textContent = "Cantidad inválida."; return; }
  bidding = true;
  try {
    const res = await fetch(API + "/puja/pujar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    suppressOutbid = true;
    await load(true);
    const top = ((data.puja && data.puja.bids) || []).slice().sort((a, b) => b.amount - a.amount)[0];
    toast(top && data.user && top.user === data.user.name ? "¡Puja registrada! Vas primero 🟢" : "¡Puja registrada! ✅");
  } catch (e) { if (err) err.textContent = e.message; }
  finally { bidding = false; }
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
  const order = ["subasta", "historial", "instrucciones"];
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
setInterval(load, 4000);