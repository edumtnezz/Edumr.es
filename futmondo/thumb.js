/* Miniatura propia de cada noticia (EduMR). No usa fotos de otras webs.
   Sale del título y del resumen: marcador, cita o once.
   Lo interesante, visto en los listados de esta semana (sin copiar sus frases):
   crónica con marcador, una cita concreta, el once que jugó. */
(function (root) {
  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function tipo(item) {
    if (item && item.tipo === "analisis") return "analisis";
    if (item && item.tipo === "articulo") return "nota"; // artículo propio: mismo dibujo, con el rótulo «ARTÍCULO»
    var title = String(item && item.title || "");
    if (!/\d+\s*[-–]\s*\d+/.test(title) && /lesi|baja|duda|molest|descartad/i.test(title)) return "lesion";
    var lead = String(item && item.lead || "");
    if (/\d+\s*[-–]\s*\d+/.test(title)) return "cronica";
    if (/once|alineaci/i.test(title)) return "once";
    if (/[«"]/.test(lead) || /fuente oficial|seg[uú]n/i.test(lead)) return "rueda";
    return "nota";
  }
  function marcador(title) {
    var m = String(title || "").match(/(\d+)\s*[-–]\s*(\d+)/);
    return m ? m[1] + "–" + m[2] : "";
  }
  function corto(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1).trim() + "…";
  }
  function svg(item) {
    var k = tipo(item);
    var title = String(item && item.title || "");
    var lead = String(item && item.lead || "");
    var nombre = corto(String(title || "").split(/[:|,]/)[0], 22);
    var grande = k === "cronica" ? marcador(title) : (k === "once" ? "ONCE" : nombre);
    var pie = k === "cronica" ? corto(lead || title, 42) : corto(lead || title, 46);
    var etiqueta = k === "cronica" ? "CRÓNICA" : (k === "once" ? "ONCE" : (k === "rueda" ? "RUEDA" : "NOTICIA"));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">' +
      '<rect width="640" height="360" fill="#14532d"/>' +
      '<rect x="0" y="0" width="12" height="360" fill="#bbf7d0"/>' +
      '<text x="36" y="54" fill="#bbf7d0" font-family="system-ui,sans-serif" font-size="22" font-weight="700">' + esc(etiqueta) + '</text>' +
      '<text x="36" y="200" fill="#f0fdf4" font-family="system-ui,sans-serif" font-size="92" font-weight="800">' + esc(grande) + '</text>' +
      '<text x="36" y="300" fill="#dcfce7" font-family="system-ui,sans-serif" font-size="26">' + esc(pie) + '</text>' +
      '</svg>';
  }
  function url(item) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(item));
  }
  var ETIQ = { cronica: "CRÓNICA", once: "ONCE", rueda: "RUEDA", lesion: "PARTE", analisis: "ANÁLISIS", nota: "NOTICIA" };
  // Dato clave de la noticia, leído de SU propio texto (nunca se calcula ni se inventa).
  // Devuelve { big, cap } o null.
  function dato(item) {
    var title = String(item && item.title || ""), lead = String(item && item.lead || "");
    var all = title + " " + lead, m;
    if (tipo(item) === "cronica" && (m = marcador(title))) return { big: m, cap: "Resultado" };
    if ((m = all.match(/(\d{1,3})\s?%\s+de\s+(?:jugar|opciones)/i))) return { big: m[1] + " %", cap: "de jugar" };
    if ((m = all.match(/(\d{1,2}(?:,\d)?)\s+de\s+media|promedia\s+(?:un\s+)?(\d{1,2}(?:,\d)?)/i))) return { big: m[1] || m[2], cap: "de media" };
    if ((m = title.match(/(\d{1,2}), (\d{1,2}), (\d{1,2})\b/))) return { big: m[1] + " · " + m[2] + " · " + m[3], cap: "últimos 3", small: true };
    if ((m = all.match(/(\d{1,3}(?:,\d{1,2})?)\s?M\b/))) return { big: m[1] + " M", cap: "valor" };
    if (tipo(item) === "lesion") {
      if (/\bbaja\b/i.test(title)) return { big: "BAJA", cap: "", small: true };
      if (/duda/i.test(title)) return { big: "DUDA", cap: "", small: true };
      return { big: "PARTE", cap: "", small: true };
    }
    if (tipo(item) === "once") return { big: "ONCE", cap: "", small: true };
    return null;
  }
  function nodo(tag, cls, txt) { var n = document.createElement(tag); n.className = cls; if (txt != null) n.textContent = txt; return n; }
  // Cartel propio en DOM (se adapta a cualquier tamaño): fondo por tipo, dato grande, foto del jugador,
  // y el club con su escudo. o = { photo, crest, club }.
  // Cartel de las noticias de estado (baja, duda, alta): fondo liso oscuro, foto redonda del jugador con su escudo,
  // etiqueta de color, nombre y club. La foto de Futmondo es pequeña (64 px), por eso no se amplía a cartel entero.
  var VERED = { baja: "BAJA", duda: "DUDA", alta: "ALTA" };
  function elEstado(item, o) {
    // Cartel 16:9 con el color del club: la cara recortada del jugador en grande a la derecha, y a la izquierda
    // la etiqueta (BAJA, DUDA, ALTA), el nombre y el club con su escudo.
    var v = VERED[item.veredicto] ? item.veredicto : "duda";
    var d = nodo("div", "eth eth-st2 eth-v-" + v);
    if (o.color) d.style.setProperty("--club", o.color);
    // Escudo en vector (football-data, nítido a cualquier tamaño) para los 20 clubes; si no, el de 256 px de Futmondo
    var FD = {"deportivo-alaves":263,"athletic-de-bilbao":77,"atletico-de-madrid":78,"barcelona":81,"betis":90,"celta-de-vigo":558,"deportivo-de-la-coruna":560,"elche":285,"espanyol":80,"getafe":82,"levante":88,"malaga":84,"osasuna":79,"racing-santander":5335,"rayo-vallecano":87,"real-madrid":86,"real-sociedad":92,"sevilla":559,"valencia":95,"villarreal":94};
    var slug = o.crest ? (String(o.crest).match(/\/teams\/\d+\/([^/]+)\.png/) || [])[1] : "";
    var crestHi = o.crest ? (FD[slug] ? "https://crests.football-data.org/" + FD[slug] + ".svg" : String(o.crest).replace(/\/teams\/64\//, "/teams/256/")) : "";
    // Fondo: palabra gigante del estado en contorno y el escudo en marca de agua (256 px, nítido)
    d.appendChild(nodo("span", "eth-ghost", VERED[v]));
    if (crestHi) { var wm = nodo("img", "eth-wm2"); wm.alt = ""; wm.loading = "lazy"; wm.src = crestHi; wm.addEventListener("error", function () { wm.remove(); }, { once: true }); d.appendChild(wm); }
    var src = o.photoG || o.photo || "";
    if (src) {
      var im = nodo("img", "eth-big" + (o.photoG ? "" : " eth-big-s")); im.alt = ""; im.loading = "lazy"; im.src = src;
      im.addEventListener("error", function () { if (o.photo && im.src !== o.photo) { im.src = o.photo; im.classList.add("eth-big-s"); } else im.remove(); });
      d.appendChild(im);
    } else if (crestHi) { var cw = nodo("img", "eth-big eth-big-c"); cw.alt = ""; cw.loading = "lazy"; cw.src = crestHi; cw.addEventListener("error", function () { cw.remove(); }, { once: true }); d.appendChild(cw); }
    var tx = nodo("div", "eth-tx");
    tx.appendChild(nodo("span", "eth-pill", VERED[v]));
    var nm = (item.players && item.players[0]) || ""; if (nm && typeof nm !== "string") nm = nm.name || "";
    tx.appendChild(nodo("b", "eth-nm", nm || String(item.title || "").split(",")[0]));
    var cl = nodo("span", "eth-cl");
    if (crestHi) { var cb = nodo("img"); cb.alt = ""; cb.loading = "lazy"; cb.src = crestHi; cb.addEventListener("error", function () { if (cb.src !== o.crest) cb.src = o.crest; else cb.remove(); }); cl.appendChild(cb); }
    cl.appendChild(document.createTextNode(o.club || item.club || ""));
    tx.appendChild(cl);
    if (item.plazo) tx.appendChild(nodo("span", "eth-sb", "Vuelta: " + String(item.plazo).charAt(0).toLowerCase() + String(item.plazo).slice(1)));
    d.appendChild(tx);
    return d;
  }
  // Portada de artículo: imagen fija por tipo (Edu, 16/11/2026), sin número de jornada. Sin fotos de jugadores.
  var ART = { vender: "/img/art-vender.jpg?v=1", fichar: "/img/art-fichar.jpg?v=1", claus: "/img/art-claus.jpg?v=1", paron: "/img/art-paron.jpg?v=1", merc: "/img/mercado-subidas-bajadas.jpg?v=3", once: "/img/art-once.jpg?v=1", chollo: "/img/art-chollo.jpg?v=2", puntos: "/img/aviso-puntos.jpg?v=1", conv: "/img/aviso-once-confirmado.jpg?v=1", vuelven: "/img/art-vuelven.jpg?v=1", previa: "/img/art-previa.jpg?v=1", suplente: "/img/art-suplente.jpg?v=1", rachas: "/img/art-rachas.jpg?v=1", resumen: "/img/art-resumen.jpg?v=1" };
  function artKind(item) {
    var a = String(item && item.art || "");
    if (a === "artmercado") return "merc";
    if (a === "artpuntos" || /^puntos del /i.test(String(item && item.title || ""))) return "puntos";
    if (/^artconv/.test(a) || /^convocatoria d/i.test(String(item && item.title || ""))) return "conv";
    if (a === "artchollo" || /^chollo del d/i.test(String(item && item.title || ""))) return "chollo";
    if (/^artonce/.test(a) || /onces recomendados/i.test(String(item && item.title || ""))) return "once";
    if (/^art(vender|fichar|claus|paron|vuelven|previa|suplente|rachas|resumen)/.test(a)) return a.slice(3).replace(/\d+$/, "");
    var t = String(item && item.title || "").toLowerCase();
    return /subidas y bajadas/.test(t) ? "merc" : /vender/.test(t) ? "vender" : /fichar/.test(t) ? "fichar" : /clausul/.test(t) ? "claus" : /par[oó]n/.test(t) ? "paron" : "fichar";
  }
  function articulo(item, mini) {
    var d = nodo("div", mini ? "eth-mini eth-art-mini" : "eth eth-art");
    var k = artKind(item);
    var im = nodo("img", "eth-art-img"); im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.src = ART[k];
    // En la miniatura cuadrada se enseña el dibujo (jugador, candado, pizarra), no el rótulo cortado
    if (mini) im.style.objectPosition = ({ vender: "80% 50%", fichar: "95% 50%", claus: "95% 50%", paron: "60% 50%", merc: "50% 50%", once: "50% 30%", chollo: "50% 50%", puntos: "50% 50%", conv: "50% 50%", vuelven: "72% 50%", previa: "72% 50%", suplente: "75% 50%", rachas: "72% 50%", resumen: "72% 40%" })[k] || "60% 40%";
    d.appendChild(im);
    return d;
  }
  function el(item, o) {
    o = o || {};
    if (item && item.auto === "estado") return elEstado(item, o);
    var k = tipo(item);
    var d = nodo("div", "eth eth-" + k);
    d.appendChild(nodo("i", "eth-bg"));
    d.appendChild(nodo("i", "eth-ring"));
    var dt = dato(item);
    if (o.photo) {
      var im = nodo("img", "eth-ph"); im.alt = ""; im.loading = "lazy"; im.src = o.photo;
      im.addEventListener("error", function () { im.remove(); d.classList.add("eth-nophoto"); }, { once: true });
      d.appendChild(im);
    } else d.classList.add("eth-nophoto");
    d.appendChild(nodo("span", "eth-tag", item && item.tipo === "articulo" ? "ARTÍCULO" : (ETIQ[k] || "NOTICIA")));
    var lg = nodo("img", "eth-logo"); lg.alt = ""; lg.src = "/img/noticias-logo.png"; lg.addEventListener("error", function () { lg.remove(); }, { once: true });
    d.appendChild(lg);
    if (dt) {
      var g = nodo("div", "eth-fig");
      g.appendChild(nodo("b", "eth-big" + (dt.small ? " eth-big-s" : ""), dt.big));
      if (dt.cap) g.appendChild(nodo("span", "eth-cap", dt.cap));
      d.appendChild(g);
    }
    if (o.crest || o.club) {
      var c = nodo("div", "eth-club");
      if (o.crest) { var cr = nodo("img", "eth-cr"); cr.alt = ""; cr.loading = "lazy"; cr.src = o.crest; cr.addEventListener("error", function () { cr.remove(); }, { once: true }); c.appendChild(cr); }
      if (o.club) c.appendChild(nodo("span", "eth-cn", o.club));
      d.appendChild(c);
    }
    return d;
  }
  root.EduThumb = { tipo: tipo, marcador: marcador, dato: dato, svg: svg, url: url, el: el, articulo: articulo };
})(typeof window !== "undefined" ? window : globalThis);
