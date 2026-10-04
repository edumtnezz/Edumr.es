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
    const codes = String(b.textContent || "").split("·").map((s) => s.trim());
    if (codes.length === 2 && POSCOL_BY_CODE[codes[0]] && POSCOL_BY_CODE[codes[1]]) {
      b.style.background = "linear-gradient(120deg, " + POSCOL_BY_CODE[codes[0]] + " 0%, " + POSCOL_BY_CODE[codes[1]] + " 100%)";
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
  let shown = 60;
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
      b.addEventListener("click", () => { quick = k; shown = 60; renderChips(); renderGrid(); });
      box.appendChild(b);
    });
  }
  let teamFilter = "";
  let rangeInit = false;
  let selA = null, selB = null;
  let rangeMin = 0;
  let rangeMax = Infinity;

  function $(id) { return document.getElementById(id); }
  function money(n) { return Number(n || 0).toLocaleString("es-ES"); }
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function stripAccents(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function formatDots(v) { const d = String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+(?=\d)/, ""); return d.replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
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
    const v = p["chg" + hlPeriod];
    return v != null ? Number(v) : (Number(p.change) || 0);
  }
  function renderHighlights() {
    const box = $("mercHighlights");
    if (!box) return;
    box.innerHTML = "";
    const seg = el("div", "hl-seg");
    [["1", "Hoy"], ["7", "7 días"], ["14", "14 días"], ["30", "30 días"]].forEach((pair) => {
      const b = el("button", "hl-btn" + (hlPeriod === pair[0] ? " active" : ""), pair[1]);
      b.type = "button";
      b.addEventListener("click", () => { hlPeriod = pair[0]; renderHighlights(); });
      seg.appendChild(b);
    });
    const head = el("div", "hl-head");
    head.appendChild(el("span", "hl-title", "📊 Movimiento del mercado"));
    head.appendChild(seg);
    box.appendChild(head);
    const up = all.filter((p) => hlChange(p) > 0).sort((a, b) => hlChange(b) - hlChange(a)).slice(0, 5);
    const down = all.filter((p) => hlChange(p) < 0).sort((a, b) => hlChange(a) - hlChange(b)).slice(0, 5);
    if (!up.length && !down.length) return;
    const wrap = el("div", "merc-cols");
    const col = (title, list, cls) => {
      const c = el("div", "merc-col");
      c.appendChild(el("div", "merc-col-title " + cls, title));
      list.forEach((p) => {
        const row = el("button", "merc-row"); row.type = "button";
        const ph = el("div", "merc-row-photo");
        const im = el("img", "merc-row-img"); im.loading = "lazy"; im.alt = ""; im.src = p.photo || "/img/avatar.svg";
        im.addEventListener("error", () => { if (im.getAttribute("src") !== "/img/avatar.svg") im.src = "/img/avatar.svg"; }, { once: true });
        ph.appendChild(im);
        const rb = roleBadge(p.role);
        if (rb) ph.appendChild(el("span", "merc-row-role posb posb-" + posCls(p.role), rb));
        row.appendChild(ph);
        const info = el("div", "merc-row-info");
        info.appendChild(el("span", "merc-row-name", p.name));
        const meta = el("div", "merc-row-meta");
        if (p.logo) { const lg = el("img", "merc-row-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; meta.appendChild(lg); }
        if (p.team) meta.appendChild(el("span", null, p.team));
        info.appendChild(meta);
        row.appendChild(info);
        row.appendChild(el("span", "merc-row-val " + cls, (cls === "up" ? "▲ " : "▼ ") + formatDots(Math.abs(hlChange(p))) + " €"));
        row.addEventListener("click", () => openFicha(p));
        c.appendChild(row);
      });
      return c;
    };
    wrap.appendChild(col("Más suben", up, "up"));
    wrap.appendChild(col("Más bajan", down, "down"));
    box.appendChild(wrap);
  }

  async function renderRachas() {
    const box = $("mercRachas");
    if (!box) return;
    box.innerHTML = "";
    const head = el("div", "hl-head");
    head.appendChild(el("span", "hl-title", "🔥 Jugadores en racha"));
    head.appendChild(el("span", "rachas-sub", "3+ partidos seguidos puntuando · Futmondo Social"));
    box.appendChild(head);
    const table = el("div", "rachas-table");
    table.innerHTML = '<div class="rachas-empty">Cargando rachas…</div>';
    box.appendChild(table);
    try {
      const d = await (await fetch(API + "/rachas")).json();
      const list = (d && d.players) || [];
      if (!list.length) { table.innerHTML = '<div class="rachas-empty">Sin rachas ahora mismo.</div>'; return; }
      table.innerHTML = "";
      list.slice(0, 12).forEach((p) => {
        const row = el("button", "racha-row"); row.type = "button";
        const ph = el("div", "racha-photo");
        const im = el("img", ""); im.loading = "lazy"; im.alt = ""; im.src = p.photo || "/img/avatar.svg";
        im.addEventListener("error", () => { if (im.getAttribute("src") !== "/img/avatar.svg") im.src = "/img/avatar.svg"; }, { once: true });
        ph.appendChild(im);
        row.appendChild(ph);
        const info = el("div", "racha-info");
        info.appendChild(el("span", "racha-name", p.name));
        const meta = el("div", "racha-meta");
        if (p.logo) { const lg = el("img", "racha-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; meta.appendChild(lg); }
        if (p.team) meta.appendChild(el("span", null, p.team));
        const rb = roleBadge(p.role);
        if (rb) meta.appendChild(el("span", "racha-role posb posb-" + posCls(p.role), rb));
        info.appendChild(meta);
        row.appendChild(info);
        const chips = el("div", "racha-scores");
        (p.last3 || []).forEach((v) => {
          const n = Math.round(Number(v) || 0);
          chips.appendChild(el("span", "racha-chip" + (n >= 6 ? " hi" : n >= 4 ? " mid" : " lo"), String(n)));
        });
        row.appendChild(chips);
        const stk = el("div", "racha-streak");
        stk.appendChild(el("b", null, String(p.streak)));
        stk.appendChild(el("small", null, "en racha"));
        row.appendChild(stk);
        const stats = el("div", "racha-stats");
        stats.appendChild(el("span", null, "PTS " + (Number(p.points) || 0)));
        stats.appendChild(el("span", null, "MED " + (Number(p.avg) || 0).toFixed(1).replace(".", ",")));
        row.appendChild(stats);
        row.appendChild(el("div", "racha-val", money(p.value) + " €"));
        row.addEventListener("click", () => openFicha(p));
        table.appendChild(row);
      });
    } catch (e) { table.innerHTML = '<div class="rachas-empty">No se pudo cargar.</div>'; }
  }

  function filteredList() {
    const q = stripAccents($("mjSearch") ? $("mjSearch").value.trim() : "");
    const team = teamFilter;
    const role = $("mjRole") ? $("mjRole").value : "";
    let list = all.filter((p) => {
      if (q && !stripAccents(p.name).includes(q)) return false;
      if (team && p.team !== team) return false;
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
    else if (sortMode === "up") list = list.filter((p) => (Number(p.change) || 0) > 0).sort((a, b) => b.change - a.change);
    else if (sortMode === "down") list = list.filter((p) => (Number(p.change) || 0) < 0).sort((a, b) => a.change - b.change);
    else list = list.slice().sort((a, b) => b.value - a.value);
    return list;
  }

  function renderGrid() {
    const grid = $("marketGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const list = filteredList();
    if (!list.length) { grid.appendChild(el("p", "market-empty", "Sin resultados.")); return; }
    list.slice(0, shown).forEach((p) => grid.appendChild(playerCard(p, openFicha)));
    if (list.length > shown) {
      const more = el("button", "btn-ghost market-more", "Ver más (" + (list.length - shown) + ")");
      more.addEventListener("click", () => { shown += 60; renderGrid(); });
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
    shown = 60;
    renderGrid();
    const grid = $("marketGrid");
    if (grid && grid.scrollIntoView) grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function syncClubActive() {
    document.querySelectorAll(".merc-club").forEach((x) => {
      const on = x.classList.contains("merc-club-all") ? !teamFilter : (x.title === teamFilter);
      x.classList.toggle("active", !!on);
    });
  }

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
      shown = 60;
      renderGrid();
    };
    min.addEventListener("input", apply);
    max.addEventListener("input", apply);
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    const panel = $("tab-" + name);
    if (panel) panel.classList.remove("hidden");
    try { sessionStorage.setItem("merc_tab", name); } catch (e) {}
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

  function renderBest() {
    const box = $("mercBest");
    if (!box) return;
    box.innerHTML = "";
    const cand = all.filter((p) => p.fitness && p.fitness.length >= 3 && p.value > 0);
    if (cand.length < 8) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const byExp = cand.slice().sort((a, b) => expOf(b) - expOf(a));
    const picked = [], seen = new Set();
    ["portero", "defensa", "centrocampista", "delantero"].forEach((pos) => {
      byExp.filter((p) => p.role === pos).slice(0, 2).forEach((p) => { if (!seen.has(p)) { picked.push(p); seen.add(p); } });
    });
    byExp.forEach((p) => { if (picked.length < 12 && !seen.has(p)) { picked.push(p); seen.add(p); } });
    const top = picked.sort((a, b) => expOf(b) - expOf(a));
    const head = el("div", "merc-besthead");
    head.appendChild(el("span", "mbh-t", "⭐ Mejor fichaje de la jornada"));
    box.appendChild(head);
    const row = el("div", "merc-bestrow");
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
  }

  async function load() {
    try {
      const res = await fetch(API + "/mercado");
      const d = await res.json();
      if (Array.isArray(d.players)) all = d.players;
      updateTime(d.updatedAt);
      renderHighlights();
      renderBest();
      renderRachas();
      renderGrid();
      renderEstado();
      if (all.length && !rangeInit) {
        rangeInit = true;
        setupRange();
      }
      setupClubs();
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
  function newsMatchMyTeam(x) {
    if (!myTeam.length) return true;
    const t = stripAccents(String(x.title || "") + " " + String(x.lead || ""));
    return myTeam.some((n) => { const k = stripAccents(n); return k.length >= 4 && t.includes(k); });
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
      list.forEach((x) => {
        const it = el("div", "newscard news-link");
        it.addEventListener("click", () => openNoticia(x.link, x.title));
        const th = el("div", "newscard-thumb" + (x.thumb ? "" : " ball"));
        const im = el("img"); im.alt = ""; im.loading = "lazy"; im.src = x.thumb || "/img/balon.svg";
        im.addEventListener("error", () => { im.src = "/img/balon.svg"; it.querySelector(".newscard-thumb").classList.add("ball"); }, { once: true });
        th.appendChild(im);
        it.appendChild(th);
        const bd = el("div", "newscard-body");
        bd.appendChild(el("div", "news-title", x.title));
        bd.appendChild(el("div", "news-date", x.date + (x.time ? " · " + x.time : "")));
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

  function showModal(node) {
    const body = $("fichaBody");
    if (!body) return;
    body.innerHTML = "";
    body.appendChild(node);
    const ov = $("fichaOverlay");
    if (ov) ov.classList.remove("hidden");
  }
  function closeModal() {
    const ov = $("fichaOverlay");
    if (ov) ov.classList.add("hidden");
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

  function openFicha(p) {
    const w = el("div");
    w.appendChild(el("p", "muted small", "Cargando ficha…"));
    showModal(w);
    fetch(API + "/jugador?id=" + encodeURIComponent(p.id || ""))
      .then((r) => r.json())
      .then((d) => showModal(renderFicha(d, p)))
      .catch(() => { const c = el("div"); c.appendChild(el("p", "muted small", "No se pudo cargar la ficha.")); showModal(c); });
  }

  function ptClass(p) { p = Number(p) || 0; return p < 0 ? "lo" : p < 6 ? "mid" : "hi"; }
  const whenShort = (v) => { if (!v) return ""; try { return new Date(v).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }); } catch (e) { return ""; } };
  function shortRival(s) { const t = String(s || "").trim(); return t.length > 14 ? t.slice(0, 13) + "…" : t; }

  function renderFicha(d, p) {
    const root = el("div", "ficha");
    const head = el("div", "ficha-head-center");
    const ph = el("div", "mcard-photo");
    ph.appendChild(posRing(photoImg(d.photo || p.photo, "mcard-img"), d.role || p.role, d.role2 || p.role2));
    const rb = roleBadge(d.role || p.role), rb2 = roleBadge(d.role2 || p.role2);
    if (rb) ph.appendChild(el("span", "mcard-role" + (rb2 ? " multi" : "") + " posb posb-" + posCls(p.role), rb + (rb2 ? " · " + rb2 : "")));
    head.appendChild(ph);
    head.appendChild(el("h2", "ficha-name", d.name || p.name || ""));
    const teamName = d.team || p.team || "";
    const teamLogo = d.logo || p.logo || "";
    if (teamName || teamLogo) {
      const tt = el("div", "ficha-team");
      if (teamLogo) { const lg = el("img"); lg.src = teamLogo; lg.alt = ""; lg.loading = "lazy"; tt.appendChild(lg); }
      tt.appendChild(el("span", null, teamName));
      head.appendChild(tt);
    }
    head.appendChild(el("div", "ficha-val", money(d.value || p.value) + " €"));
    const chg = Number(d.change != null ? d.change : p.change) || 0;
    head.appendChild(el("div", "cmp-trend " + (chg > 0 ? "up" : chg < 0 ? "down" : "flat"),
      chg > 0 ? "▲ " + formatDots(chg) + " €" + pct(d.value || p.value, chg) : chg < 0 ? "▼ " + formatDots(-chg) + " €" + pct(d.value || p.value, chg) : "—"));
    head.appendChild(el("div", "cmp-status", statusLabel(d.status || p.status)));
    if (d.pronostico) head.appendChild(el("div", "ficha-pron", "Pronóstico: " + d.pronostico));
    root.appendChild(head);

    const stats = el("div", "ficha-stats");
    const st = (label, val) => { const c = el("div", "ficha-stat"); c.appendChild(el("div", "fs-val", String(val))); c.appendChild(el("div", "fs-lab", label)); stats.appendChild(c); };
    st("Puntos", d.points || 0);
    st("Media", String(Math.round((Number(d.average) || 0) * 10) / 10).replace(".", ","));
    st("Partidos", d.matches5 || 0);
    root.appendChild(stats);
    const peers = all.filter((x) => x.role && x.role === (d.role || p.role));
    if (peers.length >= 8) {
      const cheaper = peers.filter((x) => (Number(x.value) || 0) < (Number(d.value) || 0)).length;
      const pct = Math.round((cheaper / (peers.length - 1)) * 100);
      root.appendChild(el("div", "ficha-pct", "💶 Precio: más caro que el " + pct + "% de los " + (roleFull(d.role || p.role) || "jugadores") + " (" + peers.length + ")"));
    }

    const cols = el("div", "ficha-cols");
    const colL = el("div", "ficha-col");
    const colR = el("div", "ficha-col");

    const ms = d.matches || [];
    if (ms.length) {
      colL.appendChild(el("div", "estado-title", "Puntos por jornada"));
      const tbl = el("div", "ficha-matches");
      ms.forEach((m) => {
        const row = el("div", "fm-row");
        row.appendChild(el("span", "fm-j", "J" + m.r));
        const rival = (m.home === d.team) ? m.away : (m.away === d.team ? m.home : (m.away || m.home));
        const casa = m.home === d.team;
        row.appendChild(el("span", "fm-match", (casa ? "🏠 " : "✈️ ") + (rival || "")));
        row.appendChild(el("span", "fm-pts pt-" + ptClass(m.stats), String(m.stats || 0)));
        tbl.appendChild(row);
      });
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
      const updown = vals.filter((x) => x.v != null && x.diff != null);
      let streak = 0, ssign = 0;
      for (const x of updown) {
        if (!x.diff) break;
        const s = x.diff > 0 ? 1 : -1;
        if (ssign === 0) ssign = s;
        if (s !== ssign) break;
        streak = x.days || 0;
      }
      if (streak > 0) {
        colR.appendChild(el("div", "fv-streak " + (ssign > 0 ? "up" : "down"),
          (ssign > 0 ? "📈 Lleva " : "📉 Lleva ") + streak + " día" + (streak === 1 ? "" : "s") + (ssign > 0 ? " subiendo" : " bajando")));
      }
      const serie = (d.temporada && d.temporada.serie) || [];
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
        r.appendChild(el("span", "fv-val", x.team || ""));
        t.appendChild(r);
      });
      colR.appendChild(t);
    }
    cols.appendChild(colL); cols.appendChild(colR);
    root.appendChild(cols);
    return root;
  }

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  (function restoreTab() {
    let name = "";
    try { name = sessionStorage.getItem("merc_tab") || ""; } catch (e) {}
    if (name && $("tab-" + name)) switchTab(name);
  })();
  document.querySelectorAll(".merc-segbtn").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".merc-segbtn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    sortMode = b.dataset.sort;
    shown = 60;
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
  async function runAnaliza(payload, prefijo) {
    const t0 = Date.now();
    const upd = () => { const s = Math.round((Date.now() - t0) / 1000); const m = $("anMsg"); if (m) m.textContent = "🧠 " + prefijo + " " + s + " s · suele tardar ~30 s, mantente a la espera"; };
    upd();
    const timer = setInterval(upd, 250);
    try {
      const r = await fetch(API + "/analiza", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      clearInterval(timer);
      const total = ((Date.now() - t0) / 1000).toFixed(1).replace(".", ",");
      if (!r.ok) { $("anMsg").textContent = (d.error || "No se pudo analizar.") + " · " + total + " s"; return null; }
      $("anMsg").textContent = "✅ Analizado en " + total + " s";
      return d;
    } catch (e) { clearInterval(timer); $("anMsg").textContent = "Error de red."; return null; }
  }

  function miniLine(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  function renderAiText(t) {
    const box = el("div", "an-ai");
    const ICONS = [["ONCE", "⭐"], ["PORTERO", "🧤"], ["DEFENSA", "🛡️"], ["MEDIO", "🎯"], ["DELANTERO", "⚽"], ["CAMBIOS", "🔄"], ["MULTIPOSICI", "↔️"], ["AVISO", "⏰"]];
    const iconOf = (title) => { const u = title.toUpperCase(); const f = ICONS.find((x) => u.indexOf(x[0]) === 0); return f ? f[1] : "•"; };
    const isLineup = (title) => /PORTERO|DEFENSA|MEDIO|DELANTERO/i.test(title);
    let body = null, lineup = false;
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
        sec.appendChild(hd);
        body = el("div", "an-sec-body");
        sec.appendChild(body);
        lineup = isLineup(title);
        box.appendChild(sec);
      } else if (body) {
        if (lineup && s.indexOf(",") >= 0) {
          s.split(",").map((x) => x.trim()).filter(Boolean).forEach((nm) => { const c = el("span", "an-chip"); c.innerHTML = miniLine(nm); body.appendChild(c); });
        } else {
          const line = el("div", "an-ai-line"); line.innerHTML = miniLine(s); body.appendChild(line);
        }
      } else {
        const line = el("div", "an-ai-line"); line.innerHTML = miniLine(s); box.appendChild(line);
      }
    });
    return box;
  }
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
      out.appendChild(box);
      const cla = tits.filter((p) => p.clause && p.valor && p.clause < p.valor * 1.6).sort((a, b) => scoreOf(b) - scoreOf(a));
      if (cla.length) {
        const cb = el("div", "an-clauses");
        cb.appendChild(el("div", "an-clauses-t", "🔒 Cláusulas bajas · súbeles la cláusula para no perderlos"));
        const grid = el("div", "an-clause-grid");
        cla.slice(0, 8).forEach((p) => {
          const c = el("div", "an-clause-card");
          const ph = el("div", "an-clause-photo");
          ph.appendChild(photoImg(p.photo));
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
    if (d.leido && d.leido.length && !anStale) out.appendChild(el("div", "an-leido", "🔎 La IA leyó: " + d.leido.join(", ")));
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
        const ph = el("span", "cmp-sugphoto"); ph.appendChild(photoImg(o.photo)); row.appendChild(ph);
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
    const pcard = (p, isBench) => {
      const card = el("div", "pitch-player" + (isBench ? " bench" : ""));
      const ph = el("div", "pitch-photo");
      ph.appendChild(photoImg(p.photo));
      card.appendChild(ph);
      card.appendChild(el("div", "pitch-name", p.nombre || ""));
      const info = el("div", "pitch-info");
      info.appendChild(el("span", "pc-prob", (p.prob != null ? p.prob : "?") + "%"));
      if (p.estado && p.estado !== "OK" && p.estado !== "?") info.appendChild(el("span", "pc-bad", p.estado));
      card.appendChild(info);
      if (p.rival) card.appendChild(el("div", "pitch-ha", (p.casa === true ? "🏠 " : p.casa === false ? "✈️ " : "") + p.rival));
      if (p.fecha) card.appendChild(el("div", "pitch-when", whenShort(p.fecha)));
      card.appendChild(el("div", "pitch-pts", p.puntos != null ? p.puntos + " pts" : ""));
      card.addEventListener("click", () => swapPicker(p));
      return card;
    };
    const field = el("div", "pitch");
    ["DEL", "CEN", "DEF", "POR"].forEach((pos) => {
      const ps = tits.filter((p) => p.pos === pos);
      if (!ps.length) return;
      const row = el("div", "pitch-row");
      ps.forEach((p) => row.appendChild(pcard(p, false)));
      field.appendChild(row);
    });
    if (field.children.length) out.appendChild(field);

    if (sups.length) {
      const bsec = el("div", "estado-sec");
      bsec.appendChild(el("div", "estado-title", "Banquillo (toca para meterlo en el once)"));
      const bench = el("div", "pitch-bench");
      sups.forEach((p) => bench.appendChild(pcard(p, true)));
      bsec.appendChild(bench);
      out.appendChild(bsec);
    }



    if (tits.length) {
      const sec = el("div", "estado-sec");
      sec.appendChild(el("div", "estado-title", "Titulares"));
      const box = el("div", "an-list");
      tits.forEach((p) => {
        const row = el("div", "an-row clickable");
        row.appendChild(el("span", "an-pos", p.pos || ""));
        const main = el("div", "an-main");
        const nameRow = el("div", "an-name-row");
        if (p.logo) { const lg = el("img", "an-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; nameRow.appendChild(lg); }
        nameRow.appendChild(el("span", "an-name", p.nombre || ""));
        main.appendChild(nameRow);
        const sub = [];
        sub.push(p.prob != null ? "Juega " + p.prob + "%" : (p.pronostico || "—"));
        if (p.puntos != null) sub.push(p.puntos + " pts");
        main.appendChild(el("span", "an-sub", sub.filter(Boolean).join("  ·  ")));
        row.appendChild(main);
        if (p.estado && p.estado !== "OK" && p.estado !== "?") {
          const cls = p.estado === "LESIÓN" ? "inj" : p.estado === "SANCIÓN" ? "red" : "doubt";
          row.appendChild(el("span", "an-st st-" + cls, p.estado));
        }
        if (p.rival) row.appendChild(el("span", "an-ha", (p.casa === true ? "🏠 " : p.casa === false ? "✈️ " : "") + p.rival));
        row.appendChild(el("span", "an-edit", "✏️"));
        row.addEventListener("click", () => openPicker("Cambiar jugador", (pl) => applyPlayer(p, pl)));
        box.appendChild(row);
      });
      sec.appendChild(box);
      out.appendChild(sec);
    }
    if (d.analisis) {
      const sec = el("div", "estado-sec");
      sec.appendChild(el("div", "estado-title", "Recomendaciones de la IA"));
      sec.appendChild(renderAiText(d.analisis));
      out.appendChild(sec);
    }
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

  const bind = (id, ev) => { const e = $(id); if (e) e.addEventListener(ev, () => { shown = 60; renderGrid(); }); };
  bind("mjSearch", "input"); bind("mjRole", "change");
  const estadoSel = $("estadoSel"); if (estadoSel) estadoSel.addEventListener("change", renderEstado);
  const teamSel = $("mjTeam"); if (teamSel) teamSel.addEventListener("change", () => { syncClubActive(); shown = 60; renderGrid(); });

  loadNoticias();
  load();
  setInterval(load, 60000);
})();
