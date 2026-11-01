/* Tabla ÚNICA de clubes de la web (Guía Fantasy).
   Antes había tres listas distintas con los mismos 20 equipos escritos a mano
   (teamCanon, CLUB_SLUG y ALI) y de ahí salieron fallos como el del Alavés, que
   quedaba como "dep" porque la regla del Deportivo iba antes que la suya.
   Regla de oro: la primera que casa gana, así que las reglas más concretas van
   primero (Alavés antes que Coruña/Deportivo).
   - k: código corto que usa la web (fcb, ath, ala…)
   - slug: página del club (/equipos/<slug>); vacío = no tiene ficha
   - re: cómo se reconoce el nombre (Futmondo, FotMob, football-data…)
   - al: palabras con las que las noticias se refieren a ese club
*/
(function (root) {
  var TEAMS = [
    { k: "fcb", slug: "barcelona", re: /barc/, al: ["barca", "barcelona"] },
    { k: "ath", slug: "athletic-de-bilbao", re: /athletic|bilbao/, al: ["athletic", "bilbao"] },
    { k: "atm", slug: "atletico-de-madrid", re: /atleti|atletico/, al: ["atletico", "atleti"] },
    { k: "rma", slug: "real-madrid", re: /real madrid/, al: ["real madrid", "madridista"] },
    { k: "bet", slug: "betis", re: /betis/, al: ["betis"] },
    { k: "rso", slug: "real-sociedad", re: /sociedad/, al: ["real sociedad", "sociedad"] },
    { k: "cel", slug: "celta-de-vigo", re: /celta/, al: ["celta"] },
    { k: "ala", slug: "alaves", re: /alaves/, al: ["alaves"] },
    { k: "dep", slug: "deportivo-de-la-coruna", re: /coruna|depor/, al: ["depor", "coruna"] },
    { k: "ray", slug: "rayo-vallecano", re: /rayo/, al: ["rayo"] },
    { k: "esp", slug: "espanyol", re: /espanyol|espanol/, al: ["espanyol", "espanol"] },
    { k: "get", slug: "getafe", re: /getafe/, al: ["getafe"] },
    { k: "elc", slug: "elche", re: /elche/, al: ["elche"] },
    { k: "osa", slug: "osasuna", re: /osasuna/, al: ["osasuna"] },
    { k: "vil", slug: "villarreal", re: /villarreal/, al: ["villarreal"] },
    { k: "val", slug: "valencia", re: /valencia/, al: ["valencia"] },
    { k: "sev", slug: "sevilla", re: /sevilla/, al: ["sevilla"] },
    { k: "lev", slug: "levante", re: /levante/, al: ["levante"] },
    { k: "mal", slug: "malaga", re: /malaga/, al: ["malaga"] },
    { k: "rac", slug: "racing-de-santander", re: /racing/, al: ["racing"] },
    { k: "gir", slug: "", re: /girona/, al: ["girona"] },
    { k: "mll", slug: "", re: /mallorca/, al: ["mallorca"] },
    { k: "ovi", slug: "", re: /oviedo/, al: ["oviedo"] },
    { k: "lpa", slug: "", re: /palmas/, al: ["las palmas", "palmas"] }
  ];

  // Relleno que no distingue a un club ("Real Betis" = "Betis").
  var FILLER = /^(real|fc|de|la|del|club|ud|cd|rc|rcd|ca|cf|sd|sad|balompie)$/;

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function entry(t) {
    var n = norm(t);
    if (!n) return null;
    for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].re.test(n)) return TEAMS[i];
    return null;
  }

  // Código corto del club. Si no se reconoce, la primera palabra con sentido
  // (así "Girona" o "Rayo" siguen funcionando sin tocar la tabla).
  function canon(t) {
    var e = entry(t);
    if (e) return e.k;
    var n = norm(t);
    var words = n.split(" ").filter(function (w) { return w && !FILLER.test(w); });
    return words[0] || n;
  }

  function slugOf(t) { var e = entry(t); return e ? e.slug : ""; }
  function href(t) { var s = slugOf(t); return s ? "/equipos/" + s : ""; }

  // Palabras para buscar el club en los titulares de las noticias.
  function alias(t) {
    var e = entry(t);
    if (e) return e.al.slice();
    var first = norm(t).split(" ")[0];
    return first ? [first] : [];
  }

  root.EduTeams = { TEAMS: TEAMS, norm: norm, canon: canon, slugOf: slugOf, href: href, alias: alias };
})(typeof window !== "undefined" ? window : globalThis);
