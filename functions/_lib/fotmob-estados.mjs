// Estado físico según FotMob: la lista de «no disponibles» que cada club tiene para su próximo partido.
// Segunda fuente de ESTADO (20/11/2026, solo para noticias): precios, puntos y minutos siguen siendo de Futmondo.
// Nada de aquí se inventa: lo que no se reconoce se descarta (mejor sin noticia que con un dato dudoso).
import { emparejar, clubKey } from "./estados.mjs";

export const FM_MATCHES = (d) => "https://www.fotmob.com/api/data/matches?date=" + d + "&timezone=Europe%2FMadrid&ccode3=ESP";
export const FM_DETAIL = (id) => "https://www.fotmob.com/api/data/matchDetails?matchId=" + id;
export const FM_LIGA = 87;

const MES = { january: "enero", february: "febrero", march: "marzo", april: "abril", may: "mayo", june: "junio", july: "julio", august: "agosto", september: "septiembre", october: "octubre", november: "noviembre", december: "diciembre" };
const PARTE = { early: "principios de", mid: "mediados de", late: "finales de" };

// «Early December 2026» → «principios de diciembre de 2026». Devuelve:
//   { ok: true, duda: true }              si es «Doubtful»
//   { ok: true, entrena: true }           si «Back in training» (ya entrena: no se cuenta como baja)
//   { ok: true, retorno: "…" }            si se entiende el plazo (o no hay plazo)
//   { ok: false }                         si el plazo es un texto que no reconocemos
export function retornoEs(er) {
  const s = String(er || "").trim();
  if (!s) return { ok: true, retorno: "" };
  if (/^doubtful$/i.test(s)) return { ok: true, duda: true, retorno: "" };
  if (/^unknown$/i.test(s)) return { ok: true, retorno: "" };
  if (/^out for (the )?season$/i.test(s)) return { ok: true, retorno: "final de temporada" };
  if (/^back in training$/i.test(s)) return { ok: true, entrena: true, retorno: "" }; // ya entrena: no es una mala noticia ni sabemos el plazo
  let m = s.match(/^about (\d+)(?:-(\d+))? weeks?$/i);
  if (m) return { ok: true, retorno: "dentro de " + m[1] + (m[2] ? "-" + m[2] : "") + (m[2] || m[1] !== "1" ? " semanas" : " semana") };
  m = s.match(/^(early|mid|late)\s+([a-z]+)(?:\s+(\d{4}))?$/i);
  if (m && MES[m[2].toLowerCase()]) return { ok: true, retorno: PARTE[m[1].toLowerCase()] + " " + MES[m[2].toLowerCase()] + (m[3] ? " de " + m[3] : "") };
  return { ok: false };
}

// Un «no disponible» de FotMob → nuestro estado { e, info } (o null si no cuenta: selección, texto raro…)
export function estadoFotmob(u) {
  const t = u && u.unavailability && u.unavailability.type;
  const er = u && u.unavailability && u.unavailability.expectedReturn;
  if (t === "suspension") return { e: "sancionado", info: "" };
  if (t !== "injury") return null;
  const r = retornoEs(er);
  if (!r.ok) return null;
  if (r.entrena) return null;
  if (r.duda) return { e: "duda", info: "" };
  return { e: "lesionado", info: r.retorno ? "Retorno estimado: " + r.retorno + "." : "" };
}

// Partidos de LaLiga de la lista de un día de FotMob que aún no han terminado
export function partidosPendientes(lista) {
  const out = [];
  for (const lg of ((lista && lista.leagues) || [])) {
    if (lg.id !== FM_LIGA && lg.primaryId !== FM_LIGA) continue;
    for (const m of lg.matches || []) if (m && m.id && !(m.status && (m.status.finished || m.status.cancelled))) out.push(m);
  }
  return out;
}

// De un partido (matchDetails): para cada equipo, sus «no disponibles». Devuelve [] si FotMob aún no da la alineación.
export function equiposDelPartido(det) {
  const l = det && det.content && det.content.lineup;
  const out = [];
  if (!l) return out;
  for (const k of ["homeTeam", "awayTeam"]) {
    const t = l[k];
    if (!t || !t.name || !Array.isArray(t.unavailable) || !l.lineupType) continue;
    out.push({ team: t.name, lista: t.unavailable.map((u) => ({ id: u.id, name: u.name, ...estadoFotmob(u) })).filter((x) => x.e) });
  }
  return out;
}

// Empareja los jugadores de FotMob con los de Futmondo (mismo club y nombre; si hay duda, no empareja)
export function fotoFotmob(equipos, fmPlayers) {
  const bw = [], teams = {};
  equipos.forEach((eq, i) => { teams[i + 1] = { name: eq.team }; for (const u of eq.lista) bw.push({ id: u.id, name: u.name, teamID: i + 1, position: 0 }); });
  const m = emparejar(bw, teams, fmPlayers);
  const cubiertos = new Set(equipos.map((e) => clubKey(e.team)));
  const foto = {};
  for (const eq of equipos) for (const u of eq.lista) {
    const f = m.get(u.id);
    if (f) foto[f.id] = { e: u.e, info: u.info, at: 0 };
  }
  return { foto, cubiertos };
}

// Une la foto nueva con la anterior. Los jugadores de un club cuyo partido hemos leído y que ya no aparecen vuelven a «ok»;
// los de clubes que no hemos leído (su próximo partido aún no está) se quedan como estaban, para no repetir cambios.
export function unirFotos(prev, cur, cubiertos, fmPlayers, now) {
  const out = {}, eventos = [];
  const club = new Map((fmPlayers || []).map((p) => [p.id, clubKey(p.team)]));
  for (const id of Object.keys(prev || {})) {
    const a = prev[id];
    if (cur[id]) continue;
    if (cubiertos.has(club.get(id))) { if (a.e !== "ok") eventos.push({ id, de: a.e, a: "ok", info: "", at: now, fuenteAt: 0 }); }
    else out[id] = a;
  }
  for (const id of Object.keys(cur)) {
    const a = (prev && prev[id]) || { e: "ok" }, b = cur[id];
    out[id] = { e: b.e, info: b.info, at: a.e === b.e && a.at ? a.at : now };
    // Solo cuenta un cambio de ESTADO (no de texto del plazo) y solo si ya había una foto anterior
    if (prev && a.e !== b.e) eventos.push({ id, de: a.e, a: b.e, info: b.info, at: now, fuenteAt: 0 });
  }
  return { foto: out, eventos };
}
