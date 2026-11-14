// Análisis propios con datos de Futmondo (13/11/2026): dificultad de calendario, once probable propio y previsión de valor.
// Todo sale de la ficha de cada jugador en Futmondo (puntos por partido de nuestra liga, minutos por jornada, valor diario).
import { clubKey, emparejar } from "./estados.mjs";

const TIT = { completo: 1, sustituido: 1 };

// Ficha completa → lo justo para guardar: partidos [jornada, local(1/0), rival, puntos|null, categoría, minutos]
export function compacto(f) {
  if (!f || !f.id) return null;
  const tk = clubKey(f.team);
  const cat = {};
  for (const c of ((f.participacion || {}).byJornada) || []) cat[c.r] = [String(c.cat || "none").charAt(0), c.mins || 0];
  const m = [];
  for (const x of f.matches || []) {
    if (!x || !x.finished) continue;
    const h = clubKey(x.home), a = clubKey(x.away);
    const local = tk === h ? 1 : tk === a ? 0 : -1;
    if (local < 0) continue; // partido con otro club (fichado a mitad de temporada): no cuenta para su equipo actual
    const c = cat[x.r] || ["n", 0];
    m.push([x.r, local, local ? a : h, typeof x.lg === "number" ? x.lg : null, c[0], c[1]]);
  }
  return { id: f.id, n: f.name, t: f.team, ro: f.role, m };
}

// DIFICULTAD: puntos que suman de media los rivales contra cada equipo. Quien más puntos concede, rival más fácil.
// Los 20 equipos se reparten en cinco niveles de cuatro: 1 = muy fácil … 5 = muy difícil.
export function dificultad(ds) {
  const conc = new Map(), nombre = new Map();
  for (const p of ds || []) {
    nombre.set(clubKey(p.t), p.t);
    for (const [r, , riv, pts] of p.m) {
      if (pts == null) continue;
      if (!conc.has(riv)) conc.set(riv, new Map());
      conc.get(riv).set(r, (conc.get(riv).get(r) || 0) + pts);
    }
  }
  const filas = [...conc.entries()].filter(([k]) => nombre.has(k)).map(([k, m]) => {
    const v = [...m.values()];
    return { k, team: nombre.get(k), partidos: v.length, concede: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 };
  }).filter((x) => x.partidos >= 3).sort((a, b) => b.concede - a.concede);
  const porNivel = Math.max(1, Math.ceil(filas.length / 5));
  filas.forEach((x, i) => { x.nivel = Math.min(5, Math.floor(i / porNivel) + 1); x.concede = Math.round(x.concede * 10) / 10; });
  return filas;
}

// Calendario de las próximas jornadas con la dificultad de cada rival
export function calendarioDificultad(niveles, cal, desde, cuantas) {
  const nv = new Map((niveles || []).map((x) => [x.k, x]));
  const teams = (cal && cal.teams) || {};
  const jornadas = [];
  for (let j = desde; j < desde + cuantas && j <= 38; j++) jornadas.push(j);
  const filas = new Map();
  const fila = (id) => {
    const t = teams[String(id)] || {}, k = clubKey(t.n || "");
    if (!filas.has(k)) filas.set(k, { k, team: (nv.get(k) || {}).team || t.n || "", crest: t.c || "", celdas: {} });
    return filas.get(k);
  };
  for (const m of (cal && cal.matches) || []) {
    const [j, h, a] = m;
    if (j < desde || j >= desde + cuantas) continue;
    const th = teams[String(h)] || {}, ta = teams[String(a)] || {};
    const nh = nv.get(clubKey(th.n || "")), na = nv.get(clubKey(ta.n || ""));
    fila(h).celdas[j] = { rival: ta.n || "", crest: ta.c || "", casa: true, nivel: na ? na.nivel : null };
    fila(a).celdas[j] = { rival: th.n || "", crest: th.c || "", casa: false, nivel: nh ? nh.nivel : null };
  }
  const out = [...filas.values()].map((f) => {
    const ns = jornadas.map((j) => (f.celdas[j] || {}).nivel).filter((x) => x != null);
    return { team: f.team, crest: f.crest, media: ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null, celdas: jornadas.map((j) => f.celdas[j] || null) };
  }).sort((a, b) => (a.media == null ? 9 : a.media) - (b.media == null ? 9 : b.media) || a.team.localeCompare(b.team));
  return { jornadas, equipos: out };
}

// ONCE PROPIO: titulares de los últimos 5 partidos del equipo, con más peso a los recientes (5,4,3,2,1).
// El dibujo (cuántos por línea) es el del último partido. Lesionados y sancionados quedan fuera; la duda resta.
const W = [5, 4, 3, 2, 1];
export function oncePropio(jug, hasta, estados) {
  const jornadas = [...new Set(jug.flatMap((p) => p.m.filter((x) => TIT[catN(x[4])] && (hasta == null || x[0] < hasta)).map((x) => x[0])))].sort((a, b) => b - a).slice(0, 5);
  if (jornadas.length < 3) return null;
  const forma = {};
  const cand = jug.map((p) => {
    const por = new Map(p.m.map((x) => [x[0], x]));
    let s = 0, mins = 0, tot = 0;
    jornadas.forEach((j, i) => { const x = por.get(j); tot += W[i]; if (!x) return; const c = catN(x[4]); s += W[i] * (TIT[c] ? 1 : c === "banquillo" ? 0.15 : 0); mins += x[5] || 0; });
    const u = por.get(jornadas[0]);
    if (u && TIT[catN(u[4])]) forma[p.ro] = (forma[p.ro] || 0) + 1;
    const e = estados ? (estados[p.id] || {}).e : "";
    let sc = s / tot;
    if (e === "lesionado" || e === "sancionado") sc = -1; else if (e === "duda") sc *= 0.6;
    return { id: p.id, name: p.n, role: p.ro, sc, mins, est: e || "" };
  });
  const xi = [];
  for (const ro of ["portero", "defensa", "centrocampista", "delantero"]) {
    xi.push(...cand.filter((c) => c.role === ro && c.sc >= 0).sort((a, b) => b.sc - a.sc || b.mins - a.mins).slice(0, forma[ro] || 0));
  }
  return { forma: [forma.defensa || 0, forma.centrocampista || 0, forma.delantero || 0].join("-"), jornadas, xi: xi.map((c) => ({ id: c.id, name: c.name, role: c.role, peso: Math.round(c.sc * 100), est: c.est })) };
}
function catN(c) { return c === "c" ? "completo" : c === "s" ? "sustituido" : c === "b" ? "banquillo" : "none"; }

// Cuánto acierta el once propio: se «predice» cada jornada pasada solo con las anteriores y se compara con los titulares reales
export function aciertoOnces(ds, desde) {
  const porEquipo = new Map();
  for (const p of ds || []) { const k = clubKey(p.t); if (!porEquipo.has(k)) porEquipo.set(k, []); porEquipo.get(k).push(p); }
  let ok = 0, tot = 0, n = 0;
  for (const jug of porEquipo.values()) {
    const js = [...new Set(jug.flatMap((p) => p.m.map((x) => x[0])))].filter((j) => j >= (desde || 5));
    for (const j of js) {
      const real = new Set(jug.filter((p) => p.m.some((x) => x[0] === j && TIT[catN(x[4])])).map((p) => p.id));
      if (real.size < 9) continue;
      const o = oncePropio(jug, j, null); if (!o) continue;
      ok += o.xi.filter((x) => real.has(x.id)).length; tot += o.xi.length; n++;
    }
  }
  return { onces: n, aciertos: ok, de: tot, pct: tot ? Math.round((1000 * ok) / tot) / 10 : null, porOnce: n ? Math.round((110 * ok) / tot) / 10 : null };
}

// Compara nuestro once con el de otra fuente (lista de titulares con nombre) para el mismo equipo
export function compararOnce(propio, equipo, titularesFuera, jugEquipo) {
  if (!propio || !Array.isArray(titularesFuera) || !titularesFuera.length) return null;
  const fm = jugEquipo.map((p) => ({ id: p.id, name: p.n, team: equipo, role: p.ro }));
  const m = emparejar(titularesFuera.map((p, i) => ({ id: i, name: p.full || p.name, teamID: 1 })), { 1: { name: equipo } }, fm);
  const fuera = new Map([...m.values()].map((f) => [f.id, f.name]));
  const mios = new Map(propio.xi.map((x) => [x.id, x.name]));
  return {
    coinciden: [...mios.keys()].filter((id) => fuera.has(id)).length, emparejados: fuera.size,
    soloPropio: [...mios.entries()].filter(([id]) => !fuera.has(id)).map(([, n]) => n),
    soloFuera: [...fuera.entries()].filter(([id]) => !mios.has(id)).map(([, n]) => n),
    firma: [...fuera.keys()].sort().join(","),
  };
}

// PREVISIÓN DE VALOR (regla comprobada el 14/11/2026 con los valores diarios de Futmondo Social de 507 jugadores,
// del 20/08 al 13/11: más de 6.000 casos de subida y 8.700 de bajada).
// Condición: hoy se mueve 100.000 € o más Y ayer se movió en el mismo sentido (va en racha).
//  · En los 3 días siguientes se mueve, en total, AL MENOS lo mismo que hoy: 84 % de las subidas (81 % en los últimos 30 días)
//    y 89 % de las bajadas. Lo habitual es bastante más: la mitad de las veces, 2,6 veces el cambio de hoy.
//  · Mañana, al menos la mitad del cambio de hoy: 85 %.
// Sin racha o con menos de 100.000 € no se da previsión (ahí la regla no llega a 8 de cada 10).
// Devuelve el mínimo previsto a 3 días, redondeado hacia abajo a 10.000 €, sin pasar del suelo de 1.000.000 € en las bajadas.
export function previsionValor(cambioHoy, cambioAyer, valor) {
  const c = Number(cambioHoy) || 0, a = Number(cambioAyer) || 0;
  if (Math.abs(c) < 100000 || c * a <= 0) return null;
  let min = Math.floor(Math.abs(c) / 10000) * 10000;
  if (c < 0) {
    const margen = (Number(valor) || 0) - 1000000;
    if (!(margen > 0)) return null;
    min = Math.min(min, Math.floor(margen / 10000) * 10000);
    if (min < 50000) return null;
  }
  return { dias: 3, min: c > 0 ? min : -min };
}
