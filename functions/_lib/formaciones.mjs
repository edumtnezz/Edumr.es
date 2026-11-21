// Registro de formaciones de cada equipo: las que de verdad ha usado en LaLiga esta temporada.
// Fuente: FotMob (matchDetails → content.lineup.{homeTeam,awayTeam}.formation) de cada partido terminado. Nada se inventa:
// si FotMob no da una formación válida de un partido, ese partido no cuenta.
import { fmKey } from "./analitica.mjs";

// 3 o 4 filas de campo (sin portero) que suman 10 jugadores: «4-2-3-1», «5-3-2», «4-4-2». Las de 5 filas («4-1-2-1-2») no se dibujan y no cuentan.
const FORM_RE = /^[1-6](-[1-6]){2,3}$/;
export const formOk = (f) => FORM_RE.test(String(f || "")) && String(f).split("-").reduce((a, b) => a + Number(b), 0) === 10;

// Partidos terminados de la temporada (FotMob leagues → fixtures.allMatches).
export function terminados(allMatches) {
  return (allMatches || []).filter((x) => x && x.id != null && x.status && x.status.finished && !x.status.cancelled && x.home && x.away).map((x) => String(x.id));
}

// Formación de cada equipo en un partido: solo con alineación oficial (lineupType) y 11 titulares.
export function formacionesDe(det) {
  const l = det && det.content && det.content.lineup;
  if (!l || !l.lineupType || l.lineupType === "predicted") return [];
  const out = [];
  for (const k of ["homeTeam", "awayTeam"]) {
    const t = l[k];
    if (!t || !t.name || !Array.isArray(t.starters) || t.starters.length !== 11 || !formOk(t.formation)) continue;
    out.push({ k: fmKey(t.name), name: t.name, f: String(t.formation) });
  }
  return out;
}

// Suma un partido al registro (una sola vez por partido). reg = { done: [ids], eq: { clave: { name, n, f: { "4-2-3-1": 7 } } } }
export function sumar(reg, id, items) {
  reg = reg && reg.eq ? reg : { done: [], eq: {} };
  if (!Array.isArray(reg.done)) reg.done = [];
  id = String(id);
  if (reg.done.indexOf(id) >= 0) return reg;
  for (const it of items || []) {
    const e = reg.eq[it.k] || (reg.eq[it.k] = { name: it.name, n: 0, f: {} });
    e.name = it.name; e.n++; e.f[it.f] = (e.f[it.f] || 0) + 1;
  }
  reg.done.push(id);
  return reg;
}

// Lo que ve la web: por equipo, cuántos partidos y cuántas veces cada formación.
export function publico(reg) {
  const eq = (reg && reg.eq) || {};
  return { equipos: Object.keys(eq).map((k) => ({ name: eq[k].name, n: eq[k].n, f: eq[k].f })), partidos: ((reg && reg.done) || []).length };
}
