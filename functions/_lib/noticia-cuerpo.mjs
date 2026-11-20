// Pasa el cuerpo de una noticia propia a HTML. Los bloques de una rueda
// (rótulo en negrita y cita en la línea siguiente) salen en su propia caja.
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (l) => esc(l).replace(/\*\*([^*]{1,160})\*\*/g, "<b>$1</b>");

export function cuerpoAHtml(body) {
  const lineas = String(body || "").split(/\n+/).map((t) => t.trim()).filter(Boolean);
  let html = "", lista = false, consejo = false, chips = false;
  // Recuadro de dato de un artículo: «= RÓTULO | valor | tono (ok verde, az azul, na naranja, mo morado) | detalle». Los seguidos van en una cuadrícula.
  const CH = /^= ([^|]{1,30}) \| ([^|]{1,30}) \| (ok|az|na|mo) \| ?(.{0,60})$/;
  for (let i = 0; i < lineas.length; i++) {
    if (chips && !CH.test(lineas[i])) { html += "</div>"; chips = false; }
    const ch = lineas[i].match(CH);
    if (ch) {
      if (lista) { html += "</ul>"; lista = false; }
      if (!chips) { html += '<div class="art-chips">'; chips = true; }
      html += '<div class="art-chip art-chip-' + ch[3] + '"><small>' + esc(ch[1].trim()) + "</small><b>" + esc(ch[2].trim()) + "</b>" + (ch[4].trim() && ch[4].trim() !== "-" ? "<i>" + esc(ch[4].trim()) + "</i>" : "") + "</div>";
      continue;
    }
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
    // Fila de jugador de un artículo: «@ id | Nombre | cifra | qué es | nota». La web le pone foto, club, media, partidos y valor (por el id).
    const pj = l.match(/^@ ([0-9a-zA-Z]{6,40}) \| ([^|]{1,60}) \| ([^|]{1,40}) \| ([^|]{1,60})(?: \| (.{1,120}))?$/);
    if (pj) {
      if (lista) { html += "</ul>"; lista = false; }
      const nota = pj[5] && pj[5].trim() !== "-" ? pj[5].trim() : "";
      const viejo = pj[5] == null; // formato anterior (4 campos): cifra + motivo
      html += '<div class="art-pl" data-pid="' + esc(pj[1]) + '"><span class="art-pl-t"><b>' + esc(pj[2].trim()) + "</b>" + (viejo ? "<small>" + esc(pj[4].trim()) + "</small>" : (nota ? '<small class="art-pl-nt">' + esc(nota) + "</small>" : "")) +
        '</span><span class="art-pl-v"><b>' + esc(pj[3].trim()) + "</b>" + (viejo ? "" : "<small>" + esc(pj[4].trim()) + "</small>") + "</span></div>";
      continue;
    }
    // Once en el campo: «# once | id,id,…(11) | etiqueta | 3-4-3» (portero, defensas, medios, delanteros; sin formación = 4-3-3, portero abajo).
    // La web pone foto, nombre y media (por el id) con la plantilla de «Analiza tu once».
    const oj = l.match(/^# once \| ([0-9a-zA-Z,]{60,600}) \| ([a-z]{1,20})(?: \| ([3-5]-[2-5]-[1-4]))?$/);
    if (oj) {
      if (lista) { html += "</ul>"; lista = false; }
      const ids = oj[1].split(",");
      if (ids.length === 11) {
        const fm = (oj[3] || "4-3-3").split("-").map(Number);
        if (fm[0] + fm[1] + fm[2] !== 10) continue;
        const fila = (xs) => '<div class="art-once-l">' + xs.map((id) => '<span class="art-op" data-pid="' + esc(id) + '"></span>').join("") + "</div>";
        const a = 1 + fm[0], b = a + fm[1];
        html += '<div class="art-once art-once-' + esc(oj[2]) + '" data-form="' + esc(fm.join("-")) + '">' + fila(ids.slice(b, 11)) + fila(ids.slice(a, b)) + fila(ids.slice(1, a)) + fila(ids.slice(0, 1)) + "</div>";
      }
      continue;
    }
    // Gráfica de valor de un jugador: «~ id | Nombre | v1,v2,… | día inicial | día final» (valores reales de cada día, de nuestro historial).
    const gj = l.match(/^~ ([0-9a-zA-Z]{6,40}) \| ([^|]{1,60}) \| ([0-9,]{3,400}) \| ([0-9/]{3,10}) \| ([0-9/]{3,10})$/);
    if (gj) {
      if (lista) { html += "</ul>"; lista = false; }
      const v = gj[3].split(",").map(Number).filter((n) => n > 0);
      if (v.length >= 2) {
        const mn = Math.min(...v), mx = Math.max(...v), W = 300, H = 64, P = 5;
        const X = (k) => P + (k * (W - 2 * P)) / (v.length - 1), Y = (n) => (mx === mn ? H / 2 : H - P - ((n - mn) * (H - 2 * P)) / (mx - mn));
        const pts = v.map((n, k) => X(k).toFixed(1) + "," + Y(n).toFixed(1)).join(" ");
        const Mm = (n) => (n / 1e6).toFixed(1).replace(".", ",") + " M";
        const dif = v[v.length - 1] - v[0], pct = Math.round((dif / v[0]) * 100);
        html += '<div class="art-gr" data-pid="' + esc(gj[1]) + '"><div class="art-gr-h"><b>' + esc(gj[2].trim()) + '</b><span class="art-gr-d">' + (dif >= 0 ? "+" : "−") + Mm(Math.abs(dif)) + " · " + (dif >= 0 ? "+" : "−") + Math.abs(pct) + " %</span></div>" +
          '<svg class="art-gr-s" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><polygon points="' + P + "," + (H - 1) + " " + pts + " " + (W - P) + "," + (H - 1) + '" fill="currentColor" opacity=".12"/><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>' +
          '<div class="art-gr-f"><span>' + esc(gj[4]) + " · " + Mm(v[0]) + "</span><span>" + esc(gj[5]) + " · " + Mm(v[v.length - 1]) + "</span></div></div>";
      }
      continue;
    }
    const li = /^- /.test(l);
    if (li && !lista) { html += '<ul class="nw-claves">'; lista = true; }
    if (!li && lista) { html += "</ul>"; lista = false; }
    if (li) html += "<li>" + fmt(l.slice(2)) + "</li>";
    else if (/^## Consejo/.test(l)) { html += '<div class="nw-consejo"><h3 class="nw-h">' + fmt(l.slice(3)) + "</h3>"; consejo = true; }
    else if (/^## /.test(l)) html += '<h3 class="nw-h">' + fmt(l.slice(3)) + "</h3>";
    else if (/^Estado del jugador según/.test(l)) { if (consejo) { html += "</div>"; consejo = false; } html += '<p class="nw-fuente">' + fmt(l) + "</p>"; }
    else html += "<p>" + fmt(l) + "</p>";
  }
  if (chips) html += "</div>";
  if (lista) html += "</ul>";
  if (consejo) html += "</div>";
  return html;
}
