(function () {
  "use strict";
  var API = "/api/laquiniela";
  var root = document.getElementById("pj");
  var qs = new URLSearchParams(location.search);
  var id = qs.get("id") || "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function eur(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €"; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim(); }
  function same(a, b) { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0); }
  function jget(u) { return fetch(API + u).then(function (r) { return r.json(); }); }
  var ROLE = { portero: "Portero", defensa: "Defensa", centrocampista: "Centrocampista", delantero: "Delantero" };
  var ABR = { portero: "POR", defensa: "DEF", centrocampista: "MED", delantero: "DEL" };
  function ptCls(p) { return p >= 8 ? "hi" : p >= 4 ? "mid" : p > 0 || p < 0 ? "lo" : "na"; }
  function fmtDate(iso) { try { var d = new Date(iso); return d.getDate() + "/" + (d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2); } catch (e) { return ""; } }

  if (!id) {
    // Sin id: enseña una lista para elegir
    jget("/mercado").then(function (r) {
      var l = (r.players || []).slice().sort(function (a, b) { return (b.value || 0) - (a.value || 0); }).slice(0, 40);
      root.innerHTML = '<div class="pj-top"><span class="pj-tag">PRUEBA · elige un jugador</span></div><div class="card"><div class="pj-grid">' +
        l.map(function (p) { return '<a href="?id=' + esc(p.id) + '" style="color:inherit;font-weight:800">' + esc(p.name) + ' <span class="pj-tag">' + esc(p.team) + '</span></a>'; }).join("") + "</div></div>";
    });
    return;
  }

  Promise.all([jget("/jugador?id=" + encodeURIComponent(id)), jget("/noticias").catch(function () { return {}; })]).then(function (res) {
    var d = res[0], news = (res[1] && res[1].noticias) || [];
    if (!d || !d.name) { root.innerHTML = '<p class="pj-load">No se encontró el jugador.</p>'; return; }
    draw(d, news);
    // Próximos partidos (sin bloquear la ficha)
    var cur = Number(d.jornada) || 0, out = [];
    if (!cur) { fillNext(out); return; }
    Promise.all([0, 1, 2, 3, 4].map(function (k) { return jget("/jornada?jornada=" + (cur + k)).then(function (j) { return { k: k, j: j }; }).catch(function () { return { k: k, j: {} }; }); })).then(function (rs) {
      rs.forEach(function (r) {
        (r.j.matches || []).forEach(function (m) {
          if ((m.live && m.live.state === "final") || out.length >= 4) return;
          var home = same(m.home, d.team), away = same(m.away, d.team);
          if (home || away) out.push({ j: cur + r.k, home: home, rival: home ? m.away : m.home, crest: home ? m.awayCrest : m.homeCrest, day: m.day, date: m.date, time: m.time });
        });
      });
      fillNext(out);
    });
  }).catch(function () { root.innerHTML = '<p class="pj-load">No se pudo cargar la ficha.</p>'; });

  function fillNext(list) {
    var box = document.getElementById("pjNext"); if (!box) return;
    if (!list.length) { box.innerHTML = '<p class="empty">Sin partidos próximos.</p>'; return; }
    box.innerHTML = '<div class="next">' + list.map(function (n) {
      return '<div class="nx"><div class="d">' + esc((n.day || "") + " " + (n.date || "")) + "<br>" + esc(n.time || "") + '</div><img src="' + esc(n.crest) + '" alt=""><br><span class="j">J' + n.j + '</span><div class="l">' + (n.home ? "🏠 Casa" : "✈️ Fuera") + "</div></div>";
    }).join("") + "</div>";
  }

  function draw(d, news) {
    var role = String(d.role || "").toLowerCase(), role2 = String(d.role2 || "").toLowerCase();
    var st = String(d.status || "ok");
    var dots = st === "ok" ? "g g g" : st === "doubt" ? "g a a" : "r r r";
    var chipCls = st === "ok" ? "" : st === "doubt" ? "doubt" : "bad";
    var stTxt = st === "ok" ? "Disponible" : st === "doubt" ? "Duda" : st === "injured" || st === "bad" ? "Lesionado" : st === "sanc" ? "Sancionado" : "Estado: " + st;
    var ms = (d.matches || []).filter(function (m) { return m.finished; });
    var forma = ms.slice(0, 4).map(function (m) { var p = Number(m.stats) || 0; return '<span class="pt ' + ptCls(p) + '">' + p + "</span>"; }).join("");
    var games = ms.map(function (m) {
      var p = Number(m.stats) || 0, home = same(m.home, d.team);
      var w = Math.max(6, Math.min(100, Math.round(((Number(m.mins) || 0) / 90) * 100)));
      return '<div class="gm"><span class="pt ' + ptCls(p) + '">' + p + '</span><span class="tm">' + esc(m.home) + " " + esc(m.hs) + " - " + esc(m.as) + " " + esc(m.away) + '</span><span class="dt">J' + esc(m.r) + " · " + fmtDate(m.date) + '<i class="mn" style="width:' + w + '%"></i>' + esc(m.mins || 0) + "'</span></div>";
    }).join("");
    var vals = d.valores || [];
    var vrows = vals.map(function (v) {
      var df = v.diff == null ? "" : '<span class="' + (v.diff > 0 ? "down" : "up") + '">' + (v.diff > 0 ? "▼ " : "▲ ") + eur(Math.abs(v.diff)) + "</span>";
      return "<tr><td>" + esc(v.label) + '</td><td class="df">' + df + "</td><td>" + eur(v.v) + "</td></tr>";
    }).join("");
    var serie = (d.temporada && d.temporada.serie) || [];
    var mx = serie.reduce(function (a, s) { return Math.max(a, s.v); }, 0), mn = serie.reduce(function (a, s) { return Math.min(a, s.v); }, Infinity);
    var pts = serie.map(function (s, i) { var x = serie.length > 1 ? (i / (serie.length - 1)) * 600 : 0; var y = mx === mn ? 80 : 150 - ((s.v - mn) / (mx - mn)) * 140; return x.toFixed(1) + "," + y.toFixed(1); }).join(" ");
    var chart = serie.length > 1 ? '<svg class="chart" viewBox="0 0 600 160" preserveAspectRatio="none"><polygon points="0,160 ' + pts + ' 600,160" fill="rgba(34,197,94,.15)"></polygon><polyline points="' + pts + '" fill="none" stroke="#16a34a" stroke-width="3" vector-effect="non-scaling-stroke"></polyline></svg>' : "";
    var first = norm(d.name).split(" ")[0];
    var nw = news.filter(function (n) { return norm(n.title).indexOf(norm(d.name)) >= 0; }).slice(0, 3);
    if (!nw.length) nw = news.filter(function (n) { return first.length > 3 && norm(n.title).indexOf(first) >= 0; }).slice(0, 3);
    var newsHtml = nw.length ? '<div class="news">' + nw.map(function (n) {
      return '<a href="' + esc(n.link) + '" target="_blank" rel="noopener"><img src="' + esc(n.thumb || "/img/balon.svg") + '" alt=""><div class="t">' + esc(n.title) + "<small>" + esc(n.date || "") + "</small></div></a>";
    }).join("") + "</div>" : '<p class="empty">No hay noticias recientes sobre ' + esc(d.name) + ".</p>";

    root.innerHTML =
      '<div class="pj-top"><button class="pj-back" id="pjBack" type="button">← Volver</button><span class="pj-tag">PRUEBA · perfil de jugador</span></div>' +
      '<div class="pj-grid">' +
      '<section class="card hero"><div class="hero-ph"><img class="face" src="' + esc(d.photo) + '" alt=""><img class="club" src="' + esc(d.logo) + '" alt=""></div>' +
      '<div class="dots">' + dots.split(" ").map(function (c) { return '<i class="' + c + '"></i>'; }).join("") + "</div>" +
      "<h1>" + esc(d.name) + "</h1>" +
      '<div class="hero-line">Pronóstico: <b>' + esc(String(d.pronostico || "—").replace(/\s*[\u{1F300}-\u{1FAFF}\u2600-\u27BF]+/gu, "")) + '</b></div>' +
      '<span class="chip ' + chipCls + '">' + esc(stTxt) + "</span></section>" +
      '<section class="card"><h2>Ficha</h2><div class="mini">' +
      '<div class="m"><div class="k">Valor</div><div class="v">' + eur(d.value) + '</div><span class="' + (d.change >= 0 ? "up" : "down") + '">' + (d.change >= 0 ? "▲ " : "▼ ") + eur(Math.abs(d.change || 0)) + "</span></div>" +
      '<div class="m"><div class="k">Edad</div><div class="v">' + esc(d.age || "—") + '</div></div>' +
      '<div class="m" style="grid-column:1/-1"><div class="k">Demarcación</div><div class="pos"><span class="p-' + role + '">' + esc(ROLE[role] || role) + "</span>" + (role2 ? '<span class="p-' + role2 + '">' + esc(ABR[role2] || role2) + "</span>" : "") + "</div></div></div>" +
      '<h2 style="margin-top:14px">Próximos partidos</h2><div id="pjNext"><p class="empty">Cargando…</p></div></section>' +
      '<section class="card"><h2>Puntos</h2><div class="tri"><div><div class="v">' + esc(d.points || 0) + '</div><div class="k">Total</div></div><div><div class="v">' + String(d.average || 0).replace(".", ",") + '</div><div class="k">Media</div></div><div><div class="v">' + esc(d.matches5 || ms.length) + '</div><div class="k">Partidos</div></div></div>' +
      '<div class="k pj-tag" style="text-align:center;margin-bottom:6px">FORMA</div><div class="forma">' + forma + "</div></section>" +
      '<section class="card"><h2>Últimos partidos</h2><div class="games">' + (games || '<p class="empty">Sin partidos.</p>') + "</div></section>" +
      '<section class="card pj-full"><h2>Valor de mercado</h2><div class="pj-grid"><div><table class="vtab">' + vrows + '</table></div><div>' +
      (isFinite(mn) ? '<div class="hl"><span class="up">▲ Máx. ' + eur(mx) + '</span><span class="down">▼ Mín. ' + eur(mn) + "</span></div>" : "") + chart + "</div></div></section>" +
      '<section class="card pj-full"><h2>Últimas noticias sobre ' + esc(d.name) + "</h2>" + newsHtml + "</section></div>";
    document.getElementById("pjBack").addEventListener("click", function () { if (history.length > 1) history.back(); else location.href = "/futmondo/guiafantasy/"; });
  }
})();
