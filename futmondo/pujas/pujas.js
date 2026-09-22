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

function render() {
  const panel = $("pujaPanel");
  panel.innerHTML = "";
  const user = data.user;
  const p = data.puja;

  // Contador (siempre visible)
  const cd = el("div", "puja-countdown");
  const timer = el("div", "puja-timer"); timer.id = "pjTimer";
  const sub = el("div", "puja-sub"); sub.id = "pjSub";
  cd.appendChild(timer);
  cd.appendChild(sub);
  panel.appendChild(cd);

  if (p) {
    const pl = el("div", "puja-player");
    pl.innerHTML = escapeHtml(p.player) + '<span class="stars">' + "⭐".repeat(Math.min(5, p.stars || 0)) + "</span>";
    panel.appendChild(pl);
    const baseTxt = el("div", "puja-base");
    baseTxt.innerHTML = "Valor de salida: <b>" + money(p.base) + " €</b> · la saca <b>" + escapeHtml(p.creator) + "</b>";
    panel.appendChild(baseTxt);
  } else {
    panel.appendChild(el("div", "puja-player", "Sin subasta activa"));
  }

  if (!user) {
    panel.appendChild(el("p", "muted", "Entra para crear la subasta o pujar. Usa tu mismo nombre y código de La Quiniela."));
    const f = el("div", "auth-form");
    const name = el("input"); name.id = "pjName"; name.placeholder = "Tu nombre"; name.maxLength = 24;
    const pin = el("input"); pin.id = "pjPin"; pin.type = "password"; pin.placeholder = "Código (4 o 6 números)"; pin.maxLength = 6;
    f.appendChild(name); f.appendChild(pin);
    const b = el("button", "btn-primary big", "Entrar"); f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
    b.addEventListener("click", () => auth("login"));
  } else if (!p) {
    panel.appendChild(el("p", "muted", "Crea la subasta del martes: jugador y valor de salida."));
    const f = el("div", "auth-form");
    const pl = el("input"); pl.id = "pjPlayer"; pl.placeholder = "Jugador (ej. Diomande)"; pl.maxLength = 40;
    const bs = el("input"); bs.id = "pjBase"; bs.type = "number"; bs.placeholder = "Valor (ej. 45500000)";
    const st = el("input"); st.id = "pjStars"; st.type = "number"; st.min = 0; st.max = 5; st.placeholder = "Estrellas (0-5)";
    f.appendChild(pl); f.appendChild(bs); f.appendChild(st);
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

  startTimer();
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
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    t.textContent = pad(h) + ":" + pad(m) + ":" + pad(sc);
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
  try {
    const res = await fetch(API + "/" + kind, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: $("pjName").value, pin: $("pjPin").value }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    await load();
  } catch (e) { if (err) err.textContent = e.message; }
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
    await load();
  } catch (e) { if (err) err.textContent = e.message; }
}

load();
setInterval(load, 10000);