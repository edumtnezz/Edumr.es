/* Página de prueba del nuevo Inicio (/futmondo/demo). Solo lee la API; no cambia nada de la web.
   Todo dato sale de /api/laquiniela. Si una fuente falla, se enseña el último dato bueno guardado. */
(function () {
  "use strict";
  var API = "/api/laquiniela";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var fold = function (s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var nameSlug = function (s) { return fold(s).replace(/[^a-z0-9]/g, ""); };
  var miles = function (n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, "."); };
  var dots = miles;
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
  var nextKo = null, curJ = 0, selJ = 0;
  function paintJornada(j, est) {
    if (!j || !j.matches || !j.matches.length) { $("#games").innerHTML = '<p class="muted">Sin partidos ahora mismo.</p>'; return; }
    if (!curJ) curJ = j.matchday;
    selJ = j.matchday;
    $("#jTit").textContent = "Jornada " + j.matchday;
    $("#jPrev").disabled = selJ <= 1; $("#jNext").disabled = selJ >= 38;
    var pr = {};
    ((est && est.items) || []).forEach(function (i) { pr[i.home + "|" + i.away] = i.at || 1; });
    $("#games").innerHTML = j.matches.map(function (m) {
      var st = m.live && m.live.state;
      var at = st === "final" ? 0 : pr[m.home + "|" + m.away];
      var tv = (m.tv || []).map(function (t) { return t.logo ? '<img class="tv" src="' + esc(t.logo) + '" alt="' + esc(t.name) + '">' : ""; }).join("");
      var score = m.live && m.live.score ? m.live.score : "";
      var lab = st === "live" ? (score || "En juego") : st === "final" ? score : m.aplazado ? "Aplazado" : m.time;
      var sub = st === "live" ? '<span class="lv">' + esc(m.live.minute || "En directo") + "</span>" : st === "final" ? '<span class="fn">Final</span>' : tv;
      var ago = at > 1e9 ? Math.round((Date.now() - at) / 60000) : -1;
      var fresh = ago >= 0 && ago < 60;
      return '<a class="gm' + (at ? " p" : "") + (fresh ? " new" : "") + '" href="/futmondo/guiafantasy/partido/' + matchSlug(m.home, m.away) + "?j=" + j.matchday + '">' +
        (at ? '<div class="pr"><b>' + (fresh ? '<i class="dot"></i>' : "") + (m.confirmed ? "Once confirmado" : "Once probable") + "</b>" + (at > 1e9 ? "<span>" + (fresh ? "hace " + Math.max(1, ago) + " min" : hm(at)) + "</span>" : "") + "</div>" : "") +
        '<div class="in"><img class="c" src="' + esc(m.homeCrest) + '" alt="' + esc(m.home) + '">' +
        '<div class="mid"><b>' + esc(m.day) + " " + esc(m.date) + "</b>" + esc(lab) + sub + "</div>" +
        '<img class="c" src="' + esc(m.awayCrest) + '" alt="' + esc(m.away) + '"></div></a>';
    }).join("");
    // barra de cuenta atrás (solo en la jornada actual): al primer partido que aún no ha empezado
    var nx = $("#next");
    if (selJ !== curJ) { nx.hidden = true; nextKo = null; return; }
    var now = Date.now(), first = null;
    j.matches.forEach(function (m) { var k = kickoff(m); if (k && k > now && !(m.live && m.live.state)) { if (!first || k < first.k) first = { k: k, m: m }; } });
    if (!first) { nx.hidden = true; return; }
    nextKo = first.k;
    nx.href = "/futmondo/guiafantasy/partido/" + matchSlug(first.m.home, first.m.away) + "?j=" + j.matchday;
    var started = j.matches.some(function (m) { var k = kickoff(m); return (m.live && m.live.state) || (k && k < now); });
    nx.innerHTML = '<span class="nx-vs"><img src="' + esc(first.m.homeCrest) + '" alt=""><em>VS</em><img src="' + esc(first.m.awayCrest) + '" alt=""></span>' +
      '<span class="nx-l"><span>' + (started ? "Próximo partido" : "Empieza la jornada") + '</span><span class="cdn" id="cdn"></span></span>';
    nx.hidden = false;
    tick();
  }
  function loadJornada(n) {
    var q = n && n !== curJ ? "jornada?jornada=" + n : "jornada";
    get(q).then(function (jr) {
      if (!jr) return;
      return (n && n !== curJ ? Promise.resolve(null) : get("alineaciones-estado?jornada=" + jr.matchday)).then(function (est) { paintJornada(jr, est); });
    });
  }
  $("#jPrev").addEventListener("click", function () { if (selJ > 1) loadJornada(selJ - 1); });
  $("#jNext").addEventListener("click", function () { if (selJ < 38) loadJornada(selJ + 1); });
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
    var hoy = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" });
    news.slice(0, 4).forEach(function (x, n) {
      var esHoy = String(x.date || "").trim() === hoy;
      var a = document.createElement("a"); a.className = "nr" + (n === 0 ? " big" : ""); a.href = x.link;
      var th = document.createElement("div"); th.className = "th";
      var t = thumbOf(x); if (t) th.appendChild(t);
      a.appendChild(th);
      var tg = newsTag(x);
      a.insertAdjacentHTML("beforeend", '<div class="b"><div class="m"><span class="pill p-' + tg[0] + '">' + tg[1] + "</span>" + (n === 0 && esHoy ? '<span class="pill p-nuevo">Nuevo</span>' : "") + "<span>" + (esHoy ? "" : esc(x.date) + " · ") + esc(x.time) + "</span></div><h3>" + esc(x.title) + "</h3></div>");
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
  // jornadas jugadas de un equipo (para poner la J bajo cada barra); si falta alguna jornada, no se pone ninguna
  var playedCache = null;
  function dateKey(d, t) {
    var a = String(d || "").split("/").map(Number), hm2 = String(t || "0:0").replace(":", "") * 1 || 0;
    return (((a[1] >= 7 ? a[1] : a[1] + 12) || 0) * 100 + (a[0] || 0)) * 10000 + hm2;
  }
  function playedJ() {
    if (playedCache) return playedCache;
    playedCache = get("jornada").then(function (jr) {
      var cur = Number(jr && jr.matchday) || 0;
      if (!cur) return null;
      var ns = []; for (var n = 1; n <= cur; n++) ns.push(n);
      return Promise.all(ns.map(function (n) { return n === cur ? Promise.resolve(jr) : get("jornada?jornada=" + n); })).then(function (rs) {
        if (rs.some(function (r) { return !r || !r.matches || !r.matches.length; })) return null;
        var m = {};
        rs.forEach(function (r, i) {
          r.matches.forEach(function (x) {
            if (!x.live || x.live.state !== "final") return;
            [x.home, x.away].forEach(function (t) { var k = canon(t); (m[k] = m[k] || []).push({ n: i + 1, k: dateKey(x.date, x.time) }); });
          });
        });
        Object.keys(m).forEach(function (k) { m[k] = m[k].sort(function (a, b) { return a.k - b.k; }).map(function (e) { return e.n; }); });
        return m;
      });
    });
    return playedCache;
  }
  function teamPub(team) { // partidos con puntos YA publicados por Futmondo (nunca los del partido anterior)
    var k = canon(team), mx = 0;
    players.forEach(function (p) { if (canon(p.team) === k && (Number(p.matches) || 0) > mx) mx = Number(p.matches) || 0; });
    return mx;
  }
  function eur(v) { v = Math.round(Number(v) || 0); return (v > 0 ? "+" : v < 0 ? "−" : "") + miles(v) + " €"; }
  function paintChollo(x) {
    var box = $("#chol");
    if (!x || !x.chol) { box.hidden = true; return; }
    var c = x.chol, p = players.find(function (q) { return String(q.id) === String(x.fid || x.pid); });
    var href = playerUrl(p);
    var f = (c.forma || []).slice(-5), mx = Math.max(10, Math.max.apply(null, f.concat([0])));
    var rep = Number(x.rep) || 0;
    var repHtml = rep ? '<span class="chol-rp"><b>' + rep + '</b><small>' + (rep === 1 ? "vez" : "veces") + ' chollo</small></span>' : '<span class="chol-rp"><b>1ª</b><small>vez chollo</small></span>';
    // valor: hoy, ayer y 7 días (Futmondo, de la lista del mercado)
    var vh = p ? Number(p.chg1) || 0 : null, v2 = p && p.chg2 != null && p.chg2 !== "" ? Number(p.chg2) || 0 : null, v7 = p && p.chg7 != null && p.chg7 !== "" ? Number(p.chg7) || 0 : null;
    var vay = vh != null && v2 != null ? v2 - vh : null;
    var cell = function (lab, v) { return '<div><small>' + lab + '</small><b class="' + (v > 0 ? "up" : v < 0 ? "dn" : "") + '">' + (v == null ? "—" : eur(v)) + "</b></div>"; };
    // previsión a 3 días: misma regla que el resto de la web (hoy ≥ 100.000 € y ayer en el mismo sentido)
    var prev = '<span class="chol-pv none">Previsión 3 días: sin señal clara hoy</span>';
    if (vh != null && Math.abs(vh) >= 100000 && vay != null && vh * vay > 0) {
      var mn = Math.floor(Math.abs(vh) / 10000) * 10000;
      prev = '<span class="chol-pv ' + (vh > 0 ? "up" : "dn") + '">Previsión 3 días: ' + (vh > 0 ? "▲ más de +" : "▼ más de −") + miles(mn) + " €</span>";
    }
    box.innerHTML = '<div class="hd"><h2>Chollo del día</h2></div>' +
      '<a class="chol-top" href="' + esc(href || "/futmondo/guiafantasy/mercado") + '"><span class="chol-ph">' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="">' : "") + "</span>" +
      '<span><span class="chol-nm">' + esc(x.title) + (c.logo ? '<img src="' + esc(c.logo) + '" alt="">' : "") + '</span><span class="chol-vl">' + esc(c.valor) + "</span></span>" + repHtml + "</a>" +
      '<div class="chol-row"><div class="chol-bars" id="cholBars"></div><div class="chol-st"><div><b>' + esc(c.media) + "</b>media</div>" + (c.prob ? "<div><b>" + esc(c.prob) + " %</b>prob. jugar</div>" : "") + "</div></div>" +
      '<div class="chol-val"><div class="chol-vg">' + cell("Hoy", vh) + cell("Ayer", vay) + cell("7 días", v7) + "</div>" + prev + "</div>";
    var bars = $("#cholBars");
    f.forEach(function (v) {
      var s = document.createElement("span"); s.className = v >= 8 ? "hi" : v <= 0 ? "lo" : "";
      s.appendChild(document.createTextNode(String(v)));
      var i = document.createElement("i"); i.style.height = Math.max(6, Math.round((v / mx) * 100)) + "%"; s.appendChild(i);
      var e = document.createElement("em"); s.appendChild(e);
      bars.appendChild(s);
    });
    box.hidden = false;
    var team = c.team || (p && p.team) || "";
    playedJ().then(function (m) {
      var l = m && m[canon(team)];
      if (!l) return; // sin las jornadas reales no se inventa la J
      var n = Math.min(l.length, teamPub(team) || l.length);
      if (n < f.length) return;
      bars.querySelectorAll("em").forEach(function (e, i) { e.textContent = "J" + l[n - 1 - (f.length - 1 - i)]; });
    });
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

  // ---------- perfil (igual que en el resto de la web) ----------
  (function () {
    var ub = $("#userBox"); if (!ub) return;
    fetch(API + "/me", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      var name = d && d.user && d.user.name; if (!name) return;
      var parts = String(name).trim().split(/\s+/).filter(Boolean);
      var ini = (parts.length <= 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
      ub.hidden = false;
      ub.innerHTML = '<button type="button" class="user-chip"><span class="user-avatar">' + esc(ini) + '</span><span class="user-name">' + esc(name) + '</span><span class="user-caret">▾</span></button><div class="user-menu"><button type="button" class="user-menu-exit">Salir</button></div>';
      var menu = ub.querySelector(".user-menu");
      ub.querySelector(".user-chip").addEventListener("click", function (e) { e.stopPropagation(); menu.classList.toggle("open"); });
      document.addEventListener("click", function (e) { if (!ub.contains(e.target)) menu.classList.remove("open"); });
      ub.querySelector(".user-menu-exit").addEventListener("click", function () { fetch(API + "/logout", { method: "POST" }).catch(function () {}).then(function () { location.reload(); }); });
    }).catch(function () {});
  })();

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
  pNews.then(function (n) {
    var l = (n && n.noticias) || [];
    paintTicker(l);
    var a = l.find(function (x) { return /\/n\/artmercado/.test(x.link || ""); });
    if (a) $("#mvAll").href = a.link;
  });
  Promise.all([pMerc, pNews]).then(function (r) { paintNews((r[1] && r[1].noticias) || []); });
  Promise.all([pMerc, get("ultimos-cambios")]).then(function (r) { paintCambios(r[1]); });
  Promise.all([pMerc, get("tabla"), get("lideres")]).then(function (r) { tabla = r[1]; lideres = r[2]; paintLiga(); });
})();
