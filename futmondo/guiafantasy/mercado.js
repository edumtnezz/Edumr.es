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

  function $(id) { return document.getElementById(id); }
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
    if (hlPeriod === "all") return p.chgAll != null ? Number(p.chgAll) : (Number(p.chg30) || 0);
    const v = p["chg" + hlPeriod];
    return v != null ? Number(v) : (Number(p.change) || 0);
  }
  let rachasData = null;
  async function renderRachas() {
    const box = $("mercRachas");
    if (!box) return;
    box.innerHTML = "";
    const best = buildBest();
    if (best) box.appendChild(best);
    const head = el("div", "hl-head");
    head.appendChild(el("span", "hl-title", "🔥 Jugadores en racha"));
    const sub = el("span", "rachas-sub", "Partidos seguidos puntuando · más reciente primero");
    head.appendChild(sub);
    box.appendChild(head);
    const table = el("div", "rachas-table");
    table.innerHTML = '<div class="rachas-empty">Cargando rachas…</div>';
    box.appendChild(table);
    try {
      let d = rachasData;
      if (!d) { d = await (await fetch(API + "/rachas")).json(); rachasData = d; }
      if (d && d.updatedAt) sub.textContent = "Partidos seguidos puntuando · más reciente primero · actualizado " + horaTxt(d.updatedAt);
      const list = (d && d.players) || [];
      const j0 = Number(d && d.jornada) || 0;
      if (!list.length) { table.innerHTML = '<div class="rachas-empty">Sin rachas ahora mismo.</div>'; return; }
      table.innerHTML = "";
      list.slice(0, 12).forEach((p) => {
        const row = el("button", "racha-row"); row.type = "button";
        const ph = el("div", "racha-photo");
        const im = el("img", ""); im.loading = "lazy"; im.alt = ""; im.src = p.photo || "/img/avatar.svg";
        im.addEventListener("error", () => { if (im.getAttribute("src") !== "/img/avatar.svg") im.src = "/img/avatar.svg"; }, { once: true });
        ph.appendChild(im);
        const rst = statusInfo(p.status);
        if (rst) ph.appendChild(el("span", "mcard-badge " + rst.cls, rst.label));
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
        const scores = el("div", "racha-scores");
        const fit = (p.fit || []).map((x) => Number(x) || 0);
        for (let k = 0; k < fit.length; k++) {
          const v = Math.round(fit[fit.length - 1 - k]);
          const j = j0 ? j0 - k : 0;
          const cls = v >= 6 ? " hi" : v >= 4 ? " mid" : v > 0 ? " lo" : " zero";
          const cell = el("span", "racha-chip" + cls);
          if (j > 0) cell.appendChild(el("i", null, "J" + j));
          cell.appendChild(el("b", null, v > 0 ? String(v) : "–"));
          scores.appendChild(cell);
        }
        row.appendChild(scores);
        const stats = el("div", "racha-stats");
        const pts = el("b", "rs-pts", String(Number(p.points) || 0));
        pts.appendChild(el("small", null, "PTS"));
        stats.appendChild(pts);
        const med = Number(p.avg) || 0;
        const mw = el("div", "rs-media");
        const mv = el("b", null, med.toFixed(1).replace(".", ","));
        mv.appendChild(el("small", null, "Media"));
        mw.appendChild(mv);
        const bar = el("span", "rs-bar");
        const fill = el("span", "rs-bar-fill");
        fill.style.width = Math.max(5, Math.min(100, (med / 30) * 100)) + "%";
        bar.appendChild(fill);
        mw.appendChild(bar);
        stats.appendChild(mw);
        row.appendChild(stats);
        const ch = hlChange(p);
        const per = hlPeriod === "1" ? "hoy" : hlPeriod === "all" ? "siempre" : hlPeriod + " días";
        const rv = el("div", "racha-val " + (ch > 0 ? "up" : ch < 0 ? "down" : "flat"));
        rv.appendChild(el("span", null, (ch > 0 ? "▲ +" : ch < 0 ? "▼ −" : "") + formatDots(Math.abs(ch)) + " €"));
        rv.appendChild(el("small", null, per));
        row.appendChild(rv);
        row.addEventListener("click", () => openFicha(p));
        table.appendChild(row);
      });
    } catch (e) { table.innerHTML = '<div class="rachas-empty">No se pudo cargar.</div>'; }
  }

  function fmtDiaLargo(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
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
      body.appendChild(tm);
      body.appendChild(el("div", "claus-owner", "👤 de " + (p.owner || "?")));
      const st = el("div", "claus-stats");
      const sbox = (val, lab, cls) => { const b = el("div", "claus-stat" + (cls ? " " + cls : "")); b.appendChild(el("b", null, String(val))); b.appendChild(el("small", null, lab)); return b; };
      st.appendChild(sbox(Number(p.points) || 0, "PTS"));
      st.appendChild(sbox((Number(p.avg) || 0).toFixed(1).replace(".", ","), "Media", "media"));
      st.appendChild(sbox((Number(p.clause) / 1e6).toFixed(1).replace(".", ",") + " M", "Cláusula", "clause"));
      body.appendChild(st);
      const diff = (Number(p.clause) || 0) - (Number(p.value) || 0);
      const vrow = el("div", "claus-val");
      vrow.appendChild(el("b", null, "Valor " + money(p.value) + " €"));
      vrow.appendChild(el("span", "claus-above", "+" + (diff / 1e6).toFixed(1).replace(".", ",") + " M por encima de su valor"));
      body.appendChild(vrow);
      const playedPct = j0 ? Math.round(((Number(p.matches) || 0) / j0) * 100) : 0;
      body.appendChild(el("div", "claus-played", "Jugados: " + playedPct + "% de los partidos"));
      const sl = statusLabel(p.status);
      const sc = p.status === "redcard" ? "red" : String(p.status || "").indexOf("injured") === 0 ? "inj" : p.status === "doubt" ? "doubt" : "ok";
      body.appendChild(el("div", "claus-status " + sc, sl));
      const blocked = p.unlock && new Date(p.unlock).getTime() > Date.now();
      if (blocked) body.appendChild(el("div", "claus-lock", "🔒 se libera el " + fmtDiaLargo(p.unlock)));
      card.appendChild(body);
      card.addEventListener("click", () => openFicha(p));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  async function renderClausulas() {
    const box = $("clausOut");
    if (!box || box.dataset.loaded === "1") return;
    box.dataset.loaded = "1";
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem("claus_cache") || "null"); } catch (e) {}
    let timer = null;
    if (cached && cached.players && cached.players.length) renderClausGrid(box, cached.players, Number(cached.jornada) || 0);
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
      if (upd) upd.textContent = "Se actualiza cada 30 min" + (d && d.updatedAt ? " · última: " + horaTxt(d.updatedAt) : "");
      renderClausGrid(box, list, j0);
      try { localStorage.setItem("claus_cache", JSON.stringify({ at: Date.now(), jornada: j0, players: list })); } catch (e) {}
    } catch (e) { if (timer) clearInterval(timer); if (!(cached && cached.players)) box.innerHTML = '<p class="market-empty">No se pudo cargar.</p>'; }
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
    else if (sortMode === "up") list = list.filter((p) => hlChange(p) > 0).sort((a, b) => hlChange(b) - hlChange(a));
    else if (sortMode === "down") list = list.filter((p) => hlChange(p) < 0).sort((a, b) => hlChange(a) - hlChange(b));
    else list = list.slice().sort((a, b) => b.value - a.value);
    return list;
  }

  function renderGrid() {
    const grid = $("marketGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const top = el("div", "mkt-top");
    const tl = el("div", "mkt-tl");
    tl.appendChild(el("div", "mkt-headline", "📋 Todos los jugadores"));
    tl.appendChild(el("div", "mkt-hint", "↔ Desliza la tabla para ver más columnas"));
    top.appendChild(tl);
    const seg = el("div", "hl-seg");
    [["1", "Hoy"], ["7", "7 días"], ["14", "14 días"], ["30", "30 días"], ["all", "Siempre"]].forEach(([k, lab]) => {
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
    const cols = [["jugador", "Jugador", false], ["pct", "% Dif", true], ["tend", "Tend.", true], ["rival", "Próx. rival", false], ["valor", "Valor", true], ["vant", "Valor ant.", true], ["dif", "Diferencia", true]];
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
      jj.appendChild(tm);
      j.appendChild(jj);
      row.appendChild(j);
      const pctv = prev > 0 ? (ch / prev) * 100 : 0;
      row.appendChild(el("div", "mkt-pct " + (ch > 0 ? "up" : ch < 0 ? "down" : "flat"), (pctv >= 0 ? "+" : "−") + Math.abs(pctv).toFixed(2).replace(".", ",") + "%"));
      const t = Number(p.tend) || 0;
      row.appendChild(el("div", "mkt-tend " + (t > 0 ? "up" : t < 0 ? "down" : "flat"), t ? ((t > 0 ? "▲ " : "▼ ") + Math.abs(t) + "d") : "—"));
      const rv = el("div", "mkt-rival");
      if (p.jornadaFf) rv.appendChild(el("b", null, "J" + p.jornadaFf));
      if (p.casaFf != null) rv.appendChild(el("span", null, p.casaFf ? "🏠" : "✈️"));
      if (p.rivalFf) rv.appendChild(el("span", "mkt-rv", shortRival(p.rivalFf)));
      if (p.prob != null) rv.appendChild(el("span", "mkt-prob", p.prob + "%"));
      row.appendChild(rv);
      row.appendChild(el("div", "mkt-val", money(p.value) + " €"));
      row.appendChild(el("div", "mkt-vant", money(prev) + " €"));
      const dif = el("div", "mkt-dif " + (ch > 0 ? "up" : ch < 0 ? "down" : "flat"));
      dif.appendChild(el("span", "mkt-lens", "💹"));
      dif.appendChild(el("span", null, (ch > 0 ? "+" : ch < 0 ? "−" : "") + formatDots(Math.abs(ch)) + " €"));
      row.appendChild(dif);
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
    renderGrid();
    const grid = $("marketGrid");
    if (grid && grid.scrollIntoView) grid.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function switchTab(name) {
    closeNoticiaInline();
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    const panel = $("tab-" + name);
    if (panel) panel.classList.remove("hidden");
    const ch = $("cxChrome");
    if (ch) ch.classList.toggle("hidden", name !== "mercado");
    if (name === "clausulazos") renderClausulas();
    try { sessionStorage.setItem("merc_tab", name); } catch (e) {}
    try { history.replaceState(null, "", "/futmondo/guiafantasy/" + name); } catch (e) {}
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
    byExp.forEach((p) => { if (picked.length < 12 && !seen.has(p)) { picked.push(p); seen.add(p); } });
    const top = picked.sort((a, b) => expOf(b) - expOf(a));
    const head = el("div", "merc-besthead");
    head.appendChild(el("span", "mbh-t", "⭐ Mejor fichaje de la jornada"));
    head.appendChild(el("span", "mbh-sub", "por puntos probables"));
    head.appendChild(el("span", "mbh-hint", "↔ desliza para ver más"));
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
    return box;
  }

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
        it.addEventListener("click", () => openNoticiaInline(x.link, x.title));
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
    try { if (history.state && history.state.ficha) { history.back(); return; } } catch (e) {}
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

  function openNoticiaInline(url, title) {
    const box = $("noticiaView");
    if (!box) return;
    const list = $("newsAnuncios");
    const h3 = document.querySelector("#tab-noticias .estado-title");
    box.innerHTML = '<p class="muted small">Cargando noticia…</p>';
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
    const w = el("div");
    w.appendChild(el("p", "muted small", "Cargando ficha…"));
    showModal(w);
    try { history.pushState({ ficha: 1 }, "", location.href); } catch (e) {}
    fetch(API + "/jugador?id=" + encodeURIComponent(p.id || ""))
      .then((r) => r.json())
      .then((d) => showModal(renderFicha(d, p)))
      .catch(() => { const c = el("div"); c.appendChild(el("p", "muted small", "No se pudo cargar la ficha.")); showModal(c); });
  }
  window.addEventListener("popstate", () => { const ov = $("fichaOverlay"); if (ov) ov.classList.add("hidden"); });

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
    if (teamName || teamLogo) {
      const tt = el("div", "ficha-team");
      if (teamLogo) { const lg = el("img"); lg.src = teamLogo; lg.alt = ""; lg.loading = "lazy"; tt.appendChild(lg); }
      tt.appendChild(el("span", null, teamName));
      head.appendChild(tt);
    }
    if (rb2) head.appendChild(el("div", "ficha-multi", "Multiposición: " + rb + " · " + rb2));
    head.appendChild(el("div", "ficha-val", money(d.value || p.value) + " €"));
    const chg = Number(d.change != null ? d.change : p.change) || 0;
    head.appendChild(el("div", "cmp-trend " + (chg > 0 ? "up" : chg < 0 ? "down" : "flat"),
      chg > 0 ? "▲ " + formatDots(chg) + " €" + pct(d.value || p.value, chg) : chg < 0 ? "▼ " + formatDots(-chg) + " €" + pct(d.value || p.value, chg) : "—"));
    head.appendChild(el("div", "cmp-status", statusLabel(d.status || p.status)));
    if (d.pronostico) head.appendChild(el("div", "ficha-pron", "Pronóstico: " + d.pronostico));
    if (d.fichaje && d.fichaje.date) head.appendChild(el("div", "ficha-fichaje", "🖊️ Fichado: " + d.fichaje.date + (d.fichaje.club ? " · " + d.fichaje.club : "")));
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

    if (d.participacion) root.appendChild(renderParticipacion(d.participacion, d.status || p.status));

    const cols = el("div", "ficha-cols");
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
          row.appendChild(el("span", "fm-match", rival ? ((casa ? "🏠 " : "✈️ ") + rival) : ""));
          const mn = Number(m.mins) || 0;
          const tg = mn <= 0 ? "" : (m.sub ? "entró " + mn + "'" : (mn >= 85 ? "90'" : "salió " + mn + "'"));
          row.appendChild(el("span", "fm-tag", tg));
          const v = valByR[j] != null ? valByR[j] : null;
          const stPts = Number(m.stats) || 0;
          const pts = v != null ? String(v) : (stPts !== 0 ? String(stPts) : "—");
          row.appendChild(el("span", "fm-pts " + (v != null ? "pt-" + ptClass(v) : "pt-st"), pts));
        } else {
          row.appendChild(el("span", "fm-match fm-nojugo", "No jugó"));
          row.appendChild(el("span", "fm-tag", ""));
          row.appendChild(el("span", "fm-pts", "—"));
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
    cols.appendChild(colL); cols.appendChild(colR);
    root.appendChild(cols);
    return root;
  }

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  (function restoreTab() {
    let name = "";
    try {
      const m = location.pathname.match(/\/guiafantasy\/(mercado|noticias|analiza|clausulazos)/);
      if (m) name = m[1];
    } catch (e) {}
    if (!name) { try { name = sessionStorage.getItem("merc_tab") || ""; } catch (e) {} }
    if (name && $("tab-" + name)) switchTab(name);
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

  const bind = (id, ev) => { const e = $(id); if (e) e.addEventListener(ev, () => { shown = 18; renderGrid(); }); };
  const searchEl = $("mjSearch");
  if (searchEl) searchEl.addEventListener("input", () => { const y = window.scrollY; shown = 18; renderGrid(); if (window.scrollY !== y) window.scrollTo(0, y); });
  bind("mjRole", "change");
  const estadoSel = $("estadoSel"); if (estadoSel) estadoSel.addEventListener("change", renderEstado);
  const teamSel = $("mjTeam"); if (teamSel) teamSel.addEventListener("change", () => { syncClubActive(); shown = 18; renderGrid(); });

  document.addEventListener("cx:news", (e) => {
    const d = e.detail || {};
    switchTab("noticias");
    openNoticiaInline(d.link, d.title);
  });

  (function initSwipe() {
    const order = ["mercado", "noticias", "analiza", "clausulazos"];
    const main = document.querySelector(".quiniela-main") || document.body;
    let sx = 0, sy = 0, st = 0;
    main.addEventListener("touchstart", (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    main.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st > 900) return;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const hit = document.elementFromPoint(sx, sy);
      if (hit && hit.closest("button, a, input, select, .mkt-wrap, .racha-scores, .merc-bestrow")) return;
      const active = document.querySelector(".tab.active");
      let i = order.indexOf(active ? active.dataset.tab : "mercado");
      if (i < 0) i = 0;
      if (dx < 0) i = Math.min(order.length - 1, i + 1); else i = Math.max(0, i - 1);
      switchTab(order[i]);
    }, { passive: true });
  })();

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
      chip.innerHTML = '<span class="user-avatar">' + ini + '</span><span class="user-name">' + name + '</span><span class="user-caret">▾</span>';
      const menu = el("div", "user-menu");
      const exit = el("button", "user-menu-exit", "Salir"); exit.type = "button";
      exit.addEventListener("click", async () => { try { await fetch(API + "/logout", { method: "POST" }); } catch (e) {} location.reload(); });
      menu.appendChild(exit);
      ub.appendChild(chip); ub.appendChild(menu);
      chip.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
      document.addEventListener("click", (e) => { if (!ub.contains(e.target)) menu.classList.remove("open"); });
    } catch (e) {}
  })();

  loadNoticias();
  load();
})();
