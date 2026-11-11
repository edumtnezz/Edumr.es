// Dos comprobaciones de datos del mercado, sin inventar nada.
//
// 1) "change" de Futmondo es el ÚLTIMO movimiento de valor, no el de hoy: en un jugador parado (lesión
//    larga) se queda con una bajada de hace días (Guruzeta, 11/11/2026: "HOY −237.946 €" y la bajada era
//    del 05/11). Si nuestro histórico dice que el valor no se ha movido ni ayer ni anteayer, ese cambio
//    es viejo y hoy vale 0. Con un solo día igual NO se toca: de madrugada, antes de que Futmondo
//    actualice, el valor de hoy aún coincide con el de ayer y "change" es el movimiento bueno.
export function staleChange(change, d1, d2) {
  if (!(Number(change) || 0)) return false;
  return d1 === 0 && d2 === 0;
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// 2) Jugadores "tocados" según la lista de novedades (días = [{day:"Miércoles 11", items:[{time,cat,title}]}],
//    del más nuevo al más viejo). Solo cuentan hoy y ayer, y manda la última novedad de cada jugador
//    (si después sale "recuperado", ya no está tocado). Devuelve { nombreNormalizado: {t:"11:18", d:"hoy"|"ayer"} }.
export function tocadosDe(days, hoyDia, ayerDia) {
  const out = {}, visto = {};
  for (const day of days || []) {
    const n = Number((String(day.day || "").match(/(\d{1,2})\s*$/) || [])[1]) || 0;
    const d = n && n === Number(hoyDia) ? "hoy" : n && n === Number(ayerDia) ? "ayer" : "";
    if (!d) continue;
    for (const it of day.items || []) {
      if (it.cat !== "tocado" && it.cat !== "recuperado") continue;
      const m = String(it.title || "").match(/^(.+?)\s+está ahora\s+/i);
      if (!m) continue;
      const k = norm(m[1]);
      if (!k || visto[k]) continue;
      visto[k] = 1;
      if (it.cat === "tocado") out[k] = { t: String(it.time || ""), d };
    }
  }
  return out;
}

// Pone "toc" solo si el nombre coincide EXACTAMENTE con un único jugador del mercado (si hay dos o ninguno, nada).
export function marcarTocados(players, mapa) {
  const keys = Object.keys(mapa || {});
  if (!keys.length) return players;
  const cuenta = {};
  players.forEach((p) => { const k = norm(p.name); cuenta[k] = (cuenta[k] || 0) + 1; });
  return players.map((p) => { const k = norm(p.name); return mapa[k] && cuenta[k] === 1 ? { ...p, toc: mapa[k] } : p; });
}
