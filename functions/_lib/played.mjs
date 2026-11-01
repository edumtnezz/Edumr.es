// Partidos que ha JUGADO un equipo, no la jornada en curso.
// Con una jornada aplazada (Rayo–Athletic, J8) el número de jornada va por delante de los
// partidos jugados: la ficha de Unai Simón mostraba "9 de 10" cuando había jugado los 9 de 9
// de su equipo (y los minutos salían sobre 900 en vez de sobre 810).
// Dato real: en el mercado de Futmondo cada jugador trae cuántos partidos lleva jugados, así que
// el equipo ha jugado tantos como el máximo de sus jugadores (el que los ha jugado todos).
// Nunca se inventa: si no hay ningún jugador de ese equipo con datos, devuelve 0.
export function teamPlayedMatches(players, teamName, keyOf) {
  const key = keyOf(teamName);
  if (!key) return 0;
  let max = 0;
  (Array.isArray(players) ? players : []).forEach((p) => {
    if (!p || keyOf(p.team) !== key) return;
    const m = Number(p.matches) || 0;
    if (m > max) max = m;
  });
  return max;
}

// Denominador de una ficha (partidos sobre los que se calculan minutos y titularidad).
// - Si sabemos cuántos partidos ha jugado su equipo, ese es el número (sin pasarse de las
//   jornadas ya publicadas y sin bajar de los partidos que ha jugado el propio jugador).
// - Si no hay datos de su equipo, se usa la última jornada que aparece en su historial, que es
//   lo que se hacía antes; nunca se inventa una cifra.
export function playedDenominator(teamPlayed, playerLastJornada, publishedMatchdays, playerPlayed) {
  const team = Number(teamPlayed) || 0;
  const last = Number(playerLastJornada) || 0;
  const pub = Number(publishedMatchdays) || 0;
  const played = Number(playerPlayed) || 0;
  let base;
  if (team > 0) base = pub > 0 ? Math.min(team, pub) : team;
  else base = last > 0 && last <= (pub || last) ? last : pub;
  return Math.max(base, played);
}
