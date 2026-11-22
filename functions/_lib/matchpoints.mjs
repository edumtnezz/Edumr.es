// Puntos de Futmondo guardados por jornada, para que al abrir un partido terminado ya estén.
// Todo sale de Futmondo (nunca se inventa): aquí solo hay lógica pura de "qué partidos faltan"
// y "cuándo se da por completo un equipo".

// 22/11/2026: el calendario llama «Barça» al Barcelona y Futmondo «Barcelona». Con la clave de equipo («teamKey» quita la primera mayúscula) salían
// «arca» y «arcelona», no se emparejaban y el partido del Barça se guardaba SIN sus jugadores: aviso de Telegram sin puntos y con «arca – Villarreal».
// Esta clave los iguala. No cambiar la clave de los demás equipos: hay claves guardadas en KV con la forma antigua.
export function claveClub(k) {
  return k === "arca" || k === "barca" ? "arcelona" : k;
}

// Dos nombres de equipo son el mismo si sus claves (ya sin relleno) coinciden o una contiene a la otra.
export function sameTeam(a, b) {
  if (!a || !b) return false;
  return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
}

// Partidos terminados que todavía no tienen sus puntos guardados.
// - matches: lista de football-data ({ status, utcDate, homeTeam, awayTeam }).
// - done: claves de equipo ya guardadas para esa jornada.
// - Un partido terminado cuenta pasados 105 min del inicio y hasta 40 h después.
// - football-data tarda a veces más de 3 h en cerrar un partido (Athletic–Espanyol, 20/11/2026: Futmondo ya
//   había publicado los puntos y aquí seguía "en juego"). Por eso un partido aún sin cerrar también se mira,
//   pasados 110 min y hasta 4 h: es solo una consulta de prueba a Futmondo, que decide si ya hay puntos.
export function pendingMatches(matches, done, keyOf, now) {
  const out = [];
  (Array.isArray(matches) ? matches : []).forEach((m) => {
    if (!m) return;
    const fin = m.status === "FINISHED" || m.status === "AWARDED";
    const abierto = m.status === "IN_PLAY" || m.status === "PAUSED" || m.status === "TIMED" || m.status === "SCHEDULED";
    if (!fin && !abierto) return;
    const t = Date.parse(m.utcDate) || 0;
    if (!t) return;
    if (fin ? (now < t + 105 * 60000 || now > t + 40 * 3600000) : (now < t + 110 * 60000 || now > t + 4 * 3600000)) return;
    const h = keyOf((m.homeTeam && (m.homeTeam.shortName || m.homeTeam.name)) || "");
    const a = keyOf((m.awayTeam && (m.awayTeam.shortName || m.awayTeam.name)) || "");
    if (!h || !a) return;
    const isDone = (k) => (done || []).some((d) => sameTeam(d, k));
    if (isDone(h) && isDone(a)) return;
    out.push({ home: h, away: a, t });
  });
  return out;
}

// Jugadores del mercado que pertenecen a alguno de esos equipos.
export function rosterFor(players, teamKeys, keyOf) {
  return (Array.isArray(players) ? players : []).filter((p) => {
    if (!p || !p.id) return false;
    const pk = keyOf(p.team || "");
    return !!pk && teamKeys.some((k) => sameTeam(pk, k));
  });
}

// results: { id: { p, f } | null }. El partido se da por completo cuando casi toda la plantilla
// ya tiene su puntuación final (≥ 80 % y al menos 14 jugadores). Si no, se vuelve a mirar.
export function isComplete(results, rosterSize) {
  const ids = Object.keys(results || {});
  const fin = ids.filter((id) => results[id] && results[id].f === true && results[id].p != null).length;
  return fin >= 14 && rosterSize > 0 && fin / rosterSize >= 0.8;
}
