const API = "/api/laquiniela";
let data = { puja: null, user: null };
let timerId = null;

function $(id) { return document.getElementById(id); }
function money(n) { return Number(n || 0).toLocaleString("es-ES"); }
function stars(n) { return n > 0 ? " " + "⭐".repeat(Math.min(5, n)) : ""; }

function step(base) { return Number(base) >= 10000000 ? 1000000 : 100000; }

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function render() {
  const panel = $("pujaPanel");
  panel.innerHTML = "";
  const user = data.user;
  const p = data.puja;

  // Sin sesion -> login
  if (!user) {
    panel.appendChild(el("h2", null, "Entra para pujar"));
    panel.appendChild(el("p", "muted", "Pon tu nombre y tu código (el mismo de La Quiniela)."));
    const f = el("div", "auth-form");
    const name = el("input"); name.id = "pjName"; name.placeholder = "Tu nombre"; name.maxLength = 24;
    const pin = el("input"); pin.id = "pjPin"; pin.type = "password"; pin.placeholder = "Código (4 o 6 números)"; pin.maxLength = 6;
    f.appendChild(name); f.appendChild(pin);
    const b = el("button", "btn-primary big", "Entrar"); b.id = "pjGo";
    f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr";
    panel.appendChild(err);
    b.addEventListener("click", () => auth("login"));
    return;
  }

  // Con sesion, sin puja -> crear
  if (!p) {
    panel.appendChild(el("h2", null, "Nueva subasta"));
    panel.appendChild(el("p", "muted", "Crea la puja del martes: jugador y valor de salida."));
    const f = el("div", "auth-form");
    const pl = el("input"); pl.id = "pjPlayer"; pl.placeholder = "Jugador (ej. Diomande)"; pl.maxLength = 40;
    const bs = el("input"); bs.id = "pjBase"; bs.type = "number"; bs.placeholder = "Valor (ej. 45500000)";
    const st = el("input"); st.id = "pjStars"; st.type = "number"; st.min = 0; st.max = 5; st.placeholder = "Estrellas (0-5)";
    f.appendChild(pl); f.appendChild(bs); f.appendChild(st);
    const b = el("button", "btn-primary big", "Sacar a subasta");
    f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr";
    panel.appendChild(err);
    b.addEventListener("click", crear);
    return;
  }

  // Puja
  const head = el("div", "puja-head");
  const pl = el("div", "puja-player");
  pl.innerHTML = escapeHtml(p.player) + '<span class="stars">' + "⭐".repeat(Math.min(5, p.stars || 0)) + "</span>";
  head.appendChild(pl);
  const baseTxt = el("div", "puja-base");
  baseTxt.innerHTML = "Valor de salida: <b>" + money(p.base) + " €</b> · la saca <b>" + escapeHtml(p.creator) + "</b>";
  head.appendChild(baseTxt);
  const timer = el("div", "puja-timer"); timer.id = "pjTimer";
  head.appendChild(timer);
  const sub = el("div", "puja-sub"); sub.id = "pjSub";
  head.appendChild(sub);
  panel.appendChild(head);

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
  } else if (user) {
    const f = el("div", "bid-form");
    const inp = el("input"); inp.id = "pjAmount"; inp.type = "number"; inp.placeholder = "Tu puja (ej. " + money(p.base + step(p.base)) + ")";
    const b = el("button", "btn-primary", "Pujar");
    f.appendChild(inp); f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr";
    panel.appendChild(err);
    b.addEventListener("click", pujar);
  }

  const list = el("div", "bid-list");
  const bids = (p.bids || []).slice().sort((a, b) => b.amount - a.amount);
  const top = bids[0];
  bids.forEach((bd) => {
    const row = el("div", "bid-row");
    if (top && bd.amount === top.amount) row.classList.add("top");
    row.appendChild(el("span", "bid-user", bd.user));
    row.appendChild(el("span", "bid-amount", money(bd.amount) + " €"));
    list.appendChild(row);
  });
  if (!bids.length) list.appendChild(el("p", "empty", "Todavía no hay pujas. ¡Sé el primero!"));
  panel.appendChild(list);

  startTimer();
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function startTimer() {
  if (timerId) clearInterval(timerId);
  const tick = () => {
    const p = data.puja;
    const t = $("pjTimer");
    const sub = $("pjSub");
    if (!p) { if (timerId) clearInterval(timerId); return; }
    if (p.status === "closed") {
      if (t) { t.classList.add("closed"); t.textContent = "CERRADA"; }
      if (sub) sub.textContent = "Subasta finalizada";
      if (timerId) clearInterval(timerId);
      return;
    }
    const diff = p.closesAt - Date.now();
    if (diff <= 0) {
      if (t) { t.classList.add("closed"); t.textContent = "CERRADA"; }
      if (sub) sub.textContent = "Subasta finalizada";
      return;
    }
    const s = Math.floor(diff / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (t) t.textContent = pad(h) + ":" + pad(m) + ":" + pad(sc);
    if (sub) sub.textContent = p.extended ? "En prórroga (se amplía con cada puja)" : "Termina a las 22:00 (hora de Madrid)";
  };
  tick();
  timerId = setInterval(tick, 1000);
}

async function load() {
  try {
    const res = await fetch(API + "/puja");
    data = await res.json();
    render();
  } catch (e) {}
}

async function auth(kind) {
  const err = $("pjErr");
  const name = $("pjName").value.trim();
  const pin = $("pjPin").value.trim();
  try {
    const res = await fetch(API + "/" + kind, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: name, pin }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    await load();
  } catch (e) {
    if (err) err.textContent = e.message;
  }
}

async function crear() {
  const err = $("pjErr");
  try {
    const res = await fetch(API + "/puja/crear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: $("pjPlayer").value, base: $("pjBase").value, stars: $("pjStars").value }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    await load();
  } catch (e) {
    if (err) err.textContent = e.message;
  }
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
    $("pjAmount").value = "";
    await load();
  } catch (e) {
    if (err) err.textContent = e.message;
  }
}

load();
setInterval(load, 10000);