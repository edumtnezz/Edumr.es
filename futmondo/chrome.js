/* Comuniate chrome: franja de jornada + tira de escudos + última hora. Rellena #cxChrome. */
(function () {
  var API = "/api/laquiniela";
  var jornada = 0;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function boot() {
    var host = document.getElementById("cxChrome");
    if (!host) return;
    host.innerHTML =
      '<div class="cx-strip"><div class="cx-strip-track" id="cxStrip"><span class="cx-strip-load">Cargando equipos…</span></div></div>' +
      '<div class="cx-live"><span class="cx-live-tag">Última hora</span><div class="cx-live-track" id="cxLiveTrack"><span class="cx-live-load">Cargando última hora…</span></div></div>' +
      '<div class="cx-jornada">' +
        '<div class="cx-jn-head">' +
          '<button class="cx-jn-nav" id="cxJPrev" aria-label="Jornada anterior">◀</button>' +
          '<span class="cx-jn-title" id="cxJTitle">Jornada</span>' +
          '<button class="cx-jn-nav" id="cxJNext" aria-label="Jornada siguiente">▶</button>' +
        '</div>' +
        '<div class="cx-jn-grid" id="cxJGrid"><span class="cx-strip-load">Cargando jornada…</span></div>' +
      '</div>';
    var pv = document.getElementById("cxJPrev"), nx = document.getElementById("cxJNext");
    if (pv) pv.addEventListener("click", function () { loadJornada(jornada - 1); });
    if (nx) nx.addEventListener("click", function () { loadJornada(jornada + 1); });
    loadJornada(0);
    loadTeams();
    loadLive();
    setInterval(loadLive, 90000);
  }
  function loadJornada(n) {
    var grid = document.getElementById("cxJGrid");
    var title = document.getElementById("cxJTitle");
    if (!grid) return;
    if (n && (n < 1 || n > 38)) return;
    var url = API + "/jornada" + (n && n > 0 ? ("?jornada=" + n) : "");
    grid.innerHTML = '<span class="cx-strip-load">Cargando jornada…</span>';
    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var ms = (d && d.matches) || [];
        jornada = Number(d && d.matchday) || 0;
        if (title) title.textContent = jornada ? ("Jornada " + jornada) : "Jornada";
        if (!ms.length) { grid.innerHTML = '<span class="cx-strip-load">Sin jornada.</span>'; return; }
        grid.innerHTML = ms.map(function (m) {
          var tv = (m.tv && m.tv[0]) ? '<img class="cx-jn-tv' + (/dazn/i.test(m.tv[0].name) ? " cx-jn-tv-sq" : "") + '" src="' + esc(m.tv[0].logo) + '" alt="' + esc(m.tv[0].name) + '" title="' + esc(m.tv[0].name) + '" loading="lazy" onerror="this.remove()">' : '<span class="cx-jn-tv-ph" title="Canal por confirmar">por confirmar</span>';
          return '<div class="cx-jn">' +
            '<img class="cx-jn-crest" src="' + esc(m.homeCrest) + '" alt="' + esc(m.home) + '" title="' + esc(m.home) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '<div class="cx-jn-mid">' + tv + '<span class="cx-jn-time">' + esc(((m.day || "") + " " + (m.date || "")).trim()) + '</span><span class="cx-jn-hora">' + esc(m.time || "") + '</span></div>' +
            '<img class="cx-jn-crest" src="' + esc(m.awayCrest) + '" alt="' + esc(m.away) + '" title="' + esc(m.away) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '</div>';
        }).join("");
        var pv = document.getElementById("cxJPrev"), nx = document.getElementById("cxJNext");
        if (pv) pv.disabled = jornada <= 1;
        if (nx) nx.disabled = jornada >= 38;
      })
      .catch(function () { grid.innerHTML = '<span class="cx-strip-load">No disponible.</span>'; });
  }
  function loadTeams() {
    var box = document.getElementById("cxStrip");
    if (!box) return;
    fetch(API + "/equipos", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var teams = (d && d.teams) || [];
        if (!teams.length) { box.innerHTML = '<span class="cx-strip-load">Sin equipos.</span>'; return; }
        var all = '<div class="cx-team cx-team-all" data-team="" title="Todos los equipos"><span class="cx-team-all-txt">Todos</span></div>';
        box.innerHTML = all + teams.map(function (t) {
          var img = t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : "";
          return '<div class="cx-team" data-team="' + esc(t.name) + '" title="' + esc(t.name) + '">' + img + '<span>' + esc(t.name) + '</span></div>';
        }).join("");
      })
      .catch(function () { box.innerHTML = '<span class="cx-strip-load">No disponible.</span>'; });
  }
  function loadLive() {
    var box = document.getElementById("cxLiveTrack");
    if (!box) return;
    fetch(API + "/ultimahora", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        if (!items.length) { if (!box.dataset.sig) box.innerHTML = '<span class="cx-live-load">Sin novedades ahora mismo.</span>'; return; }
        var sig = (items[0].link || items[0].title || "") + "|" + items.length;
        if (box.dataset.sig === sig) return;
        box.dataset.sig = sig;
        box.innerHTML = items.map(function (x) {
          var img = x.thumb ? '<img src="' + esc(x.thumb) + '" alt="" loading="lazy" onerror="this.remove()">' : "";
          var tm = x.time ? '<b class="cx-live-time">' + esc((x.date ? x.date + " · " : "") + x.time) + '</b>' : "";
          return '<a class="cx-live-item" href="' + esc(x.link) + '" target="_blank" rel="noopener">' + img +
            '<span class="cx-live-txt">' + esc(x.title) + '</span>' + tm + '</a>';
        }).join("");
        autoScroll();
      })
      .catch(function () { if (!box.dataset.sig) box.innerHTML = '<span class="cx-live-load">No disponible.</span>'; });
  }
  function autoScroll() {
    var box = document.getElementById("cxLiveTrack");
    if (!box || box.dataset.scroll) return;
    box.dataset.scroll = "1";
    var paused = false;
    box.addEventListener("mouseenter", function () { paused = true; });
    box.addEventListener("mouseleave", function () { paused = false; });
    box.addEventListener("touchstart", function () { paused = true; }, { passive: true });
    box.addEventListener("touchend", function () { paused = false; }, { passive: true });
    setInterval(function () {
      if (paused || document.hidden) return;
      if (box.scrollWidth - box.clientWidth < 12) return;
      if (box.scrollLeft + box.clientWidth >= box.scrollWidth - 1) box.scrollLeft = 0;
      else box.scrollLeft += 1;
    }, 40);
  }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
