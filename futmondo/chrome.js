/* Comuniate chrome: tira de escudos + última hora. Rellena #cxChrome. */
(function () {
  var API = "/api/laquiniela";
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
      '<div class="cx-live"><span class="cx-live-tag">Última hora</span><div class="cx-live-track" id="cxLiveTrack"><span class="cx-live-load">Cargando última hora…</span></div></div>';
    loadTeams();
    loadLive();
  }
  function loadTeams() {
    var box = document.getElementById("cxStrip");
    if (!box) return;
    fetch(API + "/equipos", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var teams = (d && d.teams) || [];
        if (!teams.length) { box.innerHTML = '<span class="cx-strip-load">Sin equipos.</span>'; return; }
        box.innerHTML = teams.map(function (t) {
          var img = t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : "";
          return '<div class="cx-team" title="' + esc(t.name) + '">' + img + '<span>' + esc(t.name) + '</span></div>';
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
        if (!items.length) { box.innerHTML = '<span class="cx-live-load">Sin novedades ahora mismo.</span>'; return; }
        box.innerHTML = items.map(function (x) {
          var img = x.thumb ? '<img src="' + esc(x.thumb) + '" alt="" loading="lazy" onerror="this.remove()">' : "";
          var tm = x.time ? '<b class="cx-live-time">' + esc((x.date ? x.date + " · " : "") + x.time) + '</b>' : "";
          return '<a class="cx-live-item" href="' + esc(x.link) + '" target="_blank" rel="noopener">' + img +
            '<span class="cx-live-txt">' + esc(x.title) + '</span>' + tm + '</a>';
        }).join("");
        autoScroll();
      })
      .catch(function () { box.innerHTML = '<span class="cx-live-load">No disponible.</span>'; });
  }
  function autoScroll() {
    var box = document.getElementById("cxLiveTrack");
    if (!box) return;
    var paused = false;
    box.addEventListener("mouseenter", function () { paused = true; });
    box.addEventListener("mouseleave", function () { paused = false; });
    setInterval(function () {
      if (paused) return;
      if (box.scrollWidth - box.clientWidth < 10) return;
      if (box.scrollLeft + box.clientWidth >= box.scrollWidth - 1) box.scrollLeft = 0;
      else box.scrollLeft += 1;
    }, 45);
  }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
