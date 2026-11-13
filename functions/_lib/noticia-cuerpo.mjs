// Pasa el cuerpo de una noticia propia a HTML. Los bloques de una rueda
// (rótulo en negrita y cita en la línea siguiente) salen en su propia caja.
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (l) => esc(l).replace(/\*\*([^*]{1,160})\*\*/g, "<b>$1</b>");

export function cuerpoAHtml(body) {
  const lineas = String(body || "").split(/\n+/).map((t) => t.trim()).filter(Boolean);
  let html = "", lista = false, consejo = false;
  for (let i = 0; i < lineas.length; i++) {
    const rot = lineas[i].match(/^\*\*([^*]{2,80})\*\*$/);
    const cita = lineas[i + 1] || "";
    if (rot && /^[«"“]/.test(cita)) {
      if (lista) { html += "</ul>"; lista = false; }
      if (consejo) { html += "</div>"; consejo = false; }
      html += '<div class="nw-bloque"><p class="nw-rotulo"><b>' + esc(rot[1].trim()) + '</b></p><p class="nw-cita">' + esc(cita) + "</p></div>";
      i += 1;
      continue;
    }
    const l = lineas[i];
    const li = /^- /.test(l);
    if (li && !lista) { html += '<ul class="nw-claves">'; lista = true; }
    if (!li && lista) { html += "</ul>"; lista = false; }
    if (li) html += "<li>" + fmt(l.slice(2)) + "</li>";
    else if (/^## Consejo/.test(l)) { html += '<div class="nw-consejo"><h3 class="nw-h">' + fmt(l.slice(3)) + "</h3>"; consejo = true; }
    else if (/^## /.test(l)) html += '<h3 class="nw-h">' + fmt(l.slice(3)) + "</h3>";
    else if (/^Estado del jugador según/.test(l)) { if (consejo) { html += "</div>"; consejo = false; } html += '<p class="nw-fuente">' + fmt(l) + "</p>"; }
    else html += "<p>" + fmt(l) + "</p>";
  }
  if (lista) html += "</ul>";
  if (consejo) html += "</div>";
  return html;
}
