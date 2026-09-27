(function () {
  const API = "/api/laquiniela";
  let all = [];
  let shown = 60;

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

  function playerCard(p) {
    const card = el("div", "mcard");
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
    if (p.team) {
      const row = el("div", "mcard-team");
      if (p.logo) { const lg = el("img", "mcard-crest"); lg.src = p.logo; lg.alt = ""; lg.loading = "lazy"; row.appendChild(lg); }
      row.appendChild(el("span", null, p.team));
      body.appendChild(row);
    }
    body.appendChild(el("div", "mcard-val", money(p.value) + " €"));
    const chg = Number(p.change) || 0;
    if (chg > 0) body.appendChild(el("div", "mcard-trend up", "▲ " + formatDots(chg) + " €"));
    else if (chg < 0) body.appendChild(el("div", "mcard-trend down", "▼ " + formatDots(-chg) + " €"));
    else body.appendChild(el("div", "mcard-trend flat", "—"));
    card.appendChild(body);
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

  function renderGrid(q) {
    const grid = $("marketGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const query = stripAccents(q);
    let list = query ? all.filter((p) => stripAccents(p.name).includes(query)) : all;
    list = list.slice().sort((a, b) => b.value - a.value);
    if (!list.length) { grid.appendChild(el("p", "market-empty", "Sin resultados.")); return; }
    list.slice(0, shown).forEach((p) => grid.appendChild(playerCard(p)));
    if (list.length > shown) {
      const more = el("button", "btn-ghost market-more", "Ver más jugadores (" + (list.length - shown) + ")");
      more.addEventListener("click", () => { shown += 60; renderGrid(q); });
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
      list.slice(0, 40).forEach((p) => grid.appendChild(playerCard(p)));
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
      d.appendChild(el("div", "muted small", p.team || ""));
      d.appendChild(el("div", "cmp-val", money(p.value) + " €"));
      const chg = Number(p.change) || 0;
      d.appendChild(el("div", "cmp-trend " + (chg > 0 ? "up" : chg < 0 ? "down" : "flat"),
        chg > 0 ? "▲ " + formatDots(chg) + " €" : chg < 0 ? "▼ " + formatDots(-chg) + " €" : "—"));
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
      renderGrid($("mjSearch") ? $("mjSearch").value.trim() : "");
      renderEstado();
      fillDatalist();
      renderComparador();
    } catch (e) {}
  }

  function initTabs() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  }

  initTabs();
  const search = $("mjSearch");
  if (search) search.addEventListener("input", () => { shown = 60; renderGrid(search.value.trim()); });
  ["cmpA", "cmpB"].forEach((id) => { const e = $(id); if (e) e.addEventListener("input", renderComparador); });
  load();
  setInterval(load, 60000);
})();
