// Artículos propios (no son noticias): listas hechas SOLO con nuestros datos (valores, medias y partidos de Futmondo; estado del registro propio).
// Cada regla está escrita aquí y cada jugador sale con el dato que lo justifica. Si una lista queda vacía, no se pinta; si todas, no hay artículo.
// Las filas de jugador van como «@ id | Nombre | dato | motivo» y la web las pinta con su foto y enlace a la ficha.

const M = (v) => (Math.abs(v) / 1e6).toFixed(1).replace(".", ",") + " M";
const dec = (v) => (Math.round(Number(v) * 10) / 10).toFixed(1).replace(".", ",");
const fila = (p, dato, motivo) => "@ " + p.id + " | " + String(p.name).replace(/\|/g, " ") + " | " + dato + " | " + motivo;
const libre = (p) => !p.est || p.est === "apercibido"; // disponible para jugar
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// «Retorno estimado: Principios de Diciembre.» → { txt: "principios de diciembre", ms } (día 5, 15 o 25 del mes, el próximo que toque).
// «Vuelta indefinida» → { txt: "sin fecha de vuelta", ms: Infinity }. Sin texto de retorno → null.
export function retorno(info, now = Date.now()) {
  const m = String(info || "").match(/Retorno estimado:\s*([^.]+)/i);
  if (!m) return null;
  const t = m[1].trim().toLowerCase();
  if (/indefinid/.test(t)) return { txt: "sin fecha de vuelta", ms: Infinity };
  const q = t.normalize("NFD").replace(/[̀-ͯ]/g, "").match(/(principios|mediados|finales) de ([a-z]+)/);
  if (!q) return null;
  const mes = MES.indexOf(q[2]);
  if (mes < 0) return null;
  const dia = q[1] === "principios" ? 5 : q[1] === "mediados" ? 15 : 25;
  const d0 = new Date(now), y = d0.getUTCFullYear();
  let ms = Date.UTC(y, mes, dia);
  if (ms < now - 45 * 86400000) ms = Date.UTC(y + 1, mes, dia); // un mes ya pasado hace tiempo es del año que viene
  return { txt: q[1] + " de " + q[2], ms };
}

const top = (arr, n) => arr.slice(0, n);
const item = (id, title, lead, secciones, nombres) => {
  const body = secciones.filter((s) => s.filas.length).map((s) => ["## " + s.titulo, s.nota, ...s.filas].filter(Boolean).join("\n")).join("\n");
  return body ? { id, title, lead, body, players: nombres.slice(0, 3) } : null;
};

// A vender: bajas largas (vuelven dentro de 4 semanas o más, o sin fecha) y sanos que han perdido 1 M o más en 7 días.
export function aVender(ps, jn, now = Date.now()) {
  const largas = ps.filter((p) => p.est === "lesionado" && p.value >= 2e6).map((p) => ({ p, r: retorno(p.estInfo, now) })).filter((x) => x.r && x.r.ms - now >= 28 * 86400000)
    .sort((a, b) => b.p.value - a.p.value);
  const caen = ps.filter((p) => libre(p) && p.value >= 3e6 && Number(p.chg7) <= -1e6).sort((a, b) => a.chg7 - b.chg7);
  const A = top(largas, 6), B = top(caen, 6);
  return item("artvender" + jn, "Jugadores a vender antes de la jornada " + jn, "Bajas largas y jugadores sanos que pierden valor.", [
    { titulo: "Baja larga", nota: "Lesionados que no vuelven hasta dentro de un mes o más.", filas: A.map((x) => fila(x.p, M(x.p.value), "Vuelta: " + x.r.txt)) },
    { titulo: "Pierden valor", nota: "Disponibles, pero han bajado 1 M o más en 7 días.", filas: B.map((p) => fila(p, "−" + M(p.chg7), "en 7 días · media " + dec(p.avg))) },
  ], A.map((x) => x.p.name).concat(B.map((p) => p.name)));
}

// A fichar: vuelven de lesión o sanción (últimos 7 días, con media de 5 o más) y disponibles de menos de 50 M en forma que suben 1 M o más en 7 días.
export function aFichar(ps, cambios, jn, now = Date.now()) {
  const porId = new Map(ps.map((p) => [String(p.id), p]));
  const visto = new Set();
  const vuelven = (cambios || []).filter((c) => c && c.a === "ok" && (c.de === "lesionado" || c.de === "sancionado") && now - c.at < 7 * 86400000)
    .map((c) => ({ c, p: porId.get(String(c.id)) })).filter((x) => x.p && libre(x.p) && x.p.matches >= 3 && x.p.avg >= 5 && !visto.has(x.p.id) && visto.add(x.p.id))
    .sort((a, b) => b.p.avg - a.p.avg);
  // Tope de 50 M: fichar a los más caros de la liga no es un consejo útil (Edu, 15/11/2026).
  const forma = ps.filter((p) => libre(p) && !visto.has(p.id) && p.value < 50e6 && p.matches >= 5 && p.avg >= 7 && Number(p.chg7) >= 1e6).sort((a, b) => b.avg - a.avg);
  const A = top(vuelven, 6), B = top(forma, 6);
  return item("artfichar" + jn, "Jugadores a fichar antes de la jornada " + jn, "Los que vuelven y los que rinden y suben de valor.", [
    { titulo: "Vuelven", nota: "Salen de lesión o sanción esta semana y rendían bien.", filas: A.map((x) => fila(x.p, dec(x.p.avg), "de media en " + x.p.matches + " partidos · " + M(x.p.value))) },
    { titulo: "En forma y subiendo", nota: "Por menos de 50 M, con media de 7 o más y 1 M o más de subida en 7 días.", filas: B.map((p) => fila(p, dec(p.avg), "de media · +" + M(p.chg7) + " en 7 días · " + M(p.value))) },
  ], A.map((x) => x.p.name).concat(B.map((p) => p.name)));
}

// Clausulazos recomendables: los tres disponibles con mejor media en cada franja de precio (6 partidos o más). Sin cláusulas de ninguna liga.
export function clausulazos(ps, jn) {
  const ok = ps.filter((p) => libre(p) && p.matches >= 6 && p.avg > 0);
  const franja = (min, max) => top(ok.filter((p) => p.value >= min && p.value < max).sort((a, b) => b.avg - a.avg || b.points - a.points), 3);
  const F = [["Hasta 5 M", 0, 5e6], ["De 5 a 15 M", 5e6, 15e6], ["De 15 a 30 M", 15e6, 30e6], ["Más de 30 M", 30e6, Infinity]].map(([t, a, b]) => ({ t, l: franja(a, b) }));
  return item("artclaus" + jn, "Clausulazos recomendables antes de la jornada " + jn, "Los que más rinden en cada franja de precio y están disponibles.",
    F.map((f) => ({ titulo: f.t, nota: "", filas: f.l.map((p) => fila(p, dec(p.avg), "de media en " + p.matches + " partidos · " + M(p.value))) })), F.flatMap((f) => f.l.map((p) => p.name)));
}

// Parón: bajas importantes que siguen, los que pueden volver para la jornada, y quién sube y baja más de valor esta semana.
export function paron(ps, jn, vuelta, now = Date.now()) {
  const les = ps.filter((p) => p.est === "lesionado" && p.value >= 3e6).map((p) => ({ p, r: retorno(p.estInfo, now) })).filter((x) => x.r);
  const llegan = les.filter((x) => x.r.ms <= vuelta + 10 * 86400000).sort((a, b) => b.p.value - a.p.value);
  const siguen = les.filter((x) => x.r.ms > vuelta + 10 * 86400000).sort((a, b) => b.p.value - a.p.value);
  const suben = ps.filter((p) => libre(p) && Number(p.chg7) >= 5e5).sort((a, b) => b.chg7 - a.chg7), bajan = ps.filter((p) => Number(p.chg7) <= -5e5).sort((a, b) => a.chg7 - b.chg7);
  const A = top(llegan, 6), B = top(siguen, 6), C = top(suben, 5), D = top(bajan, 5);
  return item("artparon" + jn, "Parón: repasa tu plantilla antes de la jornada " + jn, "Quién puede volver, quién sigue de baja y cómo se mueve el mercado sin partidos.", [
    { titulo: "Pueden volver para la jornada " + jn, nota: "Lesionados con vuelta prevista en estas fechas.", filas: A.map((x) => fila(x.p, M(x.p.value), "Vuelta: " + x.r.txt)) },
    { titulo: "Siguen de baja", nota: "", filas: B.map((x) => fila(x.p, M(x.p.value), "Vuelta: " + x.r.txt)) },
    { titulo: "Suben en el parón", nota: "Mayor subida de valor en 7 días.", filas: C.map((p) => fila(p, "+" + M(p.chg7), "en 7 días · media " + dec(p.avg))) },
    { titulo: "Bajan en el parón", nota: "", filas: D.map((p) => fila(p, "−" + M(p.chg7), "en 7 días · media " + dec(p.avg))) },
  ], A.map((x) => x.p.name).concat(C.map((p) => p.name)));
}

// Primer partido de la jornada («20/11» + «21:00», hora de Madrid) en milisegundos. null si no se puede leer.
export function inicioJornada(matches, now = Date.now()) {
  let min = null;
  for (const m of (matches || [])) {
    const d = String(m.date || "").match(/^(\d{1,2})\/(\d{1,2})$/), t = String(m.time || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!d) continue;
    const y0 = new Date(now).getUTCFullYear();
    let ms = Date.UTC(y0, Number(d[2]) - 1, Number(d[1]), t ? Number(t[1]) - 1 : 11, t ? Number(t[2]) : 0); // hora de Madrid ≈ UTC+1 (vale para decidir días)
    if (ms < now - 180 * 86400000) ms = Date.UTC(y0 + 1, Number(d[2]) - 1, Number(d[1]), t ? Number(t[1]) - 1 : 11, t ? Number(t[2]) : 0);
    if (min == null || ms < min) min = ms;
  }
  return min;
}
// Hay parón si faltan 5 días o más para el primer partido (en una semana normal nunca pasa de 4: lunes → viernes).
export const esParon = (inicio, now = Date.now()) => inicio != null && inicio - now >= 5 * 86400000;
