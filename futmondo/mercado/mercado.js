(function () {
  const API = "/api/laquiniela";
  const ROLE = { portero: "POR", defensa: "DEF", centrocampista: "CEN", delantero: "DEL" };
  const ROLE_FULL = { portero: "Portero", defensa: "Defensa", centrocampista: "Centrocampista", delantero: "Delantero" };
  let all = [];
  let shown = 60;
  let sortMode = "up";
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
    if (p.photo) {
      const im = el("img", "mcard-img"); im.src = p.photo; im.alt = p.name; im.loading = "lazy";
      photoWrap.appendChild(im);
    } else {
      photoWrap.appendChild(el("div", "mcard-img", initials(p.name)));
    }
    const st = statusInfo(p.status);
    if (st) photoWrap.appendChild(el("span", "mcard-badge " + st.cls, st.label));
    card.appendChild(photoWrap);
    const body = el("div", "mcard-body");
    body.appendChild(el("div", "mcard-name", p.name));
    const rb = roleBadge(p.role), rb2 = roleBadge(p.role2);
    if (rb) {
      const roles = el("div", "mcard-roles");
      const b = el("span", "mcard-role" + (rb2 ? " multi" : ""), rb + (rb2 ? " · " + rb2 : ""));
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
    body.appendChild(el("div", "mcard-val", money(p.value) + " €"));
    const chg = Number(p.change) || 0;
    if (chg > 0) body.appendChild(el("div", "mcard-trend up", "▲ " + formatDots(chg) + " €" + pct(p.value, chg)));
    else if (chg < 0) body.appendChild(el("div", "mcard-trend down", "▼ " + formatDots(-chg) + " €" + pct(p.value, chg)));
    else body.appendChild(el("div", "mcard-trend flat", "—"));
    card.appendChild(body);
    if (onClick) card.addEventListener("click", () => onClick(p));
    return card;
  }

  function renderHighlights() {
    const box = $("mercHighlights");
    if (!box) return;
    box.innerHTML = "";
    const up = all.filter((p) => (Number(p.change) || 0) > 0).sort((a, b) => b.change - a.change).slice(0, 5);
    const down = all.filter((p) => (Number(p.change) || 0) < 0).sort((a, b) => a.change - b.change).slice(0, 5);
    if (!up.length && !down.length) return;
    const wrap = el("div", "merc-cols");
    const col = (title, list, cls) => {
      const c = el("div", "merc-col");
      c.appendChild(el("div", "merc-col-title " + cls, title));
      list.forEach((p) => {
        const row = el("div", "merc-row");
        row.appendChild(el("span", "merc-row-name", p.name));
        row.appendChild(el("span", "merc-row-val " + cls, (cls === "up" ? "▲ " : "▼ ") + formatDots(Math.abs(p.change)) + " €"));
        c.appendChild(row);
      });
      return c;
    };
    wrap.appendChild(col("Más suben", up, "up"));
    wrap.appendChild(col("Más bajan", down, "down"));
    box.appendChild(wrap);
  }

  function filteredList() {
    const q = stripAccents($("mjSearch") ? $("mjSearch").value.trim() : "");
    const team = $("mjTeam") ? $("mjTeam").value : "";
    const role = $("mjRole") ? $("mjRole").value : "";
    let list = all.filter((p) => {
      if (q && !stripAccents(p.name).includes(q)) return false;
      if (team && p.team !== team) return false;
      if (role && p.role !== role) return false;
      const v = Number(p.value) || 0;
      if (v < rangeMin || v > rangeMax) return false;
      return true;
    });
    if (sortMode === "up") list = list.filter((p) => (Number(p.change) || 0) > 0).sort((a, b) => b.change - a.change);
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
    const groups = [
      { title: "Lesionados", test: (s) => String(s).indexOf("injured") === 0 },
      { title: "Sancionados", test: (s) => s === "redcard" },
      { title: "Dudas", test: (s) => s === "doubt" },
    ];
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
    if (!any) box.appendChild(el("p", "market-empty", "Sin bajas ni dudas ahora mismo."));
  }

  function findPlayer(name) {
    const q = stripAccents(name).trim();
    if (!q) return null;
    return all.find((p) => stripAccents(p.name) === q) || all.find((p) => stripAccents(p.name).includes(q)) || null;
  }

  function renderComparador() {
    const out = $("cmpOut");
    if (!out) return;
    const a = findPlayer($("cmpA").value);
    const b = findPlayer($("cmpB").value);
    out.innerHTML = "";
    if (!a || !b) { out.appendChild(el("p", "muted small", "Escribe dos jugadores (elige de la lista) para compararlos.")); return; }
    const wrap = el("div", "cmp-cols");
    const side = (p) => {
      const d = el("div", "cmp-side");
      const ph = el("div", "mcard-photo");
      if (p.photo) { const im = el("img", "mcard-img"); im.src = p.photo; im.alt = p.name; ph.appendChild(im); }
      d.appendChild(ph);
      d.appendChild(el("div", "cmp-name", p.name));
      const rbs = roleBadge(p.role), rb2s = roleBadge(p.role2);
      if (rbs) {
        const roles = el("div", "mcard-roles");
        const b = el("span", "mcard-role" + (rb2s ? " multi" : ""), rbs + (rb2s ? " · " + rb2s : ""));
        b.title = roleFull(p.role) + (rb2s ? " · " + roleFull(p.role2) + " (multiposición)" : "");
        roles.appendChild(b);
        d.appendChild(roles);
      }
      d.appendChild(el("div", "muted small", p.team || ""));
      d.appendChild(el("div", "cmp-val", money(p.value) + " €"));
      const chg = Number(p.change) || 0;
      d.appendChild(el("div", "cmp-trend " + (chg > 0 ? "up" : chg < 0 ? "down" : "flat"),
        chg > 0 ? "▲ " + formatDots(chg) + " €" + pct(p.value, chg) : chg < 0 ? "▼ " + formatDots(-chg) + " €" + pct(p.value, chg) : "—"));
      d.appendChild(el("div", "cmp-status", statusLabel(p.status)));
      return d;
    };
    wrap.appendChild(side(a));
    wrap.appendChild(side(b));
    out.appendChild(wrap);
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
    const map = {};
    all.forEach((p) => { if (p.team && p.logo && !map[p.team]) map[p.team] = p.logo; });
    Object.keys(map).sort((a, b) => a.localeCompare(b)).forEach((t) => {
      const btn = el("button", "merc-club");
      btn.type = "button";
      btn.title = t;
      const im = el("img", "merc-club-img"); im.src = map[t]; im.alt = t; im.loading = "lazy";
      btn.appendChild(im);
      btn.addEventListener("click", () => {
        const sel = $("mjTeam");
        const cur = sel.value === t ? "" : t;
        sel.value = cur;
        syncClubActive();
        shown = 60;
        renderGrid();
      });
      box.appendChild(btn);
    });
  }

  function syncClubActive() {
    const sel = $("mjTeam");
    const cur = sel ? sel.value : "";
    document.querySelectorAll(".merc-club").forEach((x) => x.classList.toggle("active", x.title === cur));
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
  }

  async function load() {
    try {
      const res = await fetch(API + "/mercado");
      const d = await res.json();
      if (Array.isArray(d.players)) all = d.players;
      updateTime(d.updatedAt);
      renderHighlights();
      renderGrid();
      renderEstado();
      fillDatalist();
      renderComparador();
      if (all.length && !$("mjTeam").dataset.init) {
        $("mjTeam").dataset.init = "1";
        setupTeams();
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

  function renderNews(d) {
    const a = $("newsAnuncios");
    if (a) {
      a.innerHTML = "";
      const list = d.noticias || [];
      if (!list.length) a.appendChild(el("p", "muted small", "Sin noticias ahora mismo."));
      list.forEach((x) => {
        const it = el("div", "news-item news-link");
        it.addEventListener("click", () => openNoticia(x.link, x.title));
        if (x.icon) { const im = el("img", "news-ico"); im.src = x.icon; im.alt = ""; im.loading = "lazy"; it.appendChild(im); }
        const b = el("div", "news-body");
        b.appendChild(el("div", "news-title", x.title));
        b.appendChild(el("div", "news-date", x.date));
        it.appendChild(b);
        a.appendChild(it);
      });
    }
    const l = $("newsLocker");
    if (l) {
      l.innerHTML = "";
      const list = d.locker || [];
      if (!list.length) l.appendChild(el("p", "muted small", "Sin actividad."));
      list.forEach((x) => {
        const it = el("div", "news-item");
        const b = el("div", "news-body");
        const head = el("div", "news-head");
        if (x.p) { const av = el("img", "news-avatar"); av.src = x.p; av.alt = ""; av.loading = "lazy"; head.appendChild(av); }
        head.appendChild(el("span", "news-user", x.n));
        head.appendChild(el("span", "news-date", fmtFecha(x.date)));
        b.appendChild(head);
        if (x.txt) b.appendChild(el("div", "news-sum", x.txt));
        it.appendChild(b);
        l.appendChild(it);
      });
    }
  }

  async function loadNoticias() {
    try {
      const d = await (await fetch(API + "/noticias")).json();
      renderNews(d);
    } catch (e) {}
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
        c.appendChild(el("h2", "ficha-name", d.title || title || ""));
        if (d.lead) c.appendChild(el("p", "art-lead", d.lead));
        const art = el("div", "art-body");
        art.innerHTML = d.html || "";
        if (!d.html) c.appendChild(el("p", "muted small", "No se pudo cargar el contenido."));
        else c.appendChild(art);
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

  function renderFicha(d, p) {
    const root = el("div", "ficha");
    const head = el("div", "ficha-head");
    const ph = el("div", "mcard-photo");
    const pic = d.photo || p.photo;
    if (pic) { const im = el("img", "mcard-img"); im.src = pic; im.alt = d.name || p.name || ""; ph.appendChild(im); }
    const rb = roleBadge(d.role || p.role), rb2 = roleBadge(d.role2 || p.role2);
    if (rb) ph.appendChild(el("span", "mcard-role" + (rb2 ? " multi" : ""), rb + (rb2 ? " · " + rb2 : "")));
    head.appendChild(ph);
    const info = el("div", "ficha-info");
    info.appendChild(el("h2", "ficha-name", d.name || p.name || ""));
    if (d.team || p.team) info.appendChild(el("div", "muted small", d.team || p.team));
    info.appendChild(el("div", "ficha-val", money(d.value || p.value) + " €"));
    const chg = Number(d.change != null ? d.change : p.change) || 0;
    info.appendChild(el("div", "cmp-trend " + (chg > 0 ? "up" : chg < 0 ? "down" : "flat"),
      chg > 0 ? "▲ " + formatDots(chg) + " €" + pct(d.value || p.value, chg) : chg < 0 ? "▼ " + formatDots(-chg) + " €" + pct(d.value || p.value, chg) : "—"));
    info.appendChild(el("div", "cmp-status", statusLabel(d.status || p.status)));
    head.appendChild(info);
    root.appendChild(head);

    const stats = el("div", "ficha-stats");
    const st = (label, val) => { const c = el("div", "ficha-stat"); c.appendChild(el("div", "fs-val", String(val))); c.appendChild(el("div", "fs-lab", label)); stats.appendChild(c); };
    st("Puntos", d.points || 0);
    st("Media", String(Math.round((Number(d.average) || 0) * 10) / 10).replace(".", ","));
    st("Partidos", d.matches5 || 0);
    root.appendChild(stats);

    const fit = d.fitness || [];
    if (fit.length) {
      root.appendChild(el("div", "estado-title", "Últimos partidos (puntos)"));
      const chips = el("div", "ficha-chips");
      fit.forEach((v) => chips.appendChild(el("span", "ficha-chip", String(v))));
      root.appendChild(chips);
    }

    const ms = d.matches || [];
    if (ms.length) {
      root.appendChild(el("div", "estado-title", "Puntos por jornada"));
      const tbl = el("div", "ficha-matches");
      ms.forEach((m) => {
        const row = el("div", "fm-row");
        row.appendChild(el("span", "fm-j", "J" + m.r));
        row.appendChild(el("span", "fm-match", (m.home || "") + " " + (m.hs != null ? m.hs : "-") + "-" + (m.as != null ? m.as : "-") + " " + (m.away || "")));
        row.appendChild(el("span", "fm-pts", String(m.stats || 0)));
        tbl.appendChild(row);
      });
      root.appendChild(tbl);
    }
    return root;
  }

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  document.querySelectorAll(".merc-segbtn").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".merc-segbtn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    sortMode = b.dataset.sort;
    shown = 60;
    renderGrid();
  }));
  let anImg = null;
  function renderAnalisis(d) {
    const out = $("anOut");
    if (!out) return;
    out.innerHTML = "";
    if (d.formacion) out.appendChild(el("div", "an-form", "Formación detectada: " + d.formacion));
    const table = (title, list) => {
      const sec = el("div", "estado-sec");
      sec.appendChild(el("div", "estado-title", title));
      const box = el("div", "an-list");
      (list || []).forEach((p) => {
        const row = el("div", "an-row");
        row.appendChild(el("span", "an-pos", p.pos || ""));
        row.appendChild(el("span", "an-name", p.nombre || ""));
        row.appendChild(el("span", "an-team", p.equipo || ""));
        const cls = p.estado === "LESIÓN" ? "inj" : p.estado === "SANCIÓN" ? "red" : p.estado === "DUDA" ? "doubt" : "ok";
        row.appendChild(el("span", "an-st st-" + cls, p.estado || ""));
        row.appendChild(el("span", "an-ha", p.casa === true ? "Casa" : p.casa === false ? "Fuera" : ""));
        row.appendChild(el("span", "an-pts", p.puntos != null ? p.puntos + " pts" : ""));
        box.appendChild(row);
      });
      sec.appendChild(box);
      return sec;
    };
    if ((d.titulares || []).length) out.appendChild(table("Titulares", d.titulares));
    if ((d.suplentes || []).length) out.appendChild(table("Banquillo", d.suplentes));
    if (d.analisis) {
      const sec = el("div", "estado-sec");
      sec.appendChild(el("div", "estado-title", "Recomendaciones de la IA"));
      const t = el("div", "an-text");
      String(d.analisis).split(/\n/).forEach((ln) => { if (ln.trim()) t.appendChild(el("p", null, ln.trim())); });
      sec.appendChild(t);
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
    $("anMsg").textContent = "🧠 Analizando… (puede tardar 20-40 s)";
    $("anOut").innerHTML = "";
    try {
      const r = await fetch(API + "/analiza", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ img: anImg }) });
      const d = await r.json();
      if (!r.ok) { $("anMsg").textContent = d.error || "No se pudo analizar."; return; }
      $("anMsg").textContent = "";
      renderAnalisis(d);
    } catch (e) { $("anMsg").textContent = "Error de red."; }
  });

  const fclose = $("fichaClose"); if (fclose) fclose.addEventListener("click", closeModal);
  const fov = $("fichaOverlay"); if (fov) fov.addEventListener("click", (e) => { if (e.target === fov) closeModal(); });

  const bind = (id, ev) => { const e = $(id); if (e) e.addEventListener(ev, () => { shown = 60; renderGrid(); }); };
  bind("mjSearch", "input"); bind("mjRole", "change");
  const teamSel = $("mjTeam"); if (teamSel) teamSel.addEventListener("change", () => { syncClubActive(); shown = 60; renderGrid(); });
  ["cmpA", "cmpB"].forEach((id) => { const e = $(id); if (e) e.addEventListener("input", renderComparador); });

  loadNoticias();
  load();
  setInterval(load, 60000);
})();
