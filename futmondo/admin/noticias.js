/* Administración → Noticias: solo las noticias nuestras, con cómo y por qué se crearon. Todo se escribe con textContent. */
(function () {
  var API = "/api/laquiniela";
  var $ = function (id) { return document.getElementById(id); };
  var D = null, filtro = "todas", abierta = null;
  var ESTADO = { ok: "Disponible", duda: "Duda", lesionado: "Lesionado", sancionado: "Sancionado", apercibido: "Apercibido" };
  var FUENTE = { biwenger: "Biwenger", fotmob: "FotMob", futmondo: "Futmondo" };
  var ARTS = {
    artvender: "Jugadores a vender: lesionados que tardan un mes o más y disponibles que bajan 1 M o más en 7 días (datos de Futmondo).",
    artfichar: "Jugadores a fichar: disponibles de menos de 50 M con media de 7 o más que suben 1 M o más en 7 días, y la mejor relación puntos/precio entre 8 y 30 M (datos de Futmondo).",
    artvuelven: "Vuelven: altas reales de lesión o sanción de los últimos 7 días y lesionados con vuelta prevista para esta jornada (registro de estados).",
    artprevia: "Antes de la jornada: cuándo se cierran la Quiniela, la Porra y la Puja, partidos, rivales fáciles y difíciles (calendario de dificultad), sancionados y apercibidos.",
    artsuplente: "Riesgo de suplente: titulares a los que cambian en el 70 % o más de sus partidos y su recambio habitual (cambios reales de FotMob).",
    artrachas: "Rachas: equipos (resultados de la temporada, FotMob) y jugadores por sus 3 últimos partidos con puntos de Futmondo.",
    artresumen: "Resumen de la jornada: once ideal, MVP, lo mejor por menos de 5 M, decepciones y puntos por equipo (puntos publicados por Futmondo).",
    artclaus: "Clausulazos recomendables: los 3 disponibles con mejor media de cada franja de precio (datos de Futmondo, no de tu liga).",
    artparon: "Parón de selecciones: los que más suben desde que acabó la jornada (historial de valores de Futmondo).",
    artmercado: "Subidas y bajadas: los 10 que más suben y los 10 que más bajan en la última actualización de valores de Futmondo.",
    artchollo: "Chollo del día: el disponible con más puntos de media por millón que cumple todas las reglas (juega, media, calendario fácil, valor sin bajar).",
    artonce: "Onces recomendados: caro, equilibrado y low cost, con la formación que más media suma (Futmondo)."
  };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function hora(ms) {
    if (!ms) return "";
    try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)); } catch (e) { return ""; }
  }
  function tipoDe(x) { return x.auto === "estado" ? "Jugador" : (x.tipo === "articulo" || x.auto === "articulo") ? "Artículo" : "Otras"; }

  function cargar() {
    fetch(API + "/admin-noticias?lite=1", { cache: "no-store", credentials: "same-origin" }).then(function (r) {
      if (r.status === 403) throw new Error("403");
      return r.json();
    }).then(function (d) { D = d; try { localStorage.setItem("adm:n:last", JSON.stringify(d)); } catch (e) {} pinta(); }).catch(function (e) {
      if (e && e.message === "403") return puerta();
      var c = null; try { c = JSON.parse(localStorage.getItem("adm:n:last") || "null"); } catch (x) {}
      if (c) { D = c; pinta(); } else { var g = $("adGate"); g.classList.remove("hidden"); g.textContent = "No se pudo cargar ahora mismo."; }
    });
  }

  function puerta() {
    $("adApp").classList.add("hidden");
    var g = $("adGate"); g.classList.remove("hidden"); g.innerHTML = "";
    g.appendChild(el("h2", null, "Entra con tu usuario"));
    var n = el("input", "ad-i"); n.placeholder = "Nombre"; n.autocomplete = "username";
    var p = el("input", "ad-i"); p.placeholder = "Código"; p.type = "password"; p.inputMode = "numeric"; p.autocomplete = "current-password";
    var b = el("button", "ad-b main", "Entrar"); b.type = "button";
    var m = el("p", "ad-meta", "");
    b.addEventListener("click", function () {
      fetch(API + "/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre: n.value, pin: p.value }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.error) { m.textContent = j.error; return; } location.reload(); }).catch(function () { m.textContent = "Sin conexión."; });
    });
    [n, p, b, m].forEach(function (x) { g.appendChild(x); });
  }

  function pinta() {
    $("adGate").classList.add("hidden"); $("adApp").classList.remove("hidden");
    var bar = $("adTabs"); bar.innerHTML = "";
    var lista = D.own || [];
    [["todas", "Todas"], ["Jugador", "Jugadores"], ["Artículo", "Artículos"], ["Otras", "Otras"]].forEach(function (t) {
      var n = t[0] === "todas" ? lista.length : lista.filter(function (x) { return tipoDe(x) === t[0]; }).length;
      if (t[0] === "Otras" && !n) return;
      var b = el("button", "ad-tab" + (filtro === t[0] ? " on" : ""), t[1] + " " + n); b.type = "button";
      b.onclick = function () { filtro = t[0]; abierta = null; pinta(); };
      bar.appendChild(b);
    });
    var v = $("adView"); v.innerHTML = "";
    var vis = lista.filter(function (x) { return filtro === "todas" || tipoDe(x) === filtro; });
    if (!vis.length) { v.appendChild(el("div", "ad-empty", "Aún no hay noticias.")); return; }
    var dia = "";
    vis.forEach(function (x) {
      var h = hora(x.publishedAt), d = h.slice(0, 5);
      if (d !== dia) { dia = d; v.appendChild(el("div", "ad-day", d)); }
      v.appendChild(fila(x));
    });
  }

  function fila(x) {
    var c = el("div", "ad-n" + (abierta === x.id ? " open" : ""));
    var h = el("div", "ad-nh");
    var t = el("div", "ad-nt");
    t.appendChild(el("small", null, hora(x.publishedAt).slice(7) + " · " + tipoDe(x) + (x.club ? " · " + x.club : "")));
    t.appendChild(el("b", null, x.title || ""));
    h.appendChild(t); h.appendChild(el("span", "ad-chev", abierta === x.id ? "–" : "+"));
    h.onclick = function () { abierta = abierta === x.id ? null : x.id; pinta(); };
    c.appendChild(h);
    if (abierta === x.id) c.appendChild(detalle(x));
    return c;
  }

  function bloque(tit, txt) {
    var b = el("div", "ad-nb"); b.appendChild(el("h4", null, tit));
    if (txt) b.appendChild(el("p", null, txt));
    return b;
  }

  function detalle(x) {
    var w = el("div", "ad-nd");
    if (x.lead) w.appendChild(bloque("Lo que dice", x.lead));
    if (x.auto === "estado") {
      var evs = (D.ev || []).filter(function (e) { return e.id === x.pid && e.at <= (x.publishedAt || 0) + 120000; }).sort(function (a, b) { return b.at - a.at; });
      var ult = evs.length ? evs[0] : null;
      var mismos = ult ? evs.filter(function (e) { return e.a === ult.a && Math.abs(e.at - ult.at) < 6 * 3600e3; }).sort(function (a, b) { return a.at - b.at; }) : [];
      var q = bloque("Qué pasó");
      q.appendChild(el("p", null, ult ? (x.players && x.players[0] || "El jugador") + " pasó de «" + (ESTADO[ult.de] || ult.de) + "» a «" + (ESTADO[ult.a] || ult.a) + "»." : "No quedó guardado el cambio exacto (el registro guarda los últimos 500)."));
      w.appendChild(q);
      var qd = bloque("Quién lo detectó y cuándo");
      if (mismos.length) mismos.forEach(function (e) { qd.appendChild(el("p", null, (FUENTE[e.src] || e.src) + " · " + hora(e.at))); });
      else qd.appendChild(el("p", null, (x.fuente === "fotmob" ? "FotMob" : "Biwenger") + " · " + hora(x.publishedAt)));
      qd.appendChild(el("p", "ad-mut", "Si Biwenger y FotMob no coinciden, manda Biwenger."));
      w.appendChild(qd);
      var inf = ult && ult.info || (mismos.filter(function (e) { return e.info; })[0] || {}).info;
      if (inf) w.appendChild(bloque("Texto del parte", inf));
      w.appendChild(bloque("Cómo se escribió", "Con una plantilla fija y datos reales de Futmondo (minutos, valor, próximo partido y recambio). La IA no inventa nada: solo redacta el resumen y se descarta si trae un número o nombre que no esté en los hechos."));
    } else if (x.tipo === "articulo" || x.auto === "articulo") {
      w.appendChild(bloque("Por qué existe", ARTS[x.art] || ARTS[String(x.id || "").replace(/\d+$/, "")] || "Artículo hecho con nuestros datos de Futmondo."));
      w.appendChild(bloque("Cómo se hizo", "Lo genera el sistema solo con las reglas fijas y datos de Futmondo; no copia ninguna otra web."));
    } else {
      w.appendChild(bloque("Cómo se hizo", "Generada automáticamente con datos de Futmondo."));
    }
    if (x.body) { var b = bloque("Texto completo"); b.appendChild(el("pre", "ad-pre", String(x.body).replace(/^[@#~] .*$/gm, function (l) { return "· " + l.slice(2).split("|").slice(0, 2).join(" · "); }))); w.appendChild(b); }
    var a = el("a", "ad-link", "Ver en la web"); a.href = "/futmondo/guiafantasy/noticias/ed-" + x.id; w.appendChild(a);
    return w;
  }

  cargar();
})();
