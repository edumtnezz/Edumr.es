/* Alineación probable con datos reales.
   /futmondo/prueba/?equipo=Levante  (por defecto Levante)
   Fuente: /api/laquiniela/once (once probable) + /mercado (jugadores de Futmondo). */
(function () {
  var API = "/api/laquiniela";
  var TEAM_ALIASES = { barca: "barcelona", atleti: "atletico" };
  var STOP = ["de", "del", "la", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie", "c", "f"];
  function strip(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  function teamWords(s) { return strip(s).split(" ").filter(function (w) { return w && STOP.indexOf(w) < 0; }).map(function (w) { return TEAM_ALIASES[w] || w; }); }
  function teamScore(a, b) { var A = teamWords(a), B = teamWords(b), n = 0; A.forEach(function (w) { if (B.indexOf(w) >= 0) n++; }); return n; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lev1(a, b) { // ¿a y b difieren en como mucho 1 letra?
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
    var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }

  // Cruce del jugador del once con el jugador de Futmondo, solo dentro de su equipo.
  var sinPareja = (window.__sinPareja = []);
  function match(s, pool) {
    var names = [strip(s.full), strip(s.name)].filter(Boolean);
    var toks = {}; names.forEach(function (n) { n.split(" ").forEach(function (t) { toks[t] = 1; }); });
    var squash = names.map(function (n) { return n.replace(/ /g, ""); });
    var steps = [
      function (p) { var n = strip(p.name); return names.indexOf(n) >= 0; },                               // 1. nombre igual
      function (p) { var pt = strip(p.name).split(" "); return pt.every(function (t) { return toks[t]; }); }, // 2. todas sus palabras están en el nombre completo
      function (p) { var q = strip(p.name).replace(/ /g, ""); return q.length >= 4 && squash.some(function (z) { return z.indexOf(q) >= 0; }); }, // 3. "Dela" dentro de "adriandelafuente"
      function (p) { var pt = strip(p.name).split(" "); return pt.every(function (t) { return Object.keys(toks).some(function (k) { return lev1(t, k) || (t.length >= 4 && k.indexOf(t) === 0); }); }); }, // 4. una letra de diferencia o diminutivo (Fede→Federico)
      function (p) { var pt = strip(p.name).split(" "), last = pt[pt.length - 1]; return last.length >= 4 && toks[last] && pool.filter(function (q) { var qt = strip(q.name).split(" "); return qt[qt.length - 1] === last; }).length === 1; } // 5. mismo apellido y único en el equipo
    ];
    for (var i = 0; i < steps.length; i++) {
      var hits = pool.filter(steps[i]);
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) { // desempate por más palabras en común
        hits.sort(function (a, b) { return strip(b.name).length - strip(a.name).length; });
        return hits[0];
      }
    }
    return null;
  }

  function line(pos) { return /port/i.test(pos) ? "gk" : /def/i.test(pos) ? "df" : /del/i.test(pos) ? "fw" : "md"; }
  function probCls(p) { return p >= 90 ? "p90" : p >= 80 ? "p80" : p >= 60 ? "p60" : p >= 40 ? "p40" : "p0"; }
  function slug(s) { return strip(s).replace(/ /g, ""); }

  function render(side, pool, bench) {
    var groups = { fw: [], md: [], df: [], gk: [] };
    side.starters.forEach(function (s) { groups[line(s.pos)].push(s); });
    // Cada suplente es alternativa de UN solo titular dudoso (el de menor probabilidad de su línea).
    var altOf = new Map(), libres = bench.filter(function (b) { return (b.prob || 0) >= 40; }).slice();
    side.starters.filter(function (s) { return s.prob != null && s.prob < 80; }).sort(function (a, b) { return a.prob - b.prob; }).forEach(function (st) {
      var cands = libres.filter(function (b) { return line(b.pos) === line(st.pos); }).sort(function (a, b) { return (b.prob || 0) - (a.prob || 0); });
      if (cands.length) { altOf.set(st, cands[0]); libres.splice(libres.indexOf(cands[0]), 1); }
    });
    var html = "";
    ["fw", "md", "df", "gk"].forEach(function (k) {
      var arr = groups[k].sort(function (a, b) { return (a.x || 0) - (b.x || 0); });
      if (!arr.length) return;
      html += '<div class="line ' + k + '">' + arr.map(function (s) {
        var fm = match(s, pool);
        if (!fm) { sinPareja.push(s.full || s.name); console.warn("[alineación] sin pareja en Futmondo:", s.full || s.name); }
        var name = fm ? fm.name : (s.name || s.full);
        var photo = (fm && fm.photo) || s.photo || "/img/avatar.svg";
        var inner = '<div class="pl-ph"><img src="' + esc(photo) + '" alt="" onerror="this.src=\'/img/avatar.svg\'">';
        if (s.prob != null) inner += '<span class="pl-prob ' + probCls(s.prob) + '">' + s.prob + '%</span>';
        if (s.san || s.inj) inner += '<span class="pl-duda bad">' + (s.san ? "✕" : "+") + '</span>';
        else if (s.prob != null && s.prob < 80) inner += '<span class="pl-duda">?</span>';
        inner += '</div><div class="pl-nm">' + esc(name) + '</div>';
        var alt = altOf.get(s);
        if (alt) inner += '<div class="pl-alt">' + esc(alt.last || alt.name) + '</div>';
        return fm ? '<a class="pl" href="/futmondo/guiafantasy/jugadores/' + encodeURIComponent(fm.id) + '/' + slug(fm.name) + '">' + inner + '</a>' : '<div class="pl">' + inner + '</div>';
      }).join("") + "</div>";
    });
    return html;
  }

  function msg(card, t) { card.querySelector(".pitch").innerHTML = '<p class="al-msg">' + esc(t) + "</p>"; }

  // Rellena UNA tarjeta (.al) con el once probable de un equipo.
  function renderCard(card, wanted, ctx) {
    var jd = ctx.jd, players = ctx.players;
    var best = null, bs = 0;
    (jd.matches || []).forEach(function (m) {
      var sh = teamScore(wanted, m.home), sa = teamScore(wanted, m.away);
      if (Math.max(sh, sa) > bs) { bs = Math.max(sh, sa); best = { m: m, home: sh >= sa }; }
    });
    if (!best) { msg(card, "No encuentro ese equipo en la jornada."); return Promise.resolve(); }
    var m = best.m;
    card.querySelector(".al-head img").src = (best.home ? m.homeCrest : m.awayCrest) || "/img/avatar.svg";
    return fetch(API + "/once?home=" + encodeURIComponent(m.home) + "&away=" + encodeURIComponent(m.away) + "&jornada=" + encodeURIComponent(jd.matchday || "")).then(function (r) { return r.json(); }).then(function (o) {
      var side = best.home ? o.home : o.away;
      if (!side || !side.starters || !side.starters.length) return msg(card, "Todavía no hay once probable.");
      var teamName = best.home ? m.home : m.away;
      var pool = players.filter(function (p) { return teamScore(p.team, teamName) >= 1; });
      card.querySelector(".pitch").innerHTML = render(side, pool, side.bench || []);
      var rival = best.home ? m.away : m.home;
      card.querySelector(".al-foot").textContent = teamName + " · J" + jd.matchday + " · " + (best.home ? "vs " : "en ") + rival + " · " + formacion(side);
    }).catch(function () { msg(card, "No se pudo cargar la alineación."); });
  }

  // Formación según DÓNDE están dibujados (filas por altura), no según la etiqueta de posición
  function formacion(side) {
    var f = (side.starters || []).filter(function (p) { return p.y != null && !/portero/i.test(p.pos); })
      .map(function (p) { return p.y; }).sort(function (a, b) { return b - a; });
    if (f.length < 8) return side.formation || "";
    var rows = [], last = null;
    f.forEach(function (y) {
      if (last != null && last - y <= 10) rows[rows.length - 1]++; else rows.push(1);
      last = y;
    });
    return rows.join("-");
  }

  function cardHtml() {
    return '<div class="al-head"><img src="/img/avatar.svg" alt=""><span class="al-title">Alineación <b>probable</b></span></div>' +
      '<div class="pitch"><p class="al-msg">Cargando alineación…</p></div><div class="al-foot">EduMR · Guía Fantasy</div>';
  }

  Promise.all([fetch(API + "/jornada").then(function (r) { return r.json(); }), fetch(API + "/mercado").then(function (r) { return r.json(); })]).then(function (res) {
    var ctx = { jd: res[0], players: res[1].players || [] };
    var multi = document.getElementById("alTodos");
    if (multi) { // todos los equipos de la jornada, uno detrás de otro
      return fetch(API + "/equipos").then(function (r) { return r.json(); }).then(function (d) {
        return Promise.all((d.teams || []).map(function (t) {
          var card = document.createElement("div"); card.className = "al"; card.innerHTML = cardHtml();
          multi.appendChild(card);
          return renderCard(card, t.name, ctx);
        }));
      });
    }
    var one = document.querySelector(".al");
    return renderCard(one, new URLSearchParams(location.search).get("equipo") || "Levante", ctx);
  }).then(function () {
    if (sinPareja.length) console.warn("[alineación] jugadores sin pareja:", sinPareja.join(", "));
  }).catch(function () {});
})();
