/* Página de prueba del nuevo Inicio (/futmondo/demo). Solo lee la API; no cambia nada de la web.
   Todo dato sale de /api/laquiniela. Si una fuente falla, se enseña el último dato bueno guardado. */
(function () {
  "use strict";
  var API = "/api/laquiniela";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var fold = function (s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var nameSlug = function (s) { return fold(s).replace(/[^a-z0-9]/g, ""); };
  var dots = function (v) { return Math.round(Math.abs(v)).toLocaleString("es-ES"); };
  var canon = function (t) { try { return window.EduTeams ? window.EduTeams.canon(t) : fold(t); } catch (e) { return fold(t); } };

  function get(route) {
    var key = "demo:" + route;
    return fetch(API + "/" + route, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) {} return d; })
      .catch(function () { try { var s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch (e) {} return null; });
  }

  // ---------- mercado (fotos, escudos y cambios de valor) ----------
  var players = [], logoByTeam = {};
  function logoOf(team) { return logoByTeam[canon(team)] || ""; }
  function playerUrl(p) { return p && p.id ? "/jugador/" + encodeURIComponent(p.id) + "/" + nameSlug(p.name) : ""; }

  // ---------- etiquetas ----------
  var VER = { baja: "Baja", alta: "Alta", duda: "Duda" };
  var CAT = { lesion: ["baja", "Baja"], duda: ["duda", "Duda"], recuperado: ["alta", "Alta"], sancionado: ["sancion", "Sanción"], sancion: ["sancion", "Sanción"], apercibido: ["duda", "Apercibido"] };
  function newsTag(n) {
    if (n.tipo === "articulo") return ["articulo", "Artículo"];
    if (VER[n.veredicto]) return [n.veredicto, VER[n.veredicto]];
    return ["nota", "Noticia"];
  }

  // ---------- cinta + escudos ----------
  function paintTicker(news) {
    if (!news.length) { $("#tick").hidden = true; return; }
    var h = news.slice(0, 8).map(function (n) {
      var t = newsTag(n);
      return '<a href="' + esc(n.link) + '"><span class="pill p-' + t[0] + '">' + t[1] + "</span>" + esc(n.title) + "</a>";
    }).join("");
    $("#tickTr").innerHTML = h + h;
  }
  function paintClubs() {
    var seen = {}, h = "";
    Object.keys(logoByTeam).sort().forEach(function (k) {
      var p = players.find(function (q) { return canon(q.team) === k; });
      if (!p || seen[k]) return; seen[k] = 1;
      var href = (window.EduTeams && window.EduTeams.href(p.team)) || "/equipos";
      h += '<a href="' + esc(href) + '" aria-label="' + esc(p.team) + '"><img src="' + esc(logoByTeam[k]) + '" alt=""></a>';
    });
    $("#clubs").innerHTML = h;
  }

  // ---------- jornada ----------
  function matchSlug(h, a) { return fold(h + "-" + a).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function kickoff(m) {
    var d = String(m.date || "").split("/"), t = String(m.time || "").split(":");
    if (d.length < 2 || t.length < 2) return null;
    var now = new Date(), y = now.getFullYear(), mo = +d[1] - 1;
    if (now.getMonth() === 11 && mo === 0) y++;
    return new Date(y, mo, +d[0], +t[0], +t[1]);
  }
  function hm(ts) {
    var d = new Date(ts), h = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString() ? h : d.getDate() + "/" + (d.getMonth() + 1) + " " + h;
  }
  var nextKo = null;
  function paintJornada(j, est) {
    if (!j || !j.matches || !j.matches.length) { $("#games").innerHTML = '<p class="muted">Sin partidos ahora mismo.</p>'; return; }
    $("#jTit").textContent = "Jornada " + j.matchday;
    var pr = {};
    ((est && est.items) || []).forEach(function (i) { pr[i.home + "|" + i.away] = i.at || 1; });
    $("#games").innerHTML = j.matches.map(function (m) {
      var at = pr[m.home + "|" + m.away];
      var tv = (m.tv || []).map(function (t) { return t.logo ? '<img class="tv" src="' + esc(t.logo) + '" alt="' + esc(t.name) + '">' : ""; }).join("");
      var lab = m.live ? "En juego" : m.aplazado ? "Aplazado" : "";
      return '<a class="gm' + (at ? " p" : "") + '" href="/futmondo/guiafantasy/partido/' + matchSlug(m.home, m.away) + "?j=" + j.matchday + '">' +
        (at ? '<div class="pr">' + (m.confirmed ? "Once confirmado" : "Once probable") + (at > 1e9 ? "<span>" + hm(at) + "</span>" : "") + "</div>" : "") +
        '<div class="in"><img class="c" src="' + esc(m.homeCrest) + '" alt="' + esc(m.home) + '">' +
        '<div class="mid"><b>' + esc(m.day) + " " + esc(m.date) + "</b>" + esc(lab || m.time) + tv + "</div>" +
        '<img class="c" src="' + esc(m.awayCrest) + '" alt="' + esc(m.away) + '"></div></a>';
    }).join("");
    // barra fina: cuenta atrás al primer partido que aún no ha empezado
    var now = Date.now(), first = null;
    j.matches.forEach(function (m) { var k = kickoff(m); if (k && k > now && !m.live && (!first || k < first.k)) first = { k: k, m: m }; });
    var nx = $("#next");
    if (!first) { nx.hidden = true; return; }
    nextKo = first.k;
    nx.href = "/futmondo/guiafantasy/partido/" + matchSlug(first.m.home, first.m.away) + "?j=" + j.matchday;
    nx.innerHTML = '<img src="' + esc(first.m.homeCrest) + '" alt=""><img src="' + esc(first.m.awayCrest) + '" alt=""><span>' +
      (j.matches.some(function (m) { var k = kickoff(m); return m.live || (k && k < now); }) ? "Próximo partido" : "Empieza la jornada") +
      '</span><span class="cdn" id="cdn"></span>';
    nx.hidden = false;
    tick();
  }
  function tick() {
    var c = $("#cdn"); if (!c || !nextKo) return;
    var s = Math.max(0, Math.floor((nextKo - Date.now()) / 1000));
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    var parts = d ? [[d, "d"], [h, "h"], [m, "m"]] : [[h, "h"], [m, "m"], [s % 60, "s"]];
    c.innerHTML = parts.map(function (p) { return "<span>" + p[0] + "<small>" + p[1] + "</small></span>"; }).join("");
  }
  setInterval(tick, 1000);

  // ---------- noticias (miniatura propia: EduThumb, con la foto de Futmondo del jugador del titular) ----------
  var CLUB_COL = [[/barc/, "#a50044"], [/real madrid/, "#1e3a8a"], [/atletico|atleti/, "#c8102e"], [/sevilla/, "#d71920"], [/betis/, "#0a7d3b"], [/valencia/, "#e8731a"], [/athletic|bilbao/, "#d4121a"], [/sociedad/, "#0067b1"], [/villarreal/, "#b58900"], [/celta/, "#2a7fbf"], [/osasuna/, "#c0102e"], [/getafe/, "#004fa3"], [/rayo/, "#d6101f"], [/espanyol/, "#0069b5"], [/alaves/, "#0052a5"], [/levante/, "#9b1030"], [/elche/, "#0c8a3f"], [/depor|coruna/, "#1d4ed8"], [/racing|santander/, "#0a7d3b"], [/malaga/, "#0b66c3"]];
  function clubColor(n) { n = fold(n); for (var i = 0; i < CLUB_COL.length; i++) if (CLUB_COL[i][0].test(n)) return CLUB_COL[i][1]; return "#1f2937"; }
  function playerOfNews(x) {
    var id = x.pid || x.fp;
    if (id) { var p = players.find(function (q) { return String(q.id) === String(id); }); if (p) return p; }
    var tt = fold(x.title);
    var cc = x.club ? canon(x.club) : "";
    return players.find(function (q) {
      return q.photo && (!cc || canon(q.team) === cc) && fold(q.name).split(/\s+/).some(function (w) { return w.length > 3 && tt.indexOf(w) >= 0; });
    }) || null;
  }
  function thumbOf(x) {
    var T = window.EduThumb;
    if (!T) return null;
    try {
      if (x.tipo === "articulo") return T.articulo(x, false);
      var p = playerOfNews(x);
      return T.el(x, { photo: p ? p.photo : "", photoG: p ? (p.fotoG || "") : "", crest: (p && p.logo) || logoOf(x.club), club: x.club || "", color: x.club ? clubColor(x.club) : "" });
    } catch (e) { return null; }
  }
  function paintNews(news) {
    var box = $("#news");
    if (!news.length) { box.innerHTML = '<p class="muted">Sin noticias ahora mismo.</p>'; return; }
    box.innerHTML = "";
    news.slice(0, 4).forEach(function (x) {
      var a = document.createElement("a"); a.className = "nr"; a.href = x.link;
      var th = document.createElement("div"); th.className = "th";
      var t = thumbOf(x); if (t) th.appendChild(t);
      a.appendChild(th);
      var tg = newsTag(x);
      a.insertAdjacentHTML("beforeend", '<div class="b"><div class="m"><span class="pill p-' + tg[0] + '">' + tg[1] + "</span><span>" + esc(x.date) + " · " + esc(x.time) + "</span></div><h3>" + esc(x.title) + "</h3></div>");
      box.appendChild(a);
    });
  }

  // ---------- últimos cambios + chollo ----------
  function paintCambios(uc) {
    var items = [], chol = null;
    ((uc && uc.days) || []).forEach(function (d) {
      (d.items || []).forEach(function (i) {
        if (i.cat === "chollo") { if (!chol) chol = i; return; }
        if (i.cat === "mercado") return; // el mercado va en su propio bloque
        items.push({ d: d.day, i: i });
      });
    });
    var box = $("#cam");
    if (!items.length) box.innerHTML = '<p class="muted">Sin cambios ahora mismo.</p>';
    else box.innerHTML = items.slice(0, 5).map(function (e) {
      var i = e.i, c = CAT[i.cat] || ["nota", i.cat];
      var p = i.pid ? players.find(function (q) { return String(q.id) === String(i.pid); }) : null;
      var href = i.href || playerUrl(p);
      var de = (i.players && i.players[0] && i.players[0].to) || "";
      var img = i.photo || (p && p.photo) ? '<span class="lg ph"><img src="' + esc(i.photo || p.photo) + '" alt=""></span>' : i.logo ? '<span class="lg"><img src="' + esc(i.logo) + '" alt=""></span>' : '<span class="lg"></span>';
      var inner = img + '<span class="b"><span class="ti"><span class="pill p-' + c[0] + '">' + esc(c[1]) + "</span>" + esc(i.title) + "</span>" + (de ? '<span class="de">' + esc(de) + "</span>" : "") + '</span><span class="tm">' + esc(i.time) + "</span>";
      return href ? '<a class="it" href="' + esc(href) + '">' + inner + "</a>" : '<div class="it">' + inner + "</div>";
    }).join("");
    paintChollo(chol);
  }
  function paintChollo(x) {
    var box = $("#chol");
    if (!x || !x.chol) { box.hidden = true; return; }
    var c = x.chol, p = players.find(function (q) { return String(q.id) === String(x.fid || x.pid); });
    var href = playerUrl(p);
    var f = (c.forma || []).slice(-5), mx = Math.max(10, Math.max.apply(null, f.concat([0])));
    box.innerHTML = '<div class="hd"><h2>Chollo del día</h2><span class="muted">' + esc(x.time || "") + "</span></div>" +
      '<a class="chol-top" href="' + esc(href || "/futmondo/guiafantasy/mercado") + '"><span class="chol-ph">' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="">' : "") + "</span>" +
      '<span><span class="chol-nm">' + esc(x.title) + (c.logo ? '<img src="' + esc(c.logo) + '" alt="">' : "") + '</span><span class="chol-vl">' + esc(c.valor) + "</span></span></a>" +
      '<div class="chol-row"><div class="chol-bars" id="cholBars"></div><div class="chol-st"><div><b>' + esc(c.media) + "</b>media</div>" + (c.prob ? "<div><b>" + esc(c.prob) + " %</b>prob. jugar</div>" : "") + "</div></div>";
    var bars = $("#cholBars");
    f.forEach(function (v) {
      var s = document.createElement("span"); s.className = v >= 8 ? "hi" : v <= 0 ? "lo" : "";
      s.appendChild(document.createTextNode(String(v)));
      var i = document.createElement("i"); i.style.height = Math.max(6, Math.round((v / mx) * 80)) + "%"; s.appendChild(i);
      bars.appendChild(s);
    });
    box.hidden = false;
  }

  // ---------- mercado: suben / bajan ----------
  var mvKey = "up";
  function paintMercado() {
    var ps = players.filter(function (p) { return p && p.name && Number(p.change); });
    var list = mvKey === "up"
      ? ps.filter(function (p) { return p.change > 0; }).sort(function (a, b) { return b.change - a.change; })
      : ps.filter(function (p) { return p.change < 0; }).sort(function (a, b) { return a.change - b.change; });
    $("#mv").innerHTML = list.length ? list.slice(0, 5).map(function (p) {
      return '<a class="row" href="' + esc(playerUrl(p)) + '">' + (p.logo ? '<img src="' + esc(p.logo) + '" alt="">' : "") + "<span>" + esc(p.name) + '</span><span class="v ' + (p.change > 0 ? "up" : "dn") + '">' + (p.change > 0 ? "+" : "−") + dots(p.change) + " €</span></a>";
    }).join("") : '<p class="muted">Sin cambios de valor ahora mismo.</p>';
  }
  $("#mvTabs").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    mvKey = b.getAttribute("data-k");
    document.querySelectorAll("#mvTabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
    paintMercado();
  });

  // ---------- LaLiga: tabla y líderes juntos ----------
  var tabla = null, lideres = null, ligaKey = "tabla", full = false;
  function paintLiga() {
    var box = $("#liga"), btn = $("#tblFull");
    btn.hidden = ligaKey !== "tabla";
    if (ligaKey === "tabla") {
      var T = (tabla && tabla.teams) || [];
      if (!T.length) { box.innerHTML = '<p class="muted">Sin clasificación ahora mismo.</p>'; return; }
      var n = T.length;
      var row = function (t) {
        var cls = t.pos <= 3 ? "q" : t.pos > n - 3 ? "d" : "";
        var lg = logoOf(t.name);
        var href = (window.EduTeams && window.EduTeams.href(t.name)) || "";
        var name = (lg ? '<img src="' + esc(lg) + '" alt="">' : "") + esc(t.name);
        return '<tr><td class="l"><span class="bar ' + cls + '"></span>' + t.pos + '</td><td class="l n">' + (href ? '<a href="' + esc(href) + '">' + name + "</a>" : name) + "</td><td>" + t.pj + "</td><td>" + (t.dg > 0 ? "+" : "") + t.dg + '</td><td class="n">' + t.pts + "</td></tr>";
      };
      var body = full ? T.map(row).join("") : T.slice(0, 3).map(row).join("") + '<tr class="gap"><td colspan="5">···</td></tr>' + T.slice(n - 3).map(row).join("");
      box.innerHTML = '<table><thead><tr><th class="l">#</th><th class="l">Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr></thead><tbody>' + body + "</tbody></table>";
      btn.textContent = full ? "Solo arriba y abajo" : "Ver completa";
      return;
    }
    var L = (lideres && lideres[ligaKey]) || [];
    if (ligaKey === "amarillas") L = L.filter(function (x) { return Number(x.v) % 5 === 4; }); // a una de la sanción
    if (!L.length) { box.innerHTML = '<p class="muted">Sin datos ahora mismo.</p>'; return; }
    box.innerHTML = (ligaKey === "amarillas" ? '<p class="muted">A una amarilla de la sanción</p>' : "") +
      L.slice(0, ligaKey === "amarillas" ? 10 : 5).map(function (x, i) {
        var lg = logoOf(x.team);
        return '<div class="row"><span class="n' + (i ? "" : " n1") + '">' + (i + 1) + "</span>" + (lg ? '<img src="' + esc(lg) + '" alt="">' : "") + "<span>" + esc(x.n) + '<span class="sm">' + esc(x.team) + '</span></span><span class="v big">' + esc(x.v) + "</span></div>";
      }).join("");
  }
  $("#ligaTabs").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    ligaKey = b.getAttribute("data-k");
    document.querySelectorAll("#ligaTabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
    paintLiga();
  });
  $("#tblFull").addEventListener("click", function () { full = !full; paintLiga(); });

  // ---------- carga ----------
  var pMerc = get("mercado").then(function (m) {
    players = (m && m.players) || [];
    players.forEach(function (p) { if (p.logo && p.team) { var k = canon(p.team); if (!logoByTeam[k]) logoByTeam[k] = p.logo; } });
    paintClubs(); paintMercado();
  });
  var pJor = get("jornada");
  var pNews = get("noticias");
  Promise.all([pJor, pJor.then(function (j) { return j && j.matchday ? get("alineaciones-estado?jornada=" + j.matchday) : null; })])
    .then(function (r) { paintJornada(r[0], r[1]); });
  pNews.then(function (n) { paintTicker((n && n.noticias) || []); });
  Promise.all([pMerc, pNews]).then(function (r) { paintNews((r[1] && r[1].noticias) || []); });
  Promise.all([pMerc, get("ultimos-cambios")]).then(function (r) { paintCambios(r[1]); });
  Promise.all([pMerc, get("tabla"), get("lideres")]).then(function (r) { tabla = r[1]; lideres = r[2]; paintLiga(); });
})();
