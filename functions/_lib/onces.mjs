// Onces recomendados (16/11/2026): tres onces en 1-4-3-3 con datos reales de Futmondo (media, partidos, valor) y la probabilidad
// de jugar del once probable. Solo entran jugadores disponibles, con 70 % o más de jugar y 5 partidos o más.
//  · Caro: los mejores, sin límite de precio.  · Equilibrado: hasta 15 M por jugador.  · Low cost: hasta 6 M por jugador.
// Un jugador sale en un solo once (se elige primero el low cost, luego el equilibrado y por último el caro, para que los baratos que
// rinden no se los lleve el caro) y como mucho 3 del mismo club por once. Se enseñan en orden caro, equilibrado, low cost.
// Se escribe como «# once | id,id,…(11) | etiqueta» y la web lo pinta como un campo con foto, nombre y media.

const FORM = [["portero", 1], ["defensa", 4], ["centrocampista", 3], ["delantero", 3]];
export const TIERS = [["caro", "Once caro", "Sin límite de precio", Infinity], ["equilibrado", "Once equilibrado", "Hasta 15 M por jugador", 15e6], ["lowcost", "Once low cost", "Hasta 6 M por jugador", 6e6]];

export const apto = (p) => p && p.id && (!p.est || p.est === "apercibido") && Number(p.prob) >= 70 && p.matches >= 5 && p.avg > 0 && p.value > 0;

// Elige un once con tope de precio. usados = ids ya elegidos en otro once. Devuelve [] si no se puede completar.
export function elegirOnce(ps, tope, usados = new Set()) {
  const c = ps.filter((p) => apto(p) && p.value <= tope && !usados.has(String(p.id))).sort((a, b) => b.avg - a.avg || b.points - a.points);
  const club = {}, out = [];
  for (const [pos, n] of FORM) {
    let k = 0;
    for (const p of c) {
      if (k >= n) break;
      if (p.role !== pos || out.includes(p) || (club[p.team] || 0) >= 3) continue;
      out.push(p); club[p.team] = (club[p.team] || 0) + 1; k++;
    }
    // Multiposición (la liga la permite): si faltan, se completa con quien tiene esa posición como segunda
    for (const p of c) {
      if (k >= n) break;
      if (p.role2 !== pos || out.includes(p) || (club[p.team] || 0) >= 3) continue;
      out.push(p); club[p.team] = (club[p.team] || 0) + 1; k++;
    }
    if (k < n) return [];
  }
  return out;
}

const M = (v) => (v / 1e6).toFixed(1).replace(".", ",") + " M";
const dec = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");

// Artículo con los tres onces. cambios = { caro: ["Sale X (lesionado), entra Y"], … } para la edición corregida.
export function oncesArticulo(ps, jn, cambios = {}) {
  const usados = new Set(), secs = [], ids = {}, elegidos = {};
  for (const [k, , , tope] of TIERS.slice().reverse()) {
    const xi = elegirOnce(ps, tope, usados);
    if (!xi.length) continue;
    xi.forEach((p) => usados.add(String(p.id)));
    elegidos[k] = xi;
  }
  for (const [k, titulo, nota] of TIERS) {
    const xi = elegidos[k];
    if (!xi) continue;
    ids[k] = xi.map((p) => String(p.id));
    const total = xi.reduce((a, p) => a + p.value, 0), media = xi.reduce((a, p) => a + p.avg, 0) / xi.length;
    const lineas = ["## " + titulo, nota + " · total " + M(total) + " · media del once " + dec(media)];
    (cambios[k] || []).forEach((t) => lineas.push("- " + t));
    lineas.push("# once | " + ids[k].join(",") + " | " + k);
    secs.push(lineas.join("\n"));
  }
  if (!secs.length) return null;
  return {
    id: "artonce" + jn, title: "Onces recomendados para la jornada " + jn,
    lead: "Tres onces en 1-4-3-3 con jugadores disponibles, 70 % o más de jugar y 5 partidos o más, elegidos por su media.",
    body: secs.join("\n"), players: [], ids,
  };
}

// Compara la edición anterior con la nueva y dice quién sale y por qué (solo por lesión o sanción).
export function cambiosOnce(prevIds, nuevos, ps) {
  const porId = new Map(ps.map((p) => [String(p.id), p]));
  const out = {};
  for (const k of Object.keys(prevIds || {})) {
    const fuera = (prevIds[k] || []).filter((id) => { const p = porId.get(id); return p && (p.est === "lesionado" || p.est === "sancionado"); });
    if (!fuera.length) continue;
    const entran = (nuevos[k] || []).filter((id) => !(prevIds[k] || []).includes(id));
    out[k] = fuera.map((id, i) => { const p = porId.get(id), e = porId.get(entran[i]); return "Sale " + p.name + " (" + (p.est === "lesionado" ? "lesionado" : "sancionado") + ")" + (e ? ", entra " + e.name : ""); });
  }
  return out;
}
