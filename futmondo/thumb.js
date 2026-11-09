/* Miniatura propia de cada noticia (EduMR). No usa fotos de otras webs.
   Sale del título y del resumen: marcador, cita o once.
   Lo interesante, visto en los listados de esta semana (sin copiar sus frases):
   crónica con marcador, una cita concreta, el once que jugó. */
(function (root) {
  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function tipo(item) {
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
  var ETIQ = { cronica: "CRÓNICA", once: "ONCE", rueda: "RUEDA", lesion: "PARTE", nota: "NOTICIA" };
  // Miniatura en DOM (se adapta a cualquier tamaño con CSS): foto del jugador y escudo, marcador si es crónica.
  // o = { photo, crest }. La animación es suave y se apaga con "reducir movimiento".
  function el(item, o) {
    o = o || {};
    var k = tipo(item);
    var d = document.createElement("div");
    d.className = "eth eth-" + k;
    var bg = document.createElement("i"); bg.className = "eth-bg"; d.appendChild(bg);
    var tg = document.createElement("span"); tg.className = "eth-tag"; tg.textContent = ETIQ[k] || "NOTICIA"; d.appendChild(tg);
    var m = k === "cronica" ? marcador(item && item.title) : "";
    if (m) { var sc = document.createElement("b"); sc.className = "eth-score"; sc.textContent = m; d.appendChild(sc); }
    else if (o.photo) { var im = document.createElement("img"); im.className = "eth-ph"; im.alt = ""; im.loading = "lazy"; im.src = o.photo; im.addEventListener("error", function () { im.remove(); d.classList.add("eth-nophoto"); }, { once: true }); d.appendChild(im); }
    else d.classList.add("eth-nophoto");
    if (o.crest) { var cr = document.createElement("img"); cr.className = "eth-cr"; cr.alt = ""; cr.loading = "lazy"; cr.src = o.crest; cr.addEventListener("error", function () { cr.remove(); }, { once: true }); d.appendChild(cr); }
    return d;
  }
  root.EduThumb = { tipo: tipo, marcador: marcador, svg: svg, url: url, el: el };
})(typeof window !== "undefined" ? window : globalThis);
