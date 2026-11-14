// Minutos de un jugador en un partido, sacados de la alineación de FotMob (titulares, suplentes y cambios con su minuto).
// Se usa SOLO para los partidos de los que Futmondo no da detalle; los puntos nunca salen de aquí.

const norm = (n) => String(n || "").toLowerCase().replace(/[øØ]/g, "o").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["de", "la", "el", "club", "fc", "cf", "ud", "cd", "rcd", "sd", "rc", "real"]);
const ALIAS = { atleti: "atletico madrid", barca: "barcelona", athletic: "athletic club" };
const toks = (n) => { let k = norm(n); if (ALIAS[k]) k = ALIAS[k]; return k.split(" ").filter((w) => w && !STOP.has(w)); };
export function mismoEquipo(a0, b0) { const a = toks(a0), b = toks(b0); return !!(a.length && b.length && a.some((w) => b.indexOf(w) >= 0)); }

// ¿Es este jugador de FotMob el que buscamos? Nombre igual, o el nombre corto de Futmondo dentro del largo de FotMob.
function esEl(nombreFotmob, buscado) {
  const n = norm(nombreFotmob), p = norm(buscado);
  if (!n || !p) return false;
  return n === p || (" " + n + " ").indexOf(" " + p + " ") >= 0 || (" " + p + " ").indexOf(" " + n + " ") >= 0;
}

// De la alineación de UN equipo: { c: "t" titular | "s" entró desde el banquillo | "b" banquillo sin jugar | "x" fuera de la convocatoria, mins }
// Devuelve null si no se puede saber con seguridad (dos jugadores con ese nombre, expulsado sin minuto, sin alineación).
export function minutosEnAlineacion(equipo, nombre) {
  if (!equipo || !Array.isArray(equipo.starters) || equipo.starters.length < 11) return null;
  const tit = equipo.starters.filter((x) => esEl(x.name, nombre)), sup = (equipo.subs || []).filter((x) => esEl(x.name, nombre));
  if (tit.length + sup.length > 1) return null;
  if (!tit.length && !sup.length) return { c: "x", mins: 0 };
  const j = tit[0] || sup[0], pf = j.performance || {};
  const evs = Array.isArray(pf.substitutionEvents) ? pf.substitutionEvents : [];
  const t = (tipo) => { const e = evs.find((x) => x && x.type === tipo); return e && Number(e.time) > 0 ? Math.min(90, Number(e.time)) : 0; };
  const roja = (pf.events || []).some((e) => e && /red|secondyellow/i.test(String(e.type || "")));
  const sale = t("subOut"), entra = t("subIn");
  if (tit.length) {
    if (sale) return { c: "t", mins: sale };
    if (roja) return null; // expulsado: FotMob no da aquí el minuto y no se inventa
    return { c: "t", mins: 90 };
  }
  if (!entra) return { c: "b", mins: 0 };
  if (roja && !sale) return null;
  return { c: "s", mins: Math.max(1, (sale || 90) - entra) };
}

// Busca el partido en la lista del día de FotMob y devuelve su id (solo si está terminado)
export function partidoDelDia(lista, home, away) {
  for (const lg of ((lista && lista.leagues) || [])) {
    for (const m of (lg.matches || [])) {
      if (mismoEquipo(home, m.home && (m.home.longName || m.home.name)) && mismoEquipo(away, m.away && (m.away.longName || m.away.name))) return m.status && m.status.finished ? m : null;
    }
  }
  return null;
}
