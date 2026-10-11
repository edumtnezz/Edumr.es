/* EduMR chrome: franja de jornada + tira de escudos + última hora. Rellena #cxChrome. */
(function () {
  var API = "/api/laquiniela";
  var jornada = 0;
  var lastJornadaMatches = [];
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Puntito de color bajo cada escudo de la tira de equipos: refleja el
  // estado del partido de esa jornada para ese equipo (igual que en la
  // tarjeta de la jornada), reutilizando los datos ya traídos por
  // loadJornada() en vez de pedirlos otra vez. Los nombres de /equipos y
  // los de /jornada no siempre coinciden letra a letra (p.ej. "Atleti" vs
  // "Atletico Madrid"), así que se empareja por palabras en común, igual
  // que hace el backend con teamScore()/wkey().
  var TEAM_ALIASES = { barca: "barcelona", atleti: "atletico" };
  var WORD_STOP = ["de", "del", "la", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie", "c", "f"];
  function stripAccents(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function wkey(s) {
    return stripAccents(String(s || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter(function (w) { return w && WORD_STOP.indexOf(w) < 0; })
      .map(function (w) { return TEAM_ALIASES[w] || w; });
  }
  function teamScore(a, b) {
    var A = wkey(a), B = wkey(b);
    if (!A.length || !B.length) return 0;
    var s = 0;
    A.forEach(function (w) { if (B.indexOf(w) >= 0) s++; });
    return s;
  }
  function matchStateFor(teamName) {
    var best = null, bs = 0;
    lastJornadaMatches.forEach(function (m) {
      var s = Math.max(teamScore(teamName, m.home), teamScore(teamName, m.away));
      if (s > bs) { bs = s; best = m; }
    });
    if (!best || bs < 1) return null;
    return (best.live && best.live.state) || "previa";
  }
  function renderTeamDots() {
    var box = document.getElementById("cxStrip");
    if (!box) return;
    box.querySelectorAll(".cx-team[data-team]").forEach(function (el) {
      var team = el.getAttribute("data-team");
      var dot = el.querySelector(".cx-team-dot");
      if (!team) { if (dot) dot.remove(); return; }
      var state = matchStateFor(team);
      if (!state) { if (dot) dot.remove(); return; }
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "cx-team-dot";
        var img = el.querySelector("img");
        if (img) el.insertBefore(dot, img.nextSibling); else el.appendChild(dot);
      }
      dot.className = "cx-team-dot cx-team-dot-" + state;
      dot.title = state === "final" ? "Partido finalizado" : state === "live" ? "En directo" : state === "suspended" ? "Partido suspendido" : "Aún no jugado";
    });
  }
  function boot() {
    var host = document.getElementById("cxChrome");
    if (!host) return;
    host.innerHTML =
      '<div class="cx-strip"><div class="cx-strip-track" id="cxStrip"><span class="cx-strip-load">Cargando equipos…</span></div><div class="cx-scrollbar" id="cxStripBar"><div class="cx-scrollbar-thumb"></div></div></div>' +
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
    var live = document.getElementById("cxLiveTrack");
    if (live) live.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest(".cx-live-item") : null;
      if (!a) return;
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("cx:news", { detail: { link: a.getAttribute("href"), title: a.getAttribute("data-title") } }));
    });
    loadJornada(0);
    loadTeams();
    loadLive();
    setInterval(loadLive, 90000);
  }
  function mountScrollBar(scrollEl, barEl) {
    if (!scrollEl || !barEl) return;
    var thumb = barEl.firstElementChild;
    if (!thumb) return;
    function update() {
      var max = scrollEl.scrollWidth - scrollEl.clientWidth;
      if (max <= 4) { barEl.style.display = "none"; return; }
      barEl.style.display = "";
      var trackW = barEl.clientWidth || 1;
      var ratio = scrollEl.clientWidth / scrollEl.scrollWidth;
      var thumbW = Math.max(trackW * ratio, 28);
      var pos = scrollEl.scrollLeft / max;
      thumb.style.width = thumbW + "px";
      thumb.style.transform = "translateX(" + (pos * (trackW - thumbW)) + "px)";
    }
    scrollEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    scrollEl.dataset.barUpdate = "1";
    scrollEl._cxBarUpdate = update;
    update();
  }
  function loadJornada(n) {
    var grid = document.getElementById("cxJGrid");
    var title = document.getElementById("cxJTitle");
    if (!grid) return;
    if (n && (n < 1 || n > 38)) return;
    var url = API + "/jornada" + (n && n > 0 ? ("?jornada=" + n) : "");
    // Para que la página no "salte" (arrastrando hacia arriba lo que hay
    // debajo, como las noticias) al cambiar de jornada: se fija la altura
    // que ya tenía la rejilla mientras carga la siguiente, en vez de
    // vaciarla primero y dejar que se desplome a una sola línea.
    var prevH = grid.offsetHeight;
    if (prevH) grid.style.minHeight = prevH + "px";
    grid.innerHTML = '<span class="cx-strip-load">Cargando jornada…</span>';
    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var ms = (d && d.matches) || [];
        jornada = Number(d && d.matchday) || 0;
        lastJornadaMatches = ms;
        renderTeamDots();
        if (title) title.textContent = jornada ? ("Jornada " + jornada) : "Jornada";
        if (!ms.length) { grid.innerHTML = '<span class="cx-strip-load">Sin jornada.</span>'; grid.style.minHeight = ""; return; }
        grid.innerHTML = ms.map(function (m) {
          var tv;
          if (m.tv && m.tv[0]) {
            tv = m.tv[0].logo
              ? '<img class="cx-jn-tv' + (/dazn/i.test(m.tv[0].name) ? " cx-jn-tv-sq" : "") + '" src="' + esc(m.tv[0].logo) + '" alt="' + esc(m.tv[0].name) + '" title="' + esc(m.tv[0].name) + '" loading="lazy" onerror="this.remove()">'
              : '<span class="cx-jn-tv-name" title="' + esc(m.tv[0].name) + '">' + esc(m.tv[0].name) + '</span>';
          } else {
            tv = '<span class="cx-jn-tv-ph" title="Canal por confirmar">por confirmar</span>';
          }
          // Marcador/estado en directo (copiado tal cual de Comuniate): si el
          // partido ya se juega o ya acabó se enseña el resultado y el
          // minuto/estado en vez del día y la hora; si no, se queda como antes.
          var live = m.live || null;
          var cardCls = "cx-jn cx-jn-click";
          var bottom;
          if (live && (live.state === "final" || live.state === "live")) {
            cardCls += live.state === "final" ? " cx-jn-final" : " cx-jn-live";
            var stLabel = live.state === "final" ? "FINAL" : (live.minute || "DIRECTO");
            bottom = tv + '<span class="cx-jn-score">' + esc(live.score || "") + '</span>' +
              '<span class="cx-jn-status cx-jn-status-' + live.state + '">' + esc(stLabel) + '</span>';
          } else if (live && live.state === "suspended") {
            cardCls += " cx-jn-susp";
            bottom = tv + '<span class="cx-jn-status cx-jn-status-suspended">SUSPEND.</span>';
          } else {
            bottom = tv + '<span class="cx-jn-time">' + esc(((m.day || "") + " " + (m.date || "")).trim()) + '</span><span class="cx-jn-hora">' + esc(m.time || "") + '</span>';
          }
          var confirmBadge = m.confirmed ? '<span class="cx-jn-confirm" title="Once ya confirmado">✅ Once confirmado</span>' : "";
          return '<div class="' + cardCls + '" data-home="' + esc(m.home) + '" data-away="' + esc(m.away) + '" data-hcrest="' + esc(m.homeCrest) + '" data-acrest="' + esc(m.awayCrest) + '">' +
            confirmBadge +
            '<img class="cx-jn-crest" src="' + esc(m.homeCrest) + '" alt="' + esc(m.home) + '" title="' + esc(m.home) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '<div class="cx-jn-mid">' + bottom + '</div>' +
            '<img class="cx-jn-crest" src="' + esc(m.awayCrest) + '" alt="' + esc(m.away) + '" title="' + esc(m.away) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '</div>';
        }).join("");
        grid.style.minHeight = "";
        var pv = document.getElementById("cxJPrev"), nx = document.getElementById("cxJNext");
        if (pv) pv.disabled = jornada <= 1;
        if (nx) nx.disabled = jornada >= 38;
        grid.querySelectorAll(".cx-jn").forEach(function (el, idx) {
          el.addEventListener("click", function () {
            var m = ms[idx] || {};
            document.dispatchEvent(new CustomEvent("cx:once", { detail: {
              home: m.home, away: m.away, homeCrest: m.homeCrest, awayCrest: m.awayCrest,
              day: m.day, date: m.date, time: m.time, tv: m.tv, jornada: jornada
            } }));
          });
        });
      })
      .catch(function () { grid.innerHTML = '<span class="cx-strip-load">No disponible.</span>'; grid.style.minHeight = ""; });
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
        mountScrollBar(box, document.getElementById("cxStripBar"));
        renderTeamDots();
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
          return '<a class="cx-live-item" href="' + esc(x.link) + '" data-title="' + esc(x.title) + '">' + img +
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
