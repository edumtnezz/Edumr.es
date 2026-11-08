// Puntos de Futmondo guardados por jornada, para que al abrir un partido terminado ya estén.
// Todo sale de Futmondo (nunca se inventa): aquí solo hay lógica pura de "qué partidos faltan"
// y "cuándo se da por completo un equipo".

// Dos nombres de equipo son el mismo si sus claves (ya sin relleno) coinciden o una contiene a la otra.
export function sameTeam(a, b) {
  if (!a || !b) return false;
  return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
}

// Partidos terminados que todavía no tienen sus puntos guardados.
// - matches: lista de football-data ({ status, utcDate, homeTeam, awayTeam }).
// - done: claves de equipo ya guardadas para esa jornada.
// - Solo cuenta un partido pasados 105 min del inicio y hasta 40 h después.
export function pendingMatches(matches, done, keyOf, now) {
  const out = [];
  (Array.isArray(matches) ? matches : []).forEach((m) => {
    if (!m || (m.status !== "FINISHED" && m.status !== "AWARDED")) return;
    const t = Date.parse(m.utcDate) || 0;
    if (!t || now < t + 105 * 60000 || now > t + 40 * 3600000) return;
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
