(function () {
  const API = "/api/laquiniela";
  const ROLE = { portero: "POR", defensa: "DEF", centrocampista: "MED", delantero: "DEL" };
  const ROLE_FULL = { portero: "Portero", defensa: "Defensa", centrocampista: "Centrocampista", delantero: "Delantero" };
  const POS = { portero: "por", defensa: "def", centrocampista: "med", delantero: "del" };
  function posCls(role) { return POS[String(role || "").toLowerCase()] || "x"; }
  const POSCOL_BY_CODE = { POR: "#16a34a", DEF: "#b45309", MED: "#0891b2", CEN: "#0891b2", DEL: "#be123c" };
  const POSCOL_RING = { POR: "#22c55e", DEF: "#f59e0b", MED: "#38bdf8", CEN: "#38bdf8", DEL: "#ef4444" };
  function posRing(node, a, b) {
    if (!node) return node;
    const c1 = POSCOL_RING[roleBadge(a) || a], c2 = POSCOL_RING[roleBadge(b) || b];
    if (!c1) return node;
    const w = el("span", "posring");
    w.style.setProperty("--c1", c1);
    if (c2) w.style.setProperty("--c2", c2); else w.classList.add("single");
    w.appendChild(node);
    return w;
  }
  function posRingCls(elm, a, b) {
    if (!elm) return elm;
    const c1 = POSCOL_RING[roleBadge(a) || a], c2 = POSCOL_RING[roleBadge(b) || b];
    if (!c1) return elm;
    elm.classList.add("posring-clip");
    elm.style.setProperty("--c1", c1);
    if (c2) elm.style.setProperty("--c2", c2); else elm.classList.add("single");
    return elm;
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
    if (b.classList.contains("posb-dual")) return;
    const codes = String(b.textContent || "").split("·").map((s) => s.trim());
    if (codes.length === 2 && POSCOL_BY_CODE[codes[0]] && POSCOL_BY_CODE[codes[1]]) {
      b.textContent = "";
      b.classList.add("posb-dual");
      b.style.background = "";
      codes.forEach((c) => { const s = document.createElement("span"); s.textContent = c; s.style.background = POSCOL_BY_CODE[c]; b.appendChild(s); });
    }
  }
  function applySplits(root) {
    if (!root) return;
    if (root.nodeType === 1) {
      if (root.classList && root.classList.contains("posb")) splitBadge(root);
      if (root.querySelectorAll) root.querySelectorAll(".posb").forEach(splitBadge);
    }
  }
  try {
    new MutationObserver((muts) => { muts.forEach((m) => { m.addedNodes.forEach(applySplits); }); })
      .observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  let all = [];
  let shown = 18;
  let mktSort = { key: "", dir: -1 };
  let sortMode = "up";
  let quick = "";
  const QUICKS = [
    ["", "Todos"],
    ["racha", "🔥 En racha"],
    ["multipos", "🔀 Multiposición"],
  ];
  function renderChips() {
    const box = $("mercChips");
    if (!box) return;
    box.innerHTML = "";
    QUICKS.forEach(([k, label]) => {
      const b = el("button", "mchip" + (quick === k ? " active" : ""), label);
      b.type = "button";
      b.addEventListener("click", () => { quick = k; shown = 18; renderChips(); renderGrid(); });
      box.appendChild(b);
    });
  }
  let teamFilter = "";
  let rangeInit = false;
  let selA = null, selB = null;
  let rangeMin = 0;
  let rangeMax = Infinity;
  const MS_KEY = "merc_state";
  let msRestored = false;
  function saveMercState() {
    try {
      const sr = $("mjSearch"), rl = $("mjRole");
      sessionStorage.setItem(MS_KEY, JSON.stringify({ q: sr ? sr.value : "", sortMode, quick, teamFilter, role: rl ? rl.value : "", rangeMin, rangeMax: rangeMax === Infinity ? 0 : rangeMax, hlPeriod, mktSort, shown }));
    } catch (e) {}
  }
  function restoreMercState() {
    if (msRestored) return; msRestored = true;
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(MS_KEY) || "null"); } catch (e) {}
    if (!st) return;
    sortMode = st.sortMode || sortMode; quick = st.quick || ""; teamFilter = st.teamFilter || "";
    rangeMin = Number(st.rangeMin) || 0; rangeMax = Number(st.rangeMax) || Infinity;
    if (st.hlPeriod) hlPeriod = st.hlPeriod;
    if (st.mktSort && typeof st.mktSort === "object") mktSort = st.mktSort;
    shown = Math.max(18, Number(st.shown) || 18);
    const sr = $("mjSearch"); if (sr && st.q) sr.value = st.q;
    const rl = $("mjRole"); if (rl) rl.value = st.role || "";
    document.querySelectorAll("#mxRole .mx-chip").forEach((x) => x.classList.toggle("active", (x.dataset.role || "") === (st.role || "")));
    document.querySelectorAll("#mxPrice .mx-chip").forEach((x) => x.classList.toggle("active", (Number(x.dataset.min) || 0) === rangeMin && (Number(x.dataset.max) || Infinity) === rangeMax));
    document.querySelectorAll(".merc-segbtn").forEach((x) => x.classList.toggle("active", x.dataset.sort === sortMode));
    renderChips(); syncClubActive();
  }
  function resetMercFilters() {
    const sr = $("mjSearch"); if (sr) sr.value = "";
    const sg = $("mjSuggest"); if (sg) { sg.innerHTML = ""; sg.hidden = true; }
    const rl = $("mjRole"); if (rl) rl.value = "";
    sortMode = "all"; quick = ""; teamFilter = ""; rangeMin = 0; rangeMax = Infinity; shown = 18; mktSort = { key: "", dir: -1 };
    document.querySelectorAll("#mxRole .mx-chip").forEach((x) => x.classList.toggle("active", !(x.dataset.role || "")));
    document.querySelectorAll("#mxPrice .mx-chip").forEach((x) => x.classList.toggle("active", !(Number(x.dataset.max) || 0) && !(Number(x.dataset.min) || 0)));
    document.querySelectorAll(".merc-segbtn").forEach((x) => x.classList.toggle("active", x.dataset.sort === "all"));
    renderChips(); syncClubActive(); renderGrid();
  }

  function $(id) { return document.getElementById(id); }
  // Botón "Volver": vuelve atrás solo si venimos de esta misma web; si no (enlace externo, pestaña nueva) va a un sitio sensato.
  function goBack(fallback) {
    let same = false;
    try { same = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) {}
    if (same && history.length > 1) history.back(); else location.href = fallback || "/futmondo/guiafantasy/inicio";
  }
  function backBtn(fallback, extra) {
    const b = el("button", "btn-ghost noti-back pp-back" + (extra ? " " + extra : ""), "←");
    b.type = "button"; b.setAttribute("aria-label", "Volver");
    b.addEventListener("click", () => goBack(fallback));
    return b;
  }
  // Botón pequeño de actualizar (arriba a la derecha en las páginas de partido)
  function refreshBtn() {
    const b = el("button", "pp-refresh");
    b.type = "button"; b.setAttribute("aria-label", "Actualizar");
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
    b.addEventListener("click", () => { if (b.classList.contains("spin")) return; b.classList.add("spin"); setTimeout(() => location.reload(), 450); });
    return b;
  }
  function money(n) { return Number(n || 0).toLocaleString("es-ES"); }
  function horaTxt(v) { try { return new Date(v).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }); } catch (e) { return ""; } }
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function stripAccents(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function formatDots(v) { const d = String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+(?=\d)/, ""); return d.replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  // true si Futmondo manda un valor real (0 incluido) y no un hueco (no jugó).
  function fitPlayed(p, idx) { const r = (p.fit || p.fitness || [])[idx]; return !(r === null || r === undefined || r === "" || r === "-" || r === "–"); }
  function roleBadge(role) { return ROLE[String(role || "").toLowerCase()] || ""; }
  function roleFull(role) { return ROLE_FULL[String(role || "").toLowerCase()] || ""; }
  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return ((parts[0] ? parts[0][0] : "?") + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  const DEFAULT_AVATAR = "/img/avatar.svg";
  function photoImg(src, cls) {
    const im = el("img", cls || "");
    im.loading = "lazy";
    im.alt = "";
    im.src = src || DEFAULT_AVATAR;
    im.addEventListener("error", () => { if (im.getAttribute("src") !== DEFAULT_AVATAR) im.src = DEFAULT_AVATAR; }, { once: true });
    return im;
  }
  function statusInfo(s) {
    if (!s) return null;
    if (s === "redcard") return { cls: "st-red", label: "" };
    if (String(s).indexOf("injured") === 0) return { cls: "st-inj", label: "+" };
    if (s === "doubt") return { cls: "st-doubt", label: "?" };
    return null;
  }
  function statusLabel(s) {
    if (!s) return "Disponible";
    if (s === "redcard") return "Sancionado";
    if (String(s).indexOf("injured") === 0) return "Lesionado";
    if (s === "doubt") return "Duda";
    return "Disponible";
  }
  function fmtDia(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function pct(v, chg) {
    const prev = (Number(v) || 0) - (Number(chg) || 0);
    if (prev <= 0) return "";
    const p = (Number(chg) || 0) / prev * 100;
    return " (" + (p >= 0 ? "+" : "") + p.toFixed(2).replace(".", ",") + "%)";
  }

  function playerCard(p, onClick) {
    const card = el("div", "mcard" + (onClick ? " clickable" : ""));
    const photoWrap = el("div", "mcard-photo");
    photoWrap.appendChild(posRing(photoImg(p.photo, "mcard-img"), p.role, p.role2));
    const st = statusInfo(p.status);
    if (st) photoWrap.appendChild(el("span", "mcard-badge " + st.cls, st.label));
    card.appendChild(photoWrap);
    const body = el("div", "mcard-body");
    body.appendChild(el("div", "mcard-name", p.name));
    const rb = roleBadge(p.role), rb2 = roleBadge(p.role2);
    if (rb) {
      const roles = el("div", "mcard-roles");
      const b = el("span", "mcard-role" + (rb2 ? " multi" : "") + " posb posb-" + posCls(p.role), rb + (rb2 ? " · " + rb2 : ""));
      b.title = roleFull(p.role) + (rb2 ? " · " + roleFull(p.role2) + " (multiposición)" : "");
      roles.appendChild(b);
      body.appendChild(roles);
    }
    if (p.team) {
      const row = el("div", "mcard-team");
      if (p.logo) { const lg = el("img", "mcard-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; row.appendChild(lg); }
      row.appendChild(el("span", null, p.team));
      clubLink(row, p.team);
      body.appendChild(row);
    }
    body.appendChild(statRow(p));
    body.appendChild(el("div", "mcard-val", money(p.value) + " €"));
    const chg = Number(p.change) || 0;
    if (chg > 0) body.appendChild(el("div", "mcard-trend up", "▲ " + formatDots(chg) + " €" + pct(p.value, chg)));
    else if (chg < 0) body.appendChild(el("div", "mcard-trend down", "▼ " + formatDots(-chg) + " €" + pct(p.value, chg)));
    else body.appendChild(el("div", "mcard-trend flat", "—"));
    card.appendChild(body);
    if (onClick) card.addEventListener("click", () => onClick(p));
    return card;
  }

  let hlPeriod = "1";
  function hlChange(p) {
    if (hlPeriod === "1") return Number(p.change) || 0;
    if (hlPeriod === "all") return p.chgAll != null ? Number(p.chgAll) : (Number(p.chg30) || 0);
    const v = p["chg" + hlPeriod];
    return v != null ? Number(v) : (Number(p.change) || 0);
  }
  let rachasData = null;
  function renderMejorFichaje() {
    const box = $("mercRachas");
    if (!box) return;
    box.innerHTML = "";
    const best = buildBest();
    if (best) {
      box.appendChild(best);
      mountScrollBar($("mercBestRow"), $("mercBestBar"));
    }
  }
  function bestPicks() {
    const cand = all.filter((p) => p.fitness && p.fitness.length >= 3 && p.value > 0);
    return cand.slice().sort((a, b) => expOf(b) - expOf(a));
  }
  // Destacados: los 6 con mejor calidad/precio = más puntos de media por millón de valor.
  // Solo entran jugadores con partidos suficientes, media decente, sin lesión ni sanción y que no estén bajando de valor (ni hoy ni en 7 días).
  function bestValue() {
    const j0 = (all || []).reduce((m, p) => Math.max(m, Number(p.matches) || 0), 0);
    return (all || [])
      .filter((p) => (Number(p.matches) || 0) >= Math.max(3, 0.6 * j0) && (Number(p.avg) || 0) >= 8 && !/injured|redcard/.test(p.status || "") && Number(p.value) > 0 && (Number(p.change) || 0) >= 0 && !(p.chg7 != null && Number(p.chg7) < 0))
      .map((p) => Object.assign({ _r: (Number(p.avg) || 0) / (Number(p.value) / 1e6) }, p))
      .sort((a, b) => b._r - a._r)
      .slice(0, 6);
  }
  function renderRachas() {
    const box = $("rachasOut");
    if (!box) return;
    box.innerHTML = "";
    const head = el("div", "dest-head");
    head.appendChild(el("span", "dest-title", "Destacados"));
    head.appendChild(el("span", "dest-upd", (lastMarketAt ? "Actualizado " + horaTxt(lastMarketAt) + " · " : "") + "se renueva cada 10 min"));
    box.appendChild(head);
    const grid = el("div", "dest-grid");
    const list = bestValue();
    if (!list.length) { grid.appendChild(el("p", "muted small dest-empty", "Cargando…")); box.appendChild(grid); return; }
    list.forEach((p, i) => {
      const card = el("div", "dest-card");
      card.addEventListener("click", () => openFicha(p));
      card.addEventListener("pointerdown", () => { try { fetch(API + "/jugador?id=" + encodeURIComponent(p.id) + "&fast=1").catch(() => {}); } catch (e) {} }, { passive: true });
      const ph = el("div", "plt-ph"), inn = el("div", "plt-in");
      if (p.photo) { const im = el("img"); im.src = p.photo; im.alt = ""; im.loading = "lazy"; im.addEventListener("error", () => im.remove()); inn.appendChild(im); }
      ph.appendChild(inn); posRingCls(ph, p.role, p.role2);
      const wrap = el("div", "plt-phw"); wrap.appendChild(ph);
      if (p.logo) { const lg = el("img", "plt-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; wrap.appendChild(lg); }
      const rst = statusInfo(p.status);
      if (rst) wrap.appendChild(el("span", "plt-st " + rst.cls, rst.label));
      card.appendChild(wrap);
      card.appendChild(el("div", "dest-name", p.name));
      const rb = roleBadge(p.role), rb2 = roleBadge(p.role2);
      if (rb) { const pill = el("span", "plt-pill posb posb-" + posCls(p.role), rb + (rb2 ? " · " + rb2 : "")); splitBadge(pill); card.appendChild(pill); }
      card.appendChild(el("div", "dest-price", (Number(p.value) / 1e6).toFixed(1).replace(".", ",") + " M€"));
      const cmp = (n) => { const a = Math.abs(n); return a >= 1e6 ? (a / 1e6).toFixed(1).replace(".", ",") + " M€" : Math.round(a / 1000) + " mil €"; };
      const trend = el("div", "dest-trend");
      [["Hoy", p.change], ["7 días", p.chg7]].forEach((x) => {
        if (x[1] == null || x[1] === "") return;
        const v = Number(x[1]) || 0;
        const line = el("div", "dt-row " + (v > 0 ? "up" : v < 0 ? "down" : "flat"));
        line.appendChild(el("span", null, x[0]));
        line.appendChild(el("b", null, v === 0 ? "igual" : (v > 0 ? "▲ " : "▼ ") + cmp(v)));
        trend.appendChild(line);
      });
      if (trend.children.length) card.appendChild(trend);
      const ratio = el("div", "dest-ratio");
      ratio.appendChild(el("b", null, (Number(p.avg) || 0).toFixed(1).replace(".", ",")));
      ratio.appendChild(el("small", null, "de media"));
      card.appendChild(ratio);
      card.appendChild(el("div", "dest-why", p._r.toFixed(2).replace(".", ",") + " pts de media por cada millón"));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  function fmtDiaLargo(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-ES", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  }
  // "2026-10-09" -> "09/10" (clSince, guardado como fecha simple sin hora).
  function fmtDiaCorto(v) {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + "/" + m[2] : "";
  }

  function reasonOf(p) {
    const parts = [];
    const fit = (p.fitness || []).map(Number);
    const med = Number(p.avg) || 0;
    if (med) parts.push("media " + med.toFixed(1).replace(".", ","));
    let racha = 0; for (let i = fit.length - 1; i >= 0; i--) { if (fit[i] > 0) racha++; else break; }
    if (racha >= 3) parts.push(racha + " partidos puntuando");
    if (p.prob != null) parts.push(p.prob + "% de jugar");
    if (p.casaFf != null) parts.push(p.casaFf ? "juega en casa" : "juega fuera");
    return parts.join(" · ") || "buen momento de forma";
  }

  function renderClausGrid(box, list, j0) {
    box.innerHTML = "";
    if (!list.length) { box.appendChild(el("p", "market-empty", "Sin clausulazos jugosos ahora mismo.")); return; }
    const grid = el("div", "claus-grid");
    list.forEach((p) => {
      const card = el("div", "claus-card2");
      const ph = el("div", "claus-photo2"); ph.appendChild(photoImg(p.photo, "claus-img"));
      const cst = statusInfo(p.status);
      if (cst) ph.appendChild(el("span", "mcard-badge " + cst.cls, cst.label));
      card.appendChild(ph);
      const body = el("div", "claus-body2");
      body.appendChild(el("div", "claus-name2", p.name || ""));
      const rb = roleBadge(p.role), rb2 = roleBadge(p.role2);
      if (rb) {
        const pros = el("div", "claus-pos");
        pros.appendChild(el("span", "posb posb-" + posCls(p.role), rb));
        if (rb2) pros.appendChild(el("span", "posb posb-" + posCls(p.role2), rb2));
        body.appendChild(pros);
      }
      const tm = el("div", "claus-team");
      if (p.logo) { const lg = el("img", "racha-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; tm.appendChild(lg); }
      if (p.team) tm.appendChild(el("span", null, p.team));
      clubLink(tm, p.team);
      body.appendChild(tm);
      const ow = el("div", "claus-owner");
      const av = el("img", "claus-ownav"); av.src = p.ownerPhoto || "/img/avatar.svg"; av.alt = ""; av.loading = "lazy";
      av.addEventListener("error", () => { av.style.visibility = "hidden"; });
      ow.appendChild(av);
      ow.appendChild(el("span", null, "de " + (p.owner || "?")));
      body.appendChild(ow);
      // Últimos partidos: para saber de un vistazo si merece la pena pagar
      // la cláusula (en racha de verdad) o si los puntos/la media vienen de
      // partidazos ya lejanos, con el mismo formato que "Jugadores en racha".
      const fit = (p.fitness || []).map((x) => Number(x) || 0);
      if (fit.length) {
        const fitWrap = el("div", "claus-fitwrap");
        fitWrap.appendChild(el("div", "claus-fitlabel", "Últimos partidos"));
        const scores = el("div", "racha-scores claus-fit-scores");
        const n = Math.min(5, fit.length);
        for (let k = 0; k < n; k++) {
          const v = Math.round(fit[fit.length - 1 - k]);
          const j = jLab(p.team, fit.length, k, j0);
          const cls = v >= 6 ? " hi" : v >= 4 ? " mid" : v > 0 ? " lo" : v < 0 ? " neg" : (fitPlayed(p, fit.length - 1 - k) ? " z0" : " zero");
          const cell = el("span", "racha-chip" + cls);
          if (j > 0) cell.appendChild(el("i", null, "J" + j));
          cell.appendChild(el("b", null, v !== 0 ? String(v) : (fitPlayed(p, fit.length - 1 - k) ? "0" : "–")));
          scores.appendChild(cell);
        }
        fitWrap.appendChild(scores);
        body.appendChild(fitWrap);
      }
      const st = el("div", "claus-stats");
      const sbox = (val, lab, cls) => { const b = el("div", "claus-stat" + (cls ? " " + cls : "")); b.appendChild(el("b", null, String(val))); b.appendChild(el("small", null, lab)); return b; };
      st.appendChild(sbox(Number(p.points) || 0, "PTS"));
      st.appendChild(sbox((Number(p.avg) || 0).toFixed(1).replace(".", ","), "Media", "media"));
      st.appendChild(sbox((Number(p.clause) / 1e6).toFixed(1).replace(".", ",") + " M", "Cláusula", "clause"));
      body.appendChild(st);
      if (p.clNewOwner) body.appendChild(el("div", "claus-newowner", "🆕 nuevo dueño"));
      const diff = (Number(p.clause) || 0) - (Number(p.value) || 0);
      const vrow = el("div", "claus-val");
      vrow.appendChild(el("b", null, "Valor " + money(p.value) + " €"));
      vrow.appendChild(el("span", "claus-above", "+" + (diff / 1e6).toFixed(1).replace(".", ",") + " M por encima de su valor"));
      body.appendChild(vrow);
      // Historial de la cláusula: sin tener que entrar en la ficha, para
      // ver de un vistazo si se la han ido subiendo (la están "defendiendo")
      // o lleva igual, directamente en la tarjeta.
      if (p.clChg != null || p.clUp) {
        const up = el("div", "claus-lastup" + (p.clUp ? " yes" : ""));
        const amtTxt = p.clUp ? (p.clUp.amt >= 1e6 ? (p.clUp.amt / 1e6).toFixed(1).replace(".", ",") + " M" : formatDots(Math.round(p.clUp.amt)) + " €") : "";
        up.textContent = p.clUp ? "📈 Subió +" + amtTxt + " · " + fmtDiaCorto(p.clUp.d) : "Sin subidas desde " + fmtDiaCorto(p.clSince);
        body.appendChild(up);
      }
      const playedPct = j0 ? Math.round(((Number(p.matches) || 0) / j0) * 100) : 0;
      body.appendChild(el("div", "claus-played", "Jugados: " + playedPct + "% de los partidos"));
      // Estado y % de jugar: se toman del mercado en vivo (se refresca solo) y, si no está, de lo guardado.
      const live = (all || []).find((x) => String(x.id) === String(p.id)) || {};
      const stt = live.status || p.status;
      const prb = live.prob != null ? live.prob : p.prob;
      const sl = statusLabel(stt);
      const sc = stt === "redcard" ? "red" : String(stt || "").indexOf("injured") === 0 ? "inj" : stt === "doubt" ? "doubt" : "ok";
      body.appendChild(el("div", "claus-status " + sc, sl + (sc !== "ok" && prb != null ? " · " + prb + "% de jugar" : "")));
      const blocked = p.unlock && new Date(p.unlock).getTime() > Date.now();
      if (blocked) body.appendChild(el("div", "claus-lock", "🔒 se libera el " + fmtDiaLargo(p.unlock)));
      card.appendChild(body);
      card.addEventListener("click", () => openFicha(p));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  let clausAll = [], clausJ0 = 0, clausPos = "", clausSort = "desc";
  function clausApply() {
    const box = $("clausOut");
    if (!box) return;
    let list = clausAll.filter((p) => !(clausPos && p.role !== clausPos && p.role2 !== clausPos));
    if (clausSort === "asc") list = list.slice().sort((a, b) => (Number(a.clause) || 0) - (Number(b.clause) || 0));
    else list = list.slice().sort((a, b) => (Number(b.clause) || 0) - (Number(a.clause) || 0));
    renderClausGrid(box, list, clausJ0);
  }
  function bindClausFilters() {
    const bind = (id, attr, set) => {
      const row = $(id);
      if (!row || row.dataset.bound) return;
      row.dataset.bound = "1";
      row.querySelectorAll(".claus-chip").forEach((b) => b.addEventListener("click", () => {
        row.querySelectorAll(".claus-chip").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        set(b.dataset[attr] || "");
      }));
    };
    bind("clausPos", "pos", (v) => { clausPos = v || ""; clausApply(); });
    bind("clausSort", "sort", (v) => { clausSort = v || "desc"; clausApply(); });
  }
  async function renderClausulas() {
    const box = $("clausOut");
    if (!box || box.dataset.loaded === "1") return;
    box.dataset.loaded = "1";
    bindClausFilters();
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem("claus_cache") || "null"); } catch (e) {}
    let timer = null;
    if (cached && cached.players && cached.players.length) { clausAll = cached.players; clausJ0 = Number(cached.jornada) || 0; clausApply(); }
    else {
      box.innerHTML = '<p class="muted small" id="clausMsg">Analizando tu liga…</p>';
      const t0 = Date.now();
      timer = setInterval(() => {
        const m = box.querySelector("#clausMsg");
        if (m) m.textContent = "Analizando tu liga… " + Math.round((Date.now() - t0) / 1000) + " s · suele tardar 10-20 s";
      }, 1000);
    }
    try {
      const d = await (await fetch(API + "/clausulas")).json();
      if (timer) clearInterval(timer);
      const list = (d && d.players) || [];
      const j0 = Number(d && d.jornada) || 0;
      const upd = $("clausUpdated");
      if (upd) upd.textContent = d && d.updatedAt ? "Actualizado " + horaTxt(d.updatedAt) + " · cada 30 min" : "Cada 30 min";
      clausAll = list; clausJ0 = j0; clausApply();
      try { localStorage.setItem("claus_cache", JSON.stringify({ at: Date.now(), jornada: j0, players: list })); } catch (e) {}
    } catch (e) { if (timer) clearInterval(timer); if (!(cached && cached.players)) box.innerHTML = '<p class="market-empty">No se pudo cargar.</p>'; }
  }

  function badgeCls(b) {
    const s = stripAccents(String(b || "").toLowerCase());
    if (s.indexOf("oficial") >= 0) return "of";
    if (s.indexOf("negociac") >= 0) return "neg";
    if (s.indexOf("rumor") >= 0) return "rum";
    return "ot";
  }
  function fichImg(urls, cls) {
    const list = (urls || []).filter(Boolean);
    if (!list.length) return null;
    const wrap = el("div", cls);
    const im = el("img"); im.alt = ""; im.loading = "lazy";
    let i = 0;
    im.addEventListener("error", () => { i++; if (i < list.length) im.src = list[i]; else wrap.remove(); });
    im.src = list[0];
    wrap.appendChild(im);
    return wrap;
  }
  // Banner de marca para fichajes sin foto: degradado con los colores de los clubes (origen -> destino)
  const CLUB_COL = [[/barc/, "#a50044"], [/real madrid/, "#1e3a8a"], [/atletico|atleti/, "#c8102e"], [/sevilla/, "#d71920"], [/betis/, "#0a7d3b"], [/valencia/, "#e8731a"], [/athletic|bilbao/, "#d4121a"], [/sociedad/, "#0067b1"], [/villarreal/, "#b58900"], [/celta/, "#2a7fbf"], [/osasuna/, "#c0102e"], [/getafe/, "#004fa3"], [/rayo/, "#d6101f"], [/espanyol/, "#0069b5"], [/mallorca/, "#c8102e"], [/alaves/, "#0052a5"], [/girona/, "#d6192b"], [/palmas/, "#b58900"], [/levante/, "#9b1030"], [/elche/, "#0c8a3f"], [/oviedo/, "#0b4aa2"], [/depor/, "#1d4ed8"], [/racing|santander/, "#0a7d3b"], [/malaga/, "#0b66c3"], [/tottenham|spurs/, "#132257"], [/psg|paris/, "#004170"], [/arsenal/, "#d4001e"], [/chelsea/, "#034694"], [/man.* city|manchester city/, "#1f6fa8"], [/man.* united|manchester united/, "#da291c"], [/liverpool/, "#c8102e"], [/bayern/, "#dc052d"], [/inter\b/, "#0a3a8c"], [/milan/, "#c8102e"], [/juventus/, "#1f2937"], [/napoli/, "#1e88e5"], [/dortmund/, "#b58900"], [/leverkusen/, "#c81d1d"], [/benfica/, "#c1001f"], [/porto/, "#003a8c"], [/ajax/, "#c8102e"], [/newcastle/, "#222222"], [/west ham/, "#7a263a"], [/aston villa/, "#670e36"], [/everton/, "#003399"], [/brighton/, "#0057b8"], [/sporting/, "#0b7a3b"], [/roma/, "#8b1c2c"], [/lazio/, "#6cb4e4"], [/atalanta/, "#1d4ed8"]];
  function clubColor(name) {
    const n = stripAccents(String(name || "").toLowerCase());
    for (const [re, c] of CLUB_COL) if (re.test(n)) return c;
    let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
    return "hsl(" + h + " 55% 32%)";
  }
  function clubLogo(name, fallback) {
    const k = teamCanon(name);
    const p = (all || []).find((x) => x.logo && teamCanon(x.team) === k);
    return (p && p.logo) || fallback || "";
  }
  function brandBan(ban, clubs, soloCrest) {
    const a = clubs[0] || "", b = clubs[1] || clubs[0] || "";
    ban.style.backgroundImage = clubs.length ? "linear-gradient(105deg, " + clubColor(a) + " 0%, " + clubColor(b) + " 100%)" : "";
    [[a, "l", clubs.length === 1 ? soloCrest : ""], [clubs.length > 1 ? b : "", "r", ""]].forEach((c) => {
      if (!c[0]) return;
      const wrap = el("div", "fich2-bc " + c[1]);
      const src = clubLogo(c[0], c[2]);
      if (src) { const im = el("img"); im.src = src; im.alt = ""; im.addEventListener("error", () => { im.remove(); wrap.textContent = String(c[0]).slice(0, 3).toUpperCase(); }); wrap.appendChild(im); }
      else wrap.textContent = String(c[0]).slice(0, 3).toUpperCase();
      ban.appendChild(wrap);
    });
  }
  let fichLoaded = false;
  async function renderFichajes() {
    const box = $("fichOut");
    if (!box || fichLoaded) return;
    fichLoaded = true;
    box.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i></div>';
    try {
      const d = await (await fetch(API + "/fichajes")).json();
      const groups = (d && d.groups) || [];
      const upd = $("fichUpdated");
      if (upd) upd.textContent = d && d.updatedAt ? "· actualizado " + haceTxt(d.updatedAt) : "";
      box.innerHTML = "";
      if (!groups.length) { box.innerHTML = '<p class="muted small">Sin movimientos ahora mismo.</p>'; return; }
      groups.forEach((g) => {
        if (g.date) { const dh = el("div", "fich-day"); dh.appendChild(el("span", "fich-day-txt", "🗓️ " + g.date)); box.appendChild(dh); }
        const grid = el("div", "fich2-grid");
        g.items.forEach((x, i) => {
          const bc = x.badge ? badgeCls(x.badge) : "ot";
          const card = el("div", "fich2 fich2-" + bc);
          card.style.animationDelay = Math.min(i, 8) * 40 + "ms";
          const ban = el("div", "fich2-ban");
          const paintBrand = () => { ban.style.backgroundImage = ""; ban.classList.add("empty"); brandBan(ban, x.clubs || [], x.clubs && x.clubs.length === 1 ? x.clubCrest : ""); };
          if (x.thumb) { ban.style.backgroundImage = 'url("' + x.thumb + '")'; const t = new Image(); t.onerror = paintBrand; t.src = x.thumb; } else paintBrand();
          if (x.badge) ban.appendChild(el("span", "fich2-badge " + bc, x.badge));
          if (x.time) ban.appendChild(el("span", "fich2-time", "🕒 " + x.time));
          card.appendChild(ban);
          const main = fichImg([x.photo, x.clubCrest], "fich2-photo");
          if (main) card.appendChild(main);
          const body = el("div", "fich2-body" + (main ? " has-ph" : ""));
          body.appendChild(el("div", "fich2-title", x.title || ""));
          if (x.clubs && x.clubs.length) {
            const rt = el("div", "fich2-ruta");
            x.clubs.forEach((c, k) => { if (k) rt.appendChild(el("span", "fich2-arrow", "➜")); rt.appendChild(el("span", "fich2-club", c)); });
            body.appendChild(rt);
          }
          if (x.extract) body.appendChild(el("div", "fich2-extract", x.extract));
          if (x.link) { const a = el("button", "fich2-link", "Leer noticia →"); a.type = "button"; a.addEventListener("click", () => openNoticia(x.link, x.title)); body.appendChild(a); }
          card.appendChild(body);
          grid.appendChild(card);
        });
        box.appendChild(grid);
      });
    } catch (e) { box.innerHTML = '<p class="muted small">No se pudo cargar.</p>'; }
  }

  const akey = (s) => stripAccents(String(s || "").toLowerCase()).replace(/[^a-z0-9]/g, "");
  function nameSlug(s) { return stripAccents(String(s || "").toLowerCase()).replace(/[^a-z0-9]/g, ""); }
  // URL de la ficha de un jugador: /jugador/<id>/<nombre>
  // (el id es el de Futmondo; el nombre solo hace la URL legible).
  function playerUrl(name) {
    const p = marketInfo(name);
    if (p && p.id) return "/jugador/" + encodeURIComponent(p.id) + "/" + nameSlug(p.name);
    return "";
  }
  function openPlayerByName(name) {
    const u = playerUrl(name);
    if (u) { location.href = u; return; }
    const q = stripAccents(String(name || "").toLowerCase());
    if (!q || !all || !all.length) return;
    const p = all.find((x) => stripAccents(x.name).toLowerCase() === q) || all.find((x) => stripAccents(x.name).toLowerCase().indexOf(q) >= 0 || q.indexOf(stripAccents(x.name).toLowerCase()) >= 0);
    if (p) openFicha(p);
  }
  function renderBench(list, title) {
    const box = el("div", "alin-bench");
    box.appendChild(el("div", "alin-bench-h", title || "Alternativas al once"));
    const grid = el("div", "alin-bench-grid");
    list.forEach((p) => {
      const c = el("div", "alin-bp");
      const ph = el("div", "alin-bimg");
      if (p.photo) { const im = el("img"); im.src = p.photo; im.alt = ""; im.loading = "lazy"; ph.appendChild(im); }
      c.appendChild(ph);
      if (p.prob != null) { const bp = el("span", "alin-bprob", p.prob + "%"); bp.title = probTitle(p.prob); c.appendChild(bp); }
      c.appendChild(el("span", "alin-bname", p.last || p.name));
      c.addEventListener("click", () => openPlayerByName(p.full || p.name));
      grid.appendChild(c);
    });
    box.appendChild(grid);
    return box;
  }
  function posGroup(pos) {
    return /portero/i.test(pos) ? "Portero" : /defensa/i.test(pos) ? "Defensa" : /delantero/i.test(pos) ? "Delantero" : "Mediocampista";
  }
  // Mismos tramos de color que FutbolFantasy para el badge de probabilidad.
  function pctColor(prob) {
    if (prob >= 90) return "#4184ab";
    if (prob >= 80) return "#41ab58";
    if (prob >= 60) return "#ebcc34";
    if (prob >= 40) return "#cf8236";
    return "#808080";
  }
  // Escala oficial de futbolfantasy.com para el % de probabilidad de jugar
  // (de donde sacamos la mayoría de estos datos). Se usa como tooltip en
  // cada badge de % para que se entienda qué significa de verdad el número,
  // no solo el porcentaje suelto.
  const PROB_SCALE = [
    [99, "Titularidad confirmada por el entrenador"],
    [95, "Titularísimo salvo lesión de última hora"],
    [90, "Titularísimo. Una rotación de cada diez partidos"],
    [80, "Titular: riesgo de 1 de 5 de rotar"],
    [70, "Límite de la duda. Titular con miedo"],
    [60, "En duda, pero con ligera ventaja"],
    [50, "Duda en igualdad de condiciones con otros competidores"],
    [40, "Suplente, pero entre los favoritos de ser titular"],
    [30, "Suplente, con opciones de ser titular"],
    [20, "Suplente con pocas opciones de ser titular"],
    [10, "Suplente habitual, juega uno de cada diez"],
    [0, "Lesionado, baja confirmada o suplencia segura"],
  ];
  function probLabel(prob) {
    const v = Number(prob);
    if (!isFinite(v)) return "";
    for (const [th, label] of PROB_SCALE) if (v >= th) return label;
    return PROB_SCALE[PROB_SCALE.length - 1][1];
  }
  function probTitle(prob) { return prob != null ? prob + "% · " + probLabel(prob) : ""; }
  // Botón "?" compacto que despliega la escala completa — para poner junto
  // a los badges de % en las secciones con más jugadores a la vista, ya que
  // en móvil no hay hover que muestre el title="" de cada badge suelto.
  function probLegendBtn() {
    const wrap = el("div", "prob-legend-wrap");
    const btn = el("button", "prob-legend-btn", "ℹ️ ¿Qué significa el %?");
    btn.type = "button";
    const panel = el("div", "prob-legend-panel hidden");
    PROB_SCALE.forEach(([th, label]) => {
      const row = el("div", "prob-legend-row");
      const pct = el("span", "prob-legend-pct", th + "%");
      pct.style.color = pctColor(th);
      row.appendChild(pct);
      row.appendChild(el("span", "prob-legend-txt", label));
      panel.appendChild(row);
    });
    btn.addEventListener("click", () => panel.classList.toggle("hidden"));
    wrap.appendChild(btn);
    wrap.appendChild(panel);
    return wrap;
  }
  function renderPitch(t, crest) {
    const col = el("div", "alin-teamcol");
    const th = el("div", "alin-tcolhead");
    if (crest) { const im = el("img"); im.src = crest; im.alt = ""; im.loading = "lazy"; th.appendChild(im); }
    th.appendChild(el("span", null, t.name || ""));
    if (t.formation) th.appendChild(el("span", "alin-form", t.formation));
    col.appendChild(th);
    const box = el("div", "alin-pitch");
    const groups = { Portero: [], Defensa: [], Mediocampista: [], Delantero: [] };
    (t.starters || []).forEach((p) => { groups[posGroup(p.pos)].push(p); });
    // Banquillo agrupado por posición y ordenado por probabilidad, para sugerir
    // el "jugador probable" (recambio) de cada titular dentro de su misma línea.
    const benchPool = { Portero: [], Defensa: [], Mediocampista: [], Delantero: [] };
    (t.bench || []).forEach((p) => { benchPool[posGroup(p.pos)].push(p); });
    Object.keys(benchPool).forEach((k) => benchPool[k].sort((a, b) => (b.prob == null ? -1 : b.prob) - (a.prob == null ? -1 : a.prob)));
    [["Delantero", 15], ["Mediocampista", 41], ["Defensa", 67], ["Portero", 88]].forEach((band) => {
      const arr = groups[band[0]];
      if (!arr.length) return;
      const n = arr.length;
      // Margen interior: el badge de probabilidad sobresale hacia la izquierda
      // de cada jugador, así que necesitan hueco de sobra para no quedar
      // cortados por el borde del campo. Con 4 jugadores en línea (ej. un
      // 4-4-2) o con 5 o más (ej. un 4-5-1), las fotos a tamaño normal quedan
      // pegadas unas a otras, así que se reducen progresivamente (y por tanto
      // necesitan menos margen) para que quepan separadas.
      const sizeClass = n >= 5 ? "tight" : n === 4 ? "semi" : "";
      const inset = n >= 5 ? 13 : n === 4 ? 16 : 20;
      const span = 100 - inset * 2;
      const step = n > 1 ? span / (n - 1) : 0;
      arr.forEach((p, i) => {
        const x = n > 1 ? (inset + i * step) : 50;
        const pl = el("div", "alin-pl" + (sizeClass ? " alin-pl-" + sizeClass : ""));
        pl.style.left = x + "%";
        pl.style.top = band[1] + "%";
        const ph = el("div", "alin-pimg");
        if (p.photo) { const im = el("img"); im.src = p.photo; im.alt = ""; im.loading = "lazy"; ph.appendChild(im); }
        if (p.prob != null && p.prob < 100) {
          const pct = el("span", "alin-pct", p.prob + "%");
          pct.style.borderColor = pctColor(p.prob);
          pct.title = probTitle(p.prob);
          ph.appendChild(pct);
        }
        pl.appendChild(ph);
        pl.appendChild(el("div", "alin-pname", p.last || p.name));
        // Solo se muestra el recambio cuando el titular no tiene la plaza asegurada
        // (probabilidad del 60% o menos); si está prácticamente fijo, no aporta,
        // y dejamos ese hueco del banquillo disponible para otro titular con duda.
        // (<=60 y no <60: hay titulares justo al 60% exacto, como Adeyemi en el
        // Barça con Gordon de recambio al 50%, que también deben mostrar recambio).
        // El portero es la excepción: solo suele haber un suplente claro (el
        // segundo portero), así que interesa verlo siempre debajo del titular
        // aunque este tenga la titularidad prácticamente asegurada (ej. Dituro
        // 70% en el Elche con Diturbe 30% como único recambio).
        if (p.prob != null && (band[0] === "Portero" || p.prob <= 60)) {
          // En una misma posición puede haber más de un suplente con opciones
          // reales (no siempre uno solo), así que se cogen hasta 2 del
          // banquillo de esa posición en vez de uno único.
          const alts = [];
          for (let k = 0; k < 2; k++) {
            const a = benchPool[band[0]].shift();
            if (a) alts.push(a);
          }
          alts.forEach((alt) => {
            const altEl = el("div", "alin-palt", alt.last || alt.name);
            altEl.title = "Probable recambio: " + (alt.full || alt.name);
            altEl.addEventListener("click", (ev) => { ev.stopPropagation(); openPlayerByName(alt.full || alt.name); });
            pl.appendChild(altEl);
          });
        }
        pl.addEventListener("click", () => openPlayerByName(p.full || p.name));
        box.appendChild(pl);
      });
    });
    col.appendChild(box);
    if (t.bench && t.bench.length) col.appendChild(renderBench(t.bench));
    return col;
  }
  // La "alineación probable" de un partido ya no vive en una pestaña propia:
  // se abre como una ficha modal (igual que la ficha de un jugador) al pinchar
  // el partido en la franja de jornada, tanto desde Inicio como desde Mercado.
  // ---------- Página de partido (/futmondo/guiafantasy/partido/<slug>) ----------
  function matchSlug(home, away) {
    return stripAccents(String(home + "-" + away).toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function mpPos(pos) {
    const p = String(pos || "").toLowerCase();
    if (p.indexOf("porter") >= 0) return ["PT", "pt"];
    if (p.indexOf("defens") >= 0) return ["DF", "df"];
    if (p.indexOf("delan") >= 0) return ["DL", "dl"];
    if (p.indexOf("med") >= 0 || p.indexOf("centro") >= 0) return ["MD", "md"];
    return ["", "x"];
  }
  // Equipo canónico para comparar "Barça" con "Barcelona", "Atleti" con "Atlético de Madrid"...
  function teamCanon(t) {
    const n = stripAccents(String(t || "").toLowerCase()).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    const T = [[/barc/, "fcb"], [/athletic|bilbao/, "ath"], [/atleti|atletico/, "atm"], [/real madrid/, "rma"], [/betis/, "bet"], [/sociedad/, "rso"], [/celta/, "cel"], [/depor/, "dep"], [/rayo/, "ray"], [/espanyol|espanol/, "esp"], [/getafe/, "get"], [/alaves/, "ala"], [/elche/, "elc"], [/osasuna/, "osa"], [/villarreal/, "vil"], [/valencia/, "val"], [/sevilla/, "sev"], [/levante/, "lev"], [/malaga/, "mal"], [/racing/, "rac"], [/girona/, "gir"], [/mallorca/, "mll"], [/oviedo/, "ovi"], [/palmas/, "lpa"]];
    for (const [re, k] of T) if (re.test(n)) return k;
    return n.split(" ").filter((w) => !/^(real|fc|de|la|del|club|ud|cd|rc|ca|cf|sd)$/.test(w))[0] || n;
  }
  // Enlace al club: cualquier escudo o nombre de equipo lleva a /equipos/<club> (salvo en los partidos "vs")
  const CLUB_SLUG = { fcb: "barcelona", ath: "athletic-de-bilbao", atm: "atletico-de-madrid", rma: "real-madrid", bet: "betis", rso: "real-sociedad", cel: "celta-de-vigo", dep: "deportivo-de-la-coruna", ray: "rayo-vallecano", esp: "espanyol", get: "getafe", ala: "alaves", elc: "elche", osa: "osasuna", vil: "villarreal", val: "valencia", sev: "sevilla", lev: "levante", mal: "malaga", rac: "racing-de-santander" };
  function clubHref(t) { const k = CLUB_SLUG[teamCanon(t)]; return k ? "/equipos/" + k : ""; }
  function clubLink(node, team) {
    const h = clubHref(team);
    if (!node || !h) return node;
    node.classList.add("club-link");
    node.setAttribute("role", "link");
    node.tabIndex = 0;
    node.title = team;
    const go = (e) => {
      e.stopPropagation(); e.preventDefault();
      try { sessionStorage.setItem("scrollBack:" + location.pathname, String(window.scrollY || 0)); } catch (x) {}
      location.href = h;
    };
    node.addEventListener("click", go);
    node.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
    return node;
  }
  // Jornadas que ha JUGADO cada equipo (partidos terminados). Los 5 puntos de "fitness" son de los
  // últimos 5 partidos jugados, así que si un partido se suspende/aplaza (Rayo–Athletic) esa jornada
  // no cuenta y las etiquetas J deben saltársela.
  let playedJ = null, oppJ = {}, anFormaRender = null;
  // Partidos de la plantilla con puntos YA publicados por Futmondo: el que más partidos suma entre los jugadores del equipo.
  // Cuando un partido acaba, Futmondo tarda un rato en dar los puntos; mientras tanto el último partido
  // terminado NO cuenta (si no, los puntos del partido anterior saldrían con la J nueva).
  let pubMap = null, pubSrc = null;
  function teamPub(team) {
    const src = (all && all.length) ? all : pltPlayers;
    if (!src || !src.length) return 0;
    if (pubSrc !== src) {
      pubMap = {}; pubSrc = src;
      src.forEach((p) => { const k = teamCanon(p.team), m = Number(p.matches) || 0; if (m > (pubMap[k] || 0)) pubMap[k] = m; });
    }
    return pubMap[teamCanon(team)] || 0;
  }
  function jLab(team, len, k) {
    const l = playedJ && playedJ[teamCanon(team)];
    if (!l) return 0; // sin las jornadas jugadas reales no se inventa la J
    const n = Math.min(l.length, teamPub(team) || l.length);
    if (n < len) return 0;
    return l[n - 1 - k];
  }
  function dateKey(d, t) {
    const a = String(d || "").split("/").map(Number);
    const hm = String(t || "0:0").replace(":", "") * 1 || 0;
    return (((a[1] >= 7 ? a[1] : a[1] + 12) || 0) * 100 + (a[0] || 0)) * 10000 + hm;
  }
  let playedJBusy = false, liveJ = {};
  async function ensurePlayedJ() {
    if (playedJ || playedJBusy) return;
    playedJBusy = true;
    try {
      const jr = await (await fetch(API + "/jornada")).json();
      const cur = Number(jr && jr.matchday) || 0;
      if (!cur) return;
      const m = {};
      liveJ = {};
      ((jr && jr.matches) || []).forEach((x) => { if (x.live && x.live.state === "live") [x.home, x.away].forEach((t) => { liveJ[teamCanon(t)] = cur; }); });
      const rs = await Promise.all(Array.from({ length: cur }, (_, i) => i + 1).map((n) =>
        n === cur ? Promise.resolve({ n, ms: (jr && jr.matches) || [] }) :
        fetch(API + "/jornada?jornada=" + n).then((r) => r.json()).then((j) => ({ n, ms: (j && j.matches) || [] })).catch(() => null)));
      if (rs.some((x) => !x || !x.ms.length)) return; // si falta alguna jornada, mejor no inventar
      rs.sort((a, b) => a.n - b.n).forEach((r) => r.ms.forEach((x) => {
        if (x.live && x.live.state === "final") [x.home, x.away].forEach((t) => {
          const k = teamCanon(t); (m[k] = m[k] || []).push({ n: r.n, k: dateKey(x.date, x.time) });
          const isH = t === x.home;
          const sm = x.live.score && String(x.live.score).match(/(\d+)\s*-\s*(\d+)/);
          (oppJ[k] = oppJ[k] || {})[r.n] = { rival: isH ? x.away : x.home, home: isH, crest: isH ? x.awayCrest : x.homeCrest, ga: sm ? (isH ? +sm[2] : +sm[1]) : null };
        });
      }));
      // Futmondo ordena los últimos partidos por FECHA, no por nº de jornada (un partido aplazado se juega antes o después).
      Object.keys(m).forEach((k) => { m[k] = m[k].sort((a, b) => a.k - b.k).map((e) => e.n); });
      playedJ = m;
      try { if (anFormaRender) anFormaRender(); } catch (e) {}
      try { renderRachas(); } catch (e) {}
      try { if (typeof clausApply === "function") clausApply(); } catch (e) {}
      try { if (pltInit && pltPlayers.length) renderPltList(); } catch (e) {}
    } catch (e) {} finally { playedJBusy = false; }
  }
  function marketInfo(name, team) {
    const norm = (s) => stripAccents(String(s || "").toLowerCase()).replace(/\s+/g, " ").trim();
    let q = norm(name);
    if (team) {
      const tc = teamCanon(team);
      const sub = (all || []).filter((x) => teamCanon(x.team) === tc);
      if (sub.length) {
        const prev = all; all = sub;
        try {
          let r = marketInfo(name);
          if (!r) { // un apellido largo en común dentro de la plantilla ("González de Zárate" / "Urko González"), si es único
            const qt = q.split(/\s+/).filter((w) => w.length >= 5);
            const c = sub.filter((x) => norm(x.name).split(/\s+/).some((w) => w.length >= 5 && qt.indexOf(w) >= 0));
            if (c.length === 1) r = c[0];
          }
          return r;
        } finally { all = prev; }
      }
    }
    if (q === "alexander-arnold" || q === "alexander arnold" || q === "trent alexander-arnold") q = "trent";
    if (!all || !all.length || !q) return null;
    const last = q.split(/\s+/).pop();
    return all.find((x) => norm(x.name) === q)
      || all.find((x) => { const xn = norm(x.name); return xn.length >= 3 && (q.indexOf(xn) >= 0 || xn.indexOf(q) >= 0); })
      || all.find((x) => { const xn = norm(x.name); return last.length >= 4 && xn.split(/\s+/).pop() === last; })
      // Apodos/cortes: "Chupe" (Comuniate) vs "Chupete" (Futmondo).
      || all.find((x) => { const xn = norm(x.name).replace(/\s+/g, ""); return last.length >= 5 && (xn.indexOf(last) === 0 || last.indexOf(xn) === 0); })
      // Apodo dentro del nombre largo: "Adrián de la Fuente" -> "Dela" (sin espacios)
      || (() => { const qs = q.replace(/\s+/g, ""); const c = all.filter((x) => { const xn = norm(x.name).replace(/\s+/g, ""); return xn.length >= 4 && qs.length > xn.length && qs.indexOf(xn) >= 0; }); return c.length === 1 ? c[0] : null; })()
      // Una letra de diferencia en el apellido ("Brugui" / "Brugué"), solo si es único
      || (() => {
        const lev = (a, b) => { if (Math.abs(a.length - b.length) > 1) return 9; const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
        if (last.length < 5) return null;
        const c = all.filter((x) => { const xl = norm(x.name).split(/\s+/).pop(); return xl.length >= 5 && xl[0] === last[0] && lev(xl, last) <= 1; });
        return c.length === 1 ? c[0] : null;
      })()
      || null;
  }
  const MPC = { PT: "pt", DF: "df", MD: "md", DL: "dl" };
  function mpEv(hl, min) {
    const wrap = el("span", "mpage-ev");
    (hl || []).forEach((h) => {
      let t = "", cls = "";
      if (/fa-circle/.test(h.ico)) { if (/danger/i.test(h.cls)) { t = "P.P."; cls = "own"; } else { t = "G"; cls = "goal"; } }
      else if (/arrow-circle-up/.test(h.ico)) { t = "G"; cls = "goal"; }
      else if (/arrow-circle-down/.test(h.ico)) { t = "F"; cls = "miss"; }
      else if (/arrow-right/.test(h.ico)) { t = "A"; cls = "assist"; }
      else if (/fa-square/.test(h.ico)) { if (/danger|red|ff0000/i.test(h.cls)) { t = "R"; cls = "red"; } else { t = "Y"; cls = "yel"; } }
      else if (/sign-in/.test(h.ico)) { t = "IN"; cls = "in"; }
      else if (/sign-out/.test(h.ico)) { t = "OUT"; cls = "out"; }
      else if (/fa-star/.test(h.ico)) { t = "★"; cls = "ideal"; }
      if (t) wrap.appendChild(el("span", "mpage-evb " + cls, t));
    });
    return wrap;
  }
  // ---------- Campo con la alineación (confirmada o probable) ----------
  // En la página de partido el campo reutiliza las clases del campo de
  // "alineaciones" (.alin-pitch, .alin-pl...) para verse igual que en el
  // resto de la web; encima de cada jugador se pintan sus puntos Futmondo
  // (prensa) y sus goles/asistencias/tarjetas, emparejando por apellido con
  // los jugadores que devuelve /detallepartido (tabla PUNTOS de Comuniate).
  const XI_FILLER = ["de", "del", "la", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie", "c", "f"];
  function xiWords(s) {
    return stripAccents(String(s || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter((w) => w && XI_FILLER.indexOf(w) < 0)
      .map((w) => ({ barca: "barcelona", atleti: "atletico", santander: "racing" }[w] || w));
  }
  function xiScore(a, b) {
    const A = xiWords(a), B = xiWords(b);
    let s = 0;
    A.forEach((w) => { if (B.indexOf(w) >= 0) s++; });
    return s;
  }
  function findXiMatch(list, home, away) {
    let best = null, bs = 0;
    (list || []).forEach((it) => {
      const s = xiScore(it.home && it.home.name, home) + xiScore(it.away && it.away.name, away);
      if (s > bs) { bs = s; best = it; }
    });
    return bs >= 2 ? best : null;
  }
  function xiGroups(side) {
    const g = { portero: [], defensas: [], medios: [], delanteros: [] };
    if (side.portero || side.defensas || side.medios || side.delanteros) {
      ["portero", "defensas", "medios", "delanteros"].forEach((k) => (side[k] || []).forEach((p) => g[k].push(p)));
    } else {
      (side.starters || []).forEach((p) => {
        const q = stripAccents(String(p.pos || "").toLowerCase()).trim();
        if (q === "pt" || /porter/.test(q)) g.portero.push(p);
        else if (q === "df" || /defens|central|lateral|carrilero/.test(q)) g.defensas.push(p);
        else if (q === "md" || q === "cen" || /medio|centro|pivote|interior/.test(q)) g.medios.push(p);
        else if (q === "dl" || /delant|extremo|punta/.test(q)) g.delanteros.push(p);
        else g.medios.push(p);
      });
    }
    return g;
  }
  function xiEvIndex(list) {
    return (list || []).map((p) => {
      const key = stripAccents(String(p.name || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").trim();
      return { key, last: key.split(/\s+/).pop() || "", p };
    });
  }
  function xiFindEv(idx, name) {
    const q = stripAccents(String(name || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").trim();
    if (!q) return null;
    const last = q.split(/\s+/).pop();
    const hit = idx.find((x) => x.key === q)
      || idx.find((x) => last.length >= 3 && x.last === last)
      || idx.find((x) => x.key.length >= 4 && (x.key.indexOf(q) >= 0 || q.indexOf(x.key) >= 0))
      || idx.find((x) => last.length >= 4 && (x.key.indexOf(last) >= 0 || x.last.indexOf(last) >= 0));
    return hit ? hit.p : null;
  }
  // Convierte un once en grupos (portero/defensas/medios/delanteros) a la lista
  // "starters" que entiende alineacion.js. Sin fotos de Comuniate: la foto sale
  // de Futmondo (cruce por nombre) o, si falta, de futbolfantasy.
  function xiToStarters(side, photoMap, keepPhoto) {
    const g = xiGroups(side);
    const POS = { portero: "Portero", defensas: "Defensa", medios: "Mediocampista", delanteros: "Delantero" };
    const starters = [];
    ["portero", "defensas", "medios", "delanteros"].forEach((k) => (g[k] || []).forEach((p) => {
      starters.push({ name: p.name, full: p.full || p.name, alt: p.alt || ffFullFor(photoMap, p.full || p.name), pos: POS[k], photo: (keepPhoto && p.photo) || ffPhotoFor(photoMap, p.full || p.name) || "" });
    }));
    return { starters, bench: [], formation: [g.defensas.length, g.medios.length, g.delanteros.length].join("-") };
  }
  let mpTeams = { home: "", away: "" }, mpCambios = [], mpPairs = [], mpReds = [], mpGm = null, mpConf = null, mpLive = false;
  function mpNewCard(side, name, crest, subtitle, mode, photoMap, bench) {
    return window.EduAlineacion.card(xiToStarters(side, photoMap, mode === "played"), name, crest, subtitle, all, mode, bench);
  }
  function mpXiTeam(side, crest, evIdx, showPts) {
    const col = el("div", "alin-teamcol mpage-xi-team");
    const th = el("div", "alin-tcolhead mpage-xi-head");
    if (crest) { const im = el("img"); im.src = crest; im.alt = ""; im.loading = "lazy"; th.appendChild(im); }
    th.appendChild(el("span", null, side.name || ""));
    const g = xiGroups(side);
    const form = side.formation || [g.defensas.length, g.medios.length, g.delanteros.length].join("-");
    if (form && form !== "0-0-0") th.appendChild(el("span", "alin-form", form));
    col.appendChild(th);
    const pitch = el("div", "alin-pitch");
    [["delanteros", 15], ["medios", 41], ["defensas", 67], ["portero", 88]].forEach((band) => {
      const arr = g[band[0]];
      if (!arr.length) return;
      const n = arr.length;
      const sizeClass = n >= 5 ? "tight" : n === 4 ? "semi" : "";
      const inset = n >= 5 ? 13 : n === 4 ? 16 : 20;
      const span = 100 - inset * 2;
      const step = n > 1 ? span / (n - 1) : 0;
      arr.forEach((p, i) => {
        const ev = evIdx ? xiFindEv(evIdx, p.name) : null;
        const pl = el("div", "alin-pl mpage-xipl" + (sizeClass ? " alin-pl-" + sizeClass : ""));
        pl.style.left = (n > 1 ? (inset + i * step) : 50) + "%";
        pl.style.top = band[1] + "%";
        const ph = el("div", "alin-pimg mpage-xiimg");
        if (p.photo) { const im = el("img"); im.src = p.photo; im.alt = ""; im.loading = "lazy"; im.addEventListener("error", () => im.remove()); ph.appendChild(im); }
        else ph.classList.add("empty");
        if (p.prob != null && p.prob < 100) {
          const pct = el("span", "alin-pct", p.prob + "%");
          pct.style.borderColor = pctColor(p.prob);
          pct.title = probTitle(p.prob);
          ph.appendChild(pct);
        }
        // Puntos: en el partido ya jugado se pintan los de MI liga Futmondo
        // (llegan después, en /puntos; el "–" es el hueco hasta entonces).
        // Antes se pintaban los de la tabla PRENSA de Comuniate, que no
        // cuadran con los de la liga (p.ej. Lamine 6 vs 10).
        if (showPts) {
          const pts = el("span", "mpage-xpts", "–");
          pts.setAttribute("data-full", p.full || p.name || "");
          pts.title = "Puntos de mi liga Futmondo";
          ph.appendChild(pts);
        }
        pl.appendChild(ph);
        pl.appendChild(el("div", "alin-pname", p.last || p.name));
        if (ev && ev.hl && ev.hl.length) {
          const evs = mpEv(ev.hl, ev.min);
          evs.classList.add("mpage-xev");
          pl.appendChild(evs);
          if (ev.min) pl.appendChild(el("span", "mpage-xmin", ev.min + "'"));
        }
        pl.addEventListener("click", () => openPlayerByName(p.full || p.name));
        pitch.appendChild(pl);
      });
    });
    col.appendChild(pitch);
    if (side.bench && side.bench.length) col.appendChild(renderBench(side.bench, "Banquillo"));
    return col;
  }
  // Fotos recortadas de FutbolFantasy por equipo (clave = nombre normalizado
  // completo; también se busca por apellido).
  function xiPhotoMap(side) {
    const map = {}, fulls = {};
    [].concat((side && side.starters) || [], (side && side.bench) || []).forEach((p) => {
      if (!p || !p.photo) return;
      const key = stripAccents(String(p.full || p.name || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").trim();
      if (key) { map[key] = p.photo; fulls[key] = String(p.full || p.name || ""); }
    });
    // Nombre completo de futbolfantasy de cada clave (no enumerable para no mezclarse con las claves)
    Object.defineProperty(map, "__full", { value: fulls, enumerable: false });
    return map;
  }
  function ffKeyFor(map, name) {
    const q = stripAccents(String(name || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").trim();
    if (!q || !map) return "";
    if (map[q]) return q;
    const last = q.split(/\s+/).pop();
    if (last.length < 4) return "";
    const keys = Object.keys(map);
    const exact = keys.find((k) => k.split(/\s+/).pop() === last);
    if (exact) return exact;
    // Nombre suelto que es una palabra del nombre completo (Johaneko → Johaneko Louis-Jean)
    const word = keys.filter((k) => k.split(/\s+/).indexOf(last) >= 0);
    if (word.length === 1) return word[0];
    // Pequeñas diferencias de una letra (Elliot vs Elliott).
    const pref = keys.find((k) => {
      const kl = k.split(/\s+/).pop();
      return kl.length >= 4 && Math.abs(kl.length - last.length) <= 1 && (kl.indexOf(last) === 0 || last.indexOf(kl) === 0);
    });
    return pref || "";
  }
  function ffPhotoFor(map, name) { const k = ffKeyFor(map, name); return k ? map[k] : ""; }
  // Nombre completo (p. ej. "Iñaki Williams" para "Williams") para cruzar con la cara de Futmondo
  function ffFullFor(map, name) { const k = ffKeyFor(map, name); return (k && map.__full && map.__full[k]) || ""; }
  // Jugadores que acabaron jugando el partido (tabla PUNTOS de Comuniate):
  // titulares = sin evento de entrada; suplentes que salieron = con "IN".
  function xiFinishedSide(name, crest, list, photoMap, conf) {
    // Formación real (alineación confirmada): fila de cada titular según dónde jugó de verdad
    let cg = null;
    if (conf) { cg = xiGroups(conf); if (!(cg.defensas.length + cg.medios.length + cg.delanteros.length >= 8)) cg = null; }
    const nT = (x) => stripAccents(String(x || "")).replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
    const sameC = (a, b) => { const p = nT(a), q = nT(b); if (!p.length || !q.length) return false; return p.every((t) => q.indexOf(t) >= 0) || q.every((t) => p.indexOf(t) >= 0) || (p[p.length - 1].length >= 4 && p[p.length - 1] === q[q.length - 1]); };
    const rowOf = (nm) => { if (!cg) return ""; for (const k of ["defensas", "medios", "delanteros"]) if (cg[k].some((c) => sameC(c.full || c.name, nm))) return k; return ""; };
    const g = { name, crest, portero: [], defensas: [], medios: [], delanteros: [], subs: [] };
    (list || []).forEach((p) => {
      const q = stripAccents(String(p.pos || "").toLowerCase()).trim();
      const isSub = (p.hl || []).some((h) => /sign-in/.test(h.ico || ""));
      const mi = marketInfo(p.name, name);
      const o = { pos: q, name: p.name, full: p.name, alt: ffFullFor(photoMap, p.name), last: String(p.name || "").split(/\s+/).pop(), photo: ffPhotoFor(photoMap, p.name) || (mi && mi.photo) || "" };
      if (isSub) { g.subs.push(o); return; }
      const cr = (q === "pt" || /porter/.test(q)) ? "" : rowOf(p.name);
      if (cr) g[cr].push(o);
      else if (q === "pt" || /porter/.test(q)) g.portero.push(o);
      else if (q === "df" || /defens/.test(q)) g.defensas.push(o);
      else if (q === "dl" || /delant/.test(q)) g.delanteros.push(o);
      else if (!q && mi && mi.role) { const r = String(mi.role).toLowerCase(); if (/defens/.test(r)) g.defensas.push(o); else if (/delant/.test(r)) g.delanteros.push(o); else g.medios.push(o); }
      else g.medios.push(o);
    });
    // Formaciones imposibles (3-6-1, 6-3-1…): la tabla de puntos clasifica a los carrileros/pivotes
    // por su ficha, no por dónde jugaron. Se lleva al reparto realista más cercano.
    if (!cg) {
      let guard = 0;
      while (guard++ < 4) {
        if (g.defensas.length >= 5 && g.medios.length <= 2 && g.delanteros.length >= 3) g.medios.unshift(g.defensas.pop());
        else if (g.defensas.length >= 6 && g.medios.length <= 4) g.medios.unshift(g.defensas.pop());
        else if (g.medios.length >= 6 && g.delanteros.length <= 1) g.delanteros.push(g.medios.pop());
        else if (g.medios.length >= 6 && g.defensas.length <= 3 && g.delanteros.length >= 2) g.defensas.push(g.medios.shift());
        else if (g.defensas.length <= 2 && g.medios.length >= 5) g.defensas.push(g.medios.shift());
        else break;
      }
    }
    g.formation = [g.defensas.length, g.medios.length, g.delanteros.length].join("-");
    return g;
  }
  function mpSubsGrid(list, evIdx) {
    const grid = el("div", "mpage-subs-grid");
    (list || []).forEach((p) => {
      const ev = evIdx ? xiFindEv(evIdx, p.name) : null;
      const c = el("div", "alin-bp mpage-subp");
      const ph = el("div", "alin-bimg mpage-xiimg");
      if (p.photo) { const im = el("img"); im.src = p.photo; im.alt = ""; im.loading = "lazy"; im.addEventListener("error", () => im.remove()); ph.appendChild(im); }
      c.appendChild(ph);
      c.appendChild(el("span", "alin-bname", p.last || p.name));
      // Los puntos van en un chip al lado del nombre, no encima de la foto
      // (tapaba la cara en las fotos pequeñas del banquillo).
      const pts = el("span", "mpage-subpts", "–");
      pts.setAttribute("data-full", p.full || p.name || "");
      pts.title = "Puntos de mi liga Futmondo";
      c.appendChild(pts);
      if (ev && ev.hl && ev.hl.length) { const evs = mpEv(ev.hl, ev.min); evs.classList.add("mpage-xev"); c.appendChild(evs); }
      c.addEventListener("click", () => openPlayerByName(p.full || p.name));
      grid.appendChild(c);
    });
    return grid;
  }
  function mpSubsBlock(teamName, list, evIdx) {
    const block = el("div", "mpage-subs-block");
    block.appendChild(el("div", "mpage-subs-h", "Desde el banquillo · " + teamName));
    block.appendChild(mpSubsGrid(list, evIdx));
    return block;
  }
  async function fillMpPoints(box, d, jn) {
    if (mpLive) {
      // En directo no hay puntos: los de Futmondo llegan al acabar el partido
      box.querySelectorAll(".pl-pts[data-full], .mpage-xpts[data-full], .mpage-subpts[data-full]").forEach((e2) => e2.remove());
      return;
    }
    const idByName = {}, teamOfName = {};
    [["home", d.homePlayers], ["away", d.awayPlayers]].forEach(([sd, ps]) => (ps || []).forEach((p) => {
      const nm = p.name || "";
      if (!nm || idByName[nm] != null) return;
      const mi = marketInfo(nm, mpTeams[sd]);
      idByName[nm] = (mi && mi.id) || "";
      if (mi) teamOfName[nm] = mi;
    }));
    const ids = Object.keys(idByName).map((k) => idByName[k]).filter((x, i, a) => x && a.indexOf(x) === i);
    if (!ids.length) return false;
    let map = {};
    try {
      // En trozos de 8: cada petición al servidor tiene un tope de llamadas externas y con 28 jugadores de golpe fallaban la mayoría
      const chunks = []; for (let i = 0; i < ids.length; i += 8) chunks.push(ids.slice(i, i + 8));
      const rs = await Promise.all(chunks.map((c) => fetch(API + "/puntos?jornada=" + encodeURIComponent(jn) + "&ids=" + c.join(","), { cache: "no-store" }).then((x) => x.json()).catch(() => null)));
      rs.forEach((r) => { if (r && r.points) Object.keys(r.points).forEach((k) => { if (r.points[k]) map[k] = r.points[k]; }); });
      // Si algún trozo falló (el servidor limita las llamadas), se piden de nuevo los que faltan, de 4 en 4 y de uno en uno
      for (let pass = 0; pass < 2; pass++) {
        const miss = ids.filter((id) => !(map[id] && map[id].f === true));
        if (!miss.length) break;
        const size = pass === 0 ? 4 : 1;
        for (let i = 0; i < miss.length; i += size) {
          const r = await fetch(API + "/puntos?jornada=" + encodeURIComponent(jn) + "&ids=" + miss.slice(i, i + size).join(","), { cache: "no-store" }).then((x) => x.json()).catch(() => null);
          if (r && r.points) Object.keys(r.points).forEach((k) => { if (r.points[k]) map[k] = r.points[k]; });
        }
      }
    } catch (e) {}
    const arrived = Object.keys(map).some((k) => map[k] && map[k].f === true && map[k].p != null);
    box.querySelectorAll(".mpage-xpts[data-full], .mpage-subpts[data-full], .pl-pts[data-full]").forEach((el2) => {
      const id = idByName[el2.getAttribute("data-full")];
      const rec = id ? map[id] : null;
      if (rec && rec.f === true && rec.p != null) { el2.textContent = String(rec.p); el2.classList.add("on"); if (rec.p < 0) el2.classList.add("neg"); }
      else el2.remove();
    });
    // Si faltan los puntos de alguien que sí tiene ficha en Futmondo, devuelve false para que se vuelva a intentar al minuto
    const missing = ids.some((id) => !(map[id] && map[id].f === true));
    // MVP del partido: el que más puntos de Futmondo ha sacado
    try {
      const best = [];
      Object.keys(idByName).forEach((nm) => { const rec = map[idByName[nm]]; if (rec && rec.f === true && rec.p != null) best.push({ nm, p: Number(rec.p) || 0 }); });
      // Desempate: más goles y asistencias en el partido, luego el del equipo ganador
      const hlOf = {}; const gh = Number(d.score), ga = Number(d.scoreAway);
      [["h", d.homePlayers], ["a", d.awayPlayers]].forEach(([sd, ps]) => (ps || []).forEach((p) => { let g = 0, a = 0; (p.hl || []).forEach((h) => { const ic = h.ico || ""; if ((/fa-circle$/.test(ic) && !/danger/i.test(h.cls || "")) || /arrow-circle-up/.test(ic)) g++; else if (/arrow-right/.test(ic)) a++; }); hlOf[p.name] = { ga: g * 2 + a, win: sd === "h" ? (gh > ga ? 1 : 0) : (ga > gh ? 1 : 0) }; }));
      best.sort((a, b) => b.p - a.p || ((hlOf[b.nm] || {}).ga || 0) - ((hlOf[a.nm] || {}).ga || 0) || ((hlOf[b.nm] || {}).win || 0) - ((hlOf[a.nm] || {}).win || 0));
      const top = best.slice(0, 1);
      if (false && top.length && top[0].p >= 1 && !box.querySelector(".mpage-mvp")) {
        const card = el("div", "mpage-mvp");
        card.appendChild(el("div", "mvp-k", "⭐ MVP del partido"));
        const wrap = el("div", "mvp-list");
        top.forEach((x) => {
          const mi = teamOfName[x.nm] || marketInfo(x.nm) || {};
          const it = el("button", "mvp-it"); it.type = "button";
          const im = el("img"); im.alt = ""; im.src = mi.photo || "/img/avatar.svg"; im.addEventListener("error", () => { im.src = "/img/avatar.svg"; }, { once: true }); it.appendChild(im);
          const tx = el("div", "mvp-tx"); tx.appendChild(el("b", null, mi.name || x.nm));
          const sm = el("small"); if (mi.logo) { const lg = el("img"); lg.src = mi.logo; lg.alt = ""; sm.appendChild(lg); } sm.appendChild(document.createTextNode(mi.team || "")); tx.appendChild(sm);
          it.appendChild(tx);
          it.appendChild(el("span", "mvp-pts", String(x.p)));
          if (mi.id) it.addEventListener("click", () => openFicha(mi));
          wrap.appendChild(it);
        });
        card.appendChild(wrap);
        card.appendChild(el("div", "mvp-sub", "Puntos Futmondo Social"));
        const ev = box.querySelector(".mpage-ev-sum");
        if (ev) ev.insertAdjacentElement("beforebegin", card); else { const xi = box.querySelector(".mpage-xi"); if (xi) xi.insertAdjacentElement("beforebegin", card); }
      }
    } catch (e) {}
    let max = null;
    box.querySelectorAll(".mpage-xpts.on, .pl-pts.on").forEach((e2) => { const v = Number(e2.textContent) || 0; if (max == null || v > max) max = v; });
    if (max != null && max >= 6) box.querySelectorAll(".mpage-xpts.on, .pl-pts.on").forEach((e2) => { if ((Number(e2.textContent) || 0) === max) e2.classList.add("top"); });
    return arrived && !missing;
  }
  // Resumen compacto de lo más destacado: los del local a la izquierda y los del
  // visitante a la derecha. Goles, asistencias, rojas, penaltis fallados y cambios.
  function haIcon(home) {
    const NS = "http://www.w3.org/2000/svg";
    const sv = document.createElementNS(NS, "svg");
    sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("class", "ffx-ha " + (home ? "h" : "a")); sv.setAttribute("aria-label", home ? "En casa" : "Fuera");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", home ? "M12 3.2 2.8 11.4a1 1 0 0 0 .7 1.7H5V20a1 1 0 0 0 1 1h4v-5.5h4V21h4a1 1 0 0 0 1-1v-6.9h1.5a1 1 0 0 0 .7-1.7L12 3.2z" : "M21.2 3.4 2.9 10.6a.8.8 0 0 0 0 1.5l5.6 2.2 2.2 5.6a.8.8 0 0 0 1.5 0l7.2-18.3a.8.8 0 0 0-1.2-.2zM9.4 13.4l7.6-6.2-5.4 8.1-.6-1.7-1.6-.2z");
    sv.appendChild(p); return sv;
  }
  function buildEvents(m, d) {
    const rows = [];
    const minOf = (t) => { const x = String(t || "").match(/\(?(\d+)(?:\+(\d+))?'\)?/); return x ? Number(x[1]) + (x[2] ? Number(x[2]) / 100 : 0) : 999; };
    const clean = (t) => String(t || "").replace(/\(?\d+(?:\+\d+)?'\)?/g, "").replace(/\s+/g, " ").trim();
    const shortName = (x, sd) => { const mi = marketInfo(x, sd ? mpTeams[sd] : ""); return (mi && mi.name) || String(x || "").trim(); };
    [["home", d.goalsHome], ["away", d.goalsAway]].forEach((g) => (g[1] || []).forEach((x, gi) => {
      const t = String(x.text || ""); const pen = /\(p\.?\)/i.test(t), og = /\(p\.?p\.?\)|propia/i.test(t);
      const who = clean(t).replace(/\(p\.?p?\.?\)/ig, "").replace(/^[A-ZÁÉÍÓÚ]\.\s*/, "").trim();
      const q = mpGm && mpGm[g[0]] && mpGm[g[0]][gi];
      // Quién es de verdad el goleador: se cruza con los jugadores de ese equipo que tienen gol
      let nm = shortName(who, g[0]) || who;
      try {
        const nz = (v) => stripAccents(String(v || "").toLowerCase()).replace(/[^a-z ]/g, " ").trim().split(/\s+/).filter(Boolean);
        const wt = nz(who).filter((w) => w.length >= 3);
        const sc = ((g[0] === "home" ? d.homePlayers : d.awayPlayers) || []).filter((p) => (p.hl || []).some((h) => (/fa-circle$/.test(h.ico || "") && !/danger/i.test(h.cls || "")) || /arrow-circle-up/.test(h.ico || "")));
        const hit = sc.filter((p) => { const pt = nz(p.name); return wt.length && wt.every((w) => pt.some((x) => x === w || (w.length >= 3 && x.indexOf(w) === 0))); });
        if (hit.length === 1) nm = shortName(hit[0].name, g[0]) || hit[0].name;
      } catch (e) {}
      rows.push({ side: g[0], min: q ? q.m + (q.x || 0) / 100 : minOf(t), sc: q && q.sc, ico: og ? "🙈" : pen ? "🎯" : "⚽", txt: nm });
    }));
    const sameN = (x, y) => { const n = (v) => stripAccents(String(v || "")).replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean); const p = n(x), q = n(y); if (!p.length || !q.length) return false; return p.every((t) => q.indexOf(t) >= 0) || q.every((t) => p.indexOf(t) >= 0) || (p[p.length - 1].length >= 4 && p[p.length - 1] === q[q.length - 1]); };
    [["home", d.homePlayers], ["away", d.awayPlayers]].forEach((g) => {
      const goals = rows.filter((r) => r.side === g[0] && r.ico === "⚽").sort((a, b) => a.min - b.min);
      let gi = 0;
      (g[1] || []).forEach((p) => {
        (p.hl || []).forEach((h) => {
          if ((/fa-square/.test(h.ico || "") && /danger|red|ff0000/i.test(h.cls || "")) || /doble-amarilla|square-roja/i.test(h.ico || "")) {
            const rd = (mpReds || []).find((x) => sameN(x.name, p.name));
            rows.push({ side: g[0], min: rd ? rd.min + (rd.x || 0) / 100 : 998, ico: "🟥", txt: shortName(p.name, g[0]) });
          }
          else if (/arrow-circle-down/.test(h.ico || "")) rows.push({ side: g[0], min: 997, ico: "❌", txt: shortName(p.name, g[0]) });
          else if (/arrow-right/.test(h.ico || "")) rows.push({ side: g[0], min: 996, ico: "👟", txt: shortName(p.name, g[0]), assist: true });
        });
      });
      // Minuto de cada asistencia: se empareja con los goles del equipo, por orden
      const as = rows.filter((r) => r.side === g[0] && r.assist);
      as.forEach((r, i) => { if (as.length <= goals.length && goals[i]) { r.min = goals[i].min + 0.001; goals[i].by = r.txt; r.merged = true; } });
    });
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].merged) rows.splice(i, 1);
    // Cambios del mismo equipo y minuto: una sola tarjeta con varias parejas
    const subG = {};
    mpPairs.forEach((c) => { const k = c.side + "|" + Math.floor(c.min); if (!subG[k]) { subG[k] = { side: c.side, min: c.min + (c.x || 0) / 100 + 0.002, sub: true, pairs: [] }; rows.push(subG[k]); } subG[k].pairs.push(c); });
    const nSubs = mpPairs.length;
    if (!rows.length) return null;
    rows.sort((a, b) => a.min - b.min);
    const box = el("section", "mpage-ev-sum");
    box.appendChild(el("div", "mpage-ev-title", "⭐ Lo más destacado"));
    const lbl = { "⚽": "Gol", "🎯": "Penalti", "🙈": "En propia", "🟥": "Roja", "❌": "Falló penalti", "👟": "Asistencia" };
    if (nSubs) {
      const tg = el("button", "mpage-ev-toggle", "🔄 Ver cambios (" + nSubs + ")");
      tg.type = "button";
      tg.addEventListener("click", () => { const on = box.classList.toggle("show-subs"); tg.textContent = on ? "🔄 Ocultar cambios" : "🔄 Ver cambios (" + nSubs + ")"; });
      box.appendChild(tg);
    }
    rows.forEach((r) => {
      const row = el("div", "mpage-ev-row " + r.side + (r.sub ? " is-sub" : ""));
      const mk = () => {
        if (r.sub) {
          const pill = el("div", "mpage-ev-pill sub");
          const tx = el("div", "mpage-ev-tx");
          r.pairs.forEach((c) => {
            const ln = el("div", "mpage-ev-swap");
            const i1 = el("span", "mpage-ev-in"); i1.appendChild(el("i", null, "▲")); i1.appendChild(document.createTextNode(" " + c.inN));
            const o1 = el("span", "mpage-ev-out"); o1.appendChild(el("i", null, "▼")); o1.appendChild(document.createTextNode(" " + c.outN));
            ln.appendChild(i1); ln.appendChild(o1); tx.appendChild(ln);
          });
          pill.appendChild(tx); return pill;
        }
        const pill = el("div", "mpage-ev-pill");
        pill.appendChild(el("span", "mpage-ev-ico", r.ico));
        const tx = el("div", "mpage-ev-tx");
        tx.appendChild(el("span", "mpage-ev-txt", r.txt));
        if (lbl[r.ico]) tx.appendChild(el("span", "mpage-ev-kind", lbl[r.ico] + (r.sc ? " · " + r.sc : "")));
        if (r.by) { const a2 = el("span", "mpage-ev-by"); a2.appendChild(document.createTextNode("👟 ")); a2.appendChild(el("b", null, r.by)); tx.appendChild(a2); }
        pill.appendChild(tx);
        return pill;
      };
      const L = el("div", "mpage-ev-cell l"), R = el("div", "mpage-ev-cell r");
      (r.side === "home" ? L : R).appendChild(mk());
      row.appendChild(L);
      row.appendChild(el("span", "mpage-ev-min", r.min < 900 ? (Math.floor(r.min + 1e-6) + (Math.round((r.min - Math.floor(r.min + 1e-6)) * 100) > 0 ? "+" + Math.round((r.min - Math.floor(r.min + 1e-6)) * 100) : "") + "'") : "•"));
      row.appendChild(R);
      box.appendChild(row);
    });
    return box;
  }
  function renderMatchDetail(box, m, d, jn, xi, xiKind, finished, ffData) {
    box.innerHTML = "";
    box.appendChild(backBtn("/futmondo/guiafantasy/inicio", "mpage-back"));
    const head = el("div", "mpage-top"); head.appendChild(refreshBtn());
    [[m.homeCrest, "left"], [m.awayCrest, "right"]].forEach((x) => { if (!x[0]) return; const bg = el("img", "mpage-bgcrest " + x[1]); window.EduAlineacion ? window.EduAlineacion.setCrest(bg, x[0]) : (bg.src = x[0]); bg.alt = ""; head.appendChild(bg); });
    const tl = el("div", "mpage-topline");
    tl.appendChild(el("span", "mpage-comp", "LaLiga" + (jn ? " · Jornada " + jn : "")));
    if (m.tv && m.tv.length) {
      const t = el("span", "mpage-tv");
      m.tv.forEach((c) => { if (!c || !c.logo) return; const im = el("img"); im.src = c.logo; im.alt = c.name || ""; im.loading = "lazy"; im.addEventListener("error", () => im.remove()); t.appendChild(im); });
      tl.appendChild(t);
    }
    head.appendChild(tl);
    const isLive = m.live && m.live.state === "live";
    const state = isLive ? (m.live.minute || "EN JUEGO") : d.state || ((m.day || "") + " " + (m.date || "") + " " + (m.time || "")).trim();
    const mkTeam = (name, crest, cls) => { const t = el("div", "mpage-team " + cls); t.appendChild(clubLink(el("span", null, name), name)); return t; };
    const teams = el("div", "mpage-teams");
    if ((d.score != null && d.scoreAway != null) || (m.live && m.live.score && m.live.state !== "suspended")) teams.classList.add("mpage-hasscore");
    teams.appendChild(mkTeam(m.home, m.homeCrest, "home"));
    const mid = el("div", "mpage-mid");
    mid.appendChild(el("div", "mpage-state", state));
    mid.appendChild(el("div", "mpage-score", (d.score != null && d.scoreAway != null) ? (d.score + " - " + d.scoreAway) : (m.live && m.live.score && m.live.state !== "suspended" ? m.live.score : "vs")));
    teams.appendChild(mid);
    teams.appendChild(mkTeam(m.away, m.awayCrest, "away"));
    head.appendChild(teams);
    if (isLive || mpLive) head.classList.add("mpage-top-live");
    box.appendChild(head);
    // Botón central "Ver partido en directo": activo desde el inicio del partido y hasta 2 días después; antes del inicio sale apagado con la hora
    try {
      const ko = kickoffMs(m);
      if (ko && Date.now() < ko + LIVE_WINDOW) {
        const on = Date.now() >= ko;
        const wrap = el("div", "mpage-livebtn-wrap");
        const b = el(on ? "a" : "div", "mpage-livebtn" + (on ? "" : " off"));
        if (on) b.href = "/futmondo/guiafantasy/directo/" + matchSlug(m.home, m.away) + (jn ? "?j=" + encodeURIComponent(jn) : "");
        b.appendChild(el("i", "mlb-dot"));
        b.appendChild(el("span", "mlb-t", on ? "Ver partido en directo" : "Directo · empieza a las " + (m.time || "")));
        if (on) b.appendChild(el("span", "mlb-go", "›"));
        wrap.appendChild(b);
        box.appendChild(wrap);
      }
    } catch (e) {}
    if (d && d.__quick) return; // pintado instantáneo: solo cabecera, el resto llega después
    const evSlot = el("div"); box.appendChild(evSlot);
    if (finished) {
      const sec = el("section", "mpage-xi mpage-xi-done");
      // En juego no se repite el título (ya lo lleva cada alineación)
      if (!mpLive) { const hd = el("div", "mpage-xi-h"); hd.appendChild(el("span", "mpage-xi-title", "Partido finalizado")); sec.appendChild(hd); }
      const idxH = xiEvIndex(d.homePlayers), idxA = xiEvIndex(d.awayPlayers);
      const home = xiFinishedSide(m.home, m.homeCrest, d.homePlayers, xiPhotoMap(ffData && ffData.home), mpConf && mpConf.home);
      const away = xiFinishedSide(m.away, m.awayCrest, d.awayPlayers, xiPhotoMap(ffData && ffData.away), mpConf && mpConf.away);
      // Cada equipo con su campo y, debajo, los suyos que salieron del
      // banquillo (pedido por Edu).
      const useNew = !!window.EduAlineacion;
      const mkCol = (side, name, crest, rival, idx) => {
        if (!useNew) { const c = mpXiTeam(side, crest, idx, true); if (side.subs.length) c.appendChild(mpSubsBlock(name, side.subs, idx)); return c; }
        const sw = (o) => { const ev = xiFindEv(idx, o.full || o.name); const h = (ev && ev.hl) || []; const dir = h.some((x) => /sign-in/.test(x.ico || "")) ? "in" : h.some((x) => /sign-out/.test(x.ico || "")) ? "out" : ""; if (dir && ev.min) o.sw = { dir, min: ev.min };
          let g = 0, a = 0; h.forEach((x) => { const ic = x.ico || ""; if (/fa-circle$/.test(ic) && !/danger/i.test(x.cls || "")) g++; else if (/arrow-circle-up/.test(ic)) g++; else if (/arrow-right/.test(ic)) a++; });
          if (g || a) o.ev = { g, a };
          if (h.some((x) => (/fa-square/.test(x.ico || "") && /danger/i.test(x.cls || "")) || /doble-amarilla|square-roja/i.test(x.ico || ""))) o.red = true;
          return o; };
        const st = xiToStarters(side, null, true);
        st.starters.forEach(sw);
        const subsL = (side.subs || []).map(sw);
        // Quién se cambió por quién: se lee de la crónica del partido (endpoint
        // /cambios). Nada de adivinar: si no hay pareja segura no se muestra.
        const normT = (x) => stripAccents(String(x || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
        const same = (pn, sn) => { const a = normT(pn), b = normT(sn); if (!a.length || !b.length) return false; return a.every((t) => b.indexOf(t) >= 0) || (a[a.length - 1].length >= 4 && a[a.length - 1] === b[b.length - 1]); };
        const outs = st.starters.filter((o) => o.sw && o.sw.dir === "out"), ins = subsL.filter((o) => o.sw && o.sw.dir === "in");
        const P = (mpCambios || []).map((c) => ({ min: Number(c.min) || 0, x: Number(c.x) || 0, o: outs.find((x) => same(x.name, c.out)) || null, i: ins.find((x) => same(x.name, c.in)) || null })).filter((p) => p.o || p.i);
        const taken = (list) => list.map((p) => p.i).filter(Boolean);
        P.forEach((p) => { // un lado conocido y el otro no: por eliminación (mismo minuto ±1, único libre)
          if (p.o && !p.i) { const c = ins.filter((x) => taken(P).indexOf(x) < 0 && Math.abs(Number(x.sw.min) - p.min) <= 1); if (c.length === 1) p.i = c[0]; }
          if (p.i && !p.o) { const usedO = P.map((q) => q.o).filter(Boolean); const c = outs.filter((x) => usedO.indexOf(x) < 0 && Math.abs(Number(x.sw.min) - p.min) <= 1); if (c.length === 1) p.o = c[0]; }
        });
        P.forEach((p) => { if (p.o && p.i) { p.o.sw.with = [p.i]; p.i.sw.with = [p.o]; mpPairs.push({ side: name === m.home ? "home" : "away", min: p.min, x: p.x, inN: window.EduAlineacion.nameOf(p.i, name, all), outN: window.EduAlineacion.nameOf(p.o, name, all) }); } });
        const cardEl = window.EduAlineacion.card(st, name, crest, rival, all, "played", subsL);
        if (mpLive) { const tt = cardEl.querySelector(".al-title"); if (tt) tt.innerHTML = "Partido <b>en juego</b>"; cardEl.classList.add("al-live"); }
        return cardEl;
      };
      const colH = mkCol(home, m.home, m.homeCrest, "vs " + m.away, idxH);
      const colA = mkCol(away, m.away, m.awayCrest, "en " + m.home, idxA);
      const pitches = el("div", "alin-pitches mpage-xipitches" + (useNew ? " al-pair" : ""));
      pitches.appendChild(colH);
      if (useNew) pitches.appendChild(el("div", "al-sep"));
      pitches.appendChild(colA);
      sec.appendChild(pitches);
      box.appendChild(sec);
    } else if (xi) {
      const sec = el("section", "mpage-xi");
      const hd = el("div", "mpage-xi-h");
      hd.appendChild(el("span", "mpage-xi-title", xiKind === "confirmada" ? "Alineación confirmada" : "Alineación probable"));
      if (xiKind !== "confirmada") hd.appendChild(probLegendBtn());
      sec.appendChild(hd);
      const idxH = xiEvIndex(d.homePlayers), idxA = xiEvIndex(d.awayPlayers);
      const pitches = el("div", "alin-pitches mpage-xipitches");
      if (xiKind === "confirmada" && window.EduAlineacion) {
        // Confirmada: sin % ni dudas ni recambios
        pitches.classList.add("al-pair");
        pitches.appendChild(mpNewCard(xi.home || {}, m.home, m.homeCrest, "vs " + m.away, "confirmed", xiPhotoMap(ffData && ffData.home), (ffData && ffData.home && ffData.home.bench) || []));
        pitches.appendChild(el("div", "al-sep"));
        pitches.appendChild(mpNewCard(xi.away || {}, m.away, m.awayCrest, "en " + m.home, "confirmed", xiPhotoMap(ffData && ffData.away), (ffData && ffData.away && ffData.away.bench) || []));
      } else if (xiKind === "probable" && window.EduAlineacion) {
        // Nuevo campo EduMR (alineacion.js): foto de Futmondo, % de titularidad y alternativa
        pitches.classList.add("al-pair");
        pitches.appendChild(window.EduAlineacion.card(xi.home || {}, m.home, m.homeCrest, "vs " + m.away, all, "probable", (xi.home && xi.home.bench) || []));
        pitches.appendChild(el("div", "al-sep"));
        pitches.appendChild(window.EduAlineacion.card(xi.away || {}, m.away, m.awayCrest, "en " + m.home, all, "probable", (xi.away && xi.away.bench) || []));
      } else {
      pitches.appendChild(mpXiTeam(xi.home || {}, (xi.home && xi.home.crest) || m.homeCrest, idxH, false));
      pitches.appendChild(mpXiTeam(xi.away || {}, (xi.away && xi.away.crest) || m.awayCrest, idxA, false));
      }
      sec.appendChild(pitches);
      box.appendChild(sec);
    } else {
    const cols = el("div", "mpage-cols");
    const col = (list) => {
      const c = el("div", "mpage-col");
      const maxP = Math.max.apply(null, (list || []).map((p) => p.pts || 0).concat([0]));
      (list || []).forEach((p) => {
        const mi = marketInfo(p.name);
        const r = el("div", "mpage-row");
        const face = el("span", "mpage-face");
        if (mi && mi.photo) { const im = el("img"); im.src = mi.photo; im.alt = ""; im.loading = "lazy"; face.appendChild(im); } else { face.classList.add("empty"); }
        r.appendChild(face);
        if (p.pos) r.appendChild(el("span", "mpage-pos " + (MPC[p.pos] || "x"), p.pos));
        r.appendChild(el("span", "mpage-name", p.name));
        r.appendChild(mpEv(p.hl, p.min));
        const pts = el("span", "mpage-pts", p.pts != null ? String(p.pts) : "–");
        if (p.pts != null && p.pts > 0 && p.pts === maxP && maxP >= 6) pts.classList.add("top");
        r.appendChild(pts);
        c.appendChild(r);
      });
      return c;
    };
    cols.appendChild(col(d.homePlayers));
    cols.appendChild(col(d.awayPlayers));
    box.appendChild(cols);
    }
  }
  // Resto de partidos de la jornada (acceso rápido, con estado y marcador en directo)
  function buildOtherMatches(ms, cur, jn) {
    const sec = el("section", "mpage-others");
    sec.appendChild(el("h3", "mpage-others-h", "⚽ Partidos de la jornada " + jn));
    const grid = el("div", "mpage-others-grid");
    (ms || []).forEach((x) => {
      const st = x.live && x.live.state;
      const card = el("a", "mo-card" + (x === cur || matchSlug(x.home, x.away) === matchSlug(cur.home, cur.away) ? " cur" : "") + (st === "live" ? " live" : st === "final" ? " fin" : ""));
      card.href = "/futmondo/guiafantasy/partido/" + matchSlug(x.home, x.away) + "?j=" + encodeURIComponent(jn);
      const lab = st === "final" ? "Finalizado" : st === "live" ? (x.live.minute || "En juego") : st === "suspended" ? "Suspendido" : [x.day, x.date].filter(Boolean).join(" ");
      card.appendChild(el("div", "mo-st", (st === "live" ? "● " : "") + lab));
      const row = el("div", "mo-row");
      const c1 = el("img"); c1.src = x.homeCrest || ""; c1.alt = x.home; c1.title = x.home; c1.loading = "lazy";
      const c2 = el("img"); c2.src = x.awayCrest || ""; c2.alt = x.away; c2.title = x.away; c2.loading = "lazy";
      row.appendChild(c1);
      row.appendChild(el("span", "mo-sc", (st === "live" || st === "final") && x.live.score ? x.live.score : st === "suspended" ? "—" : (x.time || "vs")));
      row.appendChild(c2);
      card.appendChild(row);
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    return sec;
  }
  // Hora de inicio (ms) de un partido de /jornada: día "17/10" + hora "21:00" en hora de Madrid
  const LIVE_WINDOW = 2 * 24 * 3600 * 1000;
  // Banquillo real (convocatoria) según FotMob: se usa siempre que lo tenga, porque el de FutbolFantasy se queda corto
  async function fmBenchFor(m, jn) {
    try {
      const ko = kickoffMs(m); if (!ko) return null;
      const pp = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ko)).forEach((x) => { pp[x.type] = x.value; });
      const r = await (await fetch(API + "/directo?home=" + encodeURIComponent(m.home) + "&away=" + encodeURIComponent(m.away) + "&jornada=" + encodeURIComponent(jn || "") + "&date=" + pp.year + pp.month + pp.day)).json();
      const ln = r && r.fm && r.fm.lineup; if (!ln) return null;
      const mk = (t) => ((t && t.sb) || []).map((q) => ({ name: q.n, full: q.n, last: String(q.n || "").split(" ").slice(-1)[0], photo: "https://images.fotmob.com/image_resources/playerimages/" + q.id + ".png", pos: "", prob: null }));
      const h = mk(ln.h), a = mk(ln.a);
      return (h.length || a.length) ? { home: h, away: a } : null;
    } catch (e) { return null; }
  }
  function kickoffMs(m) {
    const dm = String((m && m.date) || "").match(/^(\d{1,2})\/(\d{1,2})$/), tm = String((m && m.time) || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!dm || !tm) return 0;
    const now = new Date(), cands = [];
    [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].forEach((y) => {
      const guess = Date.UTC(y, Number(dm[2]) - 1, Number(dm[1]), Number(tm[1]), Number(tm[2]));
      // La hora de Madrid es UTC+1 o +2: se prueba cuál da esa hora local
      [2, 1].forEach((off) => {
        const t = guess - off * 3600000;
        const parts = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23" }).format(new Date(t));
        if (parts.indexOf(String(dm[1]).padStart(2, "0") + "/" + String(dm[2]).padStart(2, "0")) === 0 && parts.slice(-5) === String(tm[1]).padStart(2, "0") + ":" + tm[2]) cands.push(t);
      });
    });
    cands.sort((a, b) => Math.abs(a - now.getTime()) - Math.abs(b - now.getTime()));
    return cands[0] || 0;
  }
  // Página del directo: /futmondo/guiafantasy/directo/<slug>?j=N — crónica minuto a minuto (la de Comuniate), de la hora del partido hasta 2 días después
  async function renderLivePage(slug) {
    const main = document.querySelector(".quiniela-main");
    if (!main) return;
    main.classList.add("mpage-open");
    document.querySelectorAll(".cx-sub").forEach((e) => e.classList.remove("hidden"));
    document.querySelectorAll("#tabsNav .tab").forEach((e) => e.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((e) => e.classList.add("hidden"));
    const ch = $("cxChrome"); if (ch) ch.classList.add("hidden");
    const boxR = el("section", "panel mpage livepage");
    boxR.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i></div>';
    main.appendChild(boxR);
    let qj = ""; try { qj = new URLSearchParams(location.search).get("j") || ""; } catch (e) {}
    const matchUrl = "/futmondo/guiafantasy/partido/" + slug + (qj ? "?j=" + encodeURIComponent(qj) : "");
    let timer = null, lvTab = "";
    const kindOf = (t) => {
      if (/¡\s*gol\b|golazo/i.test(t) && !/anulad|malogr|ocasi[oó]n|fuera de juego/i.test(t)) return ["goal", "⚽"];
      if (/tarjeta roja|expuls|doble amarilla|segunda amarilla/i.test(t) && !/amarilla a|le muestra tarjeta amarilla/i.test(t)) return ["red", "🟥"];
      if (/tarjeta amarilla|amonest/i.test(t)) return ["yellow", "🟨"];
      if (/cambio|sustitu|entra en su lugar/i.test(t)) return ["sub", "🔄"];
      if (/penalti/i.test(t)) return ["pen", "🎯"];
      if (/var\b/i.test(t)) return ["var", "📺"];
      if (/comenzado|comienza|descanso|final del partido|termina|segunda parte|primera parte/i.test(t)) return ["mark", "⏱️"];
      return ["", ""];
    };
    const paint = async (first, box = boxR) => {
      let jr = null;
      try { jr = await (await fetch(API + "/jornada" + (qj ? "?jornada=" + encodeURIComponent(qj) : ""))).json(); } catch (e) {}
      const m = ((jr && jr.matches) || []).find((x) => matchSlug(x.home, x.away) === slug);
      if (!m) { if (first) box.innerHTML = '<p class="muted small">No se encontró este partido.</p>'; return false; }
      const ko = kickoffMs(m), now = Date.now();
      const jn = Number(jr && jr.matchday) || Number(qj) || 0;
      const live = m.live || {};
      box.innerHTML = "";
      box.appendChild(backBtn(matchUrl, "mpage-back"));
      const head = el("div", "lv-head"); head.appendChild(refreshBtn());
      const side = (name, crest) => { const t = el("div", "lv-team"); const im = el("img"); im.src = crest || ""; im.alt = ""; t.appendChild(im); t.appendChild(el("span", null, name)); return t; };
      head.appendChild(side(m.home, m.homeCrest));
      const mid = el("div", "lv-mid");
      if (live.state === "live") {
        const lb = el("div", "lv-livebox");
        const pill = el("span", "lv-livepill"); pill.appendChild(el("i")); pill.appendChild(document.createTextNode("En directo")); lb.appendChild(pill);
        const lbl = String(live.minute || "");
        const mn = lbl.match(/(\d+(?:\+\d+)?)\s*$/);
        const per = lbl.split("·")[0].replace(/min\.?.*$/i, "").trim();
        if (mn) { const ln2 = el("div", "lv-liveline"); ln2.appendChild(el("b", null, mn[1] + "'")); if (per && per !== lbl) ln2.appendChild(el("span", null, per)); lb.appendChild(ln2); }
        else if (lbl) lb.appendChild(el("div", "lv-liveline", lbl));
        mid.appendChild(lb);
      } else mid.appendChild(el("div", "lv-state", live.state === "final" ? "Finalizado" : ((m.day || "") + " " + (m.date || "") + " · " + (m.time || "")).trim()));
      mid.appendChild(el("div", "lv-score", live.score && live.state !== "suspended" ? live.score : "vs"));
      head.appendChild(mid);
      head.appendChild(side(m.away, m.awayCrest));
      box.appendChild(head);
      const expired = ko && now > ko + LIVE_WINDOW;
      if (expired) { box.appendChild(el("p", "muted small lv-note", "Este directo ya no está disponible (se retira 2 días después del partido).")); return false; }
      if (ko && now < ko) { box.appendChild(el("p", "lv-note", "El directo empieza a las " + (m.time || "") + ". Esta página se actualiza sola.")); return true; }
      let entries = null, fm = null, ok = false;
      let dstr = "";
      try { const pp = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ko || now)).forEach((x) => { pp[x.type] = x.value; }); dstr = pp.year + pp.month + pp.day; } catch (e) {}
      try { const r = await (await fetch(API + "/directo?home=" + encodeURIComponent(m.home) + "&away=" + encodeURIComponent(m.away) + "&jornada=" + encodeURIComponent(jn) + (dstr ? "&date=" + dstr : ""))).json(); entries = (r && r.entries) || []; fm = r && r.fm; ok = true; } catch (e) {}
      // Cuenta atrás del descanso (hora real del final de la 1ª parte según FotMob + 15 min reglamentarios)
      try {
        const hf = fm && fm.halfs;
        const toMs = (v) => { const q = String(v || "").match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/); if (!q) return 0; const u = Date.UTC(+q[3], +q[2] - 1, +q[1], +q[4], +q[5], +q[6]); const off = Date.parse(new Date(u).toLocaleString("en-US", { timeZone: "Europe/Madrid" })) - Date.parse(new Date(u).toLocaleString("en-US", { timeZone: "UTC" })); return u - off; };
        const t1 = hf && hf.firstHalfEnded && !hf.secondHalfStarted && !fm.finished ? toMs(hf.firstHalfEnded) : 0;
        if (t1 && Date.now() - t1 < 40 * 60 * 1000) {
          const ht = el("div", "lv-ht"); const big = el("b", null, ""); const sm = el("span", null, ""); ht.appendChild(big); ht.appendChild(sm); mid.appendChild(ht);
          let seen = false, tries = 0;
          const tick = () => {
            if (ht.isConnected) seen = true; else if (seen || ++tries > 40) { clearInterval(iv); return; }
            const left = t1 + 15 * 60 * 1000 - Date.now();
            if (left > 0) { const t = Math.ceil(left / 1000); big.textContent = String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); sm.textContent = "hasta la segunda parte"; }
            else { big.textContent = ""; sm.textContent = "La segunda parte va a empezar"; }
          };
          const iv = setInterval(tick, 1000); tick();
        }
      } catch (e) {}
      // Marcador y minuto de la cabecera con los datos de FotMob (van más rápido que los de la jornada)
      let fmDone = false;
      try {
        if (fm && fm.started && Array.isArray(fm.score) && fm.score[0] != null && fm.score[1] != null && live.state !== "suspended") {
          const se = mid.querySelector(".lv-score"); if (se) se.textContent = fm.score[0] + " - " + fm.score[1];
          const hf = fm.halfs || {};
          const tM = (v) => { const q = String(v || "").match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/); if (!q) return 0; const u = Date.UTC(+q[3], +q[2] - 1, +q[1], +q[4], +q[5], +q[6]); const off = Date.parse(new Date(u).toLocaleString("en-US", { timeZone: "Europe/Madrid" })) - Date.parse(new Date(u).toLocaleString("en-US", { timeZone: "UTC" })); return u - off; };
          if (fm.finished) {
            fmDone = true;
            const lbx = mid.querySelector(".lv-livebox");
            if (lbx) { const st = el("div", "lv-state", "Finalizado"); lbx.replaceWith(st); }
            else { const stx = mid.querySelector(".lv-state"); if (stx) stx.textContent = "Finalizado"; }
          } else {
            let lbx = mid.querySelector(".lv-livebox");
            if (!lbx) { const stx = mid.querySelector(".lv-state"); if (stx) { lbx = el("div", "lv-livebox"); const pl = el("span", "lv-livepill"); pl.appendChild(el("i")); pl.appendChild(document.createTextNode("En directo")); lbx.appendChild(pl); stx.replaceWith(lbx); } }
            if (lbx) {
              const fh = tM(hf.firstHalfStarted), fe = tM(hf.firstHalfEnded), sh = tM(hf.secondHalfStarted), se2 = tM(hf.secondHalfEnded);
              const mk = (n, base) => (n > base ? base + "+" + (n - base) : String(n)) + "'";
              let ml = "", per = "";
              if (sh && !se2) { ml = mk(45 + Math.floor((Date.now() - sh) / 60000) + 1, 90); per = "2ª parte"; }
              else if (fh && !fe) { ml = mk(Math.floor((Date.now() - fh) / 60000) + 1, 45); per = "1ª parte"; }
              else if (fe && !sh) { ml = ""; per = "Descanso"; }
              if (per) {
                const old = lbx.querySelector(".lv-liveline"); if (old) old.remove();
                const ln3 = el("div", "lv-liveline"); if (ml) ln3.appendChild(el("b", null, ml)); ln3.appendChild(el("span", null, per)); lbx.appendChild(ln3);
              }
            }
          }
        }
      } catch (e) {}
      const mm = (e) => e.t + "'" + (e.x ? "+" + e.x : "");
      const evs = (fm && fm.events) || [], sts = (fm && fm.stats) || [];
      let fechaCard = null; const secs = []; const sec = (title) => { const c = el("section", "lv-sec"); c.appendChild(el("h3", "lv-h", title)); box.appendChild(c); secs.push([title.split(" ")[0], c]); return [c]; };
      const srcTag = () => {};
      const ln = fm && fm.lineup;
      let ourHrefG = null;
      // 1) Campo en directo
      if (ln && ln.h && ln.a) {
        if (!all || !all.length) { try { await load(); } catch (e) {} }
        const fnorm = (x) => stripAccents(String(x || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        // Jugador de FotMob -> su ficha en nuestra web (mismo equipo; nombre completo o, si es único, el apellido)
        ourHrefG = (full, team) => {
          const tk = teamCanon(team);
          const pool = (all || []).filter((p) => p.id && teamCanon(p.team) === tk);
          const ft = fnorm(full).split(" ").filter(Boolean);
          if (!ft.length) return "";
          let best = null, bs = 0, tie = false;
          pool.forEach((p) => {
            const pt = fnorm(p.name).split(" ").filter((w) => w.length > 1);
            if (pt.length && pt.every((w) => ft.indexOf(w) >= 0)) { if (pt.length > bs) { bs = pt.length; best = p; tie = false; } else if (pt.length === bs && best && best.id !== p.id) tie = true; }
          });
          if (best && !tie) return "/jugador/" + encodeURIComponent(best.id) + "/" + nameSlug(best.name);
          const last = ft[ft.length - 1];
          const same = pool.filter((p) => { const pt = fnorm(p.name).split(" "); return pt[pt.length - 1] === last; });
          return same.length === 1 ? "/jugador/" + encodeURIComponent(same[0].id) + "/" + nameSlug(same[0].name) : "";
        };
        const [c] = sec("Alineación");
        const top = el("div", "lv-ptop");
        const rcls = (r) => (r >= 8 ? " rt-hi" : r >= 7 ? " rt-mid" : r ? " rt-lo" : "");
        [[ln.h, "h", m.homeCrest], [ln.a, "a", m.awayCrest]].forEach(([t, w, cr]) => {
          const d = el("div", "lv-pt " + w);
          const im = el("img"); im.alt = ""; im.src = cr || ""; d.appendChild(im);
          const tx = el("div", "lv-pt-tx"); tx.appendChild(el("b", null, t.name));
          const chips = el("div", "lv-chips");
          if (t.f) chips.appendChild(el("span", "lv-chip", t.f));
          if (t.r) chips.appendChild(el("span", "lv-chip lv-rate" + rcls(t.r), String(t.r.toFixed ? t.r.toFixed(1) : t.r).replace(".", ",")));
          tx.appendChild(chips); d.appendChild(tx); top.appendChild(d);
        });
        c.appendChild(top);
        const pitch = el("div", "lv-pitch");
        pitch.appendChild(el("div", "lv-mid-line"));
        pitch.appendChild(el("div", "lv-circle"));
        [[ln.h, "h", m.homeCrest], [ln.a, "a", m.awayCrest]].forEach(([t, w, cr]) => {
          const tg = el("div", "lv-ptag " + w); const im = el("img"); im.alt = ""; im.src = cr || ""; tg.appendChild(im); tg.appendChild(el("span", null, t.name)); pitch.appendChild(tg);
        });
        const place = (t, home) => (t.st || []).forEach((q) => {
          if (q.x == null || q.y == null) return;
          const hrf = ourHrefG(q.n, t.name);
          const pl = el(hrf ? "a" : "div", "pl lv-abs"); if (hrf) pl.href = hrf;
          pl.style.setProperty("left", ((home ? q.x : 1 - q.x) * 100) + "%");
          pl.style.setProperty("top", ((home ? 6 + q.y * 40 : 94 - q.y * 40)) + "%");
          const ph = el("div", "pl-ph");
          const im = el("img"); im.loading = "lazy"; im.alt = ""; im.src = "https://images.fotmob.com/image_resources/playerimages/" + q.id + ".png";
          im.addEventListener("error", () => { im.src = "/img/avatar.svg"; });
          ph.appendChild(im);
          if (q.r) ph.appendChild(el("span", "pl-pts" + (fm.potm && fm.potm.id === q.id ? " mvp" : rcls(q.r)), String(q.r.toFixed ? q.r.toFixed(1) : q.r).replace(".", ",") + (fm.potm && fm.potm.id === q.id ? " ★" : "")));
          const cds = q.ev || [];
          if (cds.indexOf("redCard") >= 0 || cds.indexOf("yellowRedCard") >= 0) ph.appendChild(el("span", "pl-red"));
          else if (cds.indexOf("yellowCard") >= 0) ph.appendChild(el("span", "pl-yel"));
          const gl = cds.filter((x) => x === "goal").length; if (gl) { const ev = el("span", "pl-evs", "⚽"); if (gl > 1) ev.appendChild(el("i", null, String(gl))); ph.appendChild(ev); }
          pl.appendChild(ph);
          pl.appendChild(el("div", "pl-nm", String(q.n || "").split(" ").slice(-1)[0]));
          if (q.so) { const sw = el("div", "pl-sw out"); sw.appendChild(el("i", null, "▼")); sw.appendChild(document.createTextNode(q.so + "'")); pl.appendChild(sw); }
          pitch.appendChild(pl);
        });
        place(ln.h, true); place(ln.a, false);
        c.appendChild(pitch);
        [[ln.h, ln.h.name, m.homeCrest, "h"], [ln.a, ln.a.name, m.awayCrest, "a"]].forEach(([t, nm, cr, w]) => {
          if (!(t.sb || []).length) return;
          const bn = el("div", "al-bench lv-benchbox " + w);
          const bh = el("div", "lv-bench-h"); if (cr) { const ci = el("img"); ci.alt = ""; ci.src = cr; bh.appendChild(ci); } const bt = el("div", "lv-bench-t"); bt.appendChild(el("small", null, "Banquillo")); bt.appendChild(el("b", null, nm)); bh.appendChild(bt); bn.appendChild(bh);
          const row = el("div", "al-bench-row");
          t.sb.forEach((q) => {
            const hrf2 = ourHrefG(q.n, t.name);
            const pl = el(hrf2 ? "a" : "div", "pl" + (q.si ? "" : " lv-unused")); if (hrf2) pl.href = hrf2;
            const ph = el("div", "pl-ph");
            const im = el("img"); im.loading = "lazy"; im.alt = ""; im.src = "https://images.fotmob.com/image_resources/playerimages/" + q.id + ".png";
            im.addEventListener("error", () => { im.src = "/img/avatar.svg"; });
            ph.appendChild(im);
            if (q.r) ph.appendChild(el("span", "pl-pts" + rcls(q.r), String(q.r.toFixed ? q.r.toFixed(1) : q.r).replace(".", ",")));
            const cds = q.ev || [];
            if (cds.indexOf("redCard") >= 0 || cds.indexOf("yellowRedCard") >= 0) ph.appendChild(el("span", "pl-red"));
            else if (cds.indexOf("yellowCard") >= 0) ph.appendChild(el("span", "pl-yel"));
            const gl = cds.filter((x) => x === "goal").length; if (gl) { const ev = el("span", "pl-evs", "⚽"); if (gl > 1) ev.appendChild(el("i", null, String(gl))); ph.appendChild(ev); }
            pl.appendChild(ph);
            pl.appendChild(el("div", "pl-nm", String(q.n || "").split(" ").slice(-1)[0]));
            if (q.si) { const sw = el("div", "pl-sw in"); sw.appendChild(el("i", null, "▲")); sw.appendChild(document.createTextNode(q.si + "'")); pl.appendChild(sw); }
            row.appendChild(pl);
          });
          bn.appendChild(row); c.appendChild(bn);
        });
        srcTag(c, "Alineaciones y notas: FotMob");
      }
      // 2) Hechos: top estadísticas, jugador del partido, eventos (del minuto más reciente al más antiguo) y momentos destacados
      const potm = fm && fm.potm, hlv = fm && fm.hl;
      const stBy = {}; sts.forEach((x) => { stBy[x.l] = x; });
      let news = [];
      try { if (fm) { const nj = await (await fetch(API + "/noticias")).json(); news = (nj && nj.noticias) || []; } } catch (e) {}
      if (evs.length || potm || hlv || sts.length) {
        const [c] = sec("Hechos");
        const varEs = (t) => String(t || "").split("·").map((p) => { const q = p.trim().toLowerCase(); const M = { "goal ruled out": "Gol anulado", "goal awarded": "Gol concedido", "goal confirmed": "Gol confirmado", "goal stands": "Gol válido", "offside": "Fuera de juego", "foul": "Falta", "handball": "Mano", "penalty awarded": "Penalti concedido", "penalty cancelled": "Penalti anulado", "penalty not awarded": "Penalti no concedido", "penalty overturned": "Penalti anulado", "no penalty": "Sin penalti", "red card": "Tarjeta roja", "red card given": "Tarjeta roja", "red card cancelled": "Roja anulada", "red card overturned": "Roja anulada", "no red card": "Sin roja", "card upgrade": "Tarjeta cambiada", "card upgraded": "Tarjeta cambiada", "yellow card": "Tarjeta amarilla", "mistaken identity": "Error de identidad", "no goal": "Gol anulado", "goal disallowed": "Gol anulado", "goal cancelled": "Gol anulado", "no foul": "Sin falta", "no offside": "Sin fuera de juego", "foul by attacker": "Falta del atacante", "offside in build-up": "Fuera de juego previo", "offside in buildup": "Fuera de juego previo", "ball out of play": "Balón fuera", "var check": "Revisión del VAR", "penalty": "Penalti" }; return M[q] || p.trim(); }).join(" · ");
        const cardsMap = {}; const card = (t, cls) => { const k = el("div", "lv-card" + (cls ? " " + cls : "")); if (t.charAt(0) !== "_") k.appendChild(el("h4", "lv-card-h", t)); cardsMap[t] = k; return k; };
        const pos = stBy["Posesión"];
        if (pos || stBy["Goles esperados (xG)"] || stBy["Tiros totales"] || stBy["Toques en el área rival"]) {
          const k = card("Top estadísticas");
          if (pos) {
            k.appendChild(el("div", "lv-pos-l", "Posesión"));
            const bar = el("div", "lv-pos"); const l = el("b", "h", String(pos.h) + "%"), r = el("b", "a", String(pos.a) + "%");
            l.style.setProperty("width", Math.max(14, Number(pos.h) || 50) + "%"); r.style.setProperty("width", Math.max(14, Number(pos.a) || 50) + "%");
            bar.appendChild(l); bar.appendChild(r); k.appendChild(bar);
          }
          ["Goles esperados (xG)", "Tiros totales", "Toques en el área rival"].forEach((nm) => {
            const x = stBy[nm]; if (!x) return;
            const hv = parseFloat(x.h), av = parseFloat(x.a);
            const row = el("div", "lv-tsr");
            row.appendChild(el("span", "lv-tsv" + (hv > av ? " win h" : ""), String(x.h).replace(".", ",")));
            row.appendChild(el("span", "lv-tsl", nm));
            row.appendChild(el("span", "lv-tsv" + (av > hv ? " win a" : ""), String(x.a).replace(".", ",")));
            k.appendChild(row);
          });
        }
        if (potm) {
          const k = card("Jugador del partido");
          const phref = (ourHrefG && ourHrefG(potm.n, potm.team)) || "";
          const row = el(phref ? "a" : "div", "lv-potm"); if (phref) row.href = phref;
          const im = el("img"); im.alt = ""; im.src = "https://images.fotmob.com/image_resources/playerimages/" + potm.id + ".png"; im.addEventListener("error", () => { im.src = "/img/avatar.svg"; });
          row.appendChild(im);
          const tx = el("div", "lv-potm-tx"); tx.appendChild(el("b", null, potm.n)); tx.appendChild(el("span", null, potm.team)); row.appendChild(tx);
          if (potm.r) row.appendChild(el("span", "lv-potm-r", String(potm.r).replace(".", ",") + " ★"));
          k.appendChild(row);
        }
        if (evs.length) {
        const kEv = card("Eventos");
        const list = el("div", "lv-evs");
        (() => { const ts = evs.filter((e) => e.k !== "half" && typeof e.t === "number"); const asc = !ts.length || ts[0].t <= ts[ts.length - 1].t; return asc ? evs.slice().reverse() : evs.slice(); })().forEach((e) => {
          if (e.k === "half") { list.appendChild(el("div", "lv-half", e.txt === "HT" ? "Descanso" : e.txt === "FT" ? "Final del partido" : e.txt || "")); return; }
          const row = el("div", "lv-evr" + (e.k === "goal" ? " goal" : ""));
          const l = el("div", "lv-evl"), r = el("div", "lv-evr2");
          const mn = el("span", "lv-evm", mm(e));
          const body = el("div", "lv-evb");
          if (e.k === "goal") {
            body.appendChild(el("strong", null, "⚽ " + e.name + (e.own ? " (en propia)" : e.pen ? " (penalti)" : "")));
            if (e.sc) body.appendChild(el("small", null, "Marcador " + e.sc + (e.assist ? " · Asistencia: " + String(e.assist).replace(/^\s*assist(?:ed)? by\s*/i, "") : "")));
          } else if (e.k === "card") {
            const sq = el("i", "lv-sq" + (/red/i.test(e.card) ? " red" : "")); body.appendChild(sq);
            body.appendChild(el("strong", null, e.name));
            body.appendChild(el("small", null, /red/i.test(e.card) ? "Tarjeta roja" : "Tarjeta amarilla"));
          } else if (e.k === "sub") {
            body.appendChild(el("span", "lv-in", "↑ " + e.inn));
            body.appendChild(el("span", "lv-out", "↓ " + e.out));
          } else if (e.k === "var") {
            body.classList.add("lv-var");
            const vb = el("span", "lv-varb", "VAR"); body.appendChild(vb);
            const vt = el("div", "lv-var-t");
            vt.appendChild(el("strong", null, e.txt ? varEs(e.txt) : "Revisión del VAR"));
            if (e.name) vt.appendChild(el("small", null, e.name));
            body.appendChild(vt);
          }
          (e.h ? l : r).appendChild(body);
          row.appendChild(l); row.appendChild(mn); row.appendChild(r);
          list.appendChild(row);
        });
        kEv.appendChild(list);
        }
        const inf = fm && fm.info;
        const FM_CREST = (id) => "https://images.fotmob.com/image_resources/logo/teamlogo/" + id + ".png";
        const fdate = (iso) => { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso)); } catch (e) { return ""; } };
        const fhour = (iso) => { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch (e) { return ""; } };
        const fshort = (iso) => { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(/\./g, ""); } catch (e) { return ""; } };
        const fdm = (iso) => { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short" }).format(new Date(iso)).replace(/\./g, ""); } catch (e) { return ""; } };
        const PAIS = { Spain: "España", Portugal: "Portugal", France: "Francia", Italy: "Italia", Germany: "Alemania", England: "Inglaterra" };
        const COMP = { "UEFA Champions League": "Champions League", "UEFA Europa League": "Europa League", "UEFA Conference League": "Conference League", "UEFA Europa Conference League": "Conference League", "Copa del Rey": "Copa del Rey", "Supercopa": "Supercopa" };
        // Fecha (arriba del todo)
        if (inf && inf.date) {
          const k = card("_fecha", "lv-when");
          const l = el("div", "lv-when-l");
          const chips = el("div", "lv-when-chips");
          if (inf.league) chips.appendChild(el("span", "lv-wchip", inf.league));
          if (inf.round) chips.appendChild(el("span", "lv-wchip alt", "Jornada " + inf.round));
          l.appendChild(chips);
          const dd = fdate(inf.date); l.appendChild(el("div", "lv-when-d", dd.charAt(0).toUpperCase() + dd.slice(1)));
          k.appendChild(l);
          k.appendChild(el("div", "lv-when-t", fhour(inf.date)));
        }
        // Forma: últimos resultados con su fecha
        const fm2 = fm && fm.form;
        if (fm2 && (fm2[0] || []).length + (fm2[1] || []).length) {
          const k = card("Últimos partidos");
          const two = el("div", "lv-form");
          [[ln && ln.h ? ln.h.name : m.home, fm2[0], m.homeCrest], [ln && ln.a ? ln.a.name : m.away, fm2[1], m.awayCrest]].forEach(([nm, arr, cr]) => {
            const col = el("div", "lv-fcol");
            const hd = el("div", "lv-fhead"); if (cr) { const ci = el("img"); ci.alt = ""; ci.src = cr; hd.appendChild(ci); } hd.appendChild(el("span", null, nm)); col.appendChild(hd);
            (arr || []).slice().reverse().forEach((x) => {
              const r = el("div", "lv-frow");
              r.appendChild(el("span", "lv-fd", x.d ? fdm(x.d) : ""));
              r.appendChild(el("span", "lv-fp " + (x.r === "W" ? "w" : x.r === "L" ? "l" : "d"), x.sc));
              const im = el("img"); im.alt = ""; im.loading = "lazy"; im.src = x.logo; clubLink(im, x.ourHome ? x.an : x.hn); r.appendChild(im);
              col.appendChild(r);
            });
            two.appendChild(col);
          });
          k.appendChild(two);
        }
        // Estadio
        const SVG = (p) => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
        const ICO = {
          stadium: SVG('<ellipse cx="12" cy="8" rx="8" ry="3.5"/><path d="M4 8v8c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V8"/><path d="M8 11.5v6M12 12v7M16 11.5v6"/>'),
          users: SVG('<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5.5M18 14c2 .7 3 2.4 3 5"/>'),
          pitch: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/>'),
          temp: SVG('<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>'),
          sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
          cloud: SVG('<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5 4.3 4.3 0 0 1 17 18z"/>'),
          rain: SVG('<path d="M7 14a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 5.5 4.3 4.3 0 0 1 17 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
          snow: SVG('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>'),
          storm: SVG('<path d="M7 14a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 5.5 4.3 4.3 0 0 1 17 14z"/><path d="M12 13l-2 4h3l-2 4"/>'),
          fog: SVG('<path d="M4 9h16M6 13h14M4 17h12"/>'),
          foul: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 16v.5"/>')
        };
        const icoEl = (n, cls) => { const e = el("span", cls || "lv-svg"); e.innerHTML = ICO[n] || ""; return e; };
        if (inf && inf.stadium) {
          const k = card("Estadio");
          const st = inf.stadium;
          const row = (ic, main, sub, extra) => { const r = el("div", "lv-std-r"); const ie = el("span", "lv-std-ic"); ie.appendChild(icoEl(ic)); r.appendChild(ie); const t = el("div", "lv-std-tx"); t.appendChild(main); if (sub) t.appendChild(sub); r.appendChild(t); if (extra) r.appendChild(extra); k.appendChild(r); return t; };
          let mapBtn = null;
          if (st.lat != null && st.lng != null) { mapBtn = el("a", "lv-std-map"); mapBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>'; mapBtn.href = "https://www.google.com/maps?q=" + st.lat + "," + st.lng; mapBtn.target = "_blank"; mapBtn.rel = "noopener noreferrer"; mapBtn.title = "Ver en el mapa"; }
          row("stadium", el("b", null, st.n), el("span", "lv-std-s", [st.city, PAIS[st.country] || st.country].filter(Boolean).join(", ")), mapBtn);
          if (st.cap) {
            const t = row("users", el("div", "lv-kv2", ""), null);
            const l1 = t.firstChild; l1.appendChild(el("span", null, "Capacidad")); l1.appendChild(el("b", null, Number(st.cap).toLocaleString("es-ES")));
            if (inf.att) {
              const l2 = el("div", "lv-kv2"); l2.appendChild(el("span", null, "Asistencia")); l2.appendChild(el("b", null, Number(inf.att).toLocaleString("es-ES"))); t.appendChild(l2);
              const pc = Math.max(1, Math.min(100, Math.round(inf.att / st.cap * 100)));
              const bar = el("div", "lv-att"); const f = el("i"); f.style.setProperty("width", pc + "%"); bar.appendChild(f); bar.appendChild(el("em", null, pc + " %")); t.appendChild(bar);
            }
          }
          if (st.surface) { const t = row("pitch", el("div", "lv-kv2", ""), null); t.firstChild.appendChild(el("span", null, "Superficie")); t.firstChild.appendChild(el("b", null, /grass/i.test(st.surface) ? "Césped" : /artificial|turf/i.test(st.surface) ? "Césped artificial" : st.surface)); }
          if (inf.wx) {
            const d0 = String(inf.wx.d || "").toLowerCase();
            const wi = /thunder|storm/.test(d0) ? "storm" : /snow/.test(d0) ? "snow" : /rain|shower|drizzle/.test(d0) ? "rain" : /fog|mist|haze/.test(d0) ? "fog" : /partly|mostly cloudy|cloud|overcast/.test(d0) ? "cloud" : /clear|sunny/.test(d0) ? "sun" : "";
            const t = row("temp", el("div", "lv-kv2", ""), null); t.firstChild.appendChild(el("span", null, "El tiempo")); { const wb = el("b", "lv-wx", Math.round(inf.wx.t) + " °C"); if (wi) wb.appendChild(icoEl(wi, "lv-svg sm")); t.firstChild.appendChild(wb); }
          }
        }
        // Árbitro
        if (inf && inf.ref) {
          const k = card("Árbitro");
          const top = el("div", "lv-ref-top");
          if (inf.ref.img) { const fi = el("img"); fi.alt = ""; fi.src = inf.ref.img; top.appendChild(fi); }
          const rt = el("div", "lv-ref-id"); rt.appendChild(el("b", null, inf.ref.n)); rt.appendChild(el("span", null, PAIS[inf.ref.country] || inf.ref.country)); top.appendChild(rt);
          k.appendChild(top);
          const rs = inf.ref.stats || {};
          const lab = (x) => (Math.abs(x.fill - x.afill) <= 5 ? ["En la media", ""] : x.fill > x.afill ? ["Por encima de la media", "hi"] : ["Por debajo de la media", "lo"]);
          const grid = el("div", "lv-ref-grid");
          [["yellowCards", "Tarjetas amarillas", "card"], ["fouls", "Faltas", "foul"]].forEach(([key, nm, ic]) => {
            const x = rs[key]; if (!x) return;
            const cell = el("div", "lv-ref-c");
            const h = el("div", "lv-ref-h"); h.appendChild(ic === "card" ? el("span", "lv-ycard") : icoEl(ic, "lv-svg sm")); h.appendChild(el("b", null, nm)); cell.appendChild(h);
            const v = el("div", "lv-ref-v"); v.appendChild(el("strong", null, String(x.v).replace(".", ","))); v.appendChild(el("small", null, " / Partido")); cell.appendChild(v);
            const tr = el("div", "lv-ref-bar");
            const f = el("i"); f.style.setProperty("width", Math.max(2, Math.min(100, x.fill)) + "%"); tr.appendChild(f);
            const dot = el("u"); dot.style.setProperty("left", Math.max(2, Math.min(98, x.fill)) + "%"); tr.appendChild(dot);
            const tk = el("s"); const al = Math.max(2, Math.min(98, x.afill)); tk.style.setProperty("left", al + "%");
            if (x.avg != null) { const tl = el("em", null, "Media " + String(x.avg).replace(".", ",")); tl.style.setProperty("left", Math.max(18, Math.min(82, al)) + "%"); tr.appendChild(tl); }
            tr.appendChild(tk);
            cell.appendChild(tr);
            const lb = lab(x); cell.appendChild(el("span", "lv-ref-l " + lb[1], lb[0]));
            grid.appendChild(cell);
          });
          k.appendChild(grid);
          if (inf.league) k.appendChild(el("div", "lv-ref-foot", inf.league));
        }
        // Noticias relacionadas con el partido
        if (news.length) {
          const nrmN = (x) => stripAccents(String(x || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
          const ALI = { fcb: ["barca", "barcelona"], atm: ["atletico", "atleti"], ath: ["athletic", "bilbao"], rma: ["real madrid", "madridista"], bet: ["betis"], rso: ["real sociedad", "sociedad"], cel: ["celta"], dep: ["depor", "coruna"], ray: ["rayo"], esp: ["espanyol", "espanol"], get: ["getafe"], ala: ["alaves"], elc: ["elche"], osa: ["osasuna"], vil: ["villarreal"], val: ["valencia"], sev: ["sevilla"], lev: ["levante"], mal: ["malaga"], rac: ["racing"] };
          const keysOf = (nm) => { const a = ALI[teamCanon(nm)]; return a || [nrmN(nm).split(" ")[0]]; };
          const hk = keysOf(m.home), ak = keysOf(m.away);
          const hit = (t, ks) => ks.some((q) => q && new RegExp("\\b" + q).test(t));
          const sc = news.map((x, i) => { const t = nrmN(x.title); const a = hit(t, hk), b = hit(t, ak); return { x, i, s: (a ? 1 : 0) + (b ? 1 : 0) }; }).filter((r) => r.s > 0).sort((p, q) => q.s - p.s || p.i - q.i).slice(0, 5);
          if (sc.length) {
            const k = card("Noticias del partido");
            sc.forEach((r) => {
              const a = el("a", "lv-nw"); a.href = r.x.link; a.target = "_blank"; a.rel = "noopener noreferrer";
              if (r.x.thumb) { const im = el("img"); im.alt = ""; im.loading = "lazy"; im.src = r.x.thumb; im.addEventListener("error", () => im.remove()); a.appendChild(im); }
              const t = el("div", "lv-nw-t"); t.appendChild(el("b", null, r.x.title)); t.appendChild(el("small", null, (r.x.date || "") + (r.x.time ? " · " + r.x.time : ""))); a.appendChild(t);
              k.appendChild(a);
            });
          }
        }
        // Partido siguiente (con su competición)
        const nx = ((fm && fm.next) || []).filter((x) => x && x.d);
        if (nx.length) {
          const k = card("Partido siguiente");
          nx.forEach((x) => {
            const r = el("div", "lv-next");
            const side = (id, nm) => { const d = el("div", "lv-ns"); const im = el("img"); im.alt = ""; im.src = FM_CREST(id); d.appendChild(im); d.appendChild(el("span", null, nm)); clubLink(d, nm); return d; };
            const tp = el("div", "lv-next-lg"); tp.appendChild(el("span", "lv-lgchip", COMP[x.lg] || x.lg || "")); tp.appendChild(el("span", null, fshort(x.d))); r.appendChild(tp);
            const row = el("div", "lv-next-row");
            row.appendChild(side(x.hid, x.hn));
            const mid = el("div", "lv-nm2"); mid.appendChild(el("b", null, fhour(x.d))); row.appendChild(mid);
            row.appendChild(side(x.aid, x.an));
            r.appendChild(row);
            k.appendChild(r);
          });
        }
        // Momentos destacados (abajo del todo) con miniatura de YouTube
        if (hlv) {
          const k = card("Momentos destacados");
          const a2 = el("a", "lv-hl"); a2.href = hlv.url; a2.target = "_blank"; a2.rel = "noopener noreferrer";
          const yid = (String(hlv.url).match(/[?&]v=([\w-]{6,})/) || String(hlv.url).match(/youtu\.be\/([\w-]{6,})/) || [])[1];
          const thumb = yid ? "https://i.ytimg.com/vi/" + yid + "/hqdefault.jpg" : (hlv.image || hlv.img || "");
          if (thumb) { const im = el("img"); im.alt = "Resumen del partido"; im.loading = "lazy"; im.src = thumb; im.addEventListener("error", () => { const alt = hlv.image || hlv.img; if (alt && im.src !== alt) im.src = alt; }); a2.appendChild(im); }
          a2.appendChild(el("span", "lv-hl-shade"));
          const pb = el("span", "lv-play"); pb.appendChild(el("i")); a2.appendChild(pb);
          const cap = el("span", "lv-hl-cap"); cap.appendChild(el("b", null, "Resumen del partido")); cap.appendChild(el("small", null, "Ver en YouTube")); a2.appendChild(cap);
          k.appendChild(a2);
        }
        fechaCard = cardsMap["_fecha"] || null; ["Jugador del partido", "Eventos", "Top estadísticas", "Últimos partidos", "Estadio", "Árbitro", "Noticias del partido", "Partido siguiente", "Momentos destacados"].forEach((n) => { if (cardsMap[n]) c.appendChild(cardsMap[n]); });
      }
      // 3) Estadísticas
      if (sts.length) {
        const [c] = sec("Estadísticas");
        const list = el("div", "lv-stats");
        let lastG = "";
        sts.forEach((x) => {
          if (x.g && x.g !== lastG) { list.appendChild(el("div", "lv-stat-g", x.g)); lastG = x.g; }
          const hv = parseFloat(x.h), av = parseFloat(x.a), tot = (hv || 0) + (av || 0);
          const row = el("div", "lv-stat");
          const tp = el("div", "lv-stat-top");
          tp.appendChild(el("b", null, String(x.h).replace(".", ",") + (x.u || "")));
          tp.appendChild(el("span", null, x.l));
          tp.appendChild(el("b", null, String(x.a).replace(".", ",") + (x.u || "")));
          row.appendChild(tp);
          const b2 = el("div", "lv-stat-bar"), l2 = el("i"), r2 = el("i");
          const pl2 = tot > 0 ? Math.round(hv / tot * 100) : 50;
          l2.style.setProperty("width", pl2 + "%"); r2.style.setProperty("width", (100 - pl2) + "%");
          b2.appendChild(l2); b2.appendChild(r2); row.appendChild(b2);
          list.appendChild(row);
        });
        c.appendChild(list);
        srcTag(c, "Estadísticas: FotMob");
      }
      if (!secs.length) box.appendChild(el("p", "muted small lv-note", ok ? "Todavía no hay datos del partido." : "No se pudo cargar el directo."));
      // 5) Clasificación
      if (fm && fm.table && fm.table.length) {
        const [c] = sec("Clasificación · LaLiga");
        const tb = el("div", "lv-table");
        const hd = el("div", "lv-trow lv-thead");
        ["#", "Equipo", "J", "G", "E", "P", "+/-", "DG", "PTS"].forEach((h, i) => hd.appendChild(el("span", i === 1 ? "lv-tn" : "", h)));
        tb.appendChild(hd);
        fm.table.forEach((x) => {
          const hl = x.id === fm.hid || x.id === fm.aid;
          const r = el("div", "lv-trow" + (hl ? " me" : ""));
          const pos = el("span", "lv-tp", String(x.i)); if (x.q) pos.style.setProperty("box-shadow", "inset 3px 0 0 " + x.q);
          r.appendChild(pos);
          const tn = el("span", "lv-tn"); const ci = el("img"); ci.alt = ""; ci.loading = "lazy"; ci.src = "https://images.fotmob.com/image_resources/logo/teamlogo/" + x.id + ".png"; tn.appendChild(ci); tn.appendChild(el("em", null, x.n)); clubLink(tn, x.n); r.appendChild(tn);
          [x.p, x.w, x.d, x.l, x.gf, x.dg, x.pt].forEach((v, i) => r.appendChild(el("span", i === 6 ? "lv-pts" : "", String(v))));
          tb.appendChild(r);
        });
        c.appendChild(tb);
        srcTag(c, "Clasificación: FotMob");
      }
      const h2 = fm && fm.h2h;
      if (h2 && h2.m && h2.m.length) {
        const [c] = sec("Cara a Cara");
        const k = el("div", "lv-card");
        const sum = el("div", "lv-h2sum");
        const hid = fm.hid, aid = fm.aid;
        const crest = (id) => { const im = el("img"); im.alt = ""; im.src = "https://images.fotmob.com/image_resources/logo/teamlogo/" + id + ".png"; return im; };
        sum.appendChild(crest(hid));
        [["h", h2.sum[0], "Victorias"], ["d", h2.sum[1], "Empates"], ["a", h2.sum[2], "Victorias"]].forEach(([cl, n, lb]) => { const d = el("div", "lv-h2c"); d.appendChild(el("span", "lv-h2n " + cl, String(n))); d.appendChild(el("b", null, lb)); sum.appendChild(d); });
        sum.appendChild(crest(aid));
        k.appendChild(sum);
        h2.m.forEach((x) => {
          const r = el("div", "lv-h2r");
          const top = el("div", "lv-h2top"); top.appendChild(el("span", null, (() => { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric" }).format(new Date(x.d)); } catch (e) { return ""; } })())); top.appendChild(el("span", null, x.lg)); r.appendChild(top);
          const mt = el("div", "lv-h2m");
          const l = el("span", "lv-h2t l"); l.appendChild(el("em", null, x.hn)); l.appendChild(crest(x.hid));
          const rg = el("span", "lv-h2t r"); rg.appendChild(crest(x.aid)); rg.appendChild(el("em", null, x.an));
          mt.appendChild(l); mt.appendChild(el("b", "lv-h2s", x.sc ? x.sc.replace(/\s/g, " ") : (() => { try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(x.d)); } catch (e) { return ""; } })())); mt.appendChild(rg);
          r.appendChild(mt); k.appendChild(r);
        });
        c.appendChild(k);
      }
      if (secs.length) {
        const ORD = ["Hechos", "Alineación", "Estadísticas", "Cara", "Clasificación"];
        secs.sort((x, y) => ORD.indexOf(x[0]) - ORD.indexOf(y[0]));
        secs.forEach(([k, c]) => box.appendChild(c));
        const srcTop = el("p", "lv-srctop", "Fuente de los datos: FotMob · se actualiza cada 10 s");
        box.insertBefore(srcTop, secs[0][1]);
        let cur = lvTab; if (!secs.some((x) => x[0] === cur)) cur = secs[0][0];
        const bar = el("div", "lv-tabs");
        secs.forEach(([k, c]) => {
          const b = el("button", "lv-tab" + (k === cur ? " on" : ""), k === "Cara" ? "Cara a cara" : k); b.type = "button";
          b.addEventListener("click", () => { lvTab = k; bar.querySelectorAll(".lv-tab").forEach((x) => x.classList.toggle("on", x === b)); secs.forEach(([k2, c2]) => c2.classList.toggle("hidden", k2 !== k)); });
          bar.appendChild(b);
          c.classList.toggle("hidden", k !== cur);
        });
        box.insertBefore(bar, secs[0][1]);
        if (fechaCard) { fechaCard.classList.add("in"); head.appendChild(fechaCard); }
      }
      return live.state !== "final" && !fmDone;
    };
    try {
      const more = await paint(true);
      if (more) timer = setInterval(async () => {
        if (!document.body.contains(boxR)) { clearInterval(timer); return; }
        if (document.hidden) return;
        const y = window.scrollY;
        try {
          // Se prepara la página nueva aparte y se cambia de golpe: sin parpadeos ni saltos
          const tmp = el("div"); const mo = await paint(false, tmp);
          if (tmp.childNodes.length) {
            const tb = boxR.querySelector(".lv-tabs"), sl = tb ? tb.scrollLeft : 0;
            boxR.replaceChildren(...tmp.childNodes);
            const tb2 = boxR.querySelector(".lv-tabs"); if (tb2) tb2.scrollLeft = sl;
          }
          if (!mo) clearInterval(timer);
        } catch (e) {}
        window.scrollTo(0, y);
      }, 10000);
    } catch (e) { boxR.innerHTML = '<p class="muted small">No se pudo cargar el directo.</p>'; }
  }
  async function renderMatchPage(slug) {
    const main = document.querySelector(".quiniela-main");
    if (!main) return;
    main.classList.add("mpage-open");
    // La barra Inicio / Noticias / Mercado se queda arriba también aquí (en toda la web).
    document.querySelectorAll(".cx-sub").forEach((e) => e.classList.remove("hidden"));
    document.querySelectorAll("#tabsNav .tab").forEach((e) => e.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((e) => e.classList.add("hidden"));
    const ch = $("cxChrome"); if (ch) ch.classList.add("hidden");
    const box = el("section", "panel mpage");
    box.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i><i class="s"></i></div>';
    main.appendChild(box);
    let timer = null;
    const run = async (first) => {
      let qj = ""; try { qj = new URLSearchParams(location.search).get("j") || ""; } catch (e) {}
      // Pide un JSON con reintentos: la API a veces falla o devuelve la jornada vacía un instante
      // (límite de football-data) y antes eso se veía como "No se encontró el partido".
      const getJ = async (u, okFn) => {
        for (let t = 0; t < 3; t++) {
          try { const r = await (await fetch(u)).json(); if (!okFn || okFn(r)) return r; } catch (e) {}
          await new Promise((res) => setTimeout(res, 500 * (t + 1)));
        }
        return null;
      };
      const hasMs = (r) => !!(r && r.matches && r.matches.length);
      let jr = await getJ(API + "/jornada" + (qj ? "?jornada=" + encodeURIComponent(qj) : ""), hasMs);
      let ms = (jr && jr.matches) || [];
      if (!ms.some((x) => matchSlug(x.home, x.away) === slug) && !qj) {
        // Sin ?j=: busca en las jornadas cercanas, de varias en varias a la vez (antes una a una = lentísimo)
        const cur = Number(jr && jr.matchday) || 0;
        const tryBatch = async (list) => {
          const rs = await Promise.all(list.filter((n) => n >= 1 && n <= 38).map((n) => getJ(API + "/jornada?jornada=" + n, hasMs)));
          for (const j2 of rs) { if (j2 && (j2.matches || []).some((x) => matchSlug(x.home, x.away) === slug)) { jr = j2; ms = j2.matches; return true; } }
          return false;
        };
        if (cur) { (await tryBatch([cur - 1, cur + 1, cur - 2, cur + 2])) || (await tryBatch([cur + 3, cur - 3, cur - 4, cur - 5, cur - 6, cur - 7])); }
      }
      const jn = Number(jr && jr.matchday) || 0;
      const m = ms.find((x) => matchSlug(x.home, x.away) === slug);
      if (!m) { if (first) box.innerHTML = '<p class="muted small">No se pudo cargar el partido. <a href="" onclick="location.reload();return false">Reintentar</a></p>'; return false; }
      // Cabecera al instante con lo que ya se sabe; lo demás se rellena al llegar
      if (first) { try { renderMatchDetail(box, m, { __quick: true }, jn, null, "", false, null); box.appendChild(Object.assign(document.createElement("div"), { className: "mpage-skel", innerHTML: '<i></i><i class="s"></i>' })); } catch (e) {} }
      // Todo lo del partido a la vez (antes iba una petición detrás de otra)
      const enc = encodeURIComponent;
      const pD = getJ(API + "/detallepartido?home=" + enc(m.home) + "&away=" + enc(m.away) + "&jornada=" + enc(jn), (r) => !!r && !r.error);
      const pC = fetch(API + "/alineaciones-confirmadas?jornada=" + enc(jn), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const pO = fetch(API + "/once?home=" + enc(m.home) + "&away=" + enc(m.away) + "&jornada=" + enc(jn), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const pL = (!all || !all.length) ? load().catch(() => {}) : Promise.resolve();
      const [d, cPre, oPre] = await Promise.all([pD, pC, pO, pL]);
      if (!d) { if (first) box.innerHTML = '<p class="muted small">No se pudo cargar el partido. <a href="" onclick="location.reload();return false">Reintentar</a></p>'; return false; }
      const finalNow = (m.live && m.live.state === "final") || /finaliz/i.test(String(d.state || ""));
      // En juego: se enseña lo que hay ahora en el campo (tabla de jugadores) en vez de la probable
      mpLive = !!(!finalNow && d.homePlayers && d.homePlayers.length >= 11 && d.awayPlayers && d.awayPlayers.length >= 11);
      const finished = finalNow || mpLive;
      // Alineación para el campo (solo si el partido NO ha acabado): primero
      // la confirmada (Comuniate, literal); si aún no está, la probable
      // (FutbolFantasy con % y banquillo). Si ya acabó, en su lugar se
      // muestran los jugadores que jugaron de verdad (tabla PUNTOS). La
      // probable se pide también con el partido acabado, solo por las fotos
      // recortadas de FF (el mercado no siempre tiene foto de todos).
      let xi = null, xiKind = "", ffData = null;
      mpConf = null;
      {
        try {
          const c = cPre;
          const cm = findXiMatch((c && c.matches) || [], m.home, m.away);
          if (cm) { mpConf = cm; if (!finished) { xi = cm; xiKind = "confirmada"; } }
        } catch (e) {}
      }
      {
        try {
          const o = oPre;
          if (o && o.home && (((o.home.starters || []).length) || ((o.away.starters || []).length) || ((o.home.bench || []).length) || ((o.away.bench || []).length))) {
            ffData = o;
            if (!(((o.home.starters || []).length) || ((o.away.starters || []).length))) ffData.benchOnly = true;
            if (!finished && !xi && !o.benchOnly) { xi = o; xiKind = "probable"; }
          }
        } catch (e) {}
      }
      mpTeams = { home: m.home, away: m.away };
      mpCambios = []; mpPairs = []; mpReds = []; mpGm = null;
      if (finished) { try { const cj = await (await fetch(API + "/cambios?home=" + encodeURIComponent(m.home) + "&away=" + encodeURIComponent(m.away) + "&jornada=" + encodeURIComponent(jn))).json(); mpCambios = cj.subs || []; mpReds = cj.reds || []; mpGm = cj.gm || null; } catch (e) {} }
      // Nunca "probable" con % si el partido ya empezó o si todos están al 100% (= confirmada)
      const sure = (o) => o && o.starters && o.starters.length >= 10 && o.starters.every((p) => p.prob === 100);
      if (xiKind === "probable" && xi && ((m.live && m.live.state === "live") || (sure(xi.home) && sure(xi.away) && !(kickoffMs(m) && kickoffMs(m) - Date.now() > 3 * 3600 * 1000)))) xiKind = "confirmada";
      if (xiKind === "confirmada" && !finished) {
        const fb = await fmBenchFor(m, jn);
        if (fb) { ffData = ffData || { home: {}, away: {} }; ffData.home = ffData.home || {}; ffData.away = ffData.away || {}; if (fb.home.length) ffData.home.bench = fb.home; if (fb.away.length) ffData.away.bench = fb.away; }
      }
      renderMatchDetail(box, m, d, jn, xi, xiKind, finished, ffData);
      box.appendChild(buildOtherMatches(ms, m, jn));
      // Los puntos de MI liga Futmondo se piden aparte (por jugador y con
      // caché en el backend) y se pintan encima en cuanto llegan.
      // Partido acabado pero sin puntos todavía: se sigue buscando cada minuto hasta que lleguen
      let pointsIn = true;
      if (finished) { try { const r = await fillMpPoints(box, d, jn); if (!mpLive) pointsIn = r !== false; } catch (e) { pointsIn = false; } }
      if (finalNow && !pointsIn) { const h = box.querySelector(".mpage-xi-h"); if (h) h.insertAdjacentElement("afterend", el("p", "muted small mpage-live-note", "⏳ Esperando los puntos de Futmondo…")); }
      return !finalNow || !pointsIn;
    };
    // Si llegan datos nuevos distintos de lo que se pintó al instante (carga rápida), se repinta en el sitio
    let swrT = null;
    const onSwr = (ev) => {
      if (!document.body.contains(box)) { document.removeEventListener("cx:swr", onSwr); return; }
      const u = (ev.detail && ev.detail.url) || "";
      if (!/detallepartido|\/once|alineaciones-confirmadas|cambios|puntos|\/jornada/.test(u)) return;
      clearTimeout(swrT);
      swrT = setTimeout(async () => {
        if (!document.body.contains(box)) return;
        const y = window.scrollY; box.style.minHeight = box.offsetHeight + "px";
        try { await run(false); } catch (e) {}
        box.style.minHeight = ""; window.scrollTo(0, y);
      }, 250);
    };
    document.addEventListener("cx:swr", onSwr);
    try {
      const more = await run(true);
      // Actualización en directo cada minuto, en el sitio (sin recargar ni mover lo que estás viendo)
      if (more) timer = setInterval(async () => {
        if (!document.body.contains(box)) { clearInterval(timer); return; }
        if (document.hidden) return;
        const y = window.scrollY;
        box.style.minHeight = box.offsetHeight + "px";
        try { const mo = await run(false); if (!mo) clearInterval(timer); } catch (e) {}
        box.style.minHeight = "";
        window.scrollTo(0, y);
      }, 60000);
    } catch (e) { try { console.error('partido:', e && e.stack || e); } catch (e2) {} box.innerHTML = '<p class="muted small">No se pudo cargar el partido.</p>'; }
  }
  // Ficha de jugador como página propia:
  // /jugador/<id>/<nombre>
  async function renderPlayerPage(id) {
    const main = document.querySelector(".quiniela-main");
    if (!main) return;
    // La barra Inicio / Noticias / Mercado se queda arriba también aquí (en toda la web).
    document.querySelectorAll(".cx-sub").forEach((e) => e.classList.remove("hidden"));
    document.querySelectorAll("#tabsNav .tab").forEach((e) => e.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((e) => e.classList.add("hidden"));
    const ch = $("cxChrome"); if (ch) ch.classList.add("hidden");
    const box = el("section", "panel playerpage");
    box.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i></div>';
    main.appendChild(box);
    const draw = (d, first) => {
      const p = (all || []).find((x) => String(x.id) === String(id)) || {};
      const y = window.scrollY;
      box.innerHTML = "";
      box.appendChild(backBtn("/futmondo/guiafantasy/mercado"));
      box.appendChild(renderFicha(d, p));
      if (!first) window.scrollTo(0, y);
    };
    let lastD = null;
    const paint = async (first) => {
      // La ficha se pinta en cuanto llega /jugador; el mercado completo (más pesado) se carga aparte y repinta después.
      const needAll = !all || !all.length;
      const pl = needAll ? load().catch(() => {}) : Promise.resolve();
      const full = fetch(API + "/jugador?id=" + encodeURIComponent(id)).then((r) => r.json());
      // Primero la ficha rápida (sin futbolfantasy/transfermarkt); en cuanto llega la completa se repinta.
      let d = null;
      if (first) {
        try { d = await fetch(API + "/jugador?id=" + encodeURIComponent(id) + "&fast=1").then((r) => r.json()); } catch (e) {}
        if (d && d.name) { lastD = d; draw(d, true); }
        full.then((fd) => { if (fd && fd.name && document.body.contains(box)) { lastD = fd; draw(fd, false); } }).catch(() => {});
        if (!(d && d.name)) { d = await full; lastD = d; draw(d, true); }
      } else { d = await full; lastD = d; draw(d, false); }
      if (needAll) pl.then(() => { if (document.body.contains(box) && lastD) draw(lastD, false); });
      if (first && !playedJ) ensurePlayedJ().then(() => { if (playedJ && document.body.contains(box) && lastD) draw(lastD, false); }).catch(() => {});
    };
    try { await paint(true); } catch (e) { box.innerHTML = '<p class="muted small">No se pudo cargar la ficha.</p>'; }
    let swrP = null;
    const onSwrP = (ev) => {
      if (!document.body.contains(box)) { document.removeEventListener("cx:swr", onSwrP); return; }
      const u = (ev.detail && ev.detail.url) || "";
      if (u.indexOf("/jugador?id=" + id) < 0 && !/\/mercado/.test(u)) return;
      clearTimeout(swrP); swrP = setTimeout(() => { paint(false).catch(() => {}); }, 250);
    };
    document.addEventListener("cx:swr", onSwrP);
  }

  function openMatchFicha(m, jn) {
    const w = el("div");
    w.appendChild(el("p", "muted small", "Cargando alineaciones…"));
    showModal(w);
    try { history.pushState({ tab: currentTab, ficha: 1 }, "", location.href); } catch (e) {}
    (async () => {
      let r = null;
      for (let a = 0; a < 2 && !r; a++) {
        try {
          const j = await (await fetch(API + "/once?home=" + encodeURIComponent(m.home) + "&away=" + encodeURIComponent(m.away) + "&jornada=" + encodeURIComponent(jn))).json();
          if (j && ((j.home && j.home.starters && j.home.starters.length) || (j.away && j.away.starters && j.away.starters.length))) r = j;
        } catch (e) {}
        if (!r && a === 0) await new Promise((x) => setTimeout(x, 1500));
      }
      if (!r) {
        const c = el("div");
        c.appendChild(el("p", "muted small", "No se pudieron cargar las alineaciones."));
        showModal(c);
        return;
      }
      const card = el("div", "alin-card");
      const head = el("div", "alin-mhead");
      head.appendChild(el("div", "alin-mtitle", "Jornada " + jn + " · LaLiga" + (r.stadium ? " · " + r.stadium : "")));
      if (m.tv && m.tv.length) {
        const tv = el("div", "alin-mtv");
        m.tv.forEach((c2) => { if (!c2 || !c2.logo) return; const im = el("img"); im.src = c2.logo; im.alt = c2.name || ""; im.title = c2.name || ""; im.loading = "lazy"; im.addEventListener("error", () => im.remove()); tv.appendChild(im); });
        head.appendChild(tv);
      }
      const teams = el("div", "alin-mteams");
      const hb = el("div", "alin-mteam");
      if (m.homeCrest) { const im = el("img"); im.src = m.homeCrest; im.alt = ""; hb.appendChild(im); }
      hb.appendChild(el("span", null, m.home));
      teams.appendChild(hb);
      teams.appendChild(el("span", "alin-mvs", "vs"));
      const ab = el("div", "alin-mteam");
      if (m.awayCrest) { const im = el("img"); im.src = m.awayCrest; im.alt = ""; ab.appendChild(im); }
      ab.appendChild(el("span", null, m.away));
      teams.appendChild(ab);
      head.appendChild(teams);
      head.appendChild(el("div", "alin-mwhen", ((m.day || "") + " " + (m.date || "") + " " + (m.time || "")).trim()));
      head.appendChild(probLegendBtn());
      card.appendChild(head);
      const pitches = el("div", "alin-pitches");
      pitches.appendChild(renderPitch(r.home || {}, m.homeCrest));
      pitches.appendChild(renderPitch(r.away || {}, m.awayCrest));
      card.appendChild(pitches);
      showModal(card);
    })();
  }

  function filteredList() {
    const q = stripAccents($("mjSearch") ? $("mjSearch").value.trim() : "");
    const team = teamFilter;
    const role = $("mjRole") ? $("mjRole").value : "";
    let list = all.filter((p) => {
      if (q && !stripAccents(p.name).includes(q)) return false;
      if (team && p.team !== team && teamCanon(p.team) !== teamCanon(team)) return false;
      if (role && p.role !== role) return false;
      const v = Number(p.value) || 0;
      if (v < rangeMin || v > rangeMax) return false;
      return true;
    });
    if (quick === "chollos") list = list.filter((p) => (Number(p.change) || 0) < -150000 && (Number(p.points) || 0) > 25);
    else if (quick === "bajando") list = list.filter((p) => (Number(p.change) || 0) < 0);
    else if (quick === "subiendo") list = list.filter((p) => (Number(p.change) || 0) > 0);
    else if (quick === "racha") list = list.filter((p) => { const f = (p.fitness || []).slice(-3); return f.length === 3 && f.every((x) => Number(x) > 0); });
    else if (quick === "vuelven") list = list.filter((p) => { const f = p.fitness || []; return f.length >= 3 && Number(f[0]) <= 0 && Number(f[f.length - 1]) > 0; });
    else if (quick === "multipos") list = list.filter((p) => p.role2);
    if (q || quick) list = list.slice().sort((a, b) => b.value - a.value);
    else if (sortMode === "up") list = list.filter((p) => hlChange(p) > 0).sort((a, b) => hlChange(b) - hlChange(a));
    else if (sortMode === "down") list = list.filter((p) => hlChange(p) < 0).sort((a, b) => hlChange(a) - hlChange(b));
    else list = list.slice().sort((a, b) => b.value - a.value);
    return list;
  }

  function renderGrid() {
    const grid = $("marketGrid");
    if (!grid) return;
    restoreMercState();
    saveMercState();
    grid.innerHTML = "";
    // Venimos del botón "en racha" de un equipo: bajar hasta la lista ya filtrada.
    try {
      if (sessionStorage.getItem("merc_scroll") && grid.offsetParent !== null) {
        sessionStorage.removeItem("merc_scroll");
        setTimeout(() => { const g = $("marketGrid"); if (g) g.scrollIntoView({ block: "start" }); }, 450);
      }
    } catch (e) {}
    const _sq = $("mjSearch"), _rl = $("mjRole");
    if ((_sq && _sq.value.trim()) || quick || teamFilter || (_rl && _rl.value) || rangeMin > 0 || (rangeMax !== Infinity && rangeMax > 0 && document.querySelector("#mxPrice .mx-chip.active") && (Number(document.querySelector("#mxPrice .mx-chip.active").dataset.max) || 0)) || sortMode !== "all") {
      const rb = el("button", "btn-ghost mkt-reset", "✕ Quitar filtros y ver todos los jugadores"); rb.type = "button";
      rb.addEventListener("click", resetMercFilters);
      grid.appendChild(rb);
    }
    const top = el("div", "mkt-top");
    const tl = el("div", "mkt-tl");
    tl.appendChild(el("div", "mkt-headline", "📋 Todos los jugadores"));
    tl.appendChild(el("div", "mkt-hint", "↔ Desliza la tabla para ver más columnas"));
    top.appendChild(tl);
    const seg = el("div", "hl-seg");
    [["1", "Hoy"], ["7", "7 días"], ["14", "14 días"], ["30", "30 días"], ["all", "Temporada"]].forEach(([k, lab]) => {
      const b = el("button", "hl-btn" + (hlPeriod === k ? " active" : ""), lab);
      b.type = "button";
      b.addEventListener("click", () => { const y = window.scrollY; hlPeriod = k; renderGrid(); renderRachas(); window.scrollTo(0, y); });
      seg.appendChild(b);
    });
    top.appendChild(seg);
    grid.appendChild(top);
    const list0 = filteredList();
    const pctOf = (p) => { const ch = hlChange(p); const prev = (Number(p.value) || 0) - ch; return prev > 0 ? (ch / prev) * 100 : 0; };
    const vantOf = (p) => (Number(p.value) || 0) - hlChange(p);
    const sorters = {
      jugador: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
      pct: (a, b) => pctOf(a) - pctOf(b),
      tend: (a, b) => (Number(a.tend) || 0) - (Number(b.tend) || 0),
      rival: (a, b) => (Number(a.prob) || 0) - (Number(b.prob) || 0),
      valor: (a, b) => (Number(a.value) || 0) - (Number(b.value) || 0),
      vant: (a, b) => vantOf(a) - vantOf(b),
      dif: (a, b) => hlChange(a) - hlChange(b),
    };
    let list = list0;
    if (mktSort.key && sorters[mktSort.key]) list = list0.slice().sort((a, b) => mktSort.dir * sorters[mktSort.key](a, b));
    if (!list.length) { grid.appendChild(el("p", "market-empty", "Sin resultados.")); return; }
    const wrap = el("div", "mkt-wrap");
    const tbl = el("div", "mkt-table");
    const head = el("div", "mkt-row mkt-head");
    const cols = [["jugador", "Jugador", false], ["valor", "Valor", true], ["vant", "Valor ant.", true], ["dif", "Diferencia", true], ["pct", "% Dif", true], ["tend", "Tend.", true], ["rival", "Próx. rival", false]];
    cols.forEach(([key, label, sortable]) => {
      const h = el("span", "mkt-h" + (mktSort.key === key ? " active" : ""), label);
      if (sortable) {
        h.appendChild(el("span", "mkt-arrow", mktSort.key === key ? (mktSort.dir > 0 ? " ▲" : " ▼") : " ⇅"));
        h.style.cursor = "pointer";
        h.addEventListener("click", () => { if (mktSort.key === key) mktSort.dir = -mktSort.dir; else { mktSort.key = key; mktSort.dir = -1; } renderGrid(); });
      }
      head.appendChild(h);
    });
    tbl.appendChild(head);
    list.slice(0, shown).forEach((p) => {
      const row = el("button", "mkt-row"); row.type = "button";
      const ch = hlChange(p);
      const prev = (Number(p.value) || 0) - ch;
      const j = el("div", "mkt-jug");
      const ph = el("div", "mkt-photo");
      ph.appendChild(photoImg(p.photo, "mkt-img"));
      const rb = roleBadge(p.role);
      if (rb) ph.appendChild(el("span", "mkt-pos posb posb-" + posCls(p.role), rb + (roleBadge(p.role2) ? "·" + roleBadge(p.role2) : "")));
      j.appendChild(ph);
      const jj = el("div", "mkt-jname");
      jj.appendChild(el("b", null, p.name));
      const tm = el("span", "mkt-jteam");
      if (p.logo) { const lg = el("img"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; tm.appendChild(lg); }
      if (p.team) tm.appendChild(el("span", null, p.team));
      clubLink(tm, p.team);
      jj.appendChild(tm);
      j.appendChild(jj);
      row.appendChild(j);
      row.appendChild(el("div", "mkt-val", money(p.value) + " €"));
      row.appendChild(el("div", "mkt-vant", money(prev) + " €"));
      const dif = el("div", "mkt-dif " + (ch > 0 ? "up" : ch < 0 ? "down" : "flat"));
      dif.appendChild(el("span", "mkt-lens", "💹"));
      dif.appendChild(el("span", null, (ch > 0 ? "+" : ch < 0 ? "−" : "") + formatDots(Math.abs(ch)) + " €"));
      row.appendChild(dif);
      const pctv = prev > 0 ? (ch / prev) * 100 : 0;
      row.appendChild(el("div", "mkt-pct " + (ch > 0 ? "up" : ch < 0 ? "down" : "flat"), (pctv >= 0 ? "+" : "−") + Math.abs(pctv).toFixed(2).replace(".", ",") + "%"));
      const t = Number(p.tend) || 0;
      row.appendChild(el("div", "mkt-tend " + (t > 0 ? "up" : t < 0 ? "down" : "flat"), t ? ((t > 0 ? "▲ " : "▼ ") + Math.abs(t) + "d") : "—"));
      const rv = el("div", "mkt-rival");
      if (p.jornadaFf) rv.appendChild(el("b", null, "J" + p.jornadaFf));
      if (p.casaFf != null) rv.appendChild(el("span", null, p.casaFf ? "🏠" : "✈️"));
      if (p.rivalFf) rv.appendChild(el("span", "mkt-rv", shortRival(p.rivalFf)));
      if (p.prob != null) { const mp = el("span", "mkt-prob", p.prob + "%"); mp.title = probTitle(p.prob); rv.appendChild(mp); }
      row.appendChild(rv);
      row.addEventListener("click", () => openFicha(p));
      tbl.appendChild(row);
    });
    wrap.appendChild(tbl);
    grid.appendChild(wrap);
    if (list.length > shown) {
      const more = el("button", "btn-ghost market-more", "Ver más (" + (list.length - shown) + ")");
      more.addEventListener("click", () => { shown += 18; renderGrid(); });
      grid.appendChild(more);
    }
  }

  function renderEstado() {
    const box = $("estadoBox");
    if (!box) return;
    box.innerHTML = "";
    const sel = $("estadoSel") ? $("estadoSel").value : "";
    const allGroups = [
      { key: "injured", title: "Lesionados", test: (s) => String(s).indexOf("injured") === 0 },
      { key: "redcard", title: "Sancionados", test: (s) => s === "redcard" },
      { key: "doubt", title: "Dudas", test: (s) => s === "doubt" },
    ];
    const groups = sel ? allGroups.filter((g) => g.key === sel) : allGroups;
    let any = false;
    groups.forEach((g) => {
      const list = all.filter((p) => g.test(p.status)).sort((a, b) => b.value - a.value);
      if (!list.length) return;
      any = true;
      const sec = el("div", "estado-sec");
      sec.appendChild(el("h3", "estado-title", g.title + " (" + list.length + ")"));
      const grid = el("div", "market-grid");
      list.slice(0, 40).forEach((p) => grid.appendChild(playerCard(p, openFicha)));
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    if (!any) box.appendChild(el("p", "market-empty", sel ? "Nadie en ese estado ahora mismo." : "Sin bajas ni dudas ahora mismo."));
  }

  function findPlayer(name) {
    const q = stripAccents(name).trim();
    if (!q) return null;
    return all.find((p) => stripAccents(p.name) === q) || all.find((p) => stripAccents(p.name).includes(q)) || null;
  }

  function sugList(input, box, onPick) {
    const q = stripAccents(input.value.trim());
    let list = q ? all.filter((p) => stripAccents(p.name).includes(q)) : all.slice().sort((a, b) => b.value - a.value);
    list = list.slice(0, 10);
    box.innerHTML = "";
    if (!list.length) { box.classList.add("hidden"); return; }
    list.forEach((p) => {
      const row = el("button", "cmp-sugrow");
      row.type = "button";
      const ph = el("span", "cmp-sugphoto");
      ph.appendChild(photoImg(p.photo));
      row.appendChild(ph);
      const body = el("span", "cmp-sugbody");
      body.appendChild(el("span", "cmp-sugname", p.name));
      body.appendChild(el("span", "cmp-sugteam", p.team || ""));
      row.appendChild(body);
      row.appendChild(el("span", "cmp-sugval", money(p.value) + " €"));
      row.addEventListener("click", () => onPick(p));
      box.appendChild(row);
    });
    box.classList.remove("hidden");
  }

  function wireCmp(input, box) {
    if (!input || !box) return;
    const pick = (p) => {
      if (input === $("cmpA")) selA = p; else selB = p;
      input.value = p.name;
      box.classList.add("hidden");
      renderComparador();
    };
    input.addEventListener("focus", () => sugList(input, box, pick));
    input.addEventListener("input", () => { if (input === $("cmpA")) selA = null; else selB = null; sugList(input, box, pick); });
  }

  function pronosticoOf(p) {
    if (p.status === "redcard") return "Sancionado 🟥";
    if (String(p.status || "").indexOf("injured") === 0) return "Lesionado ❌";
    if (p.status === "doubt") return "Duda 🟠";
    const f = p.fitness || [];
    const avg = f.length ? f.reduce((s, x) => s + (Number(x) || 0), 0) / f.length : 0;
    return avg >= 5 ? "Titular 🔥" : avg >= 3 ? "Probable ✅" : "Suplente 🤔";
  }
  function cmpCard(p) {
    const c = el("div", "cmp2-card");
    const ph = el("div", "cmp2-photo");
    ph.appendChild(photoImg(p.photo));
    c.appendChild(ph);
    c.appendChild(el("div", "cmp2-name", p.name));
    const rb = roleBadge(p.role), rb2 = roleBadge(p.role2);
    if (rb) c.appendChild(el("span", "mcard-role" + (rb2 ? " multi" : "") + " posb posb-" + posCls(p.role), rb + (rb2 ? " · " + rb2 : "")));
    c.appendChild(el("div", "cmp2-team", p.team || ""));
    return c;
  }
  function renderComparador() {
    const out = $("cmpOut");
    if (!out) return;
    out.innerHTML = "";
    const a = selA, b = selB;
    if (!a || !b) { out.appendChild(el("p", "muted small", "Toca el buscador y elige dos jugadores para compararlos.")); return; }
    const grid = el("div", "cmp2");
    grid.appendChild(cmpCard(a));
    grid.appendChild(el("div", "cmp2-vs", "VS"));
    grid.appendChild(cmpCard(b));
    out.appendChild(grid);
    const avg = (p) => { const f = p.fitness || []; return f.length ? f.reduce((s, x) => s + (Number(x) || 0), 0) / f.length : 0; };
    const stats = el("div", "cmp2-stats");
    const stat = (label, va, vb, wa, wb) => {
      const row = el("div", "cmp2-row");
      row.appendChild(el("span", "cmp2-cell" + (wa ? " win" : ""), va));
      row.appendChild(el("span", "cmp2-lab", label));
      row.appendChild(el("span", "cmp2-cell right" + (wb ? " win" : ""), vb));
      stats.appendChild(row);
    };
    const va = Number(a.value) || 0, vb = Number(b.value) || 0;
    const posOf = (p) => (roleBadge(p.role) || "") + (roleBadge(p.role2) ? "/" + roleBadge(p.role2) : "");
    stat("Posición", posOf(a), posOf(b), false, false);
    stat("Valor", money(va) + " €", money(vb) + " €", va > vb, vb > va);
    const probOf = (p) => {
      if (p.prob != null) return p.prob;
      if (String(p.status || "").indexOf("injured") === 0) return 5;
      if (p.status === "doubt") return 50;
      const f = p.fitness || [];
      const played = f.filter((x) => Number(x) !== 0).length;
      let base = 55 + (avg(p) - 3) * 6;
      if (played <= 1) base -= 25;
      return Math.max(15, Math.min(95, Math.round(base)));
    };
    const qa = probOf(a), qb = probOf(b);
    stat("Prob. jugar", qa + "%", qb + "%", qa > qb, qb > qa);
    const pa = Number(a.points) || 0, pb = Number(b.points) || 0;
    stat("Puntos", String(pa), String(pb), pa > pb, pb > pa);
    const ma = avg(a), mb = avg(b);
    stat("Media ú.5", ma.toFixed(1).replace(".", ","), mb.toFixed(1).replace(".", ","), ma > mb, mb > ma);
    stat("Últimos 5", (a.fitness || []).join(" · ") || "—", (b.fitness || []).join(" · ") || "—", false, false);
    const ca = Number(a.change) || 0, cb = Number(b.change) || 0;
    stat("Tendencia", (ca >= 0 ? "▲ +" : "▼ −") + formatDots(Math.abs(ca)) + " €", (cb >= 0 ? "▲ +" : "▼ −") + formatDots(Math.abs(cb)) + " €", ca > cb, cb > ca);
    stat("Estado", statusLabel(a.status), statusLabel(b.status), false, false);
    stat("Pronóstico", pronosticoOf(a), pronosticoOf(b), false, false);
    out.appendChild(stats);
  }

  function updateTime(at) {
    const e = $("mercadoUpdated");
    if (e && at) e.textContent = "Actualizado " + fmtDia(at);
  }

  function fillDatalist() {
    const dl = $("cmpList");
    if (!dl) return;
    dl.innerHTML = "";
    all.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => {
      const o = document.createElement("option");
      o.value = p.name;
      dl.appendChild(o);
    });
  }

  function setupClubs() {
    const box = $("mercClubs");
    if (!box || box.dataset.init) return;
    box.dataset.init = "1";
    const allBtn = el("button", "merc-club merc-club-all", "Todos");
    allBtn.type = "button";
    allBtn.title = "Todos los equipos";
    allBtn.addEventListener("click", () => setTeam(""));
    box.appendChild(allBtn);
    const map = {};
    all.forEach((p) => { if (p.team && p.logo && !map[p.team]) map[p.team] = p.logo; });
    Object.keys(map).sort((a, b) => a.localeCompare(b)).forEach((t) => {
      const btn = el("button", "merc-club");
      btn.type = "button";
      btn.title = t;
      const im = el("img", "merc-club-img"); im.src = map[t]; im.alt = t; im.loading = "lazy";
      btn.appendChild(im);
      btn.addEventListener("click", () => setTeam(teamFilter === t ? "" : t));
      box.appendChild(btn);
    });
  }

  function setTeam(t) {
    teamFilter = t || "";
    syncClubActive();
    sortMode = "all";
    document.querySelectorAll(".merc-segbtn").forEach((x) => x.classList.toggle("active", x.dataset.sort === "all"));
    shown = 18;
    // La tira de escudos ahora también se ve desde Noticias; si no estamos ya
    // en Mercado hay que llevar ahí al usuario, si no el filtro "funciona"
    // pero no se ve nada (el grid queda oculto en la pestaña Noticias).
    pltClub = t || ""; pltPos = ""; pltShown = 40; pltSave();
    if (currentTab !== "plantillas") switchTab("plantillas");
    else if (pltInit) { renderPltControls(); renderPltList(); }
    window.scrollTo(0, 0);
  }

  function syncClubActive() {
    document.querySelectorAll(".merc-club").forEach((x) => {
      const on = x.classList.contains("merc-club-all") ? !teamFilter : (x.title === teamFilter);
      x.classList.toggle("active", !!on);
    });
    document.querySelectorAll("#cxStrip .cx-team").forEach((x) => {
      const on = x.classList.contains("cx-team-all") ? !teamFilter : (x.dataset.team === teamFilter);
      x.classList.toggle("active", !!on);
    });
  }

  document.addEventListener("click", (e) => {
    const cell = e.target.closest ? e.target.closest("#cxStrip .cx-team") : null;
    if (!cell) return;
    const t = cell.dataset.team || "";
    // En Inicio la tira de escudos lleva a la página del club; en Mercado/Noticias sigue filtrando
    if (currentTab === "inicio") { location.href = t ? (clubHref(t) || "/equipos") : "/equipos"; return; }
    setTeam(teamFilter === t ? "" : t);
  });

  function setupTeams() {
    const sel = $("mjTeam");
    if (!sel) return;
    const teams = [...new Set(all.map((p) => p.team).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    teams.forEach((t) => { const o = document.createElement("option"); o.value = t; o.textContent = t; sel.appendChild(o); });
  }

  function setupRange() {
    const min = $("mjMin"), max = $("mjMax");
    if (!min || !max) return;
    const maxV = Math.max(1, ...all.map((p) => Number(p.value) || 0));
    rangeMin = 0; rangeMax = maxV;
    const label = $("mjRangeLabel");
    if (label) label.textContent = money(0) + " € – " + money(maxV) + " €";
    const apply = () => {
      let a = Number(min.value), b = Number(max.value);
      if (a > b) { const t = a; a = b; b = t; }
      rangeMin = Math.round(maxV * a / 100);
      rangeMax = Math.round(maxV * b / 100) || maxV;
      if (label) label.textContent = money(rangeMin) + " € – " + money(rangeMax) + " €";
      shown = 18;
      renderGrid();
    };
    min.addEventListener("input", apply);
    max.addEventListener("input", apply);
  }

  // Menú "☰ Más": pestañas que no entran en la barra principal (Fichajes,
  // Clausulazo jugoso, Analiza tu equipo) viven aquí dentro en vez de obligar
  // a deslizar o poner flechas. Si la pestaña activa es una de las del menú,
  // el botón se pone verde para saber dónde estás sin abrir el desplegable.
  const MORE_TABS = { fichajes: "Fichajes", clausulazos: "Clausulazo jugoso", analiza: "Analiza tu equipo", plantillas: "Plantillas (prueba)" };
  function closeMoreMenu() {
    const menu = $("cxMoreMenu"), btn = $("cxMoreBtn");
    if (menu) menu.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }
  function setupMoreMenu() {
    const btn = $("cxMoreBtn"), menu = $("cxMoreMenu");
    if (!btn || !menu) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.contains("hidden");
      menu.classList.toggle("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
      if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMoreMenu();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMoreMenu(); });
  }
  function updateMoreBtn(name) {
    const btn = $("cxMoreBtn"), label = $("cxMoreLabel");
    if (!btn || !label) return;
    const active = MORE_TABS[name];
    btn.classList.toggle("active", !!active);
    label.textContent = active || "Más";
  }

  let currentTab = "inicio";
  function switchTab(name, fromPop) {
    closeNoticiaInline();
    currentTab = name;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    updateMoreBtn(name);
    closeMoreMenu();
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    const panel = $("tab-" + name);
    if (panel) panel.classList.remove("hidden");
    const ch = $("cxChrome");
    if (ch) {
      ch.classList.toggle("hidden", name !== "mercado" && name !== "noticias" && name !== "inicio");
      // La cinta de "Última hora" (chrome.js) es la primera cosa de la
      // portada: solo se enseña en Inicio.
      ch.classList.toggle("hide-ticker", name !== "inicio");
      // En Noticias no se repiten los escudos ni la franja de jornada
      // (ya están en Inicio).
      ch.classList.toggle("hide-strip", name === "noticias");
      // Los partidos de la jornada solo se ven en Inicio.
      ch.classList.toggle("hide-jornada", name !== "inicio");
    }
    // La cinta de la portada se recalcula al volver a Inicio (al estar
    // oculta su ancho era 0 y la duración de la animación quedaba corta).
    if (name === "inicio") { try { if (window.__cxTickerSync) window.__cxTickerSync(); } catch (e) {} }
    if (name === "inicio") renderInicioFeatured();
    if (name === "clausulazos") renderClausulas();
    if (name === "fichajes") renderFichajes();
    if (name === "plantillas") initPlantillas();
    if (name === "analiza") renderCapHistorial();
    try { sessionStorage.setItem("merc_tab", name); } catch (e) {}
    try {
      const url = "/futmondo/guiafantasy/" + (name === "plantillas" ? "mercado" : name);
      if (fromPop) history.replaceState({ tab: name }, "", url);
      else history.pushState({ tab: name }, "", url);
    } catch (e) {}
  }

  // Base de cálculo del análisis: toda la temporada (media real de Futmondo por partido jugado) o solo los últimos 5.
  let anBase = "temporada";
  try { const sv = localStorage.getItem("merc_anbase"); if (sv === "ultimos5" || sv === "temporada") anBase = sv; } catch (e) {}
  // Media de la temporada y partidos jugados de un jugador del análisis (dato del mercado de Futmondo).
  function seasonOf(p) {
    if (!p) return null;
    if (p._s !== undefined && (p._s || (all && all.length))) return p._s;
    let r = null;
    try {
      if (p.avg != null && p.matches != null && p.name) r = { avg: Number(p.avg), n: Number(p.matches), id: p.id };
      else if (all && all.length) {
        const tc = teamCanon(p.equipo || "");
        const ro = all.filter((x) => teamCanon(x.team) === tc);
        const nk = stripAccents(String(p.nombre || "").toLowerCase()).replace(/[^a-z0-9 ]/g, "").trim();
        const key = (x) => stripAccents(String(x.name || "").toLowerCase()).replace(/[^a-z0-9 ]/g, "").trim();
        let m = (p.id && ro.find((x) => String(x.id) === String(p.id))) || ro.find((x) => key(x) === nk);
        if (!m && nk) {
          const last = nk.split(" ").pop();
          const c = ro.filter((x) => key(x) === last || key(x).split(" ").pop() === last || nk.indexOf(key(x)) >= 0);
          if (c.length === 1) m = c[0];
        }
        if (m) r = { avg: Number(m.avg), n: Number(m.matches), id: m.id };
      }
    } catch (e) {}
    if (r && !(r.avg > 0 && r.n > 0)) r = null;
    p._s = r;
    return r;
  }
  // Forma: media REAL de los puntos de los últimos partidos que JUGÓ (Futmondo; un 0 = no jugó). Sin pesos inventados.
  function formOf(p) {
    const f = (p.fitness || []).map(Number).filter((x) => !isNaN(x));
    const pl = f.filter((x) => x !== 0); // un 0 = no jugó ("–" en Futmondo)
    const avg = pl.length ? pl.reduce((a, b) => a + b, 0) / pl.length : 0;
    const l2 = f.slice(-2).filter((x) => x !== 0);
    const rec = l2.length ? l2.reduce((a, b) => a + b, 0) / l2.length : avg;
    const ss = anBase === "temporada" ? seasonOf(p) : null;
    const base = ss ? ss.avg : avg;
    return { avg, rec, base, season: ss, trend: l2.length ? rec - base : 0, played: pl.length, len: f.length, avgAll: f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0 };
  }
  function expOf(p) {
    const f = p.fitness || [];
    const played = f.filter((x) => Number(x) !== 0).length;
    const avg = f.length ? f.reduce((a, b) => a + (Number(b) || 0), 0) / f.length : 0;
    const prob = p.prob != null ? p.prob : (String(p.status || "").indexOf("injured") === 0 ? 0 : p.status === "doubt" ? 50 : 60);
    const casa = p.casaFf === true ? 1.08 : p.casaFf === false ? 0.94 : 1;
    const fit = played >= 3 ? 1 : played === 2 ? 0.85 : 0.6;
    return avg * (prob / 100) * casa * fit;
  }

  function buildBest() {
    const box = el("div", "merc-best");
    const cand = all.filter((p) => p.fitness && p.fitness.length >= 3 && p.value > 0);
    if (cand.length < 8) return null;
    const byExp = cand.slice().sort((a, b) => expOf(b) - expOf(a));
    const picked = [], seen = new Set();
    ["portero", "defensa", "centrocampista", "delantero"].forEach((pos) => {
      byExp.filter((p) => p.role === pos).slice(0, 2).forEach((p) => { if (!seen.has(p)) { picked.push(p); seen.add(p); } });
    });
    byExp.forEach((p) => { if (picked.length < 10 && !seen.has(p)) { picked.push(p); seen.add(p); } });
    const top = picked.sort((a, b) => expOf(b) - expOf(a)).slice(0, 10);
    const head = el("div", "merc-besthead");
    head.appendChild(el("span", "mbh-t", "⭐ Mejor fichaje de la jornada"));
    head.appendChild(el("span", "mbh-sub", "por puntos probables"));
    box.appendChild(head);
    const row = el("div", "merc-bestrow");
    row.id = "mercBestRow";
    top.forEach((p) => {
      const c = el("button", "mbc"); c.type = "button";
      const ph = el("div", "mbc-photo");
      const im = el("img", "mbc-img"); im.loading = "lazy"; im.alt = ""; im.src = p.photo || "/img/avatar.svg";
      im.addEventListener("error", () => { if (im.getAttribute("src") !== "/img/avatar.svg") im.src = "/img/avatar.svg"; }, { once: true });
      ph.appendChild(posRing(im, p.role, p.role2));
      const sti = statusInfo(p.status);
      if (sti) ph.appendChild(el("span", "mcard-badge " + sti.cls, sti.label));
      c.appendChild(ph);
      c.appendChild(el("div", "mbc-name", p.name));
      if (p.team) {
        const tr = el("div", "mbc-team");
        if (p.logo) { const lg = el("img", "mbc-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; tr.appendChild(lg); }
        tr.appendChild(el("span", null, p.team));
        clubLink(tr, p.team);
        c.appendChild(tr);
      }
      const rb = roleBadge(p.role), rb2 = roleBadge(p.role2);
      if (rb) c.appendChild(el("span", "mbc-role" + (rb2 ? " multi" : "") + " posb posb-" + posCls(p.role), rb + (rb2 ? "·" + rb2 : "")));
      c.appendChild(el("div", "mbc-exp", "~" + expOf(p).toFixed(1).replace(".", ",") + " pts"));
      if (p.value) c.appendChild(el("div", "mbc-val", money(p.value) + " €"));
      const f = (p.fitness || []).slice(0, 5);
      if (f.length) {
        const lc = el("div", "mbc-last5");
        f.forEach((v) => lc.appendChild(el("span", "ficha-chip pt-" + ptClass(v), String(v))));
        c.appendChild(lc);
      }
      if (p.rivalFf) c.appendChild(el("div", "mbc-rival", (p.casaFf === true ? "🏠 " : p.casaFf === false ? "✈️ " : "") + p.rivalFf));
      c.addEventListener("click", () => openFicha(p));
      row.appendChild(c);
    });
    box.appendChild(row);
    return box;
  }

  function mountScrollBar(scrollEl, barEl) {
    if (!scrollEl || !barEl) return;
    const thumb = barEl.firstElementChild;
    if (!thumb) return;
    function update() {
      const max = scrollEl.scrollWidth - scrollEl.clientWidth;
      if (max <= 4) { barEl.style.display = "none"; return; }
      barEl.style.display = "";
      const trackW = barEl.clientWidth || 1;
      const ratio = scrollEl.clientWidth / scrollEl.scrollWidth;
      const thumbW = Math.max(trackW * ratio, 28);
      const pos = scrollEl.scrollLeft / max;
      thumb.style.width = thumbW + "px";
      thumb.style.transform = "translateX(" + (pos * (trackW - thumbW)) + "px)";
    }
    scrollEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    setTimeout(update, 300);
  }

  (function backScroll() {
    let y = 0, k = "scrollBack:" + location.pathname;
    try { history.scrollRestoration = "manual"; y = Number(sessionStorage.getItem(k)) || 0; sessionStorage.removeItem(k); } catch (e) {}
    if (!y || /\/jugador(?:es)?\//.test(location.pathname)) return;
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (document.documentElement.scrollHeight >= y + window.innerHeight - 5) { window.scrollTo(0, y); if (Math.abs(window.scrollY - y) < 4 && n > 3) clearInterval(t); }
      if (n > 40) clearInterval(t);
    }, 150);
  })();
  document.addEventListener("cx:swr", (ev) => { const u = (ev.detail && ev.detail.url) || ""; if (/\/mercado/.test(u) && typeof load === "function") load(); });
  let lastMarketAt = 0;
  async function load() {
    try {
      const res = await fetch(API + "/mercado");
      const d = await res.json();
      if (d.updatedAt && d.updatedAt === lastMarketAt && all.length) { updateTime(d.updatedAt); return; }
      lastMarketAt = d.updatedAt || 0;
      if (Array.isArray(d.players)) all = d.players;
      updateTime(d.updatedAt);
      const _y = window.scrollY;
      renderRachas();
      renderGrid();
      renderEstado();
      if (all.length && !rangeInit) {
        rangeInit = true;
        setupRange();
      }
      setupClubs();
      try { if (window.scrollY !== _y) window.scrollTo(0, _y); } catch (e) {}
    } catch (e) {}
  }

  function fmtFecha(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtDia(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtHora(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  let myTeam = [];
  let newsMineOnly = false;
  let lastNews = null;
  try { const s = JSON.parse(localStorage.getItem("merc_myteam") || "[]"); if (Array.isArray(s)) myTeam = s; } catch (e) {}
  function updateNewsFilter() {
    const b = $("newsMine");
    if (!b) return;
    if (!myTeam.length) { b.classList.add("hidden"); return; }
    b.classList.remove("hidden");
    b.classList.toggle("active", newsMineOnly);
    b.textContent = "🔎 Solo mis jugadores (" + myTeam.length + ")";
  }
  // ¿Habla este texto de ESE jugador? Nombre completo como palabras enteras. Si el nombre es de una sola
  // palabra ("Romero") o solo se usa el apellido, se exige que no vaya detrás de OTRO nombre de pila
  // ("Isaac Romero" no es "Romero" del Atlético) salvo que la noticia nombre también su club.
  // Nunca por el nombre de pila solo ("Toni Amor" no es "Toni Martínez").
  function newsMentions(text, name, team) {
    const clean = (x) => stripAccents(String(x || "")).replace(/[^a-z0-9 ,;:()]/g, " ");
    const toks = clean(text).replace(/([,;:()])/g, " $1 ").split(/\s+/).filter(Boolean);
    const isP = (w) => w === "," || w === ";" || w === ":" || w === "(" || w === ")";
    const nt = clean(name).replace(/[,;:()]/g, " ").split(/\s+/).filter(Boolean);
    if (!nt.length || !toks.length) return false;
    const PART = { de: 1, del: 1, la: 1, el: 1, y: 1, a: 1, en: 1, con: 1, por: 1, que: 1, sobre: 1, para: 1, e: 1 };
    const words = toks.filter((w) => !isP(w));
    let tk = "";
    if (team) { tk = clean(team).split(/\s+/).filter((w) => w.length >= 4 && !/^(real|club|futbol|deportivo|atletico)$/.test(w))[0] || clean(team).split(/\s+/)[0] || ""; }
    const teamIn = !!tk && words.indexOf(tk) >= 0;
    const find = (seq) => {
      const out = [];
      for (let i = 0; i + seq.length <= toks.length; i++) {
        let ok = true;
        for (let k = 0; k < seq.length; k++) if (toks[i + k] !== seq[k]) { ok = false; break; }
        if (ok) out.push(i);
      }
      return out;
    };
    const prevOk = (i) => { const pv = toks[i - 1]; return !pv || isP(pv) || !!PART[pv]; };
    if (nt.length >= 2) {
      if (find(nt).length) return true;
      const last = nt[nt.length - 1];
      if (last.length < 5 || !teamIn) return false;
      return find([last]).some((i) => prevOk(i) || nt.indexOf(toks[i - 1]) >= 0);
    }
    if (nt[0].length < 4) return false;
    return find(nt).some((i) => prevOk(i) || teamIn);
  }
  function newsMatchMyTeam(x) {
    if (!myTeam.length) return true;
    const t = String(x.title || "") + " " + String(x.lead || "");
    return myTeam.some((n) => newsMentions(t, n, ""));
  }

  function haceTxt(ts) {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m <= 0) return "ahora mismo";
    if (m < 60) return "hace " + m + " min";
    const h = Math.round(m / 60);
    if (h < 24) return "hace " + h + " h";
    return "hace " + Math.round(h / 24) + " d";
  }

  function waColor(name) {
    const cols = ["#0e7a5f", "#c2410c", "#3f6212", "#be185d", "#4338ca", "#0f766e", "#a16207"];
    let h = 0;
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return cols[h % cols.length];
  }

  function waBold(s) {
    let t = String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    t = t.replace(/(\d{1,3}(?:\.\d{3})+)(\s?€)?/g, "<b>$1$2</b>");
    t = t.replace(/\b([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})*)\b/g, "<b>$1</b>");
    return t;
  }

  function renderNews(d) {
    lastNews = d;
    const upd = $("newsUpdated");
    if (upd) upd.textContent = d.updatedAt ? "· actualizado " + haceTxt(d.updatedAt) : "";
    const a = $("newsAnuncios");
    if (a) {
      a.innerHTML = "";
      a.classList.add("news-grid");
      let list = d.noticias || [];
      if (newsMineOnly && myTeam.length) {
        list = list.filter(newsMatchMyTeam);
        if (!list.length) a.appendChild(el("p", "muted small", "Ninguna noticia de tus jugadores ahora mismo."));
      }
      if (!list.length && !(newsMineOnly && myTeam.length)) a.appendChild(el("p", "muted small", "Sin noticias ahora mismo."));
      let lastDate = "";
      list.forEach((x, idx) => {
        if (x.date && x.date !== lastDate) {
          lastDate = x.date;
          const dh = el("div", "news-day");
          dh.appendChild(el("span", "news-day-txt", "📅 " + x.date));
          a.appendChild(dh);
        }
        const it = el("div", "newscard news-link" + (idx === 0 ? " news-hero" : ""));
        it.style.animationDelay = Math.min(idx, 10) * 40 + "ms";
        it.addEventListener("click", () => openNoticiaInline(x.link, x.title));
        const th = el("div", "newscard-thumb" + (x.thumb ? "" : " ball"));
        const setBg = (u, ball) => { th.style.backgroundImage = 'url("' + u + '")'; th.classList.toggle("ball", !!ball); };
        if (x.thumb) { setBg(x.thumb, false); const t = new Image(); t.onerror = () => setBg("/img/balon.svg", true); t.src = x.thumb; } else setBg("/img/balon.svg", true);
        it.appendChild(th);
        const bd = el("div", "newscard-body");
        if (idx === 0) bd.appendChild(el("span", "news-badge", "🔥 Lo último"));
        bd.appendChild(el("div", "news-title", x.title));
        bd.appendChild(el("div", "news-date", "🕒 " + x.date + (x.time ? " · " + x.time : "")));
        it.appendChild(bd);
        a.appendChild(it);
      });
    }
    const l = $("newsLocker");
    if (l) {
      l.innerHTML = "";
      l.classList.add("wa-chat");
      const list = (d.locker || []).slice().sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

      const top = el("div", "wa-top");
      top.appendChild(photoImg("/img/avatar.svg", "wa-top-av"));
      const tt = el("div", "wa-top-txt");
      tt.appendChild(el("b", "", "Actividad de tu liga"));
      tt.appendChild(el("span", "", "Vestuario"));
      top.appendChild(tt);
      l.appendChild(top);

      const body = el("div", "wa-body");
      const pin = el("div", "wa-pin");
      pin.appendChild(el("div", "wa-pin-head", "📌 Mensajes pineados"));
      const pinb = el("div", "wa-pin-txt");
      pinb.innerHTML = "<b>FORMATO de subasta:</b><br>Saco a subasta a JUGADOR 🔸 DINERO 🔸 ⭐⭐⭐<br><br><b>FORMATO de puja</b><br>JUGADOR 🔸 DINERO 🔸 ⭐⭐⭐";
      pin.appendChild(pinb);
      body.appendChild(pin);

      if (!list.length) body.appendChild(el("p", "muted small", "Sin actividad."));
      let lastDay = "";
      list.forEach((x) => {
        const dd = new Date(x.date || 0);
        const dk = isNaN(dd.getTime()) ? "" : dd.toISOString().slice(0, 10);
        if (dk && dk !== lastDay) {
          lastDay = dk;
          body.appendChild(el("div", "wa-day", fmtDia(x.date)));
        }
        const msg = el("div", "wa-msg");
        msg.appendChild(photoImg(x.p || DEFAULT_AVATAR, "wa-avatar"));
        const bub = el("div", "wa-bubble");
        const head = el("div", "wa-head");
        const nm = el("span", "wa-name", x.n || "Liga");
        nm.style.color = waColor(x.n || "Liga");
        head.appendChild(nm);
        head.appendChild(el("span", "wa-time", fmtHora(x.date)));
        bub.appendChild(head);
        const t = el("div", "wa-text");
        t.innerHTML = waBold(x.txt || "");
        bub.appendChild(t);
        msg.appendChild(bub);
        body.appendChild(msg);
      });
      l.appendChild(body);
    }
    renderInicioFeatured();
  }

  function renderInicioFeatured() {
    const box = $("inicioFeatured");
    if (!box) return;
    const list = (lastNews && lastNews.noticias) || [];
    if (!list.length) { box.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i></div>'; return; }
    box.innerHTML = "";
    const open = (x) => { switchTab("noticias"); openNoticiaInline(x.link, x.title); };
    const hero = list[0];
    const h = el("div", "feat-hero");
    h.addEventListener("click", () => open(hero));
    const him = el("img"); him.alt = ""; him.loading = "lazy"; him.src = hero.thumb || "/img/balon.svg";
    him.addEventListener("error", () => { him.src = "/img/balon.svg"; }, { once: true });
    h.appendChild(him);
    const hov = el("div", "feat-hero-overlay");
    hov.appendChild(el("div", "feat-hero-title", hero.title));
    hov.appendChild(el("div", "feat-hero-date", (hero.date || "") + (hero.time ? " · " + hero.time : "")));
    h.appendChild(hov);
    box.appendChild(h);
    const sub = el("div", "feat-sub");
    list.slice(1, 3).forEach((x) => {
      const it = el("div", "feat-card-sm");
      it.addEventListener("click", () => open(x));
      const im = el("img"); im.alt = ""; im.loading = "lazy"; im.src = x.thumb || "/img/balon.svg";
      im.addEventListener("error", () => { im.src = "/img/balon.svg"; }, { once: true });
      it.appendChild(im);
      const ov = el("div", "feat-card-sm-overlay");
      ov.appendChild(el("div", "feat-card-sm-title", x.title));
      ov.appendChild(el("div", "feat-card-sm-date", (x.date || "") + (x.time ? " · " + x.time : "")));
      it.appendChild(ov);
      sub.appendChild(it);
    });
    box.appendChild(sub);
  }

  async function loadNoticias() {
    try {
      const d = await (await fetch(API + "/noticias")).json();
      renderNews(d);
    } catch (e) {}
    updateNewsFilter();
    const b = $("newsMine");
    if (b && !b.dataset.wired) {
      b.dataset.wired = "1";
      b.addEventListener("click", () => { newsMineOnly = !newsMineOnly; updateNewsFilter(); if (lastNews) renderNews(lastNews); });
    }
  }

  function lockScroll(on) {
    try {
      const root = document.documentElement, b = document.body;
      if (on) { root.classList.add("no-scroll"); b.classList.add("no-scroll"); }
      else { root.classList.remove("no-scroll"); b.classList.remove("no-scroll"); }
    } catch (e) {}
  }
  function showModal(node) {
    const body = $("fichaBody");
    if (!body) return;
    body.innerHTML = "";
    body.appendChild(node);
    const ov = $("fichaOverlay");
    if (ov) ov.classList.remove("hidden");
    lockScroll(true);
  }
  function closeModal() {
    const ov = $("fichaOverlay");
    if (ov) ov.classList.add("hidden");
    lockScroll(false);
    try { if (history.state && history.state.ficha) history.back(); } catch (e) {}
  }

  function openNoticia(url, title) {
    const w = el("div");
    w.appendChild(el("h2", "ficha-name", "Cargando noticia…"));
    showModal(w);
    fetch(API + "/noticia?u=" + encodeURIComponent(url || ""))
      .then((r) => r.json())
      .then((d) => {
        const c = el("div");
        c.appendChild(el("h2", "ficha-name", title || d.title || ""));
        if (d.lead) c.appendChild(el("p", "art-lead", d.lead));
        if (d.html) {
          const art = el("div", "art-body");
          art.innerHTML = d.html;
          c.appendChild(art);
        } else {
          c.appendChild(el("p", "muted small", "No pude extraer el texto de esta noticia."));
          if (url) { const a = el("a", "cmp-trend up", "Ver en FutbolFantasy →"); a.href = url; a.target = "_blank"; a.rel = "noopener"; c.appendChild(a); }
        }
        showModal(c);
      })
      .catch(() => {
        const c = el("div");
        c.appendChild(el("h2", "ficha-name", title || ""));
        c.appendChild(el("p", "muted small", "No se pudo cargar la noticia."));
        showModal(c);
      });
  }

  function openNoticiaInline(url, title) {
    const box = $("noticiaView");
    if (!box) return;
    const list = $("newsAnuncios");
    const h3 = document.querySelector("#tab-noticias .estado-title");
    box.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i></div>';
    box.classList.remove("hidden");
    if (list) list.classList.add("hidden");
    if (h3) h3.classList.add("hidden");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
    fetch(API + "/noticia?u=" + encodeURIComponent(url || ""))
      .then((r) => r.json())
      .then((d) => renderNoticiaInline(d, title, url))
      .catch(() => renderNoticiaInline({}, title, url));
  }
  function renderNoticiaInline(d, title, url) {
    const box = $("noticiaView");
    if (!box) return;
    box.innerHTML = "";
    const back = el("button", "btn-ghost noti-back", "← Volver a noticias");
    back.type = "button";
    back.addEventListener("click", closeNoticiaInline);
    box.appendChild(back);
    box.appendChild(el("h2", "ficha-name", title || d.title || ""));
    if (d.lead) box.appendChild(el("p", "art-lead", d.lead));
    if (d.html) {
      const art = el("div", "art-body");
      art.innerHTML = d.html;
      box.appendChild(art);
    } else {
      box.appendChild(el("p", "muted small", "No pude extraer el texto de esta noticia."));
      if (url) { const a = el("a", "cmp-trend up", "Ver en FutbolFantasy →"); a.href = url; a.target = "_blank"; a.rel = "noopener"; box.appendChild(a); }
    }
  }
  function closeNoticiaInline() {
    const box = $("noticiaView");
    if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
    const list = $("newsAnuncios");
    if (list) list.classList.remove("hidden");
    const h3 = document.querySelector("#tab-noticias .estado-title");
    if (h3) h3.classList.remove("hidden");
  }

  function openFicha(p) {
    if (p && p.id) { try { sessionStorage.setItem("scrollBack:" + location.pathname, String(window.scrollY || 0)); } catch (e) {} location.href = "/jugador/" + encodeURIComponent(p.id) + "/" + nameSlug(p.name); return; }
    const w = el("div");
    w.appendChild(el("p", "muted small", "Cargando ficha…"));
    showModal(w);
    try { history.pushState({ tab: currentTab, ficha: 1 }, "", location.href); } catch (e) {}
    fetch(API + "/jugador?id=" + encodeURIComponent(p.id || ""))
      .then((r) => r.json())
      .then((d) => showModal(renderFicha(d, p)))
      .catch(() => { const c = el("div"); c.appendChild(el("p", "muted small", "No se pudo cargar la ficha.")); showModal(c); });
  }
  window.addEventListener("popstate", () => {
    const ov = $("fichaOverlay"); if (ov) ov.classList.add("hidden");
    lockScroll(false);
    const st = history.state;
    if (st && st.tab && !st.ficha && st.tab !== currentTab) switchTab(st.tab, true);
  });

  function ptClass(p) { p = Number(p) || 0; return p < 0 ? "lo" : p < 6 ? "mid" : "hi"; }
  const whenShort = (v) => { if (!v) return ""; try { return new Date(v).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }); } catch (e) { return ""; } };
  function shortRival(s) { return String(s || "").trim(); }

  function renderParticipacion(par, status) {
    const box = el("div", "dash");
    const card = el("div", "dash-card");
    card.appendChild(el("div", "dash-kicker", "Participación"));
    card.appendChild(el("h3", "dash-title", "Minutos y titularidades"));
    const legend = el("div", "dash-legend");
    const lg = (cls, txt) => { const s = el("span", "dash-lg"); s.appendChild(el("i", "dot " + cls)); s.appendChild(el("span", null, txt)); return s; };
    legend.appendChild(lg("blue", "90' Completos"));
    legend.appendChild(lg("green", "Titular sustituido"));
    legend.appendChild(lg("yellow", "Desde banquillo"));
    legend.appendChild(el("span", "dash-media", "— Media: " + (Number(par.avgMin) || 0).toFixed(1).replace(".", ",") + "'"));
    card.appendChild(legend);
    const chart = el("div", "dash-chart");
    const yax = el("div", "dash-yaxis");
    ["90", "60", "30", "0"].forEach((v) => yax.appendChild(el("span", null, v)));
    chart.appendChild(yax);
    const byR = {}; (par.byJornada || []).forEach((x) => { byR[x.r] = x; });
    const n = Number(par.jornada) || 0;
    const avg = el("div", "dash-avg");
    avg.style.bottom = Math.min(100, ((Number(par.avgMin) || 0) / 90) * 100) + "%";
    chart.appendChild(avg);
    const bars = el("div", "dash-bars");
    for (let j = 1; j <= n; j++) {
      const c = byR[j];
      const col = el("div", "dash-col");
      const bw = el("div", "dash-barwrap");
      if (c && c.cat && c.cat !== "none") {
        const b = el("div", "dash-bar " + c.cat);
        b.style.height = Math.max(6, Math.min(100, ((Number(c.mins) || 0) / 90) * 100)) + "%";
        const det = c.cat === "completo" ? "Titular · 90'" : c.cat === "sustituido" ? "Titular · cambio " + c.mins + "'" : "Desde banquillo · " + c.mins + "'";
        b.title = "J" + j + " · " + det;
        b.appendChild(el("span", "dash-min", (Number(c.mins) || 0) + "'"));
        bw.appendChild(b);
      } else {
        bw.appendChild(el("div", "dash-bar none"));
      }
      col.appendChild(bw);
      col.appendChild(el("span", "dash-x", "J" + j));
      bars.appendChild(col);
    }
    chart.appendChild(bars);
    card.appendChild(chart);
    box.appendChild(card);

    box.appendChild(el("div", "dash-sect", "Estadísticas de interés"));
    const grid = el("div", "dash-grid");
    const mcard = (title, big, sub, bar, barcls, ico, icocls) => {
      const c = el("div", "dash-m");
      const hd = el("div", "dash-mh"); hd.appendChild(el("span", "dash-mt", title)); if (ico) hd.appendChild(el("span", "dash-ico " + icocls, ico)); c.appendChild(hd);
      const b = el("div", "dash-mb"); b.appendChild(el("b", null, big)); if (sub) b.appendChild(el("span", "dash-ms", sub)); c.appendChild(b);
      if (bar != null) { const pb = el("div", "dash-pb"); const f = el("span", "dash-pf" + (barcls ? " " + barcls : "")); f.style.width = Math.min(100, bar) + "%"; pb.appendChild(f); c.appendChild(pb); }
      return c;
    };
    grid.appendChild(mcard("Titularidades", par.starts + "/" + par.played, par.pctStart + "%", par.pctStart, "green", "✓", "green"));
    grid.appendChild(mcard("Participación", par.played + " de " + par.jornada, "encuentros", par.jornada ? (par.played / par.jornada) * 100 : 0, "blue", "+", "blue"));
    grid.appendChild(mcard("Minutos Totales", par.totalMin + " min", "de " + par.maxMin + " min posibles (" + par.pctMin + "%)", null, null, "⏱", "purple"));
    box.appendChild(grid);

    box.appendChild(el("div", "dash-sect", "Disponibilidad & disciplina"));
    const av = el("div", "dash-avail");
    const acell = (lab, val, sub) => { const c = el("div", "dash-a"); c.appendChild(el("div", "dash-al", lab)); c.appendChild(el("div", "dash-av", String(val))); c.appendChild(el("div", "dash-as", sub)); return c; };
    const inj = status && String(status).indexOf("injured") === 0;
    const sanct = (Number(par.reds) || 0) + (status === "redcard" ? 1 : 0);
    av.appendChild(acell("Banquillo", par.bench, "Entró " + par.bench + " " + (par.bench === 1 ? "vez" : "veces")));
    av.appendChild(acell("Sanciones", sanct, sanct ? "Sancionado" : "Limpio"));
    av.appendChild(acell("Lesiones", inj ? 1 : 0, inj ? "Lesionado" : "100% apto"));
    box.appendChild(av);
    return box;
  }

  function renderFicha(d, p) {
    const root = el("div", "ficha");
    const colA = el("div", "ficha-side ficha-side-a"), colB = el("div", "ficha-side ficha-side-b");

    // Caja de estado (como Comuniate): "ESTADO DEL JUGADOR / En forma".
    const stat = String(d.status || p.status || "");
    const bad = stat === "redcard" || stat.indexOf("injured") === 0;
    const warn = stat === "doubt";
    const sb = el("div", "pp-status" + (bad ? " bad" : warn ? " warn" : ""));
    sb.appendChild(el("span", "pp-status-ico", bad ? "✕" : warn ? "?" : "✓"));
    const stx = el("div", "pp-status-tx");
    stx.appendChild(el("div", "pp-status-k", "ESTADO DEL JUGADOR"));
    stx.appendChild(el("div", "pp-status-v", statusLabel(stat)));
    sb.appendChild(stx);
    colA.appendChild(sb);
    const head = el("div", "ficha-head-center");
    const ph = el("div", "mcard-photo");
    ph.appendChild(posRing(photoImg(d.photo || p.photo, "mcard-img"), d.role || p.role, d.role2 || p.role2));
    const rb = roleBadge(d.role || p.role), rb2 = roleBadge(d.role2 || p.role2);
    if (rb) ph.appendChild(el("span", "mcard-role" + (rb2 ? " multi" : "") + " posb posb-" + posCls(p.role), rb + (rb2 ? " · " + rb2 : "")));
    const fst = statusInfo(d.status || p.status);
    if (fst) ph.appendChild(el("span", "mcard-badge " + fst.cls, fst.label));
    head.appendChild(ph);
    head.appendChild(el("h2", "ficha-name", d.name || p.name || ""));
    const teamName = d.team || p.team || "";
    const teamLogo = d.logo || p.logo || "";
    const ageN = Number(d.age || p.age) || 0;
    const ageTxt = ageN ? (ageN + " años") : "";
    if (ageTxt || teamName || teamLogo) {
      const tt = el("div", "ficha-team");
      if (teamLogo) { const lg = el("img"); lg.src = teamLogo; lg.alt = ""; lg.loading = "lazy"; tt.appendChild(lg); clubLink(lg, teamName); }
      if (ageTxt) tt.appendChild(el("span", null, ageTxt + (teamName ? " · " : "")));
      if (teamName) tt.appendChild(clubLink(el("span", null, teamName), teamName));
      head.appendChild(tt);
    }
    // Demarcación: píldora ancha con la posición principal + chips de las secundarias
    {
      const ROLE_AB = { portero: "PT", defensa: "DF", centrocampista: "MC", delantero: "DL" };
      const r1 = String(d.role || p.role || "").toLowerCase(), r2 = String(d.role2 || p.role2 || "").toLowerCase();
      if (r1) {
        const dm = el("div", "ficha-dem");
        const bar = el("div", "ficha-dem-bar");
        const m1 = el("div", "ficha-dem-main posb-" + posCls(r1));
        m1.appendChild(el("span", "ficha-dem-ab", ROLE_AB[r1] || ""));
        m1.appendChild(el("span", null, roleFull(r1)));
        bar.appendChild(m1);
        if (r2) bar.appendChild(el("div", "ficha-dem-sec posb-" + posCls(r2), ROLE_AB[r2] || ""));
        dm.appendChild(bar);
        head.appendChild(dm);
      }
    }
    // Próximos 4 partidos (se rellenan al llegar los datos de las jornadas)
    const fixBox = el("div", "ficha-fix");
    fixBox.appendChild(el("div", "ficha-fix-k", "Próximos partidos"));
    const fixRow = el("div", "ficha-fix-row");
    fixBox.appendChild(fixRow);
    head.appendChild(fixBox);
    (async () => {
      const cur = Number(d.jornada) || Number(p.jornadaFf) || 0;
      if (!cur) { fixBox.remove(); return; }
      const nrm = (x) => stripAccents(String(x || "")).replace(/[^a-z0-9 ]/g, "").trim();
      const sameT = (a1, b1) => { const x = nrm(a1), y = nrm(b1); return !!x && !!y && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0); };
      const rs = await Promise.all([0, 1, 2, 3, 4, 5].filter((k) => cur + k <= 38).map((k) => fetch(API + "/jornada?jornada=" + (cur + k)).then((r) => r.json()).then((j) => ({ k, j })).catch(() => ({ k, j: {} }))));
      const out = [];
      rs.forEach((r) => (r.j.matches || []).forEach((m) => {
        if (m.live || out.length >= 4) return;
        const home = sameT(m.home, teamName), away = sameT(m.away, teamName);
        if (home || away) out.push({ j: cur + r.k, home, crest: home ? m.awayCrest : m.homeCrest, rival: home ? m.away : m.home, day: m.day, date: m.date, time: m.time });
      }));
      if (!out.length) { fixBox.remove(); return; }
      out.forEach((n) => {
        const c = el("div", "ficha-fix-it");
        const top = el("div", "ffx-top");
        top.appendChild(el("span", "ffx-j", "J" + n.j));
        top.appendChild(haIcon(n.home));
        c.appendChild(top);
        const mid = el("div", "ffx-mid");
        if (n.crest) { const im = el("img"); im.src = n.crest; im.alt = ""; im.loading = "lazy"; mid.appendChild(im); }
        mid.appendChild(el("b", "ffx-rival", n.rival || ""));
        c.appendChild(mid);
        const when = [n.day, n.date].filter(Boolean).join(" ");
        c.appendChild(el("div", "ffx-d", when + (n.time ? " · " + n.time : "")));
        fixRow.appendChild(c);
      });
    })();
    head.appendChild(el("div", "ficha-val", money(d.value || p.value) + " €"));
    const chg = Number(d.change != null ? d.change : p.change) || 0;
    head.appendChild(el("div", "cmp-trend " + (chg > 0 ? "up" : chg < 0 ? "down" : "flat"),
      chg > 0 ? "▲ " + formatDots(chg) + " €" + pct(d.value || p.value, chg) : chg < 0 ? "▼ " + formatDots(-chg) + " €" + pct(d.value || p.value, chg) : "—"));
    if (d.pronostico) { const pr = el("div", "ficha-pron", "Pronóstico: " + d.pronostico); if (p.prob != null) pr.appendChild(el("span", "ficha-pron-pct", p.prob + "%")); head.appendChild(pr); }
    if (d.fichaje && d.fichaje.date) head.appendChild(el("div", "ficha-fichaje", "🖊️ Fichado: " + d.fichaje.date + (d.fichaje.club ? " · " + d.fichaje.club : "")));
    colA.appendChild(head);

    const stats = el("div", "ficha-stats");
    const st = (label, val) => { const c = el("div", "ficha-stat"); c.appendChild(el("div", "fs-val", String(val))); c.appendChild(el("div", "fs-lab", label)); stats.appendChild(c); };
    st("Puntos", d.points || 0);
    st("Media", String(Math.round((Number(d.average) || 0) * 10) / 10).replace(".", ","));
    st("Partidos", d.matches5 || 0);
    colA.appendChild(stats);
    if (d.participacion) colA.appendChild(renderParticipacion(d.participacion, d.status || p.status));


    const colL = el("div", "ficha-col");
    const colR = el("div", "ficha-col");

    const fit = (d.fitness || []).map((x) => Number(x) || 0);
    const ms = d.matches || [];
    const j0 = Number(d.jornada) || 0;
    if (ms.length || fit.length) {
      colL.appendChild(el("div", "estado-title", "Puntos por jornada (Futmondo Social)"));
      const tbl = el("div", "ficha-matches");
      const valByR = {}, rivals = {};
      ms.forEach((m, k) => { if (k < fit.length) valByR[m.r] = Math.round(fit[fit.length - 1 - k]); rivals[m.r] = m; });
      const topJ = j0 || Math.max.apply(null, ms.map((x) => x.r).concat([0]));
      for (let j = topJ; j >= 1; j--) {
        const row = el("div", "fm-row");
        row.appendChild(el("span", "fm-j", "J" + j));
        const m = rivals[j];
        if (m) {
          const rival = (m.home === d.team) ? m.away : (m.away === d.team ? m.home : (m.away || m.home || ""));
          const casa = m.home === d.team;
          { const mt = el("span", "fm-match"); if (rival) { mt.appendChild(haIcon(casa)); mt.appendChild(document.createTextNode(" " + rival)); } row.appendChild(mt); }
          const mn = Number(m.mins) || 0;
          let tg = "", tgCls = "";
          if (mn > 0) {
            if (m.sub) { tg = "▲ entró " + mn + "'"; tgCls = "fm-in"; }
            else if (mn >= 85) { tg = "90'"; }
            else { tg = "▼ salió " + mn + "'"; tgCls = "fm-out"; }
          }
          row.appendChild(el("span", "fm-tag " + tgCls, tg));
          const v = valByR[j] != null ? valByR[j] : null;
          const stPts = Number(m.stats) || 0;
          const pts = v != null ? String(v) : (stPts !== 0 ? String(stPts) : "—");
          row.appendChild(el("span", "fm-pts " + (v != null ? "pt-" + ptClass(v) : "pt-st"), pts));
        } else {
          const nj = el("span", "fm-match fm-nojugo", "No jugó");
          row.appendChild(nj);
          row.appendChild(el("span", "fm-tag", ""));
          const njPts = el("span", "fm-pts", "—");
          row.appendChild(njPts);
          if (j === topJ && d.team) { // ¿de verdad no jugó, o su partido aún no ha acabado?
            fetch(API + "/jornada?jornada=" + j).then((r) => r.json()).then((jj) => {
              const tc = teamCanon(d.team);
              const mm = (jj.matches || []).find((x) => teamCanon(x.home) === tc || teamCanon(x.away) === tc);
              if (!mm || (mm.live && mm.live.state === "final")) return;
              nj.classList.remove("fm-nojugo"); nj.classList.add("fm-pend");
              if (mm.live && mm.live.state === "live") {
                nj.textContent = "En juego" + (mm.live.minute ? " · " + mm.live.minute : "");
                njPts.textContent = "●"; njPts.className = "fm-pts fm-live"; njPts.title = "Partido en juego";
              } else {
                let dia = "";
                try {
                  const q = String(mm.date || "").split("/").map(Number), now = new Date();
                  if (q.length >= 2 && q[0] && q[1]) {
                    let dt = new Date(now.getFullYear(), q[1] - 1, q[0]);
                    if (dt.getTime() < now.getTime() - 180 * 864e5) dt = new Date(now.getFullYear() + 1, q[1] - 1, q[0]);
                    dia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][dt.getDay()] + " " + q[0] + "/" + q[1];
                  }
                } catch (e) {}
                nj.textContent = dia ? "Se juega el " + dia + (mm.time ? " · " + mm.time : "") : "Aún no se ha jugado" + (mm.time ? " · " + mm.time : "");
              }
            }).catch(() => {});
          }
        }
        tbl.appendChild(row);
      }
      colL.appendChild(tbl);
    }

    const vals = d.valores || [];
    if ((vals.length && vals.some((x) => x.v != null)) || (d.temporada && d.temporada.n >= 2)) {
      colR.appendChild(el("div", "estado-title", "Valor de mercado"));
      if (d.temporada && d.temporada.n >= 2) {
        const tt = d.temporada;
        const tup = tt.diff >= 0;
        const srow = el("div", "fv-season");
        srow.appendChild(el("span", "fvs-label", "Temporada"));
        srow.appendChild(el("span", "fvs-diff " + (tup ? "up" : "down"), (tup ? "▲ +" : "▼ −") + formatDots(Math.abs(tt.diff)) + " € (" + (tup ? "+" : "−") + Math.abs(tt.pct).toFixed(1).replace(".", ",") + "%)"));
        srow.appendChild(el("span", "fvs-range", tt.desde + " → " + tt.hasta));
        colR.appendChild(srow);
      }
      const serie = (d.temporada && d.temporada.serie) || [];
      let streak = 0, ssign = 0;
      for (let i = serie.length - 1; i > 0; i--) {
        const dd = Number(serie[i].v) - Number(serie[i - 1].v);
        if (dd === 0) break;
        const s = dd > 0 ? 1 : -1;
        if (ssign === 0) ssign = s;
        if (s !== ssign) break;
        streak++;
      }
      if (streak > 0) {
        colR.appendChild(el("div", "fv-streak " + (ssign > 0 ? "up" : "down"),
          (ssign > 0 ? "📈 Lleva " : "📉 Lleva ") + streak + " día" + (streak === 1 ? "" : "s") + (ssign > 0 ? " subiendo" : " bajando")));
      }
      const valsSeries = serie.length >= 2 ? serie.map((x) => x.v) : vals.filter((x) => x.v != null).reverse().map((x) => x.v);
      if (valsSeries.length >= 2) {
        const W = 520, H = 220, pl = 48, pr = 10, pt = 12, pb = 26;
        const maxv = Math.max.apply(null, valsSeries);
        const minv = Math.min.apply(null, valsSeries);
        const nn = valsSeries.length;
        const xf = (i) => pl + (i / (nn - 1)) * (W - pl - pr);
        const yf = (v) => H - pb - ((v - minv) / Math.max(1, maxv - minv)) * (H - pt - pb);
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        svg.setAttribute("class", "ficha-chart");
        const steps = 4;
        for (let k = 0; k <= steps; k++) {
          const v = minv + (maxv - minv) * (k / steps);
          const yy = yf(v);
          const gl = document.createElementNS(svgNS, "line");
          gl.setAttribute("x1", pl); gl.setAttribute("x2", W - pr); gl.setAttribute("y1", yy.toFixed(1)); gl.setAttribute("y2", yy.toFixed(1));
          gl.setAttribute("stroke", "rgba(255,255,255,0.10)");
          svg.appendChild(gl);
          const tl = document.createElementNS(svgNS, "text");
          tl.setAttribute("x", pl - 6); tl.setAttribute("y", (yy + 3).toFixed(1));
          tl.setAttribute("text-anchor", "end"); tl.setAttribute("class", "fx-lab");
          tl.textContent = (v / 1000000).toFixed(0) + "M";
          svg.appendChild(tl);
        }
        const nlab = 7;
        for (let k = 0; k < nlab; k++) {
          const i = Math.round((k / (nlab - 1)) * (nn - 1));
          const tl = document.createElementNS(svgNS, "text");
          tl.setAttribute("x", xf(i).toFixed(1)); tl.setAttribute("y", H - 8);
          tl.setAttribute("text-anchor", "middle"); tl.setAttribute("class", "fx-lab");
          tl.textContent = (serie.length >= 2 && serie[i]) ? serie[i].d : "";
          svg.appendChild(tl);
        }
        const dLine = valsSeries.map((v, i) => (i ? "L" : "M") + xf(i).toFixed(1) + " " + yf(v).toFixed(1)).join(" ");
        const area = document.createElementNS(svgNS, "path");
        area.setAttribute("d", dLine + " L" + xf(nn - 1).toFixed(1) + " " + (H - pb) + " L" + xf(0).toFixed(1) + " " + (H - pb) + " Z");
        area.setAttribute("fill", "rgba(34,197,94,0.12)");
        svg.appendChild(area);
        const pa = document.createElementNS(svgNS, "path");
        pa.setAttribute("d", dLine);
        pa.setAttribute("fill", "none");
        pa.setAttribute("stroke", "#22c55e");
        pa.setAttribute("stroke-width", "2.5");
        pa.setAttribute("stroke-linejoin", "round");
        svg.appendChild(pa);
        colR.appendChild(svg);
      }
      if (serie.length >= 2) {
        const thead = el("div", "fv-thead");
        thead.appendChild(el("span", null, "Fecha"));
        thead.appendChild(el("span", null, "Subida/Bajada"));
        thead.appendChild(el("span", null, "Valor"));
        colR.appendChild(thead);
        const tb = el("div", "fv-table");
        for (let i = serie.length - 1; i >= 0; i--) {
          const cur = serie[i], prev = serie[i - 1];
          const diff = prev ? cur.v - prev.v : null;
          const pv = prev && prev.v ? (diff / prev.v) * 100 : null;
          const row = el("div", "fv-trow");
          row.appendChild(el("span", "fv-td", cur.d));
          row.appendChild(el("span", "fv-td " + (diff > 0 ? "up" : diff < 0 ? "down" : ""),
            diff == null ? "—" : (diff >= 0 ? "+" : "−") + formatDots(Math.abs(diff)) + (pv != null ? " (" + (pv >= 0 ? "+" : "−") + Math.abs(pv).toFixed(2).replace(".", ",") + "%)" : "")));
          row.appendChild(el("span", "fv-td fv-tval", money(cur.v) + " €"));
          tb.appendChild(row);
        }
        colR.appendChild(tb);
      }
    }
    const temp = d.temporadas || [];
    if (temp.length) {
      colR.appendChild(el("div", "estado-title", "Temporadas anteriores"));
      const t = el("div", "ficha-vals");
      temp.forEach((x) => {
        const r = el("div", "fv-row");
        r.appendChild(el("span", "fv-label", x.season));
        r.appendChild(el("span", "fv-diff", x.points + " pts" + (x.games ? " · " + x.games + " part." : "")));
        const tv = el("span", "fv-val");
        if (x.logo) { const lg = el("img", "fv-crest"); lg.src = x.logo; lg.alt = ""; lg.loading = "lazy"; tv.appendChild(lg); }
        if (x.team) tv.appendChild(el("span", null, x.team));
        r.appendChild(tv);
        t.appendChild(r);
      });
      colR.appendChild(t);
    }
    colA.appendChild(colL); colB.appendChild(colR);
    root.appendChild(colA); root.appendChild(colB);
    // Últimas noticias sobre el jugador (abajo del todo)
    {
      const nm = d.name || p.name || "";
      const sec = el("section", "ficha-news");
      root.appendChild(sec);
      (async () => {
        let list = (lastNews && lastNews.noticias) || null;
        if (!list) { try { list = ((await (await fetch(API + "/noticias")).json()) || {}).noticias || []; } catch (e) { list = []; } }
        const hit0 = list.filter((x) => newsMentions(x.title, nm, d.team || p.team || ""));
        let hit = hit0;
        hit = hit.slice(0, 3);
        if (!hit.length) { sec.remove(); return; }
        sec.appendChild(el("h3", "ficha-news-h", "Últimas noticias sobre " + nm));
        const g = el("div", "ficha-news-grid");
        hit.forEach((x) => {
          const a1 = el("a", "ficha-news-it"); a1.href = x.link || "#"; a1.target = "_blank"; a1.rel = "noopener";
          const im = el("img"); im.alt = ""; im.loading = "lazy"; im.src = x.thumb || "/img/balon.svg";
          im.addEventListener("error", () => { im.src = "/img/balon.svg"; }, { once: true });
          a1.appendChild(im);
          const t = el("div", "ficha-news-t"); t.appendChild(el("span", null, x.title || "")); t.appendChild(el("small", null, (x.date || "") + (x.time ? " · " + x.time : ""))); a1.appendChild(t);
          g.appendChild(a1);
        });
        sec.appendChild(g);
      })();
    }
    return root;
  }

  // ---------- Páginas de club (/equipos y /equipos/<club>) ----------
  function teamSlug(n) { return stripAccents(String(n || "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function eqOpen() {
    const main = document.querySelector(".quiniela-main");
    if (!main) return null;
    main.classList.add("mpage-open");
    // La barra Inicio / Noticias / Mercado… se queda arriba también en las páginas de clubes.
    document.querySelectorAll(".cx-sub").forEach((e) => e.classList.remove("hidden"));
    document.querySelectorAll("#tabsNav .tab").forEach((e) => e.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((e) => e.classList.add("hidden"));
    const ch = $("cxChrome"); if (ch) ch.classList.add("hidden");
    const box = el("section", "panel mpage eq-page");
    main.appendChild(box);
    return box;
  }
  function eqBack(box) {
    const bar = el("div", "eq-backbar");
    bar.appendChild(backBtn("/equipos"));
    const a = el("a", "eq-back", "Todos los equipos");
    a.href = "/equipos";
    bar.appendChild(a);
    box.appendChild(bar);
  }
  async function eqTeams() {
    const d = await (await fetch(API + "/equipos")).json();
    return (d && d.teams) || [];
  }
  function eqMoney(v) { v = Number(v) || 0; return v >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(".", ",") + " M€" : money(v) + " €"; }
  function eqFacts(tc) {
    const sq = (all || []).filter((p) => teamCanon(p.team) === tc);
    let val = 0, bajas = 0, dudas = 0, racha = 0;
    sq.forEach((p) => {
      val += Number(p.value) || 0;
      const st = String(p.status || "");
      if (st === "redcard" || st.indexOf("injured") === 0) bajas++; else if (st === "doubt") dudas++;
      const f = (p.fitness || []).slice(-3);
      if (f.length === 3 && f.every((x) => Number(x) > 0)) racha++;
    });
    return { n: sq.length, val, bajas, dudas, racha };
  }
  async function renderTeamsIndex() {
    const box = eqOpen(); if (!box) return;
    const hero = el("div", "eqi-hero");
    hero.appendChild(el("h2", "eq-h1", "Equipos"));
    hero.appendChild(el("p", "eqi-sub", "Toca un club para ver su partido y su plantilla."));
    const inp = el("input", "market-search eqi-search"); inp.placeholder = "Buscar club…"; inp.autocomplete = "off";
    hero.appendChild(inp);
    box.appendChild(hero);
    const grid = el("div", "eq-grid");
    box.appendChild(grid);
    let teams = [];
    try { teams = await eqTeams(); } catch (e) {}
    if (!teams.length) { grid.appendChild(el("p", "muted small", "No se pudieron cargar los equipos.")); return; }
    if (!all || !all.length) { try { await load(); } catch (e) {} }
    const tiles = [];
    teams.slice().sort((a, b) => a.name.localeCompare(b.name, "es")).forEach((t) => {
      const a = el("a", "eq-tile");
      a.href = "/equipos/" + teamSlug(t.name);
      const cw = el("span", "eq-tile-cw");
      if (t.logo) { const im = el("img"); im.src = t.logo; im.alt = ""; im.loading = "lazy"; cw.appendChild(im); }
      a.appendChild(cw);
      const tx = el("span", "eq-tile-tx");
      tx.appendChild(el("b", null, t.name));
      const f = eqFacts(teamCanon(t.name));
      if (f.n) tx.appendChild(el("small", null, f.n + " jugadores · " + eqMoney(f.val)));
      a.appendChild(tx);
      a.appendChild(el("span", "eq-tile-go", "›"));
      a.dataset.n = stripAccents(t.name);
      grid.appendChild(a); tiles.push(a);
    });
    const empty = el("p", "muted small eq-empty", "Ningún club se llama así."); empty.hidden = true; box.appendChild(empty);
    inp.addEventListener("input", () => {
      const q = stripAccents(inp.value.trim()); let n = 0;
      tiles.forEach((a) => { const ok = !q || a.dataset.n.indexOf(q) >= 0; a.hidden = !ok; if (ok) n++; });
      empty.hidden = n > 0;
    });
  }
  async function renderTeamPage(slug) {
    const box = eqOpen(); if (!box) return;
    eqBack(box);
    const body = el("div", "eq-body");
    box.appendChild(body);
    body.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i></div>';
    let timer = null;
    const eqSq = { pos: "delantero", q: "", sort: "points" };
    const run = async (first) => {
      // Todo en paralelo (antes iba una cosa detrás de otra)
      const pTeams = eqTeams(), pAll = (!all || !all.length) ? load().catch(() => {}) : Promise.resolve(), pJr = fetch(API + "/jornada").then((r) => r.json());
      const teams = await pTeams;
      const team = teams.find((t) => teamSlug(t.name) === slug);
      if (!team) { if (first) body.innerHTML = '<p class="muted small">No se encontró ese equipo.</p>'; return false; }
      const tc = teamCanon(team.name);
      await pAll;
      const jr = await pJr;
      const cur = Number(jr && jr.matchday) || 0;
      const jrs = [{ n: cur, ms: (jr && jr.matches) || [] }];
      await Promise.all([cur - 1, cur + 1, cur + 2, cur + 3].filter((n) => n >= 1 && n <= 38).map(async (n) => {
        try { const j2 = await (await fetch(API + "/jornada?jornada=" + n)).json(); jrs.push({ n, ms: (j2 && j2.matches) || [] }); } catch (e) {}
      }));
      jrs.sort((a, b) => a.n - b.n);
      const mine = [];
      jrs.forEach((j) => j.ms.forEach((m) => { if (teamCanon(m.home) === tc || teamCanon(m.away) === tc) mine.push(Object.assign({ jn: j.n }, m)); }));
      const stOf = (m) => (m.live && m.live.state) || "";
      // Un partido suspendido/aplazado no es el "próximo partido": se muestra aparte en el calendario como "Aplazado".
      const upcoming = mine.filter((m) => stOf(m) !== "final" && stOf(m) !== "suspended");
      const postponed = mine.filter((m) => stOf(m) === "suspended");
      const played = mine.filter((m) => stOf(m) === "final");
      const next = upcoming[0] || null;
      const last = played[played.length - 1] || null;
      const squad = (all || []).filter((p) => teamCanon(p.team) === tc);
      const frag = document.createDocumentFragment();
      // Cabecera
      const hd = el("div", "eq-hero");
      // El logo de Futmondo es de solo 64 px y se ve borroso en grande: se usa el escudo de la fuente de partidos (football-data, nítido) si lo hay.
      let hiCrest = "";
      for (let q = 0; q < mine.length && !hiCrest; q++) hiCrest = (teamCanon(mine[q].home) === tc ? mine[q].homeCrest : mine[q].awayCrest) || "";
      // football-data también ofrece el escudo en vectorial (.svg): nítido a cualquier tamaño.
      const crestSvg = /crests\.football-data\.org\/.+\.png$/i.test(hiCrest) ? hiCrest.replace(/\.png$/i, ".svg") : "";
      const crestSrc = crestSvg || hiCrest || team.logo;
      if (crestSrc) { const bg = el("img", "eq-hero-bg"); bg.src = crestSrc; bg.alt = ""; hd.appendChild(bg); }
      if (crestSrc) { const im = el("img", "eq-crest"); im.src = crestSrc; im.alt = ""; let tried = 0; im.addEventListener("error", () => { tried++; if (tried === 1 && hiCrest && im.src !== hiCrest) im.src = hiCrest; else if (team.logo && im.src !== team.logo) im.src = team.logo; }); hd.appendChild(im); }
      const ht = el("div", "eq-htxt");
      ht.appendChild(el("h2", "eq-h1", team.name));
      const fx = eqFacts(tc);
      if (next) {
        const home = teamCanon(next.home) === tc;
        const rival = home ? next.away : next.home;
        const rcrest = home ? next.awayCrest : next.homeCrest;
        const liveNow = stOf(next) === "live";
        const nx = el("div", "eq-next");
        nx.appendChild(el("div", "eq-next-k", liveNow ? "● En juego ahora" : "Próximo partido"));
        const r1 = el("div", "eq-next-row");
        r1.appendChild(el("span", "eq-next-j", "J" + next.jn));
        r1.appendChild(haIcon(home));
        if (rcrest) { const im = el("img", "eq-next-crest"); im.src = rcrest; im.alt = ""; r1.appendChild(im); }
        r1.appendChild(el("b", "eq-next-rival", rival));
        nx.appendChild(r1);
        const r2 = el("div", "eq-next-when");
        r2.appendChild(el("span", "eq-chip", home ? "En casa" : "Fuera"));
        const dd = [next.day, next.date].filter(Boolean).join(" ");
        if (dd) r2.appendChild(el("span", "eq-chip", "📅 " + dd));
        if (next.time) r2.appendChild(el("span", "eq-chip", "🕒 " + next.time));
        nx.appendChild(r2);
        ht.appendChild(nx);
      }
      hd.appendChild(ht);
      frag.appendChild(hd);
      if (fx.n) {
        const stx = el("div", "eq-stats");
        [[eqMoney(fx.val), "valor plantilla", "", false], [String(fx.racha), "en racha ›", fx.racha ? "up" : "", true]].forEach((x) => {
          const go = x[3] && fx.racha > 0 && squad[0];
          const c = el(go ? "button" : "div", "eq-stat " + x[2] + (go ? " eq-stat-go" : ""));
          c.appendChild(el("b", null, x[0])); c.appendChild(el("small", null, go ? x[1] : x[1].replace(" ›", "")));
          if (go) {
            c.type = "button";
            c.title = "Ver los jugadores en racha de este equipo";
            c.addEventListener("click", () => {
              try { sessionStorage.setItem("pltState", JSON.stringify({ c: squad[0].team, p: "", s: "rise", d: -1, per: "chg7", n: 40 })); } catch (e) {}
              location.href = "/futmondo/guiafantasy/mercado";
            });
          }
          stx.appendChild(c);
        });
        frag.appendChild(stx);
      }
      // Alineación (probable / confirmada) del próximo partido, con el banquillo aparte
      if (next) {
        const sec = el("section", "eq-sec");
        const isHome = teamCanon(next.home) === tc;
        const name = isHome ? next.home : next.away;
        const crest = isHome ? next.homeCrest : next.awayCrest;
        const sub = isHome ? "vs " + next.away : "en " + next.home;
        const link = el("a", "eq-more", "Ver partido →");
        link.href = "/futmondo/guiafantasy/partido/" + matchSlug(next.home, next.away) + "?j=" + next.jn;
        if (stOf(next) === "live") {
          const h = el("div", "eq-sech"); h.appendChild(el("h3", null, "Partido en juego")); h.appendChild(link);
          sec.appendChild(h);
        } else {
          sec.appendChild(Object.assign(document.createElement("div"), { className: "mpage-skel", innerHTML: '<i class="h"></i>' }));
          (async () => {
          let side = null, kind = "", ff = null, conf = null, benchEl = null;
          try {
            const c = await (await fetch(API + "/alineaciones-confirmadas?jornada=" + next.jn, { cache: "no-store" })).json();
            const cm = findXiMatch((c && c.matches) || [], next.home, next.away);
            if (cm) conf = cm[isHome ? "home" : "away"];
          } catch (e) {}
          try {
            const o = await (await fetch(API + "/once?home=" + encodeURIComponent(next.home) + "&away=" + encodeURIComponent(next.away) + "&jornada=" + next.jn)).json();
            if (o && o.home && ((o.home.starters || []).length || (o.away.starters || []).length || (o.home.bench || []).length || (o.away.bench || []).length)) ff = o[isHome ? "home" : "away"];
          } catch (e) {}
          const sure = (o) => o && o.starters && o.starters.length >= 10 && o.starters.every((p) => p.prob === 100);
          if (conf) { side = conf; kind = "confirmada"; } else if (ff && (ff.starters || []).length) { side = ff; kind = sure(ff) && !(kickoffMs(next) && kickoffMs(next) - Date.now() > 3 * 3600 * 1000) ? "confirmada" : "probable"; }
          sec.replaceChildren();
          const h = el("div", "eq-sech");
          h.appendChild(el("h3", null, side ? (kind === "confirmada" ? "Alineación confirmada" : "Alineación probable") : "Alineación"));
          h.appendChild(link);
          sec.appendChild(h);
          if (side && window.EduAlineacion) {
            const wrap = el("div", "alin-pitches mpage-xipitches eq-pitch");
            let bn = (kind === "confirmada" ? (ff && ff.bench) : (side && side.bench)) || [];
            if (kind === "confirmada") {
              const fbn = await fmBenchFor(next, next.jn);
              if (fbn) { const x = fbn[isHome ? "home" : "away"]; if (x && x.length) bn = x; }
              wrap.appendChild(mpNewCard(side, name, crest, sub, "confirmed", xiPhotoMap(ff), []));
            } else wrap.appendChild(window.EduAlineacion.card(side, name, crest, sub, all, "probable", []));
            benchEl = bn.length && window.EduAlineacion.bench ? window.EduAlineacion.bench(bn, name, all, kind === "confirmada" ? "confirmed" : "probable") : null;
            sec.appendChild(wrap);
            if (benchEl) sec.appendChild(benchEl);
          } else {
            sec.appendChild(el("p", "muted small", "Aún no hay alineación publicada para este partido."));
          }
          })().catch(() => {});
        }
        frag.appendChild(sec);
      }
      // Calendario
      const cal = el("section", "eq-sec");
      cal.appendChild(el("div", "eq-sech")).appendChild(el("h3", null, "Calendario"));
      const rows = el("div", "eq-cal");
      const calList = [].concat(last ? [last] : [], postponed, upcoming.slice(0, 3)).sort((a, b) => { const rk = (m) => { const s2 = stOf(m); return s2 === "live" ? 0 : s2 === "final" ? 2 : 1; }; return rk(a) - rk(b) || (rk(a) === 2 ? b.jn - a.jn : a.jn - b.jn); }); // en juego, luego lo próximo, y al final lo ya jugado
      calList.forEach((m) => {
        const home = teamCanon(m.home) === tc;
        const st = stOf(m);
        const a = el("a", "eq-calrow" + (st === "final" ? " fin" : st === "live" ? " live" : ""));
        a.href = "/futmondo/guiafantasy/partido/" + matchSlug(m.home, m.away) + "?j=" + m.jn;
        a.appendChild(el("span", "eq-calj", "J" + m.jn));
        a.appendChild(haIcon(home));
        const c = el("img"); c.src = (home ? m.awayCrest : m.homeCrest) || ""; c.alt = ""; c.loading = "lazy";
        a.appendChild(c);
        a.appendChild(el("span", "eq-calrival", home ? m.away : m.home));
        const res = st === "suspended" ? "Aplazado" : st === "final" || st === "live" ? ((m.live && m.live.score) || "") : [m.day, m.date, m.time].filter(Boolean).join(" ");
        if (st === "live") { const tg = el("span", "eq-livetag"); tg.appendChild(el("i")); tg.appendChild(document.createTextNode("En juego")); a.appendChild(tg); }
        a.appendChild(el("span", "eq-calres", res));
        rows.appendChild(a);
      });
      if (!calList.length) rows.appendChild(el("p", "muted small", "Sin partidos próximos."));
      cal.appendChild(rows);
      frag.appendChild(cal);
      // Plantilla completa por posiciones (cada jugador es una fila entera tocable, con sus puntos de las últimas 5 jornadas)
      const plRow = (p) => {
        const r = el("a", "sq3-row");
        r.href = "/jugador/" + encodeURIComponent(p.id) + "/" + nameSlug(p.name);
        r.appendChild(photoImg(p.photo, "sq3-img"));
        const mid = el("div", "sq3-mid");
        const nm = el("div", "sq3-name"); nm.appendChild(el("b", null, p.name));
        const st = statusInfo(p.status); if (st) nm.appendChild(el("span", "sq3-st " + st.cls, p.status === "redcard" ? "Sancionado" : p.status === "doubt" ? "Duda" : "Lesión"));
        mid.appendChild(nm);
        mid.appendChild(el("div", "sq3-sub", [money(p.value) + " €", Number(p.avg) > 0 ? "Media " + Number(p.avg).toFixed(1).replace(".", ",") : "", p.prob != null ? p.prob + "% jugar" : ""].filter(Boolean).join(" · ")));
        const fit = (p.fitness || []).map((x) => Number(x) || 0);
        if (fit.length) {
          const sc = el("div", "sq3-pts");
          const j0 = (Number(p.jornadaFf) || 0) - 1;
          for (let k = 0; k < fit.length; k++) {
            const idx = fit.length - 1 - k, v = Math.round(fit[idx]);
            const j = jLab(p.team, fit.length, k, j0 > 0 ? j0 : 0);
            const cell = el("span", "sq3-pt " + (v >= 6 ? "hi" : v >= 4 ? "mid" : v > 0 ? "lo" : v < 0 ? "neg" : fitPlayed(p, idx) ? "z0" : "zero"));
            if (j > 0) cell.title = "Jornada " + j;
            cell.appendChild(el("i", null, j > 0 ? "J" + j : ""));
            cell.appendChild(el("b", null, v !== 0 ? String(v) : fitPlayed(p, idx) ? "0" : "–"));
            sc.appendChild(cell);
          }
          mid.appendChild(sc);
        }
        r.appendChild(mid);
        return r;
      };
      const sqS = el("section", "eq-sec sq3");
      sqS.appendChild(el("div", "eq-sech")).appendChild(el("h3", null, "Plantilla"));
      const GR = [["portero", "POR", "Portero"], ["defensa", "DEF", "Defensa"], ["centrocampista", "MC", "Centrocampista"], ["delantero", "DL", "Delantero"]].filter((g) => squad.some((p) => String(p.role || "").toLowerCase() === g[0]));
      if (GR.length && !GR.some((g) => g[0] === eqSq.pos)) eqSq.pos = GR[0][0];
      const bar = el("div", "sq4-bar"); bar.setAttribute("role", "tablist");
      const lst = el("div", "sq4-list");
      const paintSq = () => {
        bar.replaceChildren();
        GR.forEach((g) => {
          const on = eqSq.pos === g[0];
          const b = el("button", "sq4-seg sq4-" + g[1] + (on ? " on" : "")); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", on ? "true" : "false");
          b.appendChild(el("span", "sq4-code", g[1]));
          if (on) b.appendChild(el("b", null, g[2]));
          b.addEventListener("click", () => { eqSq.pos = g[0]; paintSq(); });
          bar.appendChild(b);
        });
        lst.replaceChildren();
        squad.filter((p) => String(p.role || "").toLowerCase() === eqSq.pos).sort((x, y) => (Number(y.points) || 0) - (Number(x.points) || 0)).forEach((p) => lst.appendChild(plRow(p)));
      };
      sqS.appendChild(bar); sqS.appendChild(lst);
      if (!squad.length) sqS.appendChild(el("p", "muted small", "Plantilla no disponible ahora mismo."));
      else paintSq();
      frag.appendChild(sqS);
      // Jugadores en racha (3 partidos seguidos puntuando)
      try {
        const hot = squad.filter((p) => { const f = (p.fitness || []).slice(-3); return f.length === 3 && f.every((x) => Number(x) > 0); })
          .sort((x, y) => { const m = (p) => (p.fitness || []).slice(-3).reduce((a, v) => a + Number(v), 0); return m(y) - m(x); });
        const rs = el("section", "eq-sec sq3");
        rs.appendChild(el("div", "eq-sech")).appendChild(el("h3", null, "🔥 Jugadores en racha"));
        if (!hot.length) rs.appendChild(el("p", "muted small", "Ningún jugador del club lleva 3 partidos seguidos puntuando."));
        hot.forEach((p) => rs.appendChild(plRow(p)));
        frag.appendChild(rs);
      } catch (e) {}
      // Pinta en el sitio (sin mover el scroll)
      const y = window.scrollY;
      body.innerHTML = "";
      body.appendChild(frag);
      window.scrollTo(0, y);
      return !!next && stOf(next) === "live";
    };
    let swrT = null;
    const onSwr = (ev) => {
      if (!document.body.contains(box)) { document.removeEventListener("cx:swr", onSwr); return; }
      const u = (ev.detail && ev.detail.url) || "";
      if (!/mercado|jornada|\/once|alineaciones-confirmadas|equipos/.test(u)) return;
      clearTimeout(swrT);
      swrT = setTimeout(() => { if (document.body.contains(box)) run(false).catch(() => {}); }, 300);
    };
    document.addEventListener("cx:swr", onSwr);
    try {
      const live = await run(true);
      timer = setInterval(() => {
        if (!document.body.contains(box)) { clearInterval(timer); return; }
        if (!document.hidden) run(false).catch(() => {});
      }, live ? 60000 : 300000);
    } catch (e) { body.innerHTML = '<p class="muted small">No se pudo cargar el equipo.</p>'; }
  }

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => { if (document.querySelector(".eq-page, .mpage, .playerpage, .livepage")) { location.href = "/futmondo/guiafantasy/" + (t.dataset.tab === "plantillas" ? "mercado" : t.dataset.tab); return; } switchTab(t.dataset.tab); }));
  setupMoreMenu();
  let pltInit = false, pltRetry = 0, pltClub = "", pltPos = "", pltSort = "points", pltPeriod = "chg7", pltDir = -1, pltShown = 40, pltPlayers = [];
  // En la ficha de jugador esto (14 peticiones de jornadas) se pide DESPUÉS de pintar, para no frenar la carga.
  if (!/\/jugador(?:es)?\/[a-z0-9]{6,40}/i.test(location.pathname)) ensurePlayedJ();
  (function restoreTab() {
    try { const pd = location.pathname.match(/\/guiafantasy\/directo\/([a-z0-9-]+)/); if (pd) { renderLivePage(pd[1]); return; } } catch (e) {}
    try { const pm = location.pathname.match(/\/guiafantasy\/partido\/([a-z0-9-]+)/); if (pm) { renderMatchPage(pm[1]); return; } } catch (e) {}
    try { const pe = location.pathname.match(/^\/equipos\/([a-z0-9-]+)/); if (pe) { renderTeamPage(pe[1]); return; } if (/^\/equipos\/?$/.test(location.pathname)) { renderTeamsIndex(); return; } } catch (e) {}
    try { const pj = location.pathname.match(/\/jugador(?:es)?\/([a-z0-9]{6,40})/i); if (pj) { renderPlayerPage(pj[1]); return; } } catch (e) {}
    let name = "";
    try {
      const m = location.pathname.match(/\/guiafantasy\/(inicio|mercado|fichajes|noticias|analiza|clausulazos|plantillas)/);
      if (m) name = m[1];
    } catch (e) {}
    if (!name) { try { name = sessionStorage.getItem("merc_tab") || ""; } catch (e) {} }
    if (name === "mercado") name = "plantillas";
    if (!name || !$("tab-" + name)) name = "inicio";
    switchTab(name, true);
  })();
  document.querySelectorAll(".merc-segbtn").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".merc-segbtn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    sortMode = b.dataset.sort;
    shown = 18;
    renderGrid();
  }));
  let anImg = null;
  function miniMd(t) {
    return String(t || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^#{1,6}\s*(.+)$/gm, "<strong>$1</strong>")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .split(/\n+/).filter((x) => x.trim()).map((ln) => "<p>" + ln.trim() + "</p>").join("");
  }

  let anData = null, anStale = false, anDrag = null;
  function openPicker(title, cb) {
    const root = el("div");
    root.appendChild(el("h2", "ficha-name", title || "Elegir jugador"));
    const inp = el("input", "market-search"); inp.placeholder = "Buscar jugador por nombre…"; inp.autocomplete = "off";
    root.appendChild(inp);
    const list = el("div", "pick-list");
    root.appendChild(list);
    const render = () => {
      const q = stripAccents(inp.value.trim());
      let arr = q ? all.filter((p) => stripAccents(p.name).includes(q)) : all.slice().sort((a, b) => b.value - a.value);
      list.innerHTML = "";
      arr.slice(0, 60).forEach((p) => {
        const row = el("button", "cmp-sugrow"); row.type = "button";
        const ph = el("span", "cmp-sugphoto"); ph.appendChild(photoImg(p.photo)); row.appendChild(ph);
        const bb = el("span", "cmp-sugbody");
        bb.appendChild(el("span", "cmp-sugname", p.name));
        bb.appendChild(el("span", "cmp-sugteam", p.team || ""));
        row.appendChild(bb);
        row.appendChild(el("span", "cmp-sugval", money(p.value) + " €"));
        row.addEventListener("click", () => { cb(p); closeModal(); });
        list.appendChild(row);
      });
      if (!arr.length) list.appendChild(el("p", "muted small", "Sin resultados."));
    };
    inp.addEventListener("input", render);
    showModal(root);
    render();
    inp.focus();
  }
  function toPlayer(pl, pos) {
    return {
      nombre: pl.name, pos: roleBadge(pl.role) || pos || "", equipo: pl.team || "",
      estado: statusLabel(pl.status), puntos: pl.points, valor: pl.value,
      fitness: pl.fitness || [], photo: pl.photo || "", casa: null, rival: "",
    };
  }
  function applyPlayer(target, pl) {
    Object.assign(target, toPlayer(pl, target.pos));
    anStale = true;
    renderAnalisis(anData);
  }
  function addPlayer(tipo, pl) {
    if (!anData) return;
    const arr = tipo === "suplente" ? (anData.suplentes = anData.suplentes || []) : (anData.titulares = anData.titulares || []);
    arr.push(toPlayer(pl));
    anStale = true;
    renderAnalisis(anData);
  }
  function flatPlayers(d) {
    const out = [];
    (d.titulares || []).forEach((p) => out.push({ nombre: p.nombre, pos: p.pos, tipo: "titular" }));
    (d.suplentes || []).forEach((p) => out.push({ nombre: p.nombre, pos: p.pos, tipo: "suplente" }));
    return out;
  }
  async function reanalizar() {
    if (!anData) return;
    const d = await runAnaliza({ jugadores: flatPlayers(anData) }, "Reanalizando…");
    if (d) { anStale = false; renderAnalisis(d); }
  }
  // Análisis en segundo plano: el servidor sigue trabajando aunque salgas de
  // la app; al volver se recoge el resultado (anJobPending en localStorage).
  let anPollT = null, anT0 = 0;
  function anStopPoll() { if (anPollT) { clearTimeout(anPollT); anPollT = null; } }
  function anShowRunning(prefijo) {
    const s = Math.round((Date.now() - anT0) / 1000); const m = $("anMsg");
    if (m) m.textContent = "🧠 " + prefijo + " " + s + " s · puedes salirte, seguirá trabajando y lo verás al volver";
  }
  function anPoll(prefijo, onDone) {
    anStopPoll();
    const tick = async () => {
      anShowRunning(prefijo);
      let j = null;
      try { const r = await fetch(API + "/analiza-estado", { cache: "no-store" }); j = await r.json(); } catch (e) { anPollT = setTimeout(tick, 3000); return; }
      if (j && j.status === "running") { anPollT = setTimeout(tick, 2500); return; }
      anStopPoll();
      try { localStorage.removeItem("anJobPending"); } catch (e) {}
      onDone(j);
    };
    tick();
  }
  async function runAnaliza(payload, prefijo) {
    anT0 = Date.now();
    anShowRunning(prefijo);
    const timer = setInterval(() => anShowRunning(prefijo), 1000);
    try {
      const r = await fetch(API + "/analiza?bg=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      clearInterval(timer);
      if (r.status === 200 && d.status === "done") {
        try { localStorage.setItem("anJobSeen", String(d.job)); localStorage.removeItem("anJobPending"); } catch (e) {}
        $("anMsg").textContent = "✅ Analizado en " + ((Date.now() - anT0) / 1000).toFixed(1).replace(".", ",") + " s";
        return d.data;
      }
      $("anMsg").textContent = d.error || "No se pudo analizar.";
      return null;
    } catch (e) {
      // Se cortó la conexión (p. ej. saliste de la app): el servidor sigue trabajando; se recoge el resultado.
      clearInterval(timer);
      try { localStorage.setItem("anJobPending", String(Date.now())); } catch (e2) {}
      return await new Promise((resolve) => {
        anPoll(prefijo, (j) => {
          if (j && j.status === "done") { try { localStorage.setItem("anJobSeen", String(j.id)); } catch (e2) {} $("anMsg").textContent = "✅ Análisis recuperado"; resolve(j.data); }
          else { $("anMsg").textContent = (j && j.error) || "No se pudo analizar."; resolve(null); }
        });
      });
    }
  }
  // Al volver a la app: si había un análisis en marcha o terminado sin ver, se recoge.
  async function resumeAnaliza() {
    if (!$("anOut") || anPollT) return;
    let j = null;
    try { const r = await fetch(API + "/analiza-estado", { cache: "no-store" }); j = await r.json(); } catch (e) { return; }
    if (!j || j.status === "none") return;
    let seen = ""; try { seen = localStorage.getItem("anJobSeen") || ""; } catch (e) {}
    const finish = (x) => {
      if (x && x.status === "done" && x.data) {
        if (String(x.id) === seen && $("anOut").children.length) return;
        try { localStorage.setItem("anJobSeen", String(x.id)); } catch (e) {}
        const m = $("anMsg"); if (m) m.textContent = "✅ Análisis terminado mientras no estabas";
        renderAnalisis(x.data);
      } else if (x && x.status === "error") {
        let pend = null; try { pend = localStorage.getItem("anJobPending"); } catch (e) {}
        if (pend) { try { localStorage.removeItem("anJobPending"); } catch (e) {} const m = $("anMsg"); if (m) m.textContent = x.error || "No se pudo analizar."; }
      }
    };
    if (j.status === "running") { anT0 = j.at || Date.now(); anPoll("Analizando…", finish); }
    else finish(j);
  }
  resumeAnaliza();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) resumeAnaliza(); });

  function miniLine(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  // Busca, entre los jugadores reales que el usuario capturó (titulares +
  // banquillo), aquel al que se refiere un nombre suelto que ha escrito la
  // IA en su texto (p.ej. "Vinícius" o "R. Fernández"), para poder mostrar
  // su foto/escudo en vez de un simple texto. Tolera tildes y nombres
  // parciales, igual que el resto del buscador de jugadores de la web.
  function findRosterPlayer(name, roster) {
    const nk = stripAccents(String(name || "").trim().toLowerCase()).replace(/[^a-z0-9 ]/g, "");
    if (!nk || !roster || !roster.length) return null;
    const words = nk.split(/\s+/).filter(Boolean);
    let best = null, bestScore = 0;
    roster.forEach((p) => {
      const pk = stripAccents(String(p.nombre || "").trim().toLowerCase()).replace(/[^a-z0-9 ]/g, "");
      if (!pk) return;
      const pw = pk.split(/\s+/).filter(Boolean);
      let s = 0;
      if (pk === nk) s = 100;
      else if (pk.indexOf(nk) >= 0 || nk.indexOf(pk) >= 0) s = 60;
      else if (words.some((w) => w.length >= 3 && pw.indexOf(w) >= 0)) s = 40;
      if (s > bestScore) { bestScore = s; best = p; }
    });
    return bestScore >= 40 ? best : null;
  }
  let anPool = [];
  function photoOf(p) {
    try { if (window.EduAlineacion && p) return window.EduAlineacion.photoFor({ name: p.nombre, full: p.nombre, photo: p.photo || "" }, anPool); } catch (e) {}
    return p && p.photo;
  }
  function renderAiText(t, roster) {
    const box = el("div", "an-ai");
    const ICONS = [["ONCE", "⭐"], ["PORTERO", "🧤"], ["DEFENSA", "🛡️"], ["MEDIO", "🎯"], ["DELANTERO", "⚽"], ["CAMBIOS", "🔄"], ["CLAVES", "🔑"], ["MULTIPOSICI", "↔️"], ["AVISO", "⏰"]];
    const iconOf = (title) => { const u = title.toUpperCase(); const f = ICONS.find((x) => u.indexOf(x[0]) === 0); return f ? f[1] : "•"; };
    const isLineup = (title) => /PORTERO|DEFENSA|MEDIO|DELANTERO/i.test(title);
    const isMulti = (title) => /MULTIPOSICI|CLAVES/i.test(title);
    const photoChip = (p) => {
      const c = el("div", "an-pchip");
      const ph = el("div", "an-pchip-photo"); ph.appendChild(photoImg(photoOf(p)));
      c.appendChild(ph);
      c.appendChild(el("div", "an-pchip-name", p.last || p.nombre || ""));
      return c;
    };
    // Fila para "MULTIPOSICIÓN": antes era un párrafo suelto por jugador
    // ("Nombre: en X porque..."); ahora se saca el nombre al principio y se
    // pinta como una fila con foto, igual de "chula" que el resto de
    // secciones, en vez de solo texto corrido.
    const multiRow = (s) => {
      const mm = s.match(/^([^:]+):\s*(.+)$/);
      const row = el("div", "an-mp-row");
      if (mm) {
        const pl = roster && roster.length ? findRosterPlayer(mm[1], roster) : null;
        const ph = el("div", "an-mp-photo"); if (pl) ph.appendChild(photoImg(photoOf(pl))); else ph.textContent = "↔️";
        row.appendChild(ph);
        const txt = el("div", "an-mp-text");
        txt.appendChild(el("div", "an-mp-name", (pl && (pl.last || pl.nombre)) || mm[1].trim()));
        const reason = el("div", "an-mp-reason"); reason.innerHTML = miniLine(mm[2]); txt.appendChild(reason);
        row.appendChild(txt);
      } else {
        const txt = el("div", "an-mp-text"); txt.innerHTML = miniLine(s); row.appendChild(txt);
      }
      return row;
    };
    let body = null, lineup = false, multi = false;
    String(t || "").split(/\n+/).forEach((ln) => {
      const s = ln.trim();
      if (!s) return;
      const m = s.match(/^\*\*(.+?)\*\*:?\s*$/);
      if (m) {
        const title = m[1].replace(/:$/, "");
        const sec = el("div", "an-sec");
        const hd = el("div", "an-sec-head");
        hd.appendChild(el("span", "an-sec-ic", iconOf(title)));
        hd.appendChild(el("span", "an-sec-t", title));
        if (!/^CLAVES/i.test(title)) sec.appendChild(hd);
        lineup = isLineup(title);
        multi = isMulti(title);
        body = el("div", "an-sec-body" + (multi ? " an-sec-body-col" : ""));
        sec.appendChild(body);
        box.appendChild(sec);
      } else if (body) {
        if (lineup) {
          // Siempre en chips con foto, aunque sea UN solo nombre sin comas
          // (p. ej. el portero) — antes solo se activaba con coma y el
          // portero se quedaba como texto plano sin foto.
          s.split(",").map((x) => x.trim()).filter(Boolean).forEach((nm) => {
            const pl = roster && roster.length ? findRosterPlayer(nm, roster) : null;
            if (pl) body.appendChild(photoChip(pl));
            else { const c = el("span", "an-chip"); c.innerHTML = miniLine(nm); body.appendChild(c); }
          });
        } else if (multi) {
          body.appendChild(multiRow(s));
        } else {
          const line = el("div", "an-ai-line"); line.innerHTML = miniLine(s); body.appendChild(line);
        }
      } else {
        const line = el("div", "an-ai-line"); line.innerHTML = miniLine(s); box.appendChild(line);
      }
    });
    return box;
  }
  // ---- Once ideal con reglas fijas ----
  // Puntos esperados de un jugador = media de sus últimos partidos (+0,4 si
  // juega en casa, -0,2 fuera) × probabilidad de ser titular. Si está
  // sancionado/lesionado con menos de 10% de jugar, vale 0.
  function expOf(p) {
    const out = (p.san || p.inj || /SANC|LESI/i.test(p.estado || "")) && (p.prob == null || p.prob < 10);
    if (out) return 0;
    const base = Math.max(0, formOf(p).base);
    const prob = p.prob != null ? p.prob : 60;
    return base * prob / 100;
  }
  const IDEAL_FORMS = [[3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 3, 2], [5, 4, 1], [3, 3, 4], [3, 6, 1], [4, 2, 4], [4, 6, 0], [5, 2, 3]];
  function pickIdealXI(players) {
    const multi = players.filter((p) => p.pos2 && p.pos2 !== p.pos && p.pos !== "POR" && p.pos2 !== "POR").slice(0, 6);
    let best = null;
    for (let mask = 0; mask < (1 << multi.length); mask++) {
      const posOf = new Map();
      players.forEach((p) => posOf.set(p, p.pos));
      multi.forEach((p, i) => { if (mask & (1 << i)) posOf.set(p, p.pos2); });
      const by = { POR: [], DEF: [], CEN: [], DEL: [] };
      players.forEach((p) => { const k = posOf.get(p); if (by[k]) by[k].push(p); });
      Object.keys(by).forEach((k) => by[k].sort((a, b) => expOf(b) - expOf(a)));
      if (!by.POR.length) continue;
      IDEAL_FORMS.forEach((f) => {
        if (by.DEF.length < f[0] || by.CEN.length < f[1] || by.DEL.length < f[2]) return;
        const sel = [by.POR[0]].concat(by.DEF.slice(0, f[0]), by.CEN.slice(0, f[1]), by.DEL.slice(0, f[2]));
        const tot = sel.reduce((a, p) => a + expOf(p), 0);
        if (!best || tot > best.total + 1e-9) best = { total: tot, form: f, sel, posOf, by };
      });
    }
    if (!best) return null;
    const slots = best.sel.map((p) => ({ p, pos: best.posOf.get(p) }));
    return { formacion: best.form.join("-"), starters: best.sel, slots, total: best.total, by: best.by, players };
  }
  // Puntuación probable del once: suma de puntos esperados + análisis de racha.
  const f1e = (x) => x.toFixed(1).replace(".", ",");
  function projBox(players, title, versus) {
    const ps = players.filter(Boolean);
    const f1 = (x) => x.toFixed(0);
    const total = ps.reduce((a, p) => a + expOf(p), 0);
    const cap = ps.filter((p) => p.pos === "CEN" || p.pos === "DEL").slice().sort((a, b) => expOf(b) - expOf(a))[0];
    const box = el("div", "an-proj");
    const top = el("div", "an-proj-top");
    top.appendChild(el("div", "an-proj-k", title));
    top.appendChild(el("div", "an-proj-n", "~" + f1(total) + " pts"));
    box.appendChild(top);
    box.appendChild(el("div", "an-proj-r", (cap ? "Con " + (cap.last || cap.nombre) + " de capitán (dobla puntos): ~" + f1(total + expOf(cap)) + " pts" : "")));
    if (versus != null) {
      const d = total - versus;
      box.appendChild(el("div", "an-proj-vs", (d >= 0.5 ? "▲ +" + f1(d) + " pts más que tu once actual" : d <= -0.5 ? "▼ " + f1(d) + " pts vs tu once actual" : "= igual que tu once actual")));
    }
    // Reparto de puntos esperados por línea (mismo dato, en mosaico con barra)
    const lines = [["POR", "🧤", "Portero"], ["DEF", "🛡️", "Defensas"], ["CEN", "🎯", "Medios"], ["DEL", "⚽", "Delanteros"]].map((g) => {
      const arr = ps.filter((p) => p.pos === g[0]);
      return { k: g[0], ico: g[1], lab: g[2], v: arr.reduce((a, p) => a + expOf(p), 0), n: arr.length };
    }).filter((x) => x.n);
    const lmax = Math.max(1, ...lines.map((x) => x.v));
    const chips = el("div", "an-lines");
    lines.forEach((x) => {
      const t = el("div", "an-line");
      const hd = el("div", "an-line-h"); hd.appendChild(el("span", null, x.ico + " " + x.lab)); hd.appendChild(el("b", null, f1(x.v)));
      t.appendChild(hd);
      const bar = el("div", "an-line-bar"); const fill = el("i"); fill.style.width = Math.max(6, Math.round((x.v / lmax) * 100)) + "%"; bar.appendChild(fill); t.appendChild(bar);
      chips.appendChild(t);
    });
    box.appendChild(chips);
    const hot = ps.filter((p) => expOf(p) > 0 && formOf(p).trend >= 1.5).sort((a, b) => formOf(b).trend - formOf(a).trend).slice(0, 4);
    const risk = ps.filter((p) => p.prob != null && p.prob < 70).sort((a, b) => a.prob - b.prob).slice(0, 4);
    const f1d = (x) => x.toFixed(1).replace(".", ",");
    // sub(p) → { v: cifra grande, c: qué significa, s: línea pequeña, bar: 0-100 opcional }
    const group = (icon, label, desc, cls, arr, sub) => {
      if (!arr.length) return;
      const g = el("div", "an-tg " + cls);
      const h = el("div", "an-tg-h");
      h.appendChild(el("span", "an-tg-pill", icon + " " + label));
      g.appendChild(h);
      g.appendChild(el("div", "an-tg-d", desc));
      arr.forEach((p) => {
        const it = el("div", "an-ti");
        const ph = el("div", "an-ti-ph"); ph.appendChild(photoImg(photoOf(p))); it.appendChild(ph);
        const tx = el("div", "an-ti-tx");
        const info = sub(p);
        tx.appendChild(el("b", null, p.last || p.nombre));
        if (info.s) tx.appendChild(el("small", null, info.s));
        if (info.bar != null) { const br = el("div", "an-ti-bar"); const fl = el("i"); fl.style.width = Math.max(4, Math.min(100, info.bar)) + "%"; br.appendChild(fl); tx.appendChild(br); }
        it.appendChild(tx);
        const mt = el("div", "an-ti-m"); mt.appendChild(el("b", null, info.v)); mt.appendChild(el("span", null, info.c));
        it.appendChild(mt);
        g.appendChild(it);
      });
      box.appendChild(g);
    };
    group("🔥", "En racha", "Llegan en su mejor momento: puntúan más en sus 2 últimos partidos.", "hot", hot, (p) => { const fo = formOf(p); return { v: "▲ " + f1d(fo.rec), c: "pts de media (últimos 2)", s: fo.season ? "Media de la temporada: " + f1d(fo.season.avg) + " pts (" + fo.season.n + " partidos)" : "Media al jugar (últimos 5): " + f1d(fo.avg) + " pts" }; });
    const irr = ps.filter((p) => { const fo = formOf(p); return fo.len >= 3 && fo.len - fo.played >= 2 && fo.played >= 1; }).sort((a, b) => formOf(b).avg - formOf(a).avg).slice(0, 4);
    group("🎲", "Irregulares", "Puntúan bien cuando juegan, pero se pierden partidos.", "irr", irr, (p) => { const fo = formOf(p); return { v: f1d(fo.avg), c: "pts al jugar", s: "Ha jugado " + fo.played + " de sus últimos " + fo.len, bar: (fo.played / fo.len) * 100 }; });
    group("⚠️", "Dudas de jugar", "Probabilidad baja de ser titulares.", "risk", risk, (p) => ({ v: p.prob + "%", c: "de jugar", bar: p.prob }));
    return { box, total };
  }
  // Desglose de una jornada: AS, Marca y SofaScore (puntos de su tabla × 50% de tu liga), minutos y el resto
  // (goles, asistencias, tarjetas…) como diferencia con los puntos reales que Futmondo dio al jugador.
  const fmCache = {};
  const fmN = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");
  const fmS = (x) => (x > 0 ? "+" : "") + fmN(x);
  function fmToggle(card, row, chip, p, jn, total) {
    const old = card.querySelector(".an-fm-det");
    const same = chip.classList.contains("sel");
    row.querySelectorAll(".an-fm-chip.sel").forEach((c) => c.classList.remove("sel"));
    if (old) old.remove();
    if (same) return;
    chip.classList.add("sel");
    const det = el("div", "an-fm-det", "Cargando…");
    row.after(det);
    const draw = (j) => {
      det.innerHTML = "";
      const m = j && (j.matches || []).find((x) => Number(x.r) === Number(jn));
      if (!m || (m.as == null && m.marca == null && m.ss == null)) { det.textContent = "Sin desglose de esta jornada."; return; }
      const mins = Number(m.mins) || 0;
      const a = (Number(m.as) || 0) / 2, mc = (Number(m.marca) || 0) / 2, ss = (Number(m.ss) || 0) / 2, mn = mins >= 60 ? 1 : 0;
      const base = a + mc + ss + mn;
      let rest = Math.floor(total - base + 1e-9);
      // Porteros y defensas (60+ min): portería a cero +1, o -1 por cada 2 goles encajados (ayuda oficial; comprobado con datos reales).
      const oj = oppJ[teamCanon(p.equipo)] && oppJ[teamCanon(p.equipo)][jn];
      const defRole = /portero|defensa/.test(String(j.role || ""));
      let defLine = null;
      if (defRole && mins >= 60 && oj && oj.ga != null) {
        const v = oj.ga === 0 ? 1 : -Math.floor(oj.ga / 2);
        defLine = oj.ga === 0 ? ["Portería a cero", 1] : (v !== 0 ? ["Goles encajados (" + oj.ga + ")", v] : null);
        rest -= v;
      }
      const bar = (cls, lab, val) => { const r = el("div", "an-fm-bar " + cls); r.appendChild(el("span", "an-fm-bl", lab)); r.appendChild(el("b", null, val)); det.appendChild(r); };
      bar("pts", "💡 Puntos J" + jn, String(total));
      bar("as", "AS", fmN(a));
      bar("marca", "MARCA", fmN(mc));
      bar("ss", "SofaScore", fmN(ss));
      bar("min", "Min. jugados", mins + "' · " + fmS(mn));
      if (defLine) bar("extra" + (defLine[1] < 0 ? " neg" : " pos"), defLine[0], fmS(defLine[1]));
      if (rest !== 0) bar("extra" + (rest < 0 ? " neg" : " pos"), rest < 0 ? "Otros descuentos (p. ej. goles encajados o tarjetas)" : "Goles, asistencias y otros", fmS(rest));
      const sum = base + rest + (defLine ? defLine[1] : 0);
      det.appendChild(el("div", "an-fm-dn", "AS, Marca y SofaScore son los puntos de su tabla × 50% (tu liga)." + (Math.abs(sum - total) > 0.01 ? " Suma " + fmN(sum) + "; Futmondo redondea a " + total + "." : "") + " AS, Marca, SofaScore y minutos salen directos de Futmondo; la última línea, si sale, es la diferencia hasta los puntos reales."));
    };
    if (fmCache[p.id]) { draw(fmCache[p.id]); return; }
    fetch(API + "/jugador?id=" + encodeURIComponent(p.id)).then((r) => r.json()).then((j) => { fmCache[p.id] = j; if (det.isConnected) draw(j); }).catch(() => { det.textContent = "No se pudo cargar el desglose."; });
  }
  // Toda la temporada de un jugador: cada partido con rival, minutos y lo que aportan AS, Marca y SofaScore (puntos de su tabla × 50% de tu liga).
  function ssToggle(card, btn, p, pid, ptsByJ) {
    const old = card.querySelector(".an-ss");
    if (old) { old.remove(); btn.textContent = "📅 Ver toda la temporada"; return; }
    btn.textContent = "🔼 Ocultar temporada";
    const box = el("div", "an-ss", "Cargando temporada…");
    btn.after(box);
    const draw = (j) => {
      box.innerHTML = "";
      const ms = ((j && j.matches) || []).filter((m) => m.finished).sort((a, b) => Number(b.r) - Number(a.r));
      if (!ms.length) { box.textContent = "Sin partidos terminados todavía."; return; }
      const tc = teamCanon(p.equipo || "");
      const pl = ms.filter((m) => (Number(m.mins) || 0) > 0);
      const avgOf = (k) => (pl.length ? pl.reduce((s, m) => s + (Number(m[k]) || 0) / 2, 0) / pl.length : 0);
      const s60 = pl.filter((m) => Number(m.mins) >= 60).length;
      const sea = seasonOf(p);
      const sum = el("div", "an-ss-sum");
      sum.appendChild(el("b", null, "Jugó " + pl.length + " de " + ms.length + " partidos de su equipo"));
      sum.appendChild(el("span", null, s60 + " con 60 min o más" + (sea ? " · media de la temporada " + f1e(sea.avg) + " pts por partido jugado" : "")));
      box.appendChild(sum);
      const tb = el("div", "an-ss-t");
      const hd = el("div", "an-ss-r hd"); ["J", "Rival", "Min", "Pts", "AS", "Marca", "Sofa"].forEach((h) => hd.appendChild(el("span", null, h))); tb.appendChild(hd);
      ms.forEach((m) => {
        const played = (Number(m.mins) || 0) > 0;
        const home = teamCanon(m.home) === tc;
        const r = el("div", "an-ss-r" + (played ? "" : " none"));
        r.appendChild(el("span", null, "J" + m.r));
        r.appendChild(el("span", "rv", (home ? "🏠 " : "✈️ ") + (home ? m.away : m.home)));
        r.appendChild(el("span", null, played ? m.mins + "'" : "–"));
        const tp = ptsByJ ? ptsByJ[Number(m.r)] : undefined;
        r.appendChild(el("span", tp !== undefined ? "pt" : "nd", tp !== undefined ? (tp === 0 ? "–" : String(tp)) : "–"));
        [m.as, m.marca, m.ss].forEach((v) => r.appendChild(el("span", null, played && v != null ? fmN((Number(v) || 0) / 2) : "–")));
        tb.appendChild(r);
      });
      if (pl.length) { const av = el("div", "an-ss-r avg"); av.appendChild(el("span", null, "")); av.appendChild(el("span", "rv", "Media")); av.appendChild(el("span", null, "")); av.appendChild(el("span", null, "")); [avgOf("as"), avgOf("marca"), avgOf("ss")].forEach((v) => av.appendChild(el("span", null, fmN(v)))); tb.appendChild(av); }
      box.appendChild(tb);
    };
    const withHist = (j) => fetch(API + "/historial-puntos?ids=" + encodeURIComponent(pid)).then((r) => r.json()).then((h) => { const o = (h && h.pts && h.pts[pid]) || {}; Object.keys(o).forEach((n) => { if (ptsByJ && ptsByJ[n] === undefined) ptsByJ[n] = o[n]; }); return j; }).catch(() => j);
    if (fmCache[pid]) { withHist(fmCache[pid]).then(draw); return; }
    fetch(API + "/jugador?id=" + encodeURIComponent(pid)).then((r) => r.json()).then((j) => { fmCache[pid] = j; return withHist(j); }).then((j) => { if (box.isConnected) draw(j); }).catch(() => { box.textContent = "No se pudo cargar la temporada."; });
  }
  // Forma de cada jugador: puntos de Futmondo en sus últimas 5 jornadas, con jornada y rival.
  function renderForma(box, players, d) {
    box.innerHTML = "";
    box.appendChild(el("div", "estado-title", "📊 Forma de tus jugadores"));
    const j0 = d && d.capJornada ? d.capJornada - 1 : 0;
    const order = { POR: 0, DEF: 1, CEN: 2, DEL: 3 };
    const tits = (d && d.titulares) || [];
    const sorted = players.slice().sort((a, b) => ((tits.indexOf(a) >= 0 ? 0 : 1) - (tits.indexOf(b) >= 0 ? 0 : 1)) || ((order[a.pos] || 0) - (order[b.pos] || 0)));
    const grid = el("div", "an-fm-list");
    sorted.forEach((p) => {
      const card = el("div", "an-fm-card" + (tits.indexOf(p) >= 0 ? "" : " bench"));
      const head = el("div", "an-fm-head");
      const ph = el("div", "an-fm-ph"); ph.appendChild(photoImg(photoOf(p))); head.appendChild(ph);
      const tx = el("div", "an-fm-tx");
      const nm = el("b", null, p.last || p.nombre); tx.appendChild(nm);
      tx.appendChild(el("small", null, (p.pos || "") + (p.equipo ? " · " + p.equipo : "") + (tits.indexOf(p) >= 0 ? "" : " · banquillo")));
      head.appendChild(tx);
      const rt = el("div", "an-fm-rt");
      rt.appendChild(el("b", null, f1e(expOf(p)) + " pts"));
      rt.appendChild(el("small", null, "esperado" + (p.prob != null ? " · " + p.prob + "% jugar" : "")));
      head.appendChild(rt);
      card.appendChild(head);
      const f = (p.fitness || []).map(Number);
      const row = el("div", "an-fm-row");
      const len = f.length;
      const ptsByJ = {};
      f.forEach((v, i) => {
        const jn = jLab(p.equipo, len, len - 1 - i, j0);
        if (jn) ptsByJ[jn] = v;
        const op = jn && oppJ[teamCanon(p.equipo)] && oppJ[teamCanon(p.equipo)][jn];
        const c = el("div", "an-fm-chip " + (v === 0 ? "none" : v <= 3 ? "low" : v >= 10 ? "high" : "mid"));
        c.appendChild(el("div", "an-fm-j", jn ? "J" + jn : "–"));
        const mid = el("div", "an-fm-op");
        if (op) { if (op.crest) { const im = el("img"); im.src = op.crest; im.alt = ""; im.loading = "lazy"; mid.appendChild(im); } mid.appendChild(haIcon(op.home)); }
        c.appendChild(mid);
        c.appendChild(el("div", "an-fm-v", v === 0 ? "–" : String(v)));
        if (v !== 0 && p.id && jn) { c.classList.add("tap"); c.setAttribute("role", "button"); c.setAttribute("tabindex", "0"); c.addEventListener("click", () => fmToggle(card, row, c, p, jn, v)); }
        row.appendChild(c);
      });
      if (!f.length) row.appendChild(el("div", "muted small", "Sin datos de sus últimos partidos."));
      card.appendChild(row);
      if (f.some((v) => v !== 0) && p.id) card.appendChild(el("div", "an-fm-hint", "👆 Toca una jornada para ver de dónde salen sus puntos"));
      const pid = p.id || (seasonOf(p) && seasonOf(p).id);
      if (pid) {
        const sb = el("button", "an-ss-btn", "📅 Ver toda la temporada"); sb.type = "button";
        sb.addEventListener("click", () => ssToggle(card, sb, p, pid, ptsByJ));
        card.appendChild(sb);
      }
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }
  function idealRules(ideal) {
    const d = el("details", "an-rules");
    d.appendChild(el("summary", null, "¿Cómo se elige el once ideal?"));
    const ul = el("div", "an-rules-b");
    const f1 = (x) => x.toFixed(1).replace(".", ",");
    [["POR", "Portero"], ["DEF", "Defensas"], ["CEN", "Centrocampistas"], ["DEL", "Delanteros"]].forEach((g) => {
      const arr = ideal.by[g[0]] || [];
      if (!arr.length) return;
      const n = g[0] === "POR" ? 1 : ideal.formacion.split("-")[g[0] === "DEF" ? 0 : g[0] === "CEN" ? 1 : 2] * 1;
      ul.appendChild(el("div", "an-rules-g", g[1]));
      arr.forEach((p, i) => {
        const fo = formOf(p);
        const ser = (p.fitness || []).length ? (p.fitness || []).join("-") : "sin datos";
        const out = (p.san || p.inj || /SANC|LESI/i.test(p.estado || "")) && (p.prob == null || p.prob < 10);
        const row = el("div", "an-rules-row" + (i < n ? " in" : " out"));
        row.appendChild(el("b", null, (i < n ? "✅ " : "▫️ ") + (p.last || p.nombre) + " → " + f1(expOf(p)) + " pts esperados"));
        row.appendChild(el("div", "an-rules-d", out ? "Sancionado/lesionado: vale 0." : (fo.season ? "media " + f1(fo.season.avg) + " en los " + fo.season.n + " partidos que ha jugado esta temporada (últimos 5, de antiguo a reciente: " + ser + ") × " : "media " + f1(fo.avg) + " en los " + fo.played + " partidos que jugó (últimos 5, de antiguo a reciente: " + ser + ") × ") + (p.prob != null ? p.prob + "% de jugar" : "sin dato de probabilidad (se usa 60%)") + (p.casa === true ? " · juega en casa" : p.casa === false ? " · juega fuera" : "")));
        ul.appendChild(row);
      });
    });
    d.appendChild(ul);
    return d;
  }
  let anRefT = null;
  async function anRefresh() {
    if (document.hidden || !anData || anStale) return;
    const ps = [].concat(anData.titulares || [], anData.suplentes || []);
    if (!ps.length) return;
    let r = null;
    try { r = await (await fetch(API + "/analiza-refresco?n=" + encodeURIComponent(ps.map((p) => p.nombre + "~" + (p.equipo || "")).join("|")), { cache: "no-store" })).json(); } catch (e) { return; }
    if (!r || !r.items) return;
    let ch = false;
    ps.forEach((p) => {
      const it = r.items[p.nombre]; if (!it) return;
      if (it.prob != null && it.prob !== p.prob) { p.prob = it.prob; ch = true; }
      if (!!it.san !== !!p.san || !!it.inj !== !!p.inj) { p.san = !!it.san; p.inj = !!it.inj; ch = true; }
    });
    if (ch) { const y = window.scrollY; renderAnalisis(anData); window.scrollTo(0, y); const m = $("anMsg"); if (m) m.textContent = "🔄 Alineaciones probables actualizadas a las " + new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) anRefresh(); });

  function renderAnalisis(d) {
    anData = d;
    const out = $("anOut");
    if (!out) return;
    out.innerHTML = "";
    try {
      const names = [].concat(d.titulares || [], d.suplentes || []).map((p) => p.nombre).filter(Boolean);
      if (names.length) { myTeam = names; localStorage.setItem("merc_myteam", JSON.stringify(names)); updateNewsFilter(); }
    } catch (e) {}
    const scoreOf = (p) => {
      if (String(p.estado || "").toUpperCase().indexOf("LESI") >= 0) return 5;
      const f = p.fitness || [];
      const avg = f.length ? f.reduce((a, b) => a + (Number(b) || 0), 0) / f.length : 0;
      const prob = p.prob != null ? p.prob : 60;
      let s = avg * 9 + (prob - 50) * 0.5;
      if (p.casa === true) s += 4; else if (p.casa === false) s -= 2;
      if (p.pos2) s += 2;
      return Math.max(5, Math.min(99, Math.round(s)));
    };
    const tits = (d.titulares = d.titulares || []);
    const sups = (d.suplentes = d.suplentes || []);
    if (tits.length) {
      const nota = Math.round(tits.reduce((a, p) => a + scoreOf(p), 0) / tits.length);
      const parts = ["DEL", "CEN", "DEF", "POR"].map((k) => { const g = tits.filter((p) => p.pos === k); return g.length ? k + " " + Math.round(g.reduce((a, p) => a + scoreOf(p), 0) / g.length) : null; }).filter(Boolean);
      const box = el("div", "an-nota");
      box.appendChild(el("div", "an-nota-num", nota + "/100"));
      box.appendChild(el("div", "an-nota-txt", "Nota de tu once · " + parts.join(" · ")));
      // Capitán: en el modo Full Mundo dobla los puntos que haga, así que lo
      // que de verdad importa no es la nota genérica del once (esa vale para
      // defensas y porteros, que rara vez interesan de capitán), sino quién
      // tiene más TECHO de puntos: un centrocampista o delantero (nunca un
      // defensa ni el portero) que además esté EN RACHA ahora mismo, no solo
      // "de media bueno". Por eso aquí se usa una nota aparte (capScoreOf)
      // que pesa el pico reciente de forma (no solo la media) y el nivel de
      // puntos de la temporada, y se filtra a CEN/DEL.
      const capScoreOf = (p) => {
        if (String(p.estado || "").toUpperCase().indexOf("LESI") >= 0) return 5;
        const f = p.fitness || [];
        const avg = f.length ? f.reduce((a, b) => a + (Number(b) || 0), 0) / f.length : 0;
        const max = f.length ? Math.max(...f.map((x) => Number(x) || 0)) : 0;
        const racha = avg * 0.5 + max * 0.5; // premia el partidazo reciente (la "racha"), no solo la media
        const prob = p.prob != null ? p.prob : 60;
        let s = racha * 8.5 + (prob - 50) * 0.4;
        if (p.casa === true) s += 3; else if (p.casa === false) s -= 1.5;
        if (p.pos2) s += 2;
        if (p.puntos != null) s += Math.min(12, p.puntos / 40); // techo de puntos: prima al que más lleva en la temporada
        return Math.max(5, Math.min(99, Math.round(s)));
      };
      // El capitán dobla puntos si juega, pero no dobla NADA si se queda en
      // el banco — así que antes de mirar quién está más en racha hay que
      // descartar a quien no tenga la titularidad prácticamente asegurada
      // (como le pasó a Lemar: buena forma pero sin sitio fijo). Solo se
      // entra en el "banco" de candidatos arriesgados (prob < 85%) si NO
      // queda nadie seguro entre los CEN/DEL.
      const SAFE_PROB = 85;
      const isSafe = (p) => p.prob != null && p.prob >= SAFE_PROB && String(p.estado || "").toUpperCase().indexOf("LESI") < 0;
      let capList = tits.filter((p) => (p.pos === "CEN" || p.pos === "DEL") && isSafe(p)).slice().sort((a, b) => capScoreOf(b) - capScoreOf(a));
      let capRisky = false;
      if (!capList.length) { capList = tits.filter((p) => p.pos === "CEN" || p.pos === "DEL").slice().sort((a, b) => capScoreOf(b) - capScoreOf(a)); capRisky = true; }
      if (!capList.length) { capList = tits.filter((p) => p.pos !== "POR").slice().sort((a, b) => capScoreOf(b) - capScoreOf(a)); capRisky = true; }
      if (capList.length) {
        const top = capList[0];
        const cap = el("div", "an-capitan");
        cap.appendChild(el("div", "an-capitan-t", "👑 Capitán recomendado"));
        const row = el("div", "an-cap-pick");
        const ph = el("div", "an-cap-photo"); ph.appendChild(photoImg(photoOf(top))); row.appendChild(ph);
        const body = el("div", "an-cap-body");
        body.appendChild(el("div", "an-cap-name", top.nombre || ""));
        const why = [];
        const fmax = (top.fitness || []).length ? Math.max(...top.fitness.map((x) => Number(x) || 0)).toFixed(1).replace(".", ",") : null;
        if (fmax) why.push("en racha (pico " + fmax + "/10)");
        if (top.puntos != null) why.push(top.puntos + " pts esta temporada");
        if (top.prob != null) why.push(top.prob + "% de jugar");
        if (top.casa === true) why.push("🏠 juega en casa"); else if (top.casa === false) why.push("✈️ juega fuera");
        if (top.pos2) why.push("doble posición");
        body.appendChild(el("div", "an-cap-why", why.join(" · ") || "sin datos suficientes"));
        if (capRisky) body.appendChild(el("div", "an-cap-warn", "⚠️ Ningún CEN/DEL tuyo tiene la titularidad asegurada. El que más opciones tiene (" + (top.prob != null ? top.prob + "%" : "sin dato") + ")"));
        else if (top.prob != null && top.prob < 95) body.appendChild(el("div", "an-cap-info", "✅ titularidad prácticamente asegurada (" + top.prob + "%)"));
        row.appendChild(body);
        cap.appendChild(row);
        // Tú eliges: las 4 mejores opciones (recomendada + 3 alternativas). Tu elección se guarda en el histórico.
        const opts = capList.slice(0, 4);
        if (opts.length > 1) {
          cap.appendChild(el("div", "an-cap-pickt", "Elige tu capitán (se guarda en tu histórico)"));
          const grid = el("div", "an-cap-opts");
          const chosenId = String(d.capChosen || "");
          opts.forEach((p, i) => {
            const isSel = chosenId ? String(p.id) === chosenId : false;
            const c = el("button", "an-cap-opt" + (isSel ? " sel" : "")); c.type = "button";
            const ph = el("div", "an-cap-opt-ph"); ph.appendChild(photoImg(photoOf(p))); c.appendChild(ph);
            const tx = el("div", "an-cap-opt-tx");
            tx.appendChild(el("div", "an-cap-opt-n", p.last || p.nombre || ""));
            tx.appendChild(el("div", "an-cap-opt-s", (i === 0 ? "⭐ Recomendado" : (p.prob != null ? p.prob + "% de jugar" : ""))));
            c.appendChild(tx);
            c.addEventListener("click", async () => {
              if (!d.capJornada) { const m = $("anMsg"); if (m) m.textContent = "Vuelve a analizar para poder guardar tu capitán."; return; }
              try {
                const r = await fetch(API + "/capitan-elegir", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jornada: d.capJornada, id: p.id }) });
                if (!r.ok) throw new Error("x");
                d.capChosen = String(p.id); capHistLoaded = false;
                grid.querySelectorAll(".an-cap-opt").forEach((x) => x.classList.remove("sel")); c.classList.add("sel");
                const m = $("anMsg"); if (m) m.textContent = "👑 Capitán guardado: " + (p.nombre || "");
                renderCapHistorial();
              } catch (e) { const m = $("anMsg"); if (m) m.textContent = "No se pudo guardar tu capitán."; }
            });
            grid.appendChild(c);
          });
          cap.appendChild(grid);
        }
        out.appendChild(cap);
      }
      const cla = tits.filter((p) => p.clause && p.valor && p.clause < p.valor * 1.6).sort((a, b) => scoreOf(b) - scoreOf(a));
      if (cla.length) {
        const cb = el("div", "an-clauses");
        cb.appendChild(el("div", "an-clauses-t", "🔒 Cláusulas bajas · súbeles la cláusula para no perderlos"));
        cb.appendChild(el("div", "an-clauses-info", "Cláusulas bajas: menos de 1,6× el valor del jugador."));
        const grid = el("div", "an-clause-grid");
        cla.slice(0, 8).forEach((p) => {
          const c = el("div", "an-clause-card");
          const ph = el("div", "an-clause-photo");
          ph.appendChild(photoImg(photoOf(p)));
          c.appendChild(ph);
          c.appendChild(el("div", "an-clause-name", p.nombre || ""));
          c.appendChild(el("div", "an-clause-cl", "🔓 " + money(p.clause) + " €"));
          c.appendChild(el("div", "an-clause-vl", "valor " + money(p.valor) + " €"));
          grid.appendChild(c);
        });
        cb.appendChild(grid);
        out.appendChild(cb);
      }
    }
    if (d.formacion) out.appendChild(el("div", "an-form", "Formación detectada: " + d.formacion));
    if (anStale) {
      const bar = el("div", "an-tools");
      bar.appendChild(el("div", "an-stale", "✏️ Has cambiado jugadores. Vuelve a analizar:"));
      const b = el("button", "btn-primary big", "🔄 Analizar de nuevo");
      b.addEventListener("click", reanalizar);
      bar.appendChild(b);
      out.appendChild(bar);
    }

    function swapMembers(a, b) {
      const aTit = tits.indexOf(a) >= 0;
      const pa = a.pos, pb = b.pos;
      if (aTit) { tits.splice(tits.indexOf(a), 1); sups.push(a); sups.splice(sups.indexOf(b), 1); tits.push(b); }
      else { sups.splice(sups.indexOf(a), 1); tits.push(a); tits.splice(tits.indexOf(b), 1); sups.push(b); }
      a.pos = pb; b.pos = pa;
      anStale = true; renderAnalisis(d);
    }
    function swapPicker(a) {
      const aTit = tits.indexOf(a) >= 0;
      const others = aTit ? sups : tits;
      if (!others.length) { openPicker("Cambiar jugador", (pl) => applyPlayer(a, pl)); return; }
      const root = el("div");
      root.appendChild(el("h2", "ficha-name", aTit ? "Sentar a " + (a.nombre || "") + " por…" : "Meter a " + (a.nombre || "") + " por…"));
      const list = el("div", "pick-list");
      others.forEach((o) => {
        const row = el("button", "cmp-sugrow"); row.type = "button";
        const ph = el("span", "cmp-sugphoto"); ph.appendChild(photoImg(photoOf(o))); row.appendChild(ph);
        const bb = el("span", "cmp-sugbody");
        bb.appendChild(el("span", "cmp-sugname", o.nombre || ""));
        bb.appendChild(el("span", "cmp-sugteam", (o.pos || "") + (o.prob != null ? " · juega " + o.prob + "%" : "")));
        row.appendChild(bb);
        row.addEventListener("click", () => { swapMembers(a, o); closeModal(); });
        list.appendChild(row);
      });
      root.appendChild(list);
      showModal(root);
    }
    // Solo cubre de otra posición quien tiene multiposición (el suplente o el
    // titular); el resto solo cubre su misma posición.
    // Posiciones en las que puede jugar un jugador: la de la captura, y sus
    // dos posiciones reales del mercado (la de la captura de tu once es donde
    // LO HAS PUESTO tú, así que la del hueco que se libera es tit.pos).
    const posCodes = (p) => {
      const set = new Set([p.pos, p.pos2].filter(Boolean));
      const q = (all || []).find((x) => String(x.id) === String(p.id));
      if (q) [q.role, q.role2].forEach((r) => { const b = roleBadge(r); if (b) set.add(b === "MED" ? "CEN" : b); });
      return set;
    };
    const covers = (sub, tit) => posCodes(sub).has(tit.pos);
    function buildSwapPlan() {
      const pairs = [];
      const T = (p) => (p.fecha ? new Date(p.fecha).getTime() : null);
      const used = new Set();
      tits.slice().sort((a, b) => (T(a) == null ? Infinity : T(a)) - (T(b) == null ? Infinity : T(b))).forEach((tit) => {
        const tt = T(tit);
        const cands = sups.filter((sub) => !used.has(sub) && T(sub) != null && covers(sub, tit) && (tt == null || T(sub) > tt));
        cands.sort((a, b) => (a.pos === tit.pos ? 0 : 1) - (b.pos === tit.pos ? 0 : 1) || T(a) - T(b));
        const cand = cands[0];
        if (cand) { used.add(cand); pairs.push({ pos: tit.pos, tit, sub: cand }); }
      });
      return pairs;
    }
    // Suplentes que juegan ANTES que todos los titulares a los que podrian
    // sustituir: desde que empieza su partido ya no se pueden meter.
    const useless = sups.filter((sub) => {
      if (!sub.fecha) return false;
      const st = new Date(sub.fecha).getTime();
      const tg = tits.filter((t) => covers(sub, t) && t.fecha);
      return tg.length > 0 && tg.every((t) => new Date(t.fecha).getTime() >= st);
    });
    const swapPairs = buildSwapPlan();
    // Los que juegan en el primer día de la jornada (de todo tu plantel): se avisa también en los titulares.
    const dayOf = (f) => new Date(f).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const earlyDay = [].concat(tits, sups).filter((p) => p.fecha).map((p) => dayOf(p.fecha)).sort()[0] || "";
    // Campo y banquillo: EXACTAMENTE la misma plantilla que "Alineaciones
    // probables" (EduAlineacion.card): mismas fotos, % de titularidad, avisos
    // de duda/sancionado/lesionado y banquillo.
    const POSLAB = { POR: "Portero", DEF: "Defensa", CEN: "Mediocampista", DEL: "Delantero" };
    const whenOf = (f) => { if (!f) return ""; const d = new Date(f); if (isNaN(d)) return ""; return d.toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).replace(",", ""); };
    const matchOf = (p) => (p.rival ? { rival: p.rival, logo: clubLogo(p.rival, ""), when: whenOf(p.fecha) } : null);
    const toSide = (p, pos) => ({ match: matchOf(p), name: p.nombre, full: p.nombre, pos: POSLAB[pos || p.pos] || "Mediocampista", photo: p.photo || "", prob: p.prob != null ? p.prob : null, san: !!p.san || /SANC/i.test(p.estado || ""), inj: !!p.inj || /LESI/i.test(p.estado || ""), _p: p, plan: (() => { const x = swapPairs.find((q) => q.tit === p); return x ? (x.sub.last || x.sub.nombre) : ""; })(), note: useless.indexOf(p) >= 0 ? "⏱ juega pronto" : (earlyDay && p.fecha && dayOf(p.fecha) === earlyDay ? "⏱ juega pronto" : "") });
    const myIds = new Set([].concat(tits, sups).map((p) => String(p.id || "")).filter(Boolean));
    const pool = (all || []).filter((q) => myIds.has(String(q.id)));
    anPool = pool;
    const cardOpts = (title) => ({ pool, title, noAuto: true, noCrest: true });
    const hookSwap = (card) => {
      card.querySelectorAll("a.pl").forEach((a) => {
        a.addEventListener("click", (ev) => {
          const m = (a.getAttribute("href") || "").match(/\/jugador\/([^/]+)/);
          const pl = m && [].concat(tits, sups).find((x) => String(x.id) === decodeURIComponent(m[1]));
          if (pl) { ev.preventDefault(); swapPicker(pl); }
        });
      });
    };
    if (window.EduAlineacion && tits.length) {
      const hs = el("div", "estado-title", "Tu once (toca a un jugador para cambiarlo)");
      out.appendChild(hs);
      const mine = window.EduAlineacion.card({ starters: tits.map((p) => toSide(p)), bench: [] }, "Tu equipo", "/img/avatar.svg", "", all, "probable", sups.map((p) => toSide(p)), cardOpts("Tu <b>once</b>"));
      hookSwap(mine);
      out.appendChild(mine);
      const bs = el("div", "an-base");
      bs.appendChild(el("div", "an-base-k", "📐 Calcular con"));
      const seg = el("div", "an-base-seg");
      [["temporada", "Toda la temporada"], ["ultimos5", "Últimos 5 partidos"]].forEach((o) => {
        const b = el("button", "an-base-b" + (anBase === o[0] ? " on" : ""), o[1]); b.type = "button";
        b.addEventListener("click", () => { if (anBase === o[0]) return; anBase = o[0]; try { localStorage.setItem("merc_anbase", anBase); } catch (e) {} const y = window.scrollY; renderAnalisis(anData); window.scrollTo(0, y); });
        seg.appendChild(b);
      });
      bs.appendChild(seg);
      bs.appendChild(el("div", "an-base-d", anBase === "temporada" ? "Puntos esperados = media de TODOS los partidos que ha jugado en la temporada (dato de Futmondo) × probabilidad de jugar. Los últimos 5 pueden ser suerte; la temporada entera es más estable." : "Puntos esperados = media de sus últimos 5 partidos jugados × probabilidad de jugar. Refleja la forma de ahora, pero 5 partidos pueden ser suerte."));
      out.appendChild(bs);
      const myProj = projBox(tits, "📈 Puntuación probable de tu once");
      out.appendChild(myProj.box);
    // Análisis guardados antes traían un "ONCE IDEAL" escrito por la IA: se quita (ahora va arriba con reglas fijas).
    let aiTxt = String(d.analisis || "");
    if (/\*\*ONCE IDEAL\*\*/i.test(aiTxt)) aiTxt = /\*\*(?:MULTIPOSICI|CLAVES)/i.test(aiTxt) ? aiTxt.replace(/\*\*ONCE IDEAL\*\*[\s\S]*?(?=\*\*(?:MULTIPOSICI|CLAVES))/i, "") : "";
    if (aiTxt.trim()) {
      const sec = el("div", "estado-sec an-ai-top");
      sec.appendChild(el("div", "estado-title", "🔑 Claves de tu once"));
      sec.appendChild(renderAiText(aiTxt, [].concat(tits, sups)));
      out.appendChild(sec);
    }
      // Once ideal con reglas fijas (no lo decide la IA)
      const ideal = pickIdealXI(tits.concat(sups));
      if (ideal) {
        const wrap = el("div", "an-ideal");
        const hd = el("div", "an-ideal-head");
        hd.appendChild(el("span", "an-ideal-badge", "✨ Recomendación de la IA"));
        hd.appendChild(el("div", "an-ideal-t", "Tu once ideal"));
        hd.appendChild(el("div", "an-ideal-s", "Formación " + ideal.formacion + " · el once que más puntos debería dar esta jornada"));
        wrap.appendChild(hd);
        if (!ideal.starters.some((p) => tits.indexOf(p) < 0) && !tits.some((p) => ideal.starters.indexOf(p) < 0)) wrap.appendChild(el("p", "an-ideal-diff", "✅ Tienes el mejor once posible"));
        const rest = tits.concat(sups).filter((p) => ideal.starters.indexOf(p) < 0);
        const posOf = new Map(ideal.slots.map((x) => [x.p, x.pos]));
        const ic = window.EduAlineacion.card({ starters: ideal.starters.map((p) => Object.assign(toSide(p, posOf.get(p)), { match: matchOf(p) })), bench: [] }, "Once ideal", "/img/avatar.svg", "", all, "probable", rest.map((p) => toSide(p)), cardOpts("Once <b>ideal</b>"));
        wrap.appendChild(ic);
        const idProj = projBox(ideal.starters, "📈 Puntuación probable del once ideal", myProj.total);
        idProj.box.classList.add("an-proj-dark");
        wrap.appendChild(idProj.box);
        const entran = ideal.starters.filter((p) => tits.indexOf(p) < 0);
        const salen = tits.filter((p) => ideal.starters.indexOf(p) < 0);
        if (entran.length || salen.length) {
          const sw = el("div", "an-sw");
          sw.appendChild(el("div", "an-sw-h", "Cambios respecto a tu once"));
          const swMax = Math.max(1, ...tits.concat(ideal.starters).map((q) => expOf(q)));
          const mk = (p, dir) => {
            const r = el("div", "an-sw-row " + dir);
            r.appendChild(el("span", "an-sw-ar", dir === "in" ? "▲" : "▼"));
            const ph = el("div", "an-sw-ph"); ph.appendChild(photoImg(photoOf(p))); r.appendChild(ph);
            const tx = el("div", "an-sw-tx");
            tx.appendChild(el("b", null, p.last || p.nombre));
            r.appendChild(tx);
            const ex = el("div", "an-sw-ex");
            const nb = el("div", "an-sw-n"); nb.appendChild(document.createTextNode(f1e(expOf(p)))); nb.appendChild(el("span", null, " pts"));
            ex.appendChild(nb);
            const bar = el("div", "an-sw-bar"); const fill = el("i"); fill.style.width = Math.max(6, Math.min(100, expOf(p) / swMax * 100)) + "%"; bar.appendChild(fill); ex.appendChild(bar);
            ex.appendChild(el("small", null, "esperados"));
            r.appendChild(ex);
            return r;
          };
          entran.forEach((p) => sw.appendChild(mk(p, "in")));
          salen.forEach((p) => sw.appendChild(mk(p, "out")));
          wrap.appendChild(sw);
        }
        out.appendChild(wrap);
      }
      const fb = el("div", "an-forma");
      out.appendChild(fb);
      anFormaRender = () => renderForma(fb, tits.concat(sups), d);
      anFormaRender();
    }


    // Plan de cambios por horario: en Futmondo puedes cambiar a un jugador
    // mientras NO haya jugado todavía (las veces que haga falta), pero en
    // cuanto haya puntuado algún titular, ya solo queda UN cambio de
    // emergencia para el resto de la jornada (no uno por posición). Por eso
    // conviene alinear primero a los que juegan antes y dejar en el banco,
    // como "segunda bala", a alguien de la misma posición que juegue más
    // tarde — así, si un titular lo hace mal, ese cambio de emergencia se
    // gasta en el que de verdad lo necesita. Esto se calcula aquí con las
    // fechas reales de cada partido, en vez de depender de que la IA lo
    // acierte en el texto libre.
    clearInterval(anRefT); anRefT = setInterval(anRefresh, 300000);
  }

  // Histórico de capitán: cada vez que analizas tu equipo se guarda a quién
  // recomendamos de capitán esa jornada; aquí se compara con los puntos
  // reales en cuanto termina el partido (fuente: puntos por jornada de
  // Futmondo), para poder ver si merece la pena fiarse del consejo.
  let capHistLoaded = false;
  async function renderCapHistorial() {
    const box = $("anCapHist");
    if (!box || capHistLoaded) return;
    capHistLoaded = true;
    box.innerHTML = '<div class="mpage-skel" aria-hidden="true"><i class="h"></i><i></i><i></i></div>';
    try {
      const d = await (await fetch(API + "/capitan-historial", { cache: "no-store" })).json();
      const hist = (d && d.historial) || [];
      if (!hist.length) { box.innerHTML = ""; return; }
      box.innerHTML = "";
      const sec = el("div", "estado-sec an-caphist");
      sec.appendChild(el("div", "estado-title", "📊 Histórico de capitán"));
      let wins = 0, resolved = 0;
      hist.forEach((h) => {
        const results = h.results || [];
        const cap = (h.chosen && results.find((r) => String(r.id) === String(h.chosen))) || results[0];
        if (!cap) return;
        const row = el("div", "cap-hist-row");
        row.appendChild(el("div", "cap-hist-j", "J" + h.jornada));
        const ph = el("div", "cap-hist-photo"); ph.appendChild(photoImg(cap.photo)); row.appendChild(ph);
        const body = el("div", "cap-hist-body");
        body.appendChild(el("div", "cap-hist-name", cap.nombre || ""));
        if (h.resolved) {
          resolved++;
          const best = results.reduce((m, r) => (r.points != null && (m == null || r.points > m)) ? r.points : m, null);
          const fue = cap.points != null && best != null && cap.points >= best;
          if (fue) wins++;
          const alts = results.filter((r) => r !== cap).map((r) => (r.nombre || "") + " " + (r.points != null ? r.points : "?")).join(" · ");
          body.appendChild(el("div", "cap-hist-alts", alts ? "Alternativas: " + alts : ""));
          const pts = el("span", "cap-hist-pts" + (fue ? " win" : ""), (cap.points != null ? cap.points : "?") + " pts" + (fue ? " 👑 mejor opción" : ""));
          row.appendChild(body);
          row.appendChild(pts);
        } else {
          body.appendChild(el("div", "cap-hist-alts", "pendiente de que termine su partido"));
          row.appendChild(body);
          row.appendChild(el("span", "cap-hist-pts pending", "…"));
        }
        sec.appendChild(row);
      });
      if (resolved) sec.insertBefore(el("div", "cap-hist-summary", "Tu capitán fue la mejor opción en " + wins + " de " + resolved + " jornadas resueltas."), sec.children[2] || null);
      box.appendChild(sec);
    } catch (e) { box.innerHTML = ""; }
  }

  const anFile = $("anFile");
  if (anFile) anFile.addEventListener("change", () => {
    const f = anFile.files && anFile.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { anImg = rd.result; const pv = $("anPreview"); if (pv) { pv.src = anImg; pv.classList.remove("hidden"); } const m = $("anMsg"); if (m) m.textContent = ""; };
    rd.readAsDataURL(f);
  });
  const anBtn = $("anBtn");
  if (anBtn) anBtn.addEventListener("click", async () => {
    if (!anImg) { $("anMsg").textContent = "Elige primero una captura de tu equipo."; return; }
    $("anOut").innerHTML = "";
    const d = await runAnaliza({ img: anImg }, "Analizando…");
    if (d) renderAnalisis(d);
  });

  const fclose = $("fichaClose"); if (fclose) fclose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const ov = $("fichaOverlay"); if (ov && !ov.classList.contains("hidden")) closeModal(); } });
  const fov = $("fichaOverlay"); if (fov) fov.addEventListener("click", (e) => { if (e.target === fov) closeModal(); });

  const bind = (id, ev) => { const e = $(id); if (e) e.addEventListener(ev, () => { shown = 18; renderGrid(); }); };
  const searchEl = $("mjSearch");
  if (searchEl) {
    // Al tocar el buscador sube arriba para que las sugerencias queden a la vista.
    searchEl.addEventListener("focus", () => [120, 450, 800].forEach((t) => setTimeout(() => { try { if (document.activeElement !== searchEl) return; const r = searchEl.getBoundingClientRect(); if (Math.abs(r.top - 128) > 6) window.scrollBy(0, r.top - 128); } catch (e) {} }, t)));
  }
  if (searchEl) {
    // Sugerencias justo debajo del buscador: se ven aunque el teclado tape la lista.
    const sug = el("div", "mj-suggest"); sug.id = "mjSuggest"; sug.hidden = true;
    searchEl.insertAdjacentElement("afterend", sug);
    const upd = () => {
      const q = stripAccents(String(searchEl.value || "").toLowerCase()).trim();
      sug.innerHTML = "";
      if (q.length < 2 || !all || !all.length) { sug.hidden = true; return; }
      const hits = all.filter((p) => stripAccents(String(p.name || "").toLowerCase()).indexOf(q) >= 0).sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).slice(0, 6);
      if (!hits.length) { sug.appendChild(el("div", "mj-sug-empty", "Ningún jugador se llama así")); sug.hidden = false; return; }
      hits.forEach((p) => {
        const r = el("button", "mj-sug-row"); r.type = "button";
        const im = el("img", "mj-sug-ph"); im.src = p.photo || "/img/avatar.svg"; im.alt = ""; r.appendChild(im);
        const tx = el("span", "mj-sug-tx");
        const l1 = el("span", "mj-sug-l1"); l1.appendChild(el("b", null, p.name));
        const rb = roleBadge(p.role);
        if (rb) l1.appendChild(el("span", "posb posb-" + posCls(p.role), rb + (roleBadge(p.role2) ? "·" + roleBadge(p.role2) : "")));
        tx.appendChild(l1);
        const l2 = el("small", "mj-sug-l2");
        if (p.logo) { const lg = el("img", "mj-sug-crest"); lg.src = p.logo; lg.alt = ""; l2.appendChild(lg); }
        l2.appendChild(document.createTextNode(p.team || ""));
        tx.appendChild(l2);
        const rt = el("span", "mj-sug-r");
        if (p.value) rt.appendChild(el("b", null, money(p.value) + " €"));
        const chg = hlChange(p);
        if (chg) rt.appendChild(el("small", chg > 0 ? "up" : "down", (chg > 0 ? "▲ +" : "▼ −") + formatDots(Math.abs(chg)) + " €"));
        tx.appendChild(rt);
        const l3 = el("span", "mj-sug-l3");
        const st = String(p.status || "");
        if (st === "redcard") l3.appendChild(el("i", "bad", "Sancionado 🟥"));
        else if (st.indexOf("injured") === 0) l3.appendChild(el("i", "bad", "Lesionado ❌"));
        else if (st === "doubt") l3.appendChild(el("i", "mid", "Duda 🟠"));
        if (Number(p.avg) > 0) l3.appendChild(el("i", null, "Media " + Number(p.avg).toFixed(1).replace(".", ",") + " pts"));
        if (p.prob != null) l3.appendChild(el("i", null, p.prob + "% de jugar"));
        const fl = (p.fitness || []).slice(-5);
        if (fl.length) l3.appendChild(el("i", null, "Últimos: " + fl.map((x) => Number(x) || 0).join(" · ")));
        if (l3.childNodes.length) tx.appendChild(l3);
        r.appendChild(tx);
        r.addEventListener("mousedown", (e) => e.preventDefault());
        r.addEventListener("click", () => openFicha(p));
        sug.appendChild(r);
      });
      sug.hidden = false;
    };
    searchEl.addEventListener("input", upd);
  }
  if (searchEl) searchEl.addEventListener("input", () => { const y = window.scrollY; shown = 18; renderGrid(); if (window.scrollY !== y) window.scrollTo(0, y); });
  bind("mjRole", "change");
  document.querySelectorAll("#mxPrice .mx-chip").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mxPrice .mx-chip").forEach((x) => x.classList.toggle("active", x === b));
    rangeMin = Number(b.dataset.min) || 0; rangeMax = Number(b.dataset.max) || Infinity;
    shown = 18; renderGrid();
  }));
  document.querySelectorAll("#mxRole .mx-chip").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mxRole .mx-chip").forEach((x) => x.classList.toggle("active", x === b));
    const sel = $("mjRole"); if (sel) { sel.value = b.dataset.role || ""; sel.dispatchEvent(new Event("change")); }
  }));

  const estadoSel = $("estadoSel"); if (estadoSel) estadoSel.addEventListener("change", renderEstado);
  const teamSel = $("mjTeam"); if (teamSel) teamSel.addEventListener("change", () => { syncClubActive(); shown = 18; renderGrid(); });

  document.addEventListener("cx:news", (e) => {
    const d = e.detail || {};
    switchTab("noticias");
    openNoticiaInline(d.link, d.title);
  });

  document.addEventListener("cx:once", (e) => {
    const d = e.detail || {};
    if (!d.home || !d.away) return;
    location.href = "/futmondo/guiafantasy/partido/" + matchSlug(d.home, d.away) + (d.jornada ? "?j=" + encodeURIComponent(d.jornada) : "");
  });

  // El cambio de pestaña deslizando con el dedo se quitó: en móvil daba
  // saltos sin querer al hacer scroll. Las pestañas se cambian con su botón.

  (async function initUserChip() {
    const ub = $("userBox");
    if (!ub) return;
    try {
      const d = await (await fetch(API + "/me", { cache: "no-store" })).json();
      const name = d && d.user && d.user.name;
      if (!name) return;
      const parts = String(name).trim().split(/\s+/).filter(Boolean);
      const ini = (parts.length <= 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
      ub.hidden = false;
      const chip = el("button", "user-chip"); chip.type = "button";
      chip.appendChild(el("span", "user-avatar", ini));
      chip.appendChild(el("span", "user-name", name));
      chip.appendChild(el("span", "user-caret", "▾"));
      const menu = el("div", "user-menu");
      const exit = el("button", "user-menu-exit", "Salir"); exit.type = "button";
      exit.addEventListener("click", async () => { try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {} location.reload(); });
      menu.appendChild(exit);
      ub.appendChild(chip); ub.appendChild(menu);
      chip.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
      document.addEventListener("click", (e) => { if (!ub.contains(e.target)) menu.classList.remove("open"); });
      // Aviso del vigilante de futbolfantasy.com: solo para Edu (admin), y
      // solo lee el último resultado guardado (no dispara las 20
      // comprobaciones al vuelo) — eso lo hace el cron semanal.
      if (d.admin) {
        try {
          const h = await (await fetch(API + "/ff-health", { cache: "no-store" })).json();
          const lines = [];
          if (h && h.broken && h.broken.length) {
            lines.push("⚠️ futbolfantasy.com no está cargando jugadores para: " + h.broken.join(", ") + " — puede que hayan cambiado de slug (revisar getFFTeam).");
          }
          if (h && h.issues && h.issues.length) {
            h.issues.forEach((it) => lines.push("⚠️ " + (it.detail || ("Fallo en " + it.source))));
          }
          let freshNames = [];
          if (h && h.newAccounts && h.newAccounts.length) {
            // Se avisa una sola vez por cuenta (se recuerda en este dispositivo, al abrir el menú).
            let seen = [];
            try { seen = JSON.parse(localStorage.getItem("seen_new_accounts") || "[]"); } catch (e) {}
            freshNames = h.newAccounts.map((a) => a.name).filter((n) => seen.indexOf(n) < 0);
            if (freshNames.length) lines.push("🆕 Cuenta(s) nueva(s) estos días: " + freshNames.join(", ") + ". Revisa que no sea nadie ocupando el nombre de otro.");
          }
          if (lines.length) {
            // Avisos de admin: un puntito rojo en el avatar y el detalle dentro del menú (no una barra roja en la página).
            const av = chip.querySelector(".user-avatar");
            if (av) av.classList.add("has-alert");
            const box = el("div", "user-menu-alerts");
            lines.forEach((t) => box.appendChild(el("p", null, t)));
            menu.insertBefore(box, menu.firstChild);
            chip.addEventListener("click", () => {
              if (!freshNames.length) return;
              try { const seen = JSON.parse(localStorage.getItem("seen_new_accounts") || "[]"); localStorage.setItem("seen_new_accounts", JSON.stringify(seen.concat(freshNames))); } catch (e) {}
              freshNames = [];
              if (!h.broken?.length && !(h.issues || []).length && av) av.classList.remove("has-alert");
            });
          }
        } catch (e) {}
      }
    } catch (e) {}
  })();

/* ---------- Pestaña Plantillas: lista de jugadores filtrable por club y posición ---------- */
  async function initPlantillas() {
    if (pltInit) return;
    pltInit = true;
    try {
      let players = all && all.length > 100 ? all : null;
      if (!players) { const d = await (await fetch(API + "/mercado")).json(); players = d.players || []; }
      pltPlayers = players;
    } catch (e) { pltInit = false; const l = $("pltList"); if (l) l.innerHTML = "<p class='muted'>No se pudo cargar la lista.</p>"; return; }
    pltLoadState();
    renderPltControls();
    renderPltList();
  }
  const PLT_PER = [["chg7", "7 días"], ["chg30", "30 días"], ["chgAll", "Temporada"]];
  function pltSave() { try { sessionStorage.setItem("pltState", JSON.stringify({ c: pltClub, p: pltPos, s: pltSort, d: pltDir, per: pltPeriod, n: pltShown })); } catch (e) {} }
  function pltLoadState() {
    try {
      const s = JSON.parse(sessionStorage.getItem("pltState") || "null");
      if (!s) return;
      pltClub = s.c || ""; pltPos = s.p || ""; pltSort = s.s || "points"; pltDir = s.d === 1 ? 1 : -1; pltPeriod = s.per || "chg7"; pltShown = Number(s.n) > 0 ? Math.min(Number(s.n), 400) : 40;
    } catch (e) {}
  }
  function pltRerender() { pltShown = 40; renderPltControls(); renderPltList(); }
  function pltBtn(label, on, fn, cls) {
    const b = el("button", "plt-btn" + (cls ? " " + cls : "") + (on ? " on" : ""), label); b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function renderPltControls() {
    const clubs = $("pltClubs"), pos = $("pltPos"), sort = $("pltSort"), per = $("pltPeriod");
    if (!clubs) return;
    const keep = clubs.scrollLeft;
    clubs.innerHTML = "";
    clubs.appendChild(pltBtn("Todos", !pltClub, () => { pltClub = ""; pltRerender(); }, "plt-all"));
    const seen = {};
    pltPlayers.forEach((p) => { if (p.team && !seen[p.team]) seen[p.team] = p.logo || ""; });
    Object.keys(seen).sort((a, b) => a.localeCompare(b)).forEach((t) => {
      const b = pltBtn("", pltClub === t, () => { pltClub = pltClub === t ? "" : t; pltRerender(); }, "plt-club"); b.title = t;
      if (seen[t]) { const im = el("img"); im.src = seen[t]; im.alt = t; im.loading = "lazy"; b.appendChild(im); } else b.textContent = t.slice(0, 3);
      clubs.appendChild(b);
    });
    clubs.scrollLeft = keep;
    if (!keep) { const onb = clubs.querySelector(".plt-club.on"); if (onb) clubs.scrollLeft = Math.max(0, onb.offsetLeft - 60); }
    pltArrows();
    pos.innerHTML = "";
    [["", "Todos"], ["portero", "Portero"], ["defensa", "Defensa"], ["centrocampista", "Medio"], ["delantero", "Delantero"]].forEach((x) => {
      pos.appendChild(pltBtn(x[1], pltPos === x[0], () => { pltPos = x[0]; pltRerender(); }));
    });
    sort.innerHTML = "";
    sort.appendChild(el("span", "plt-lbl", "Ordenar"));
    [["points", "Puntos"], ["value", "Precio"], ["avg", "Media"], ["rise", "Subidas"]].forEach((x) => {
      const on = pltSort === x[0];
      sort.appendChild(pltBtn(x[1] + (on ? (pltDir < 0 ? " ↓" : " ↑") : ""), on, () => {
        if (pltSort === x[0]) pltDir = -pltDir; else { pltSort = x[0]; pltDir = -1; }
        pltRerender();
      }));
    });
    per.innerHTML = "";
    per.hidden = pltSort !== "rise";
    if (pltSort === "rise") {
      PLT_PER.forEach((x) => per.appendChild(pltBtn(x[1], pltPeriod === x[0], () => { pltPeriod = x[0]; pltRerender(); }, "plt-per-b")));
    }
  }
  function pltArrows() {
    const c = $("pltClubs"), w = $("pltClubWrap");
    if (!c || !w) return;
    w.classList.toggle("can-l", c.scrollLeft > 4);
    w.classList.toggle("can-r", c.scrollLeft + c.clientWidth < c.scrollWidth - 4);
  }
  (function pltStickyTop() {
    const set = () => { const hd = document.querySelector(".cx-header"); if (hd) document.documentElement.style.setProperty("--plt-top", hd.offsetHeight + "px"); };
    set(); window.addEventListener("resize", set); window.addEventListener("load", set);
  })();
  (function pltBindArrows() {
    const c = $("pltClubs"), w = $("pltClubWrap");
    if (!c || !w) return;
    c.addEventListener("scroll", pltArrows, { passive: true });
    window.addEventListener("resize", pltArrows);
    w.querySelectorAll(".plt-arrow").forEach((a) => a.addEventListener("click", () => {
      c.scrollBy({ left: (a.dataset.dir === "l" ? -1 : 1) * Math.max(160, c.clientWidth * 0.7), behavior: "smooth" });
    }));
  })();
  function pltBuildRow(p, o) {
      const row = el("div", "plt-row"); row.addEventListener("click", () => openFicha(p));
      row.addEventListener("pointerdown", () => { try { fetch(API + "/jugador?id=" + encodeURIComponent(p.id) + "&fast=1").catch(() => {}); } catch (e) {} }, { passive: true }); // calienta la ficha mientras se pulsa
      const ph = el("div", "plt-ph");
      const inn = el("div", "plt-in");
      if (p.photo) { const im = el("img"); im.src = p.photo; im.alt = ""; im.loading = "lazy"; im.addEventListener("error", () => im.remove()); inn.appendChild(im); }
      ph.appendChild(inn);
      posRingCls(ph, p.role, p.role2);
      const wrap = el("div", "plt-phw");
      wrap.appendChild(ph);
      if (p.logo) { const lg = el("img", "plt-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; wrap.appendChild(lg); }
      const rst = statusInfo(p.status);
      if (rst) wrap.appendChild(el("span", "plt-st " + rst.cls, rst.label));
      const phc = el("div", "plt-phc");
      phc.appendChild(wrap);
      const rb = roleBadge(p.role), rb2 = roleBadge(p.role2);
      if (rb) {
        const pill = el("span", "plt-pill posb posb-" + posCls(p.role), rb + (rb2 ? " · " + rb2 : ""));
        splitBadge(pill);
        phc.appendChild(pill);
      }
      row.appendChild(phc);
      const mid = el("div", "plt-mid");
      if (o.tag) mid.appendChild(el("div", "plt-tag " + o.tag[0], o.tag[1]));
      const nm = el("div", "plt-nm");
      nm.appendChild(el("span", "plt-name", p.name));
      mid.appendChild(nm);
      mid.appendChild(el("div", "plt-val", money(p.value) + " €"));
      const chg = o.chg;
      const t = chg > 0 ? "▲ " + formatDots(chg) + " €" : chg < 0 ? "▼ " + formatDots(-chg) + " €" : "—";
      mid.appendChild(el("div", "plt-chg " + (chg > 0 ? "up" : chg < 0 ? "down" : "flat"), t));
      row.appendChild(mid);
      const side = el("div", "plt-side");
      const fit = el("div", "plt-fit");
      const f = (p.fit || p.fitness || []).slice(-5);
      for (let k = 0; k < f.length; k++) {
        const idx = f.length - 1 - k;
        const raw = f[idx];
        const ok = !(raw === null || raw === undefined || raw === "" || raw === "-" || raw === "–");
        const v = Math.round(Number(raw) || 0);
        const j = jLab(p.team, f.length, k);
        const cls = !ok ? " zero" : v >= 6 ? " hi" : v >= 4 ? " mid" : v > 0 ? " lo" : v < 0 ? " neg" : " z0";
        const cell = el("span", "racha-chip" + cls);
        if (j > 0) cell.appendChild(el("i", null, "J" + j));
        cell.appendChild(el("b", null, ok ? String(v) : "–"));
        fit.insertBefore(cell, fit.firstChild);
      }
      const lj = liveJ[teamCanon(p.team)];
      if (lj) {
        const cell = el("span", "racha-chip live"); cell.title = "Partido en juego";
        cell.appendChild(el("i", null, "J" + lj)); cell.appendChild(el("b", null, "●"));
        fit.appendChild(cell);
      }
      side.appendChild(fit);
      row.appendChild(side);
      if (o.why) { row.classList.add("has-why"); row.appendChild(el("div", "plt-why", o.why)); }
      const rt = el("div", "plt-rt");
      const pts = el("div", "plt-pts"); pts.appendChild(el("b", null, String(Number(p.points) || 0))); pts.appendChild(el("small", null, "PTS"));
      const avg = el("div", "plt-avg"); avg.appendChild(el("b", null, (Number(p.avg) || 0).toFixed(1).replace(".", ","))); avg.appendChild(el("small", null, "MEDIA"));
      rt.appendChild(pts); rt.appendChild(avg);
      row.appendChild(rt);
      return row;
  }
  function renderPltList() {
    const box = $("pltList");
    if (!box) return;
    pltSave();
    const rise = pltSort === "rise";
    const key = rise ? pltPeriod : pltSort;
    let list = pltPlayers.filter((p) => (!pltClub || p.team === pltClub) && (!pltPos || String(p.role || "").toLowerCase() === pltPos));
    list = list.slice().sort((a, b) => pltDir * ((Number(a[key]) || 0) - (Number(b[key]) || 0)));
    box.innerHTML = "";
    if (!list.length) { box.appendChild(el("p", "muted", "Sin jugadores.")); return; }
    const j0 = pltPlayers.reduce((m, p) => Math.max(m, Number(p.matches) || 0), 0);
    list.slice(0, pltShown).forEach((p) => {
      box.appendChild(pltBuildRow(p, { chg: Number(rise ? p[pltPeriod] : p.change) || 0 }));
    });
    if (list.length > pltShown) {
      const more = el("button", "btn-ghost market-more", "Ver más (" + (list.length - pltShown) + ")"); more.type = "button";
      more.addEventListener("click", () => { pltShown += 40; renderPltList(); });
      box.appendChild(more);
    }
  }

  loadNoticias();
  load();
})();
