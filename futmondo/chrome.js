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
  var TEAM_ALIASES = { barca: "barcelona", atleti: "atletico", santander: "racing" };
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
      '<div class="cx-ticker" id="cxTicker">' +
        '<span class="cx-ticker-tag">Última hora</span>' +
        '<div class="cx-ticker-view" id="cxTickerView">' +
          '<div class="cx-ticker-track" id="cxTickerTrack"></div>' +
        '</div>' +
      '</div>' +
      '<div class="cx-strip"><div class="cx-strip-track" id="cxStrip"><span class="cx-sk cx-sk-strip"></span></div><div class="cx-scrollbar" id="cxStripBar"><div class="cx-scrollbar-thumb"></div></div></div>' +
      '<div class="cx-jornada">' +
        '<div class="cx-jn-head">' +
          '<button class="cx-jn-nav" id="cxJPrev" aria-label="Jornada anterior">◀</button>' +
          '<span class="cx-jn-title" id="cxJTitle">Jornada</span>' +
          '<button class="cx-jn-nav" id="cxJNext" aria-label="Jornada siguiente">▶</button>' +
        '</div>' +
        '<div class="cx-jn-grid" id="cxJGrid"><span class="cx-sk cx-sk-strip"></span></div>' +
      '</div>';
    var pv = document.getElementById("cxJPrev"), nx = document.getElementById("cxJNext");
    if (pv) pv.addEventListener("click", function () { loadJornada(jornada - 1); });
    if (nx) nx.addEventListener("click", function () { loadJornada(jornada + 1); });
    // La cinta de Última hora: las noticias abren la noticia (en Noticias);
    // las alineaciones confirmadas navegan a la página del partido (enlace
    // normal).
    var tview = document.getElementById("cxTickerView");
    if (tview) tview.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest(".cx-ticker-item") : null;
      if (!a) return;
      if (a.getAttribute("data-kind") === "match") return;
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("cx:news", { detail: { link: a.getAttribute("data-link") || a.getAttribute("href"), title: a.getAttribute("data-title") } }));
    });
    loadJornada(0);
    loadTeams();
    loadTicker();
    // La cinta de la portada se refresca sola cada 5 minutos.
    setInterval(loadTicker, 300000);
    // Refresca el marcador de la jornada en curso cada minuto: así los
    // partidos que están jugando ahora mismo van actualizando el resultado
    // sin tener que recargar la página.
    setInterval(function () { if (jornada) loadJornada(jornada); }, 60000);
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
    // La barra se puede arrastrar (o tocar) con el dedo/ratón para desplazar la tira
    function seek(ev) {
      var r = barEl.getBoundingClientRect();
      var max = scrollEl.scrollWidth - scrollEl.clientWidth;
      var thumbW = thumb.offsetWidth;
      var rel = (ev.clientX - r.left - thumbW / 2) / Math.max(r.width - thumbW, 1);
      scrollEl.scrollLeft = Math.min(1, Math.max(0, rel)) * max;
    }
    var drag = false;
    barEl.addEventListener("pointerdown", function (ev) { drag = true; try { barEl.setPointerCapture(ev.pointerId); } catch (e) {} seek(ev); ev.preventDefault(); });
    barEl.addEventListener("pointermove", function (ev) { if (drag) seek(ev); });
    barEl.addEventListener("pointerup", function () { drag = false; });
    barEl.addEventListener("pointercancel", function () { drag = false; });
    scrollEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    scrollEl.dataset.barUpdate = "1";
    scrollEl._cxBarUpdate = update;
    update();
  }
  // "Once probable" encima de los partidos que ya tienen alineación probable (los que no, sin nada)
  var probCache = {};
  function markProb(set) {
    var grid = document.getElementById("cxJGrid");
    if (!grid) return;
    grid.querySelectorAll(".cx-jn").forEach(function (el) {
      if (el.querySelector(".cx-jn-statusrow, .cx-jn-statusrow-prob")) return;
      var at = set[el.getAttribute("data-home") + "|" + el.getAttribute("data-away")];
      if (at) {
        el.classList.add("cx-jn-probable");
        var tm = "";
        if (at > 1e9) {
          var dd = new Date(at), hm = dd.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
          tm = dd.toDateString() === new Date().toDateString() ? hm : dd.toLocaleDateString("es-ES", { day: "numeric", month: "numeric" }) + " " + hm;
        }
        el.insertAdjacentHTML("afterbegin", '<div class="cx-jn-statusrow-prob" title="Último cambio del once: ' + tm + '">Once probable' + (tm ? ' <span class="cx-prob-t">· ' + tm + "</span>" : "") + "</div>");
      }
    });
  }
  function applyProb(n) {
    if (!n) return;
    var c = probCache[n];
    if (!c) { try { var raw = localStorage.getItem("cx_prob_" + n); if (raw) { c = JSON.parse(raw); probCache[n] = c; } } catch (e) {} }
    if (c) markProb(c.set);
    if (c && Date.now() - c.at < 300000) return;
    fetch(API + "/alineaciones-estado?jornada=" + n, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var set = {};
        ((d && d.items) || []).forEach(function (i) { set[i.home + "|" + i.away] = i.at || 1; });
        probCache[n] = { at: Date.now(), set: set };
        try { localStorage.setItem("cx_prob_" + n, JSON.stringify(probCache[n])); } catch (e) {}
        if (jornada === n) markProb(set);
      }).catch(function () {});
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
    var lsKey = "cx_jor_" + (n && n > 0 ? n : "cur");
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(lsKey) || "null"); } catch (e) {}
    if (!(cached && cached.matches && cached.matches.length)) grid.innerHTML = '<span class="cx-sk cx-sk-strip"></span>';
    var renderJ = function (d) {
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
          // partido ya se juega o ya acabó, arriba del todo (ancho completo,
          // estilo jornadaperfecta) se enseña la etiqueta de estado y debajo
          // el marcador en grande; si no, se queda el día/hora de siempre.
          // La tarjeta ya no lleva borde de color: fondo neutro siempre.
          var live = m.live || null;
          var state = live ? live.state : null;
          var cardCls = "cx-jn cx-jn-click";
          var statusRow = "";
          var mid;
          if (state === "final" || state === "live") {
            var stLabel = state === "final" ? "FINALIZADO" : (live.minute || "EN JUEGO");
            statusRow = '<div class="cx-jn-statusrow cx-jn-statusrow-' + state + '"><span class="cx-jn-dot"></span>' + esc(stLabel) + '</div>';
            cardCls += state === "final" ? " cx-jn-isfinal" : " cx-jn-islive";
            mid = '<span class="cx-jn-score">' + esc(live.score || "") + '</span>';
          } else if (state === "suspended") {
            statusRow = '<div class="cx-jn-statusrow cx-jn-statusrow-suspended"><span class="cx-jn-dot"></span>SUSPENDIDO</div>';
            mid = '';
          } else {
            if (m.confirmed) { statusRow = '<div class="cx-jn-statusrow cx-jn-statusrow-confirm">Once confirmado</div>'; cardCls += " cx-jn-confirmed"; }
            mid = '<span class="cx-jn-time">' + esc(((m.day || "") + " " + (m.date || "")).trim()) + '</span><span class="cx-jn-hora">' + esc(m.time || "") + '</span>';
          }
          return '<div class="' + cardCls + '" data-home="' + esc(m.home) + '" data-away="' + esc(m.away) + '" data-hcrest="' + esc(m.homeCrest) + '" data-acrest="' + esc(m.awayCrest) + '">' +
            statusRow +
            '<div class="cx-jn-row">' +
              '<img class="cx-jn-crest" src="' + esc(m.homeCrest) + '" alt="' + esc(m.home) + '" title="' + esc(m.home) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
              '<div class="cx-jn-mid">' + mid + '</div>' +
              '<img class="cx-jn-crest" src="' + esc(m.awayCrest) + '" alt="' + esc(m.away) + '" title="' + esc(m.away) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            '</div>' +
            (tv ? '<div class="cx-jn-tvrow">' + tv + '</div>' : '') +
            '</div>';
        }).join("");
        grid.style.minHeight = "";
        applyProb(jornada);
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
    };
    if (cached && cached.matches && cached.matches.length) {
      renderJ(cached);
      try { var cj = Number(cached.matchday) || 0; if (cj) { var cp = localStorage.getItem("cx_prob_" + cj); if (!cp) applyProb(cj); } } catch (e) {}
    }
    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.matches && d.matches.length) { try { localStorage.setItem(lsKey, JSON.stringify(d)); } catch (e) {} }
        renderJ(d);
      })
      .catch(function () { if (!(cached && cached.matches && cached.matches.length)) { grid.innerHTML = '<span class="cx-strip-load">No disponible.</span>'; grid.style.minHeight = ""; } });
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
  // ---------- Cinta de "Última hora" de la portada ----------
  // Marquesina CSS continua: el carril lleva el contenido duplicado y la
  // animación lo desplaza un -50%, así el bucle no tiene costuras. Se para
  // al pasar el ratón por encima (y sigue al quitarlo). Se alimenta de
  // /portada (noticias + alineaciones confirmadas, ya ordenadas).
  function tickerSlug(home, away) {
    return stripAccents(String(home + "-" + away).toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function tickerWhen(x) {
    if (x.kind === "match" && x.at) {
      try {
        var dt = new Date(x.at);
        var dd = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" }).format(dt);
        var hh = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(dt);
        return dd + " - " + hh;
      } catch (e) {}
    }
    var ds = String(x.date || "").trim(), ts = String(x.time || "").trim();
    if (ds && ts) return ds + " - " + ts;
    return ts || ds;
  }
  function tickerIcon(x) {
    var src = x.kind === "match" ? x.crest : x.thumb;
    if (src) return '<img src="' + esc(src) + '" alt="" loading="lazy">';
    return '<span class="cx-ticker-emoji">' + (x.kind === "match" ? "⚽" : "📰") + '</span>';
  }
  function tickerSyncDuration() {
    var track = document.getElementById("cxTickerTrack");
    if (!track || track.classList.contains("cx-ticker-empty")) return;
    var half = track.scrollWidth / 2;
    if (!half) return;
    var dur = Math.max(24, Math.min(180, Math.round(half / 55)));
    var cur = parseFloat(track.style.animationDuration) || 0;
    if (Math.abs(cur - dur) > 2) track.style.animationDuration = dur + "s";
  }
  window.__cxTickerSync = tickerSyncDuration;
  // Alerta bajo la cinta: alineaciones confirmadas en las últimas horas
  var cxCrestRows = [], cxCrestLoading = false;
  function renderConfAlert(items) {
    var tk = document.querySelector(".cx-ticker");
    if (!tk) return;
    var box = document.getElementById("cxConfAlert");
    var seen = {}, list = [];
    (items || []).forEach(function (x) {
      if (x.kind !== "match" || !x.home || !x.away) return;
      var k = x.home + "|" + x.away;
      if (seen[k] || !x.at || Date.now() - Number(x.at) > 5 * 3600 * 1000) return;
      seen[k] = 1; list.push(x);
    });
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "cxConfAlert"; box.className = "cx-conf-alert"; tk.insertAdjacentElement("afterend", box); }
    var crestOf = function (name) {
      var best = null, bs = 0;
      cxCrestRows.forEach(function (m) {
        [[m.home, m.homeCrest], [m.away, m.awayCrest]].forEach(function (t) {
          var sc = teamScore(t[0], name); if (sc > bs) { bs = sc; best = t[1]; }
        });
      });
      return bs >= 2 || (bs >= 1 && best) ? best : "";
    };
    var img = function (n) { var c = crestOf(n); return c ? '<img class="cx-conf-crest" src="' + esc(c) + '" alt="" loading="lazy" onerror="this.remove()">' : ""; };
    box.innerHTML = list.slice(0, 4).map(function (x) {
      return '<a class="cx-conf-pill" href="/futmondo/guiafantasy/partido/' + tickerSlug(x.home, x.away) + '"><span class="cx-conf-k">Alineación confirmada</span><span class="cx-conf-m">' + img(x.home) + esc(x.home) + ' vs ' + esc(x.away) + img(x.away) + '</span></a>';
    }).join("");
    if (!cxCrestRows.length && !cxCrestLoading) {
      cxCrestLoading = true;
      fetch(API + "/jornada").then(function (r) { return r.json(); }).then(function (d) {
        cxCrestRows = (d && d.matches) || []; if (cxCrestRows.length) renderConfAlert(items);
      }).catch(function () {});
    }
  }
  function renderTicker(items) {
    renderConfAlert(items);
    var track = document.getElementById("cxTickerTrack");
    if (!track) return;
    if (!items.length) {
      track.classList.add("cx-ticker-empty");
      track.style.animationDuration = "";
      track.innerHTML = '<span class="cx-ticker-load">Sin novedades ahora mismo.</span>';
      return;
    }
    track.classList.remove("cx-ticker-empty");
    var html = items.map(function (x) {
      var href = x.kind === "match" ? ("/futmondo/guiafantasy/partido/" + tickerSlug(x.home, x.away)) : (x.link || "#");
      var when = tickerWhen(x);
      return '<a class="cx-ticker-item" href="' + esc(href) + '" data-kind="' + esc(x.kind || "news") + '" data-title="' + esc(x.title || "") + '" data-link="' + esc(x.link || "") + '">' +
        '<span class="cx-ticker-ico">' + tickerIcon(x) + '</span>' +
        '<span class="cx-ticker-txt">' + esc(x.title || "") + '</span>' +
        (when ? '<span class="cx-ticker-when">' + esc(when) + '</span>' : '') +
        '</a>';
    }).join("");
    // Dos copias idénticas (y separación por margin, no gap, para que cada
    // copia mida exactamente lo mismo).
    track.innerHTML = html + html;
    track.querySelectorAll(".cx-ticker-ico img").forEach(function (im) {
      im.addEventListener("error", function () {
        var p = im.parentNode;
        if (p) p.innerHTML = '<span class="cx-ticker-emoji">' + (im.closest('[data-kind="match"]') ? "⚽" : "📰") + '</span>';
      });
    });
    tickerSyncDuration();
  }
  function loadTicker() {
    var track = document.getElementById("cxTickerTrack");
    if (!track) return;
    fetch(API + "/portada", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        var sig = items.map(function (x) { return (x.kind || "") + "|" + (x.title || "") + "|" + (x.at || ""); }).join("~");
        if (track.dataset.sig === sig) return;
        track.dataset.sig = sig;
        renderTicker(items);
      })
      .catch(function () {});
  }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();

/* Móvil: que el botón activo del menú verde se vea ENTERO (centrado en la barra) */
(function () {
  function fit() {
    var nav = document.querySelector(".cx-nav"); if (!nav) return;
    var a = nav.querySelector("a.active"); if (!a) return;
    var left = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
    nav.scrollLeft = Math.max(0, left);
  }
  if (document.readyState !== "loading") fit(); else document.addEventListener("DOMContentLoaded", fit);
  window.addEventListener("load", fit);
  window.addEventListener("resize", fit);
  try { document.fonts && document.fonts.ready.then(fit); } catch (e) {}
  setTimeout(fit, 400); setTimeout(fit, 1500); setTimeout(fit, 4000);
})();
