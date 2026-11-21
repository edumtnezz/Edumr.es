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
// SITUACIÓN del jugador antes de un partido, mirando los últimos partidos de su equipo (del más reciente al más antiguo).
// Son casos en los que el «peso» solo se queda corto; cada uno tiene su frecuencia real medida (tabla calSit de aciertoOnces):
//  por-fijo: portero titular los 5 últimos · vuelve1 / vuelve2: habitual que no jugó nada el último / los dos últimos
//  fijo90 / fijo70 / fijo-: titular los 5 últimos y en el último jugó 90', 70-89' o menos · rotado: habitual que el último salió del banquillo
export function situacion(p, prev) {
  const por = new Map(p.m.map((x) => [x[0], x]));
  const c = prev.slice(0, 6).map((q) => por.get(q) || null);
  const st = c.map((x) => (x && TIT[catN(x[4])] ? 1 : 0)), mn = c.map((x) => (x ? x[5] || 0 : 0));
  if (st.length < 5) return null;
  let racha = 0; while (racha < st.length && st[racha]) racha++;
  const suma = (a, b) => st.slice(a, b).reduce((t, v) => t + v, 0);
  const hab = suma(1, 5) >= 3, hab2 = st.length >= 6 && suma(2, 6) >= 3;
  if (p.ro === "portero" && racha >= 5) return "por-fijo";
  if (hab2 && !mn[0] && !mn[1]) return "vuelve2";
  if (hab && !mn[0]) return "vuelve1";
  if (racha >= 5) return mn[0] >= 90 ? "fijo90" : mn[0] >= 70 ? "fijo70" : "fijo-";
  if (hab && mn[0] && !st[0]) return "rotado";
  return null;
}
export function oncePropio(jug, hasta, estados) {
  const todas = [...new Set(jug.flatMap((p) => p.m.filter((x) => TIT[catN(x[4])] && (hasta == null || x[0] < hasta)).map((x) => x[0])))].sort((a, b) => b - a);
  const jornadas = todas.slice(0, 5);
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
    return { id: p.id, name: p.n, role: p.ro, sc, mins, est: e || "", sit: situacion(p, todas) };
  });
  const xi = [];
  for (const ro of ["portero", "defensa", "centrocampista", "delantero"]) {
    xi.push(...cand.filter((c) => c.role === ro && c.sc >= 0).sort((a, b) => b.sc - a.sc || b.mins - a.mins).slice(0, forma[ro] || 0));
  }
  return { forma: [forma.defensa || 0, forma.centrocampista || 0, forma.delantero || 0].join("-"), jornadas, xi: xi.map((c) => ({ id: c.id, name: c.name, role: c.role, peso: Math.round(c.sc * 100), est: c.est })),
    cand: cand.map((c) => ({ id: c.id, name: c.name, role: c.role, peso: Math.max(0, Math.round(c.sc * 100)), est: c.est, sit: c.sit })) };
}
function catN(c) { return c === "c" ? "completo" : c === "s" ? "sustituido" : c === "b" ? "banquillo" : "none"; }

// Cuánto acierta el once propio: se «predice» cada jornada pasada solo con las anteriores y se compara con los titulares reales
export function aciertoOnces(ds, desde) {
  const porEquipo = new Map();
  for (const p of ds || []) { const k = clubKey(p.t); if (!porEquipo.has(k)) porEquipo.set(k, []); porEquipo.get(k).push(p); }
  let ok = 0, tot = 0, n = 0; const cal = {}, calSit = {};
  for (const jug of porEquipo.values()) {
    const js = [...new Set(jug.flatMap((p) => p.m.map((x) => x[0])))].filter((j) => j >= (desde || 5));
    for (const j of js) {
      const real = new Set(jug.filter((p) => p.m.some((x) => x[0] === j && TIT[catN(x[4])])).map((p) => p.id));
      if (real.size < 9) continue;
      const o = oncePropio(jug, j, null); if (!o) continue;
      ok += o.xi.filter((x) => real.has(x.id)).length; tot += o.xi.length; n++;
      // Calibración: de los jugadores con cada «peso» (0-9 = 0-9 %, 10-19 %…), cuántos fueron titulares de verdad
      for (const c of o.cand) {
        const b = tramo(c.peso); cal[b] = cal[b] || [0, 0]; if (real.has(c.id)) cal[b][0]++; cal[b][1]++;
        if (c.sit) { calSit[c.sit] = calSit[c.sit] || [0, 0]; if (real.has(c.id)) calSit[c.sit][0]++; calSit[c.sit][1]++; }
      }
    }
  }
  return { onces: n, aciertos: ok, de: tot, pct: tot ? Math.round((1000 * ok) / tot) / 10 : null, porOnce: n ? Math.round((110 * ok) / tot) / 10 : null, cal, calSit };
}
const tramo = (peso) => Math.max(0, Math.min(9, Math.floor((Number(peso) || 0) / 10)));
// PROBABILIDAD INTERNA de ser titular: la frecuencia real con la que fueron titulares los jugadores de ese mismo «peso»
// en las jornadas pasadas (tabla `cal` de aciertoOnces). Con menos de 30 casos en el tramo no se da (null).
// Lesionado o sancionado: 0. No se enseña en la web hasta que su acierto esté medido contra jornadas reales.
// Si el jugador está en una «situación» medida (ver situacion) con 30 casos o más, manda esa frecuencia; si no, la de su tramo de peso.
export function probInterna(peso, est, cal, sit, calSit) {
  if (est === "lesionado" || est === "sancionado") return 0;
  const vs = sit ? (calSit || {})[sit] : null;
  if (vs && vs[1] >= 30) return Math.round((100 * vs[0]) / vs[1]);
  const v = (cal || {})[tramo(peso)];
  if (!v || v[1] < 30) return null;
  return Math.round((100 * v[0]) / v[1]);
}
// DUELO con el once de fuera (FutbolFantasy): se guarda la última previsión de cada uno antes del partido y, cuando llegan
// los titulares reales, se cuenta cuántos acertó cada uno. Así se sabe con datos cuándo podemos dejar de depender de él.
export function puntuarDuelo(previo, reales) {
  if (!previo || !reales || reales.size < 11) return null;
  const cuenta = (ids) => (ids || []).filter((id) => reales.has(id)).length;
  const r = { propio: cuenta(previo.propio), ff: previo.ff && previo.ff.length >= 10 ? cuenta(previo.ff) : null, ffN: (previo.ff || []).length };
  // Aprendizaje por jugador (17/11/2026): % de cada uno (E nuestro, F FutbolFantasy) contra si fue titular de verdad.
  // Brier = media de (probabilidad − 1 si fue titular, 0 si no)²; cuanto más bajo, mejor. Solo con los jugadores de los que hay los dos %.
  const pe = previo.pe || {}, pf = previo.pf || {}, ids = Object.keys(pf).filter((id) => pe[id] != null && pf[id] != null);
  if (ids.length >= 8) {
    let be = 0, bf = 0, se = 0, sf = 0, sr = 0;
    for (const id of ids) { const o = reales.has(id) ? 1 : 0, e = pe[id] / 100, f = pf[id] / 100; be += (e - o) ** 2; bf += (f - o) ** 2; se += e; sf += f; sr += o; }
    r.jug = { n: ids.length, be: +(be / ids.length).toFixed(4), bf: +(bf / ids.length).toFixed(4), e: +se.toFixed(2), f: +sf.toFixed(2), real: sr };
    // Modelo E2 (en sombra): mismos jugadores, para ver si gana a E y a F
    const p2 = previo.pe2 || {}, i2 = ids.filter((id) => p2[id] != null);
    if (i2.length >= 8) { let b2 = 0, bE = 0, bF = 0; for (const id of i2) { const o = reales.has(id) ? 1 : 0; b2 += (p2[id] / 100 - o) ** 2; bE += (pe[id] / 100 - o) ** 2; bF += (pf[id] / 100 - o) ** 2; } r.jug.n2 = i2.length; r.jug.b2 = +(b2 / i2.length).toFixed(4); r.jug.be2 = +(bE / i2.length).toFixed(4); r.jug.bf2 = +(bF / i2.length).toFixed(4); }
  }
  return r;
}

// Compara nuestro once con el de otra fuente (lista de titulares con nombre) para el mismo equipo
export function compararOnce(propio, equipo, titularesFuera, jugEquipo) {
  if (!propio || !Array.isArray(titularesFuera) || !titularesFuera.length) return null;
  const fm = jugEquipo.map((p) => ({ id: p.id, name: p.n, team: equipo, role: p.ro }));
  const m = emparejar(titularesFuera.map((p, i) => ({ id: i, name: p.full || p.name, teamID: 1 })), { 1: { name: equipo } }, fm);
  const fuera = new Map([...m.values()].map((f) => [f.id, f.name]));
  // % de FutbolFantasy de cada titular emparejado (para el aprendizaje por jugador)
  const pf = {};
  for (const [k, f] of m.entries()) { const t = titularesFuera[k]; if (t && t.prob != null && !isNaN(Number(t.prob))) pf[f.id] = Number(t.prob); }
  const mios = new Map(propio.xi.map((x) => [x.id, x.name]));
  return {
    coinciden: [...mios.keys()].filter((id) => fuera.has(id)).length, emparejados: fuera.size,
    soloPropio: [...mios.entries()].filter(([id]) => !fuera.has(id)).map(([, n]) => n),
    soloFuera: [...fuera.entries()].filter(([id]) => !mios.has(id)).map(([, n]) => n),
    firma: [...fuera.keys()].sort().join(","), pf,
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

// ──────────────────────────────────────────────────────────────────────────────────────────────
// MODELO E2 (20/11/2026): probabilidad de ser titular con regresión logística entrenada con las titularidades reales de
// Futmondo de toda la temporada. Probado con las jornadas 6–12 de 2026/27 (entrenado con 6–9, medido en 10–12 sin verlas):
// Brier 0,1576 → 0,1440 y 8,22 → 8,52 aciertos de 11 frente a la fórmula por tramos (E). Va EN SOMBRA: se guarda al lado de E
// (`pe2` en el duelo) y solo se enseña si gana en el duelo real. Con menos de 5 partidos del equipo no hay modelo (null).
const STIT = (c) => catN(c) === "completo" || catN(c) === "sustituido";
// Filas (una por jugador) con las variables de cada jugador ANTES de la jornada j (null = el próximo partido)
export function filasModelo(jug, j) {
  const cnt = {};
  for (const p of jug) for (const x of p.m) if (STIT(x[4])) cnt[x[0]] = (cnt[x[0]] || 0) + 1;
  const games = Object.keys(cnt).map(Number).filter((r) => cnt[r] >= 9).sort((a, b) => a - b);
  const prior = (j == null ? games : games.filter((r) => r < j)).slice().reverse();
  if (prior.length < 5) return null;
  const L = prior.slice(0, 6);
  const pl = jug.map((p) => {
    const by = new Map(p.m.map((x) => [x[0], x]));
    const e = L.map((r) => by.get(r) || null);
    const s = e.map((x) => (x && STIT(x[4]) ? 1 : 0)), b = e.map((x) => (x && catN(x[4]) === "banquillo" ? 1 : 0)), mi = e.map((x) => (x ? Math.min(1, (x[5] || 0) / 90) : 0));
    const starts = prior.filter((r) => { const x = by.get(r); return x && STIT(x[4]); }).length;
    let streak = 0; while (streak < 6 && !(e[streak] && (STIT(e[streak][4]) || catN(e[streak][4]) === "banquillo"))) streak++;
    const sc = W.reduce((t, w, i) => t + w * (s[i] || 0), 0) / 15;
    const jx = j == null ? null : by.get(j);
    return { id: p.id, ro: p.ro, s, b, mi, rate: starts / prior.length, streak: streak / 6, sc, y: jx && STIT(jx[4]) ? 1 : 0 };
  });
  const slots = {};
  for (const x of pl) if (x.s[0]) slots[x.ro] = (slots[x.ro] || 0) + 1;
  for (const ro of Object.keys(slots)) { const g = pl.filter((x) => x.ro === ro).sort((a, b) => b.sc - a.sc), th = (g[slots[ro] - 1] || { sc: 0 }).sc; for (const x of g) x.gap = x.sc - th; }
  for (const x of pl) if (x.gap === undefined) x.gap = x.sc - 0.5;
  return pl;
}
export const featModelo = (x) => [1, x.s[0] || 0, x.s[1] || 0, x.s[2] || 0, x.s[3] || 0, x.s[4] || 0, x.b[0] || 0, x.b[1] || 0, x.mi[0] || 0, x.mi[1] || 0, x.mi[2] || 0, x.rate, x.streak, x.sc, x.gap, x.ro === "portero" ? 1 : 0];
const sigm = (z) => 1 / (1 + Math.exp(-z));
// Entrena con todas las jornadas pasadas de todos los equipos (nunca con la jornada que se va a predecir)
export function entrenarModelo(ds, iter) {
  const porEquipo = new Map();
  for (const p of ds || []) { const k = clubKey(p.t); if (!porEquipo.has(k)) porEquipo.set(k, []); porEquipo.get(k).push(p); }
  const X = [], Y = [];
  for (const jug of porEquipo.values()) {
    const cnt = {};
    for (const p of jug) for (const x of p.m) if (STIT(x[4])) cnt[x[0]] = (cnt[x[0]] || 0) + 1;
    const games = Object.keys(cnt).map(Number).filter((r) => cnt[r] >= 9).sort((a, b) => a - b);
    for (let gi = 5; gi < games.length; gi++) { const f = filasModelo(jug, games[gi]); if (f) for (const x of f) { X.push(featModelo(x)); Y.push(x.y); } }
  }
  if (X.length < 500) return null;
  const d = X[0].length; const w = new Array(d).fill(0);
  for (let it = 0; it < (iter || 3000); it++) {
    const g = new Array(d).fill(0);
    for (let i = 0; i < X.length; i++) { let z = 0; for (let k = 0; k < d; k++) z += X[i][k] * w[k]; const e = sigm(z) - Y[i]; for (let k = 0; k < d; k++) g[k] += e * X[i][k]; }
    for (let k = 0; k < d; k++) w[k] -= 0.5 * (g[k] / X.length + (k ? 0.001 * w[k] : 0));
  }
  return { w: w.map((v) => +v.toFixed(4)), n: X.length };
}
// % (0-100) de cada jugador del equipo para el próximo partido; lesionado/sancionado 0, duda ×0,6 (igual que E)
export function probModelo(modelo, jug, estados) {
  if (!modelo || !modelo.w) return null;
  const f = filasModelo(jug, null); if (!f) return null;
  const out = {};
  for (const x of f) {
    const e = estados ? (estados[x.id] || {}).e : "";
    let p = sigm(featModelo(x).reduce((t, v, k) => t + v * modelo.w[k], 0));
    if (e === "lesionado" || e === "sancionado") p = 0; else if (e === "duda") p *= 0.6;
    out[x.id] = Math.round(p * 100);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ONCE OFICIAL DE FOTMOB (20/11/2026): después del partido Comuniate ya no da la alineación; FotMob sí.
// Clave de club con los nombres de FotMob: «Deportivo Alavés» y «Deportivo A Coruña» darían los dos «depor».
export function fmKey(name) {
  const n = String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/alav/.test(n)) return "alave";
  return clubKey(name);
}
// Titulares de cada equipo de un matchDetails de FotMob. Solo con alineación oficial (lineupType) y 11 titulares.
export function titularesFotmob(det) {
  const l = det && det.content && det.content.lineup;
  if (!l || !l.lineupType) return [];
  const out = [];
  for (const k of ["homeTeam", "awayTeam"]) {
    const t = l[k];
    if (!t || !t.name || !Array.isArray(t.starters) || t.starters.length !== 11) continue;
    out.push({ k: fmKey(t.name), team: t.name, formation: t.formation || "", starters: t.starters.map((x) => ({ id: x.id, name: x.name })) });
  }
  return out;
}

// COMPARATIVA (página privada de Edu): para un resultado del duelo, cada jugador con su E, su F, si fue titular y POR QUÉ
// tenía nuestra E (su situación y sus últimos 5 partidos antes de esa jornada, de Futmondo). Nada se calcula a ojo.
export const SIT_TXT = {
  "por-fijo": "Portero titular en los 5 últimos",
  fijo90: "Titular en los 5 últimos y 90' en el último",
  fijo70: "Titular en los 5 últimos; en el último salió entre el 70' y el 89'",
  "fijo-": "Titular en los 5 últimos; en el último salió antes del 70'",
  vuelve1: "Habitual que no jugó el último partido",
  vuelve2: "Habitual que no jugó los 2 últimos",
  rotado: "Habitual que en el último salió desde el banquillo",
};
export function detalleDuelo(res, jug) {
  const porId = new Map((jug || []).map((p) => [p.id, p]));
  const prev = [...new Set((jug || []).flatMap((p) => p.m.filter((x) => (x[4] === "c" || x[4] === "s") && x[0] < res.j).map((x) => x[0])))].sort((a, b) => b - a);
  const real = new Set(res.real || []), pe = res.pe || {}, pf = res.pf || {}, pe2 = res.pe2 || {};
  const ff = new Set(res.ffIds || Object.keys(pf)), propio = new Set(res.propioIds || []);
  const ids = new Set([...real, ...Object.keys(pf), ...propio, ...Object.keys(pe).filter((id) => pe[id] >= 40)]);
  const filas = [...ids].map((id) => {
    const p = porId.get(id) || { id, n: id, ro: "", m: [] };
    const by = new Map(p.m.map((x) => [x[0], x]));
    const ult = prev.slice(0, 5).map((j) => { const x = by.get(j); return x ? (x[4] === "c" || x[4] === "s" ? "T" : x[4] === "b" ? "S" : "N") : "N"; });
    const sit = (res.sit || {})[id] || situacion({ ...p, m: p.m.filter((x) => x[0] < res.j) }, prev) || null;
    const E = pe[id] != null ? pe[id] : null, F = ff.has(id) ? (pf[id] != null ? pf[id] : null) : 0;
    const tit = real.has(id);
    let veredicto = "";
    if (E != null && F != null) {
      const okE = (E >= 50) === tit, okF = (F >= 50) === tit;
      veredicto = okE && okF ? "ambos" : okE ? "nosotros" : okF ? "ff" : "ninguno";
    } else if (F != null) veredicto = (F >= 50) === tit ? "ff-sinE" : "ninguno-sinE";
    return { id, name: p.n, role: p.ro, titular: tit, E, F, E2: pe2[id] != null ? pe2[id] : null, enOnceFF: ff.has(id), enOncePropio: propio.has(id), sit, sitTxt: sit ? SIT_TXT[sit] || "" : "Titular en " + ult.filter((u) => u === "T").length + " de sus 5 últimos", ult, veredicto };
  });
  const ord = { portero: 0, defensa: 1, centrocampista: 2, delantero: 3 };
  filas.sort((a, b) => (b.titular - a.titular) || ((ord[a.role] ?? 9) - (ord[b.role] ?? 9)) || ((b.F || 0) - (a.F || 0)));
  const titE = filas.filter((x) => x.titular && x.E != null), titF = filas.filter((x) => x.titular && x.F != null);
  return {
    j: res.j, team: res.team, src: res.src, forma: res.forma || "", at: res.at,
    aciertos: { propio: res.propio, ff: res.ff },
    mediaTitulares: { E: titE.length ? Math.round(titE.reduce((t, x) => t + x.E, 0) / titE.length) : null, F: titF.length ? Math.round(titF.reduce((t, x) => t + x.F, 0) / titF.length) : null },
    brier: res.jug ? { E: res.jug.be, F: res.jug.bf, E2: res.jug.b2 != null ? res.jug.b2 : null, n: res.jug.n } : null,
    jugadores: filas,
  };
}
// Aprendizaje: en cada situación, E media, F media y cuántos fueron titulares de verdad (todos los resultados guardados)
export function aprendizaje(resultados, sitDe) {
  const g = {};
  for (const r of resultados || []) {
    const real = new Set(r.real || []), pe = r.pe || {}, pf = r.pf || {};
    for (const id of Object.keys(pf)) {
      if (pe[id] == null) continue;
      const s = ((r.sit || {})[id]) || (sitDe ? sitDe(r, id) : null) || "otra";
      const x = g[s] = g[s] || { n: 0, e: 0, f: 0, tit: 0 };
      x.n++; x.e += pe[id]; x.f += pf[id]; if (real.has(id)) x.tit++;
    }
  }
  return Object.entries(g).map(([s, x]) => ({ sit: s, txt: SIT_TXT[s] || "Sin situación clara", n: x.n, E: Math.round(x.e / x.n), F: Math.round(x.f / x.n), real: Math.round((100 * x.tit) / x.n) })).sort((a, b) => b.n - a.n);
}

// MARCADOR (21/11/2026): mide cada fórmula con TODOS los partidos puntuados y TODA la plantilla (no solo los del once).
// E = la de la web; F = FutbolFantasy (0 si no lo pone en su once); E2 = modelo en sombra;
// E3 = E reescalada para que el equipo sume 11 titulares (en sombra, idea nueva: E da % repartidos de más).
export function normalizar11(pe) {
  const ids = Object.keys(pe || {});
  let v = Object.fromEntries(ids.map((id) => [id, Math.max(0, Number(pe[id]) || 0)]));
  for (let i = 0; i < 4; i++) {
    const libres = ids.filter((id) => v[id] < 97), fijos = ids.length - libres.length;
    const s = libres.reduce((t, id) => t + v[id], 0);
    if (!s) break;
    const f = (1100 - fijos * 97) / s;
    libres.forEach((id) => { v[id] = Math.min(97, v[id] * f); });
  }
  return Object.fromEntries(ids.map((id) => [id, Math.round(v[id])]));
}
export function marcadorFormulas(resultados) {
  const V = { E4: { n: 0, ok: 0, b: 0, once: 0, p: 0 }, E: { n: 0, ok: 0, b: 0, once: 0, p: 0 }, F: { n: 0, ok: 0, b: 0, once: 0, p: 0 }, E2: { n: 0, ok: 0, b: 0, once: 0, p: 0 }, E3: { n: 0, ok: 0, b: 0, once: 0, p: 0 } };
  const jornadas = new Set();
  for (const r of resultados || []) {
    if (!r.real || !r.real.length || !r.pe || !Object.keys(r.pe).length) continue;
    jornadas.add(r.j);
    const real = new Set(r.real), pe = r.pe, ids = Object.keys(pe);
    const ff = new Set(r.ffIds || Object.keys(r.pf || {}));
    const val = {
      E: pe,
      F: Object.fromEntries(ids.map((id) => [id, ff.has(id) ? Number((r.pf || {})[id] ?? 50) : 0])),
      E2: r.pe2 && Object.keys(r.pe2).length ? r.pe2 : null,
      E3: normalizar11(pe),
      E4: r.pe4 && Object.keys(r.pe4).length ? r.pe4 : pe, // sin convocatoria del club, E4 = E
    };
    for (const k of Object.keys(V)) {
      const m = val[k]; if (!m) continue;
      const v = V[k]; v.p++;
      for (const id of ids) {
        const p = Number(m[id]) || 0, t = real.has(id) ? 1 : 0;
        v.n++; v.b += (p / 100 - t) ** 2; if ((p >= 50) === !!t) v.ok++;
      }
      // once: los 11 con más % (en F, su once tal cual)
      const top = k === "F" && ff.size ? [...ff] : ids.slice().sort((a, b) => (Number(m[b]) || 0) - (Number(m[a]) || 0)).slice(0, 11);
      v.once += top.filter((id) => real.has(id)).length;
    }
  }
  const out = { equipos: 0, jornadas: [...jornadas].sort((a, b) => a - b), conConvocatoria: (resultados || []).filter((r) => r.pe4 && Object.keys(r.pe4).length).length };
  for (const k of Object.keys(V)) {
    const v = V[k];
    out.equipos = Math.max(out.equipos, V.E.p);
    out[k] = v.p ? { equipos: v.p, once: Math.round((v.once / v.p) * 10) / 10, oncePct: Math.round((100 * v.once) / (v.p * 11)), jugadores: v.n, bien: v.ok, bienPct: Math.round((100 * v.ok) / v.n), brier: Math.round((v.b / v.n) * 10000) / 10000 } : null;
  }
  return out;
}

// E4 (21/11/2026, en sombra, aprobado por Edu): la E de siempre, pero con la convocatoria OFICIAL del club de esa jornada:
// quien no está en la lista pasa a 0. Solo si la lista es de esa jornada, tiene 18 o más y no quedó ningún nombre sin identificar
// (si alguno no se identificó, podría ser uno de nuestra plantilla y lo dejaríamos a 0 por error). Si no hay lista válida: null.
export function conConvocatoria(pe, conv, jornada) {
  if (!pe || !conv || Number(conv.jornada) !== Number(jornada) || !Array.isArray(conv.ids) || conv.ids.length < 18 || (conv.sin || 0) > 0) return null;
  const ok = new Set(conv.ids);
  return Object.fromEntries(Object.keys(pe).map((id) => [id, ok.has(id) ? pe[id] : 0]));
}
