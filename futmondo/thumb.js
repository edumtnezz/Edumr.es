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
    var v = VERED[item.veredicto] ? item.veredicto : "duda";
    var d = nodo("div", "eth eth-st eth-v-" + v);
    // Escudo en grande (256 px) para que no se pixele; si no existe, el de siempre
    var crestHi = o.crest ? String(o.crest).replace(/\/teams\/64\//, "/teams/256/") : "";
    var pw = nodo("span", "eth-pw");
    var src = o.photo || crestHi;
    if (src) {
      var im = nodo("img", "eth-pf" + (o.photo ? "" : " eth-pf-c")); im.alt = ""; im.loading = "lazy"; im.src = src;
      im.addEventListener("error", function () { if (o.crest && im.src !== o.crest) { im.src = o.crest; im.classList.add("eth-pf-c"); } else im.remove(); });
      pw.appendChild(im);
    }
    if (o.photo && o.crest) { var cb = nodo("img", "eth-pc"); cb.alt = ""; cb.loading = "lazy"; cb.src = crestHi; cb.addEventListener("error", function () { if (cb.src !== o.crest) cb.src = o.crest; else cb.remove(); }); pw.appendChild(cb); }
    d.appendChild(pw);
    var tx = nodo("div", "eth-tx");
    tx.appendChild(nodo("span", "eth-pill", VERED[v]));
    var nm = (item.players && item.players[0]) || ""; if (nm && typeof nm !== "string") nm = nm.name || "";
    tx.appendChild(nodo("b", "eth-nm", nm || String(item.title || "").split(",")[0]));
    var sub = [o.club || item.club || "", item.plazo ? "Vuelta: " + String(item.plazo).charAt(0).toLowerCase() + String(item.plazo).slice(1) : ""].filter(Boolean).join(" · ");
    if (sub) tx.appendChild(nodo("span", "eth-sb", sub));
    d.appendChild(tx);
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
    d.appendChild(nodo("span", "eth-tag", ETIQ[k] || "NOTICIA"));
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
  root.EduThumb = { tipo: tipo, marcador: marcador, dato: dato, svg: svg, url: url, el: el };
})(typeof window !== "undefined" ? window : globalThis);
