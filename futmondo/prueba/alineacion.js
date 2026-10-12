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
      function (p) { var pt = strip(p.name).split(" "); return pt.every(function (t) { return Object.keys(toks).some(function (k) { return lev1(t, k); }); }); } // 4. una letra de diferencia
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
        if (s.prob != null && s.prob < 80) {
          var alts = bench.filter(function (b) { return line(b.pos) === k && (b.prob || 0) >= 40; }).sort(function (a, b) { return (b.prob || 0) - (a.prob || 0); }).slice(0, 2);
          if (alts.length) inner += '<div class="pl-alt">' + alts.map(function (b) { return esc(b.last || b.name); }).join(" / ") + '</div>';
        }
        return fm ? '<a class="pl" href="/futmondo/guiafantasy/jugadores/' + encodeURIComponent(fm.id) + '/' + slug(fm.name) + '">' + inner + '</a>' : '<div class="pl">' + inner + '</div>';
      }).join("") + "</div>";
    });
    return html;
  }

  function msg(t) { document.getElementById("alPitch").innerHTML = '<p class="al-msg">' + esc(t) + "</p>"; }

  var wanted = new URLSearchParams(location.search).get("equipo") || "Levante";
  Promise.all([fetch(API + "/jornada").then(function (r) { return r.json(); }), fetch(API + "/mercado").then(function (r) { return r.json(); })]).then(function (res) {
    var jd = res[0], players = res[1].players || [];
    var best = null, bs = 0;
    (jd.matches || []).forEach(function (m) {
      var sh = teamScore(wanted, m.home), sa = teamScore(wanted, m.away);
      if (Math.max(sh, sa) > bs) { bs = Math.max(sh, sa); best = { m: m, home: sh >= sa }; }
    });
    if (!best) return msg("No encuentro ese equipo en la jornada.");
    var m = best.m;
    document.getElementById("alCrest").src = (best.home ? m.homeCrest : m.awayCrest) || "/img/avatar.svg";
    return fetch(API + "/once?home=" + encodeURIComponent(m.home) + "&away=" + encodeURIComponent(m.away) + "&jornada=" + encodeURIComponent(jd.matchday || "")).then(function (r) { return r.json(); }).then(function (o) {
      var side = best.home ? o.home : o.away;
      if (!side || !side.starters || !side.starters.length) return msg("Todavía no hay once probable.");
      var teamName = best.home ? m.home : m.away;
      var pool = players.filter(function (p) { return teamScore(p.team, teamName) >= 1; });
      document.getElementById("alPitch").innerHTML = render(side, pool, side.bench || []);
      var rival = best.home ? m.away : m.home;
      document.getElementById("alFoot").textContent = "J" + jd.matchday + " · " + (best.home ? "vs " : "en ") + rival + " · " + (side.formation || "");
      if (sinPareja.length) console.warn("[alineación] jugadores sin pareja:", sinPareja.join(", "));
    });
  }).catch(function () { msg("No se pudo cargar la alineación."); });
})();
