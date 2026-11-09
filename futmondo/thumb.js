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
    var grande = k === "cronica" ? marcador(title) : (k === "once" ? "ONCE" : "«");
    var pie = k === "cronica" ? corto(title.replace(/\d+\s*[-–]\s*\d+/, "").trim() || lead, 42) : corto(lead || title, 46);
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
  root.EduThumb = { tipo: tipo, marcador: marcador, svg: svg, url: url };
})(typeof window !== "undefined" ? window : globalThis);
