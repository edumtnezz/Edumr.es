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
  var ALIAS = { "alexander arnold": "trent", "trent alexander arnold": "trent" }; // nombre en Futmondo
  var sinPareja = (window.__sinPareja = []);
  function match(s, pool) {
    var names = [strip(s.full), strip(s.name)].filter(Boolean);
    names.slice().forEach(function (n) { if (ALIAS[n]) names.push(ALIAS[n]); });
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

  // Si una foto falla: primero la de futbolfantasy, luego el avatar (los atributos onerror los bloquea la CSP).
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG" || !t.closest || !t.closest(".pl-ph")) return;
    var ff = t.getAttribute("data-ff");
    if (ff && !t.dataset.triedFf && t.getAttribute("src") !== ff) { t.dataset.triedFf = "1"; t.src = ff; }
    else if (t.getAttribute("src") !== "/img/avatar.svg") t.src = "/img/avatar.svg";
  }, true);

  // Escudos de football-data: el SVG se ve nítido a cualquier tamaño (algunos PNG son de 70px).
  function setCrest(img, url) {
    var u = String(url || "");
    if (/crests\.football-data\.org\/\d+\.png$/.test(u)) {
      img.addEventListener("error", function f() { img.removeEventListener("error", f); img.src = u; });
      img.src = u.replace(/\.png$/, ".svg");
    } else img.src = u || "/img/avatar.svg";
  }

  function line(pos) { return /port/i.test(pos) ? "gk" : /def/i.test(pos) ? "df" : /del/i.test(pos) ? "fw" : "md"; }
  function probCls(p) { return p >= 90 ? "p90" : p >= 80 ? "p80" : p >= 60 ? "p60" : p >= 40 ? "p40" : "p0"; }
  function slug(s) { return strip(s).replace(/ /g, ""); }

  function playerHtml(s, pool, mode, probable, alt) {
        var fm = match(s, pool);
        if (!fm) { sinPareja.push(s.full || s.name); console.warn("[alineación] sin pareja en Futmondo:", s.full || s.name); }
        var name = fm ? fm.name : (s.name || s.full);
        var photo = (fm && fm.photo) || s.photo || "/img/avatar.svg", ffPh = s.photo || "/img/avatar.svg";
        // Fotos de Futmondo con nombre en vez de número suelen ser de cuerpo entero: mejor la cara de FF
        if (fm && fm.photo && s.photo && !/\/faces\/\d+\/\d+\.png/.test(fm.photo)) photo = s.photo;
        var inner = '<div class="pl-ph"><img src="' + esc(photo) + '" alt="" data-ff="' + esc(ffPh) + '">';
        if (probable && s.bench && (s.san || s.inj) && (s.prob == null || s.prob < 10)) inner += '<span class="pl-prob pl-out">' + (s.san ? "Sancionado" : "Lesionado") + '</span>';
        else if (probable && s.prob != null) inner += '<span class="pl-prob ' + probCls(s.prob) + '">' + s.prob + '%</span>';
        if (mode === "played") inner += '<span class="pl-pts" data-full="' + esc(s.full || s.name) + '">–</span>';
        else if (!probable) { /* confirmada: sin dudas */ }
        else if (s.san || s.inj) inner += '<span class="pl-duda bad">' + (s.san ? "✕" : "+") + '</span>';
        else if (s.prob != null && s.prob < 80 && !s.bench) inner += '<span class="pl-duda">?</span>';
        if (s.ev && (s.ev.g || s.ev.a)) inner += '<span class="pl-evs">' + "⚽".repeat(s.ev.g || 0) + "👟".repeat(s.ev.a || 0) + "</span>";
        if (s.red) inner += '<span class="pl-red" title="Expulsado"></span>';
        inner += '</div><div class="pl-nm">' + esc(name) + '</div>';
        if (s.sw) inner += '<div class="pl-sw ' + s.sw.dir + '"><i>' + (s.sw.dir === "in" ? "▲" : "▼") + "</i>" + esc(s.sw.min) + "'</div>" + (s.sw.with ? '<div class="pl-sw-who">' + (s.sw.dir === "in" ? "por " : "→ ") + esc(s.sw.with.map(function (o) { var f = match(o, pool); return f ? f.name : (o.name || o.full); }).join(" / ")) + "</div>" : "");
        if (alt) { var fa = match(alt, pool); inner += '<div class="pl-alt">' + esc(fa ? fa.name : (alt.name || alt.last)) + '</div>'; }
        return fm ? '<a class="pl" href="/jugador/' + encodeURIComponent(fm.id) + '/' + slug(fm.name) + '">' + inner + '</a>' : '<div class="pl">' + inner + '</div>';
  }

  function benchHtml(subs, pool, mode) {
    // Con un 0% por sanción (roja) o lesión se enseñan igualmente, marcados, al final del banquillo
    if (subs && mode !== "played") {
      var out = function (s) { return !!(s.san || s.inj); };
      subs = subs.filter(function (s) { return s.prob == null || s.prob >= 10 || out(s); });
      subs = subs.filter(function (s) { return !out(s); }).concat(subs.filter(out));
    }
    if (!subs || !subs.length) return "";
    var played = mode === "played", probable = !mode || mode === "probable";
    return '<div class="al-bench"><div class="al-bench-h">' + (played ? "Desde el banquillo" : "Banquillo") + '</div><div class="al-bench-row">' + subs.map(function (s) {
      var o = played ? s : Object.assign({}, s, { bench: true });
      return playerHtml(o, pool, played ? "played" : mode, probable, null);
    }).join("") + '</div></div>';
  }

  function render(side, pool, bench, mode) {
    var probable = !mode || mode === "probable";
    var groups = { fw: [], md: [], df: [], gk: [] };
    side.starters.forEach(function (s) { groups[line(s.pos)].push(s); });
    // Cada suplente es alternativa de UN solo titular dudoso (el de menor probabilidad de su línea).
    var altOf = new Map(), libres = !probable ? [] : bench.filter(function (b) { return (b.prob || 0) >= 40; }).slice();
    (probable ? side.starters : []).filter(function (s) { return s.prob != null && s.prob < 80; }).sort(function (a, b) { return a.prob - b.prob; }).forEach(function (st) {
      var cands = libres.filter(function (b) { return line(b.pos) === line(st.pos); }).sort(function (a, b) { return (b.prob || 0) - (a.prob || 0); });
      if (cands.length) { altOf.set(st, cands[0]); libres.splice(libres.indexOf(cands[0]), 1); }
    });
    var html = "", rows = rowsOf(side);
    var lines = rows ? rows.slice().reverse().map(function (r, i) { return { k: i === 0 ? "fw" : (i === rows.length - 1 ? "df" : "md"), arr: r }; })
      : ["fw", "md", "df"].map(function (k) { return { k: k, arr: groups[k] }; });
    lines.push({ k: "gk", arr: groups.gk });
    lines.forEach(function (ln) {
      var arr = ln.arr.sort(function (a, b) { return (a.x || 0) - (b.x || 0); });
      if (!arr.length) return;
      html += '<div class="line ' + ln.k + '">' + arr.map(function (s) {
        return playerHtml(s, pool, mode, probable, altOf.get(s));
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
  // Filas del campo (defensas primero) según la altura y; null si no hay datos fiables.
  function rowsOf(side) {
    var f = (side.starters || []).filter(function (p) { return !/portero/i.test(p.pos); });
    if (f.length < 8 || f.some(function (p) { return p.y == null; })) return null;
    f = f.slice().sort(function (a, b) { return b.y - a.y; });
    var rows = [], last = null;
    f.forEach(function (p) {
      if (last != null && last - p.y <= 7) rows[rows.length - 1].push(p); else rows.push([p]);
      last = p.y;
    });
    return rows.length >= 2 && rows.length <= 4 ? rows : null;
  }
  // La etiqueta sale SIEMPRE de lo que se dibuja (mismas filas).
  function formacion(side) {
    var rows = rowsOf(side);
    if (rows) return rows.map(function (r) { return r.length; }).join("-");
    var c = { df: 0, md: 0, fw: 0 };
    (side.starters || []).forEach(function (p) { var k = line(p.pos); if (c[k] != null) c[k]++; });
    return c.df + "-" + c.md + "-" + c.fw;
  }

  function cardHtml() {
    return '<div class="al-head"><img src="/img/avatar.svg" alt=""><span class="al-title">Alineación <b>probable</b></span></div>' +
      '<div class="pitch"><p class="al-msg">Cargando alineación…</p></div><div class="al-foot">EduMR · Guía Fantasy</div>';
  }

  // API para otras páginas (Guía Fantasy): devuelve una tarjeta .al ya pintada.
  window.EduAlineacion = {
    setCrest: setCrest,
    nameOf: function (o, teamName, players) {
      var pool = (players || []).filter(function (p) { return teamScore(p.team, teamName) >= 1; });
      var f = match(o, pool); return f ? f.name : (o.name || o.full);
    },
    // Misma foto que se pinta en el campo (cara de Futmondo o, si no, la de FutbolFantasy)
    photoFor: function (s, pool) {
      var fm = match(s, pool || []);
      var photo = (fm && fm.photo) || s.photo || "/img/avatar.svg";
      if (fm && fm.photo && s.photo && !/\/faces\/\d+\/\d+\.png/.test(fm.photo)) photo = s.photo;
      return photo;
    },
    card: function (side, teamName, crest, subtitle, players, mode, subs, opts) {
      opts = opts || {};
      // Todos al 100% = once confirmado: nunca se enseñan porcentajes
      if (!opts.noAuto && (!mode || mode === "probable") && side.starters && side.starters.length >= 10 && side.starters.every(function (p) { return p.prob === 100; })) mode = "confirmed";
      var card = document.createElement("div"); card.className = "al"; card.innerHTML = cardHtml();
      var tt = card.querySelector(".al-title");
      if (mode === "played") tt.innerHTML = "Partido <b>finalizado</b>";
      else if (mode === "confirmed") tt.innerHTML = "Alineación <b>confirmada</b>";
      if (opts.title) tt.innerHTML = opts.title;
      if (opts.noCrest) card.classList.add("al-nocrest");
      setCrest(card.querySelector(".al-head img"), crest);
      var pool = opts.pool || (players || []).filter(function (p) { return teamScore(p.team, teamName) >= 1; });
      card.querySelector(".pitch").innerHTML = render(side, pool, side.bench || [], mode);
      if (subs && subs.length) card.querySelector(".pitch").insertAdjacentHTML("afterend", benchHtml(subs, pool, mode));
      card.querySelector(".al-foot").textContent = teamName + (subtitle ? " · " + subtitle : "") + " · " + formacion(side);
      return card;
    }
  };

  if (!document.querySelector(".al, #alTodos")) return;
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
