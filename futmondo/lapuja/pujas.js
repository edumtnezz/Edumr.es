const API = "/api/laquiniela";

// Oculta el widget de cuenta hasta resolver la sesión: evita el parpadeo del
// estado "sin cuenta" en los primeros milisegundos de carga.
document.documentElement.classList.add("auth-loading");
(function () {
  const style = document.createElement("style");
  style.textContent = ".auth-loading #userBox,.auth-loading #exitBox{visibility:hidden}";
  document.head.appendChild(style);
})();

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
let selPlayer = null;
let iWasLeading = false;
let suppressOutbid = false;
let lastErr = "";
let bidCooldown = 0;

function hortxt(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function statusInfo(s) {
  if (!s) return null;
  if (s === "redcard") return { cls: "st-red", label: "" };
  if (String(s).indexOf("injured") === 0) return { cls: "st-inj", label: "+" };
  if (s === "doubt") return { cls: "st-doubt", label: "?" };
  return null;
}
const ROLE = { portero: "POR", defensa: "DEF", centrocampista: "MED", delantero: "DEL" };
const POS = { portero: "por", defensa: "def", centrocampista: "med", delantero: "del" };
function posCls(role) { return POS[String(role || "").toLowerCase()] || "x"; }
var POSCOL_BY_CODE = { POR: "#16a34a", DEF: "#b45309", MED: "#0891b2", DEL: "#be123c" };
var POSCOL_RING = { POR: "#22c55e", DEF: "#f59e0b", MED: "#38bdf8", CEN: "#38bdf8", DEL: "#ef4444" };
function posRing(node, a, b) {
  if (!node) return node;
  var c1 = POSCOL_RING[roleBadge(a) || a], c2 = POSCOL_RING[roleBadge(b) || b];
  if (!c1) return node;
  var w = el("span", "posring");
  w.style.setProperty("--c1", c1);
  if (c2) w.style.setProperty("--c2", c2); else w.classList.add("single");
  w.appendChild(node);
  return w;
}
function posRingCls(elx, a, b) {
  if (!elx) return elx;
  var c1 = POSCOL_RING[roleBadge(a) || a], c2 = POSCOL_RING[roleBadge(b) || b];
  if (!c1) return elx;
  elx.classList.add("posring-clip");
  elx.style.setProperty("--c1", c1);
  if (c2) elx.style.setProperty("--c2", c2); else elx.classList.add("single");
  return elx;
}
function statRow(p) {
  const row = el("div", "mcard-stats");
  const mk = (v, label, cls) => {
    const s = el("div", "mstat" + (cls ? " " + cls : ""));
    s.appendChild(el("b", null, String(v)));
    s.appendChild(el("small", null, label));
    return s;
  };
  row.appendChild(mk(Number(p.points) || 0, "PTS", "pts"));
  row.appendChild(mk(Number(p.matches) || 0, "PART", null));
  row.appendChild(mk((Number(p.avg) || 0).toFixed(1).replace(".", ","), "MEDIA", null));
  return row;
}
function splitBadge(b) {
  var codes = String(b.textContent || "").split("·").map(function (s) { return s.trim(); });
  if (codes.length === 2 && POSCOL_BY_CODE[codes[0]] && POSCOL_BY_CODE[codes[1]]) {
    b.style.background = "linear-gradient(120deg, " + POSCOL_BY_CODE[codes[0]] + " 0%, " + POSCOL_BY_CODE[codes[1]] + " 100%)";
  }
}
function applySplits(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.classList && root.classList.contains("posb")) splitBadge(root);
  if (root.querySelectorAll) root.querySelectorAll(".posb").forEach(splitBadge);
}
document.addEventListener("DOMContentLoaded", function () {
  try { new MutationObserver(function (muts) { muts.forEach(function (m) { m.addedNodes.forEach(applySplits); }); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
});
const ROLE_FULL = { portero: "Portero", defensa: "Defensa", centrocampista: "Centrocampista", delantero: "Delantero" };
function roleBadge(role) { return ROLE[String(role || "").toLowerCase()] || ""; }
function roleFull(role) { return ROLE_FULL[String(role || "").toLowerCase()] || ""; }
function statusBorder(s) {
  if (s === "redcard") return "#f97316";
  if (String(s || "").indexOf("injured") === 0) return "#ef4444";
  if (s === "doubt") return "#eab308";
  return "#22c55e";
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
  if (!box) return;
  box.innerHTML = "";
  const u = data.user;
  if (!u) { box.hidden = true; return; }
  box.hidden = false;
  const chip = el("button", "user-chip"); chip.type = "button";
  chip.innerHTML = '<span class="user-avatar">' + escapeHtml(initials(u.name)) + '</span><span class="user-name">' + escapeHtml(u.name) + '</span><span class="user-caret">▾</span>';
  const menu = el("div", "user-menu");
  const exit = el("button", "user-menu-exit", "Salir"); exit.type = "button";
  exit.onclick = async () => {
    try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {}
    lastErr = "";
    await load(true);
  };
  menu.appendChild(exit);
  box.appendChild(chip); box.appendChild(menu);
  chip.onclick = (e) => { e.stopPropagation(); menu.classList.toggle("open"); };
  if (!document.__umWired) { document.__umWired = 1; document.addEventListener("click", (e) => { document.querySelectorAll(".user-menu.open").forEach((m) => { if (!m.parentElement.contains(e.target)) m.classList.remove("open"); }); }); }
}

function render() {
  const panel = $("pujaPanel");
  panel.innerHTML = "";
  const user = data.user;
  const p = data.puja;
  renderUser();

  if (!user) {
    const intro = el("div", "auth-intro");
    intro.appendChild(el("h2", null, "Entra o crea tu cuenta"));
    intro.appendChild(el("p", "muted", "Con un nombre y un código de 4 o 6 números juegas a La Puja, La Porra y La Quiniela. Si aún no tienes cuenta, se crea sola. Después entra siempre con lo mismo."));
    panel.appendChild(intro);
    const go = el("a", "btn-primary big", "Crear cuenta o entrar");
    go.href = "/futmondo/cuenta/?next=" + encodeURIComponent("/futmondo/lapuja/");
    panel.appendChild(go);
  }

  // Contador (siempre visible)
  const cd = el("div", "puja-countdown");
  const timer = el("div", "puja-timer"); timer.id = "pjTimer";
  const sub = el("div", "puja-sub"); sub.id = "pjSub";
  const refresh = el("button", "puja-refresh", "⟳");
  refresh.title = "Actualizar subasta";
  refresh.setAttribute("aria-label", "Actualizar subasta");
  refresh.addEventListener("click", async () => { await load(true); toast("Subasta actualizada ✅"); });
  cd.appendChild(timer);
  cd.appendChild(sub);
  cd.appendChild(refresh);
  panel.appendChild(cd);

  if (p && p.status === "closed") {
    const won = el("div", "puja-won");
    won.appendChild(el("div", "pw-ico", "🏆"));
    if (p.winner) {
      won.appendChild(el("div", "pw-txt", "Puja ganada por"));
      won.appendChild(el("div", "pw-name", p.winner.user));
      won.appendChild(el("div", "pw-amt", money(p.winner.amount) + " €"));
    } else {
      won.appendChild(el("div", "pw-txt", "Nadie pujó esta vez"));
    }
    panel.appendChild(won);
  }

  if (p) {
    if (p.status === "closed") panel.appendChild(el("div", "puja-sec", "Jugador subastado"));
    if (p.status === "open") panel.appendChild(el("p", "bid-note", "⚠️ Al pujar no se puede retirar ni bajar la puja. Piénsalo antes de pujar."));
    const pcard = el("div", "puja-pcard");
    const pwrap = el("div", "puja-pcard-photo");
    const pbc = statusBorder(p.pstatus);
    if (p.photo) {
      const img = el("img", "puja-photo");
      img.src = p.photo;
      img.alt = p.player;
      img.style.borderColor = pbc;
      pwrap.appendChild(img);
    }
    const pst = statusInfo(p.pstatus);
    if (pst) pwrap.appendChild(el("span", "mcard-badge " + pst.cls, pst.label));
    pcard.appendChild(pwrap);
    pcard.appendChild(el("div", "puja-pcard-name", p.player));
    const prb = roleBadge(p.role), prb2 = roleBadge(p.role2);
    if (prb) {
      const pr = el("div", "puja-pcard-roles");
      const full = [roleFull(p.role), roleFull(p.role2)].filter(Boolean).join(" · ");
      pr.appendChild(el("span", "pos-badge posb posb-" + posCls(p.role) + (prb2 ? " multi" : ""), "Posición: " + (full || prb) + (prb2 ? " (multiposición)" : "")));
      pcard.appendChild(pr);
    }
    if (p.team) {
      const tr = el("div", "puja-pcard-team");
      if (p.logo) { const lg = el("img", "puja-pcard-crest"); lg.src = p.logo; lg.alt = ""; tr.appendChild(lg); }
      tr.appendChild(el("span", null, p.team));
      pcard.appendChild(tr);
    }
    if (p.value) {
      const vv = el("div", "puja-pcard-val", "Valor: " + money(p.value) + " €");
      const chg = Number(p.change) || 0;
      if (chg > 0) vv.appendChild(el("span", "up", "   ▲ " + formatDots(chg) + " €"));
      else if (chg < 0) vv.appendChild(el("span", "down", "   ▼ " + formatDots(-chg) + " €"));
      pcard.appendChild(vv);
    }
    panel.appendChild(pcard);
    if (p.status === "open") {
      const baseTxt = el("div", "puja-base");
      baseTxt.innerHTML = "Precio de salida: <b>" + money(p.base) + " €</b> · la saca <b>" + escapeHtml(p.creator) + "</b>";
      panel.appendChild(baseTxt);
    }
    if (data.admin && p) {
      const adm = el("div", "puja-admin");
      adm.appendChild(el("div", "puja-admin-t", "🛠️ Panel de administrador"));
      const be = el("button", "btn-ghost", "✏️ Editar jugador / precio"); be.type = "button";
      be.addEventListener("click", () => adminEdit(p));
      const bd = el("button", "btn-ghost", "🗑️ Borrar subasta"); bd.type = "button";
      bd.addEventListener("click", adminReset);
      adm.appendChild(be); adm.appendChild(bd);
      panel.appendChild(adm);
    }
  } else {
    panel.appendChild(el("div", "puja-player", "Sin subasta activa"));
  }

  // Pujas (clasificación en vivo)
  const list = el("div", "bid-list");
  const bids = ((p && p.bids) || []).slice().sort((a, b) => b.amount - a.amount);
  const top = bids[0];
  if (p) {
    const lbl = p.status === "closed" ? "Pujas finales" : "Pujas";
    list.appendChild(el("div", "puja-sec", lbl + (bids.length ? " (" + bids.length + ")" : "")));
  }
  bids.forEach((bd) => {
    const row = el("div", "bid-row");
    const isTop = top && bd.amount === top.amount;
    if (isTop) row.classList.add("top");
    if (data.user && bd.user === data.user.name) {
      row.classList.add("mine");
      if (!isTop) row.classList.add("losing");
    }
    row.appendChild(el("span", "bid-user", bd.user));
    if (bd.at) row.appendChild(el("span", "bid-time", hortxt(bd.at)));
    row.appendChild(el("span", "bid-amount", money(bd.amount) + " €"));
    list.appendChild(row);
  });
  if (!bids.length && (!p || p.status === "open")) list.appendChild(el("p", "empty", "Todavía no hay pujas."));
  if (bids.length || (p && p.status === "open")) { panel.appendChild(el("div", "puja-sep")); panel.appendChild(list); }

  if (user) {
    const open = p && p.status === "open";
    // El admin puede abrir una puja aunque no sea la hora habitual (lunes
    // 23:59 a martes 22:00); el resto de usuarios solo ven el formulario
    // dentro de esa ventana.
    const canOpen = data.inWindow || data.admin;
    if (!open && canOpen) {
    panel.appendChild(el("p", "muted", "Elige el jugador a subasta y el precio de salida. El resto verá la subasta y podrá pujar."));
    if (!data.inWindow && data.admin) panel.appendChild(el("p", "puja-admin-note", "🛠️ Fuera del horario habitual — solo tú puedes abrirla ahora (modo admin)."));
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
    f.appendChild(el("p", "bid-note", "⚠️ Una vez alguien puje, no se puede retirar ni bajar la puja."));
    const b = el("button", "btn-primary big", "Sacar a subasta"); f.appendChild(b);
    panel.appendChild(f);
    const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
    b.addEventListener("click", crear);
    attachPlayerSearch();
    } else if (open) {
      const step = p.base >= 10000000 ? 500000 : 100000;
      const curBids = (p.bids || []).slice().sort((a, b) => b.amount - a.amount);
      const leader = curBids[0] || null;
      const minFirst = Math.ceil(p.base / step) * step;
      const min = leader ? leader.amount + step : minFirst;

      const iLead = !!(leader && data.user && leader.user === data.user.name);
      const myBid = (p.bids || []).find((b) => data.user && b.user === data.user.name) || null;
      if (data.user && leader && myBid && !iLead && !suppressOutbid) {
        const ob = el("div", "outbid");
        ob.appendChild(el("div", "outbid-title", "🔔 ¡Te han superado!"));
        panel.appendChild(ob);
      }
      iWasLeading = iLead;
      suppressOutbid = false;

      panel.appendChild(el("div", "puja-sep"));
      panel.appendChild(el("div", "puja-sec", "Pujar"));
      const lead = el("div", "bid-lead");
      if (leader) lead.innerHTML = "Va primero <b>" + escapeHtml(leader.user) + "</b> con <b>" + money(leader.amount) + " €</b>";
      else lead.textContent = "Aún no hay pujas. ¡Sé el primero!";
      panel.appendChild(lead);

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
      const inp = el("input"); inp.id = "pjAmount"; inp.type = "text"; inp.inputMode = "numeric"; inp.placeholder = "Cantidad (€)";
      inp.addEventListener("input", () => { inp.value = formatDots(inp.value); });
      const b = el("button", "btn-ghost", "Pujar");
      f.appendChild(inp); f.appendChild(b);
      panel.appendChild(f);
      const err = el("p", "error"); err.id = "pjErr"; panel.appendChild(err);
      b.addEventListener("click", () => doPujar(parseDots(inp.value)));
    } else {
      panel.appendChild(el("p", "muted", "La subasta se abre el lunes a las 00:00 (hora de Madrid)."));
    }
  }

  if (p && p.status === "closed") {
    const wb = el("button", "btn-primary big share-btn", "📲 Enviar resultado por WhatsApp");
    wb.addEventListener("click", () => shareWhatsApp(p));
    panel.appendChild(wb);
  } else if (p && p.status === "open") {
    const shareBtn = el("button", "btn-ghost share-btn", "📲 Compartir por WhatsApp");
    shareBtn.addEventListener("click", () => shareWhatsApp(p));
    panel.appendChild(shareBtn);
  }

  renderHistory();

  const eEl = $("pjErr");
  if (eEl && lastErr) eEl.textContent = lastErr;

  startTimer();
}

function renderHistory() {
  ["pujaHistory", "pujaHistMain"].forEach((id) => {
  const box = $(id);
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
    const imgCol = el("div", "hist-imgcol");
    if (h.photo) {
      const im = el("img", "hist-img");
      im.src = h.photo;
      im.alt = h.player;
      im.loading = "lazy";
      im.addEventListener("error", () => { if (im.parentNode) im.parentNode.replaceChild(el("div", "hist-img", initials(h.player)), im); });
      imgCol.appendChild(posRing(im, h.role, h.role2));
    } else {
      imgCol.appendChild(el("div", "hist-img", initials(h.player)));
    }
    const hrb = roleBadge(h.role), hrb2 = roleBadge(h.role2);
    if (hrb) imgCol.appendChild(el("div", "hist-pos posb posb-" + posCls(h.role), hrb + (hrb2 ? " · " + hrb2 : "")));
    main.appendChild(imgCol);
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
        if (i === 0) row.classList.add("top");
        row.appendChild(el("span", "hb-name", (i + 1) + ". " + bd.user));
        if (bd.at) row.appendChild(el("span", "hb-time", hortxt(bd.at)));
        row.appendChild(el("span", "hb-amt", money(bd.amount) + " €"));
        bl.appendChild(row);
      });
      card.appendChild(bl);
    }
    wrap.appendChild(card);
  });
  box.appendChild(wrap);
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
    let target, txt;
    if (open) { target = p.closesAt; txt = p.extended ? "En prórroga (se amplía con cada puja)" : "Termina a las 22:00 (hora de Madrid)"; }
    else if (data.inWindow) { target = data.nextTuesday; txt = "Elige el jugador — cierra el martes a las 22:00 (hora de Madrid)"; }
    else { target = data.nextWindow; txt = "La subasta se abre el lunes a las 00:00 (hora de Madrid)"; }
    if (sub) sub.textContent = txt;
    if (!target) { t.textContent = "--:--:--"; return; }
    const diff = target - Date.now();
    if (diff <= 0) { t.classList.add("closed"); t.textContent = "00:00:00"; return; }
    t.classList.remove("closed");
    const s = Math.floor(diff / 1000);
    if (s >= 86400) {
      const d = Math.floor(s / 86400);
      t.textContent = "Próxima puja en " + d + (d === 1 ? " día" : " días");
      t.classList.add("small");
      return;
    }
    t.classList.remove("small");
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
  document.documentElement.classList.remove("auth-loading");
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

let marketShown = 18;

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
      photoWrap.appendChild(posRing(im, p.role, p.role2));
    } else {
      photoWrap.appendChild(el("div", "mcard-img", initials(p.name)));
    }
    const st = statusInfo(p.status);
    if (st) photoWrap.appendChild(el("span", "mcard-badge " + st.cls, st.label));
    card.appendChild(photoWrap);
    const body = el("div", "mcard-body");
    body.appendChild(el("div", "mcard-name", p.name));
    const mrb = roleBadge(p.role), mrb2 = roleBadge(p.role2);
    if (mrb) {
      const roles = el("div", "mcard-roles");
      const b = el("span", "mcard-role" + (mrb2 ? " multi" : "") + " posb posb-" + posCls(p.role), mrb + (mrb2 ? " · " + mrb2 : ""));
      b.title = roleFull(p.role) + (mrb2 ? " · " + roleFull(p.role2) + " (multiposición)" : "");
      roles.appendChild(b);
      body.appendChild(roles);
    }
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
    body.appendChild(statRow(p));
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
    more.addEventListener("click", () => { marketShown += 18; renderMarket(); });
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
    marketShown = 18;
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
      const meta = el("div", "pj-sug-meta");
      if (p.logo) { const lg = el("img", "pj-sug-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; meta.appendChild(lg); }
      if (p.team) meta.appendChild(el("span", null, p.team));
      info.appendChild(meta);
      row.appendChild(info);
      const right = el("div", "pj-sug-right");
      right.appendChild(el("div", "pj-sug-val", money(p.value) + " €"));
      const chg = Number(p.change) || 0;
      if (chg > 0) right.appendChild(el("div", "pj-sug-trend up", "▲ " + formatDots(chg) + " €"));
      else if (chg < 0) right.appendChild(el("div", "pj-sug-trend down", "▼ " + formatDots(-chg) + " €"));
      else right.appendChild(el("div", "pj-sug-trend flat", "—"));
      row.appendChild(right);
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
  selPlayer = p;
  const inp = $("pjPlayer"); if (inp) inp.value = p.name;
  const bs = $("pjBase"); if (bs) bs.value = formatDots(p.value);
  const hid = $("pjPhoto"); if (hid) hid.value = p.photo || "";
  const chg = Number(p.change) || 0;
  const bi = $("pjBaseInfo");
  if (bi) bi.textContent = "El precio de salida no puede ser menor que su valor.";
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
    const info = el("div", "pj-preview-info");
    info.appendChild(el("div", "pj-preview-name", p.name));
    const prb = roleBadge(p.role), prb2 = roleBadge(p.role2);
    if (prb) info.appendChild(el("div", "pj-preview-pos", "Posición: " + [roleFull(p.role), roleFull(p.role2)].filter(Boolean).join(" · ") + (prb2 ? " (multiposición)" : "")));
    const meta = el("div", "pj-preview-meta");
    if (p.logo) { const lg = el("img", "pj-preview-crest"); lg.src = p.logo; lg.alt = ""; meta.appendChild(lg); }
    if (p.team) meta.appendChild(el("span", null, p.team));
    info.appendChild(meta);
    const val = el("div", "pj-preview-val", money(p.value) + " €");
    if (chg > 0) val.appendChild(el("span", "up", "   ▲ " + formatDots(chg) + " €"));
    else if (chg < 0) val.appendChild(el("span", "down", "   ▼ " + formatDots(-chg) + " €"));
    info.appendChild(val);
    prev.appendChild(info);
  }
  const msg = $("mercadoMsg");
  if (msg) msg.textContent = "Has elegido a " + p.name + ". Escribe el precio de la puja.";
  const sug = $("pjSuggest");
  if (sug) { sug.innerHTML = ""; sug.classList.add("hidden"); }
}

async function auth(kind) {
  const err = $("pjErr");
  lastErr = "";
  try {
    const res = await fetch(API + "/" + kind, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: $("pjName").value, pin: $("pjPin").value }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    lastErr = "";
    await load(true);
  } catch (e) { lastErr = e.message; if (err) err.textContent = e.message; }
}

async function crear() {
  const err = $("pjErr");
  lastErr = "";
  const baseVal = $("pjBase") ? parseDots($("pjBase").value) : 0;
  if (!baseVal) { lastErr = "Elige un jugador y pon el precio."; if (err) err.textContent = lastErr; return; }
  if (selValue && baseVal < selValue) { lastErr = "El precio no puede ser menor que el valor del jugador (" + money(selValue) + " €)."; if (err) err.textContent = lastErr; return; }
  try {
    const res = await fetch(API + "/puja/crear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: $("pjPlayer").value, base: baseVal, photo: $("pjPhoto") ? $("pjPhoto").value : "", team: selPlayer ? selPlayer.team : "", logo: selPlayer ? selPlayer.logo : "", change: selPlayer ? selPlayer.change : 0, pstatus: selPlayer ? selPlayer.status : "", role: selPlayer ? selPlayer.role : "", role2: selPlayer ? selPlayer.role2 : "" }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    await load(true);
    toast("¡Subasta creada! 🟢");
  } catch (e) { lastErr = e.message; if (err) err.textContent = e.message; }
}

let toastTimer = null;
async function adminReset() {
  if (!confirm("¿Borrar la subasta actual y todas sus pujas? Esto no se puede deshacer.")) return;
  try {
    const res = await fetch(API + "/puja/reset", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const d = await res.json();
    if (!res.ok) { toast(d.error || "Error"); return; }
    lastJson = ""; toast("Subasta borrada ✅"); load(true);
  } catch (e) { toast("No se pudo borrar"); }
}

async function adminEdit(p) {
  const np = prompt("Jugador (tal cual en el mercado):", p.player || "");
  if (np === null) return;
  const nb = prompt("Precio de salida (€):", String(p.base || ""));
  if (nb === null) return;
  try {
    const res = await fetch(API + "/puja/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player: np.trim(), base: parseDots(nb) }) });
    const d = await res.json();
    if (!res.ok) { toast(d.error || "Error"); return; }
    lastJson = ""; toast("Subasta actualizada ✅"); load(true);
  } catch (e) { toast("No se pudo editar"); }
}

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
  const url = "https://edumr.es/futmondo/lapuja/";
  let txt;
  if (p.status === "closed") {
    if (p.winner) txt = "🏆 Subasta finalizada en Futmondo MR\n\nJugador: " + p.player + "\nGanador: " + p.winner.user + "\nPuja ganadora: " + money(p.winner.amount) + " €";
    else txt = "🏁 Subasta finalizada en Futmondo MR\n\nJugador: " + p.player + "\nNadie pujó esta vez.";
    txt += "\n\n👉 " + url;
  } else {
    txt = "🟢 Subasta en Futmondo MR\n\nJugador: " + p.player + "\nPrecio de salida: " + money(p.base) + " €\n\n¡Entra y puja! 👉 " + url;
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

let bidding = false;
async function doPujar(amount) {
  const err = $("pjErr");
  if (bidding) return;
  lastErr = "";
  if (err) err.textContent = "";
  if (Date.now() < bidCooldown) { lastErr = "Espera " + Math.ceil((bidCooldown - Date.now()) / 1000) + " s entre pujas."; if (err) err.textContent = lastErr; return; }
  if (!Number.isFinite(amount) || amount <= 0) { lastErr = "Cantidad inválida."; if (err) err.textContent = lastErr; return; }
  if (!window.confirm("¿Seguro que quieres pujar " + money(amount) + " €?\n\nNo se puede retirar ni bajar la puja.")) return;
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
    bidCooldown = Date.now() + 5000;
    await load(true);
    const top = ((data.puja && data.puja.bids) || []).slice().sort((a, b) => b.amount - a.amount)[0];
    toast(top && data.user && top.user === data.user.name ? "¡Puja registrada! Vas primero 🟢" : "¡Puja registrada! ✅");
  } catch (e) { lastErr = e.message; if (err) err.textContent = e.message; }
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
  const order = ["subasta", "historial", "instrucciones", "actividad"];
  const main = document.querySelector(".quiniela-main") || document.body;
  let sx = 0, sy = 0, st = 0, multi = false;
  // Con dos dedos (pellizco para hacer zoom) no queremos interpretarlo como
  // un deslizamiento para cambiar de pestaña: se marca "multi" y se ignora
  // ese gesto por completo, aunque el dedo que suelta en último lugar se
  // mueva mucho en horizontal.
  main.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) { multi = true; return; }
    multi = false;
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  main.addEventListener("touchmove", (e) => { if (e.touches.length > 1) multi = true; }, { passive: true });
  main.addEventListener("touchend", (e) => {
    const wasMulti = multi;
    if (e.touches.length === 0) multi = false;
    if (wasMulti || e.touches.length > 0) return;
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

/* ===== Actividad de la liga (estilo Vestuario) ===== */
function waColor(name) {
  const cols = ["#0e7a5f", "#c2410c", "#3f6212", "#be185d", "#4338ca", "#0f766e", "#a16207"];
  let h = 0; const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return cols[h % cols.length];
}
function waBold(s) {
  let t = escapeHtml(s);
  t = t.replace(/(\d{1,3}(?:\.\d{3})+)(\s?€)?/g, "<b>$1$2</b>");
  t = t.replace(/\b([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})*)\b/g, "<b>$1</b>");
  return t;
}
function waDia(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
function waImg(src, cls) {
  const im = el("img", cls); im.loading = "lazy"; im.alt = "";
  im.src = src || "/img/avatar.svg";
  im.addEventListener("error", () => { if (im.getAttribute("src") !== "/img/avatar.svg") im.src = "/img/avatar.svg"; }, { once: true });
  return im;
}
function renderActividad(l, list0) {
  l.innerHTML = "";
  l.classList.add("wa-chat");
  const list = (list0 || []).slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const top = el("div", "wa-top");
  top.appendChild(el("span", "wa-back", "‹"));
  const hanger = el("span", "wa-hanger");
  hanger.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM12 6.8c.6.6.6 1.2.2 1.7l7.4 5.1c.6.4.4 1.4-.4 1.4H4.8c-.8 0-1-.9-.4-1.4l7.4-5.1"/></svg>';
  top.appendChild(hanger);
  const tt = el("div", "wa-top-txt");
  tt.appendChild(el("b", "", "Con Permiso"));
  tt.appendChild(el("span", "", "Vestuario"));
  top.appendChild(tt);
  const logo = el("span", "wa-logo");
  logo.innerHTML = '<img src="/img/balonmundial.png" alt="">';
  top.appendChild(logo);
  l.appendChild(top);

  const body = el("div", "wa-body");
  body.appendChild(el("div", "wa-pin-label", "Mensajes pineados"));
  const pin = el("div", "wa-pin");
  const pinb = el("div", "wa-pin-txt");
  pinb.innerHTML = "<b>FORMATO de subasta:</b><br>Saco a subasta a JUGADOR 🔸 DINERO 🔸 ⭐⭐⭐<br><br><b>FORMATO de puja</b><br>JUGADOR 🔸 DINERO 🔸 ⭐⭐⭐";
  pin.appendChild(pinb);
  body.appendChild(pin);

  if (!list.length) body.appendChild(el("p", "muted small", "Sin actividad."));
  let lastDay = "";
  list.forEach((x) => {
    const dd = new Date(x.date || 0);
    const dk = isNaN(dd.getTime()) ? "" : dd.toISOString().slice(0, 10);
    if (dk && dk !== lastDay) { lastDay = dk; body.appendChild(el("div", "wa-day", waDia(x.date))); }
    const msg = el("div", "wa-msg");
    msg.appendChild(waImg(x.p, "wa-avatar"));
    const bub = el("div", "wa-bubble");
    const head = el("div", "wa-head");
    const nm = el("span", "wa-name", x.n || "Liga");
    nm.style.color = waColor(x.n || "Liga");
    head.appendChild(nm);
    head.appendChild(el("span", "wa-time", hortxt(x.date)));
    bub.appendChild(head);
    const t = el("div", "wa-text");
    t.innerHTML = waBold(x.txt || "");
    bub.appendChild(t);
    msg.appendChild(bub);
    body.appendChild(msg);
  });

  const bot = el("div", "wa-bottom");
  bot.innerHTML = '<span class="wa-bottom-logo"><img src="/img/balonmundial.png" alt=""></span>';
  body.appendChild(bot);

  l.appendChild(body);
}
async function loadActividad() {
  const l = $("pujasLocker");
  if (!l) return;
  try {
    const d = await (await fetch(API + "/noticias")).json();
    renderActividad(l, d.locker || []);
  } catch (e) { l.innerHTML = '<p class="muted">No se pudo cargar la actividad.</p>'; }
}
loadActividad();
