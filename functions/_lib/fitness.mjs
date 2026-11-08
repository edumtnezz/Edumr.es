// Puntos de liga de Futmondo ("fitness"): los 5 últimos partidos PUBLICADOS de un jugador, de más
// antiguo a más nuevo, uno por partido del EQUIPO (un 0 = no jugó).
//
// Problema (08/11/2026, Atlético–Barça): al acabar un partido, Futmondo marca el partido como
// terminado ("F") antes de publicar los puntos. Mientras tanto el último valor de "fitness" es el del
// partido anterior, y la web lo pintaba como si fuera el del partido nuevo (Hancko "12" y David "4"
// eran los puntos de la jornada 11).
//
// Cómo se sabe cuántos partidos lleva publicados Futmondo: el máximo de partidos entre los jugadores
// del equipo en el mercado (ver played.mjs). Y cuántos han terminado de verdad: los partidos
// terminados de SU EQUIPO. Ojo: la lista de partidos de un jugador que llegó tarde NO tiene los
// primeros partidos del equipo, así que contar solo su lista da un número de menos.

// Partidos terminados del equipo que Futmondo aún no ha publicado (0 si todo está al día o si falta
// algún dato: sin datos no se inventa un retraso).
export function fitLagOf(published, finished) {
  const pub = Number(published) || 0;
  const fin = Number(finished) || 0;
  if (pub <= 0 || fin <= 0) return 0;
  return Math.max(0, fin - pub);
}

// Posición en el array "fitness" del partido que ocupa el puesto `finishedUpTo` (partidos terminados
// del equipo hasta ese partido, él incluido). Devuelve null si Futmondo aún no lo ha publicado o si
// ya no cabe en los 5 últimos.
export function fitIndex(fitLength, published, finishedUpTo) {
  const len = Number(fitLength) || 0;
  const pub = Number(published) || 0;
  const fin = Number(finishedUpTo) || 0;
  if (len <= 0 || pub <= 0 || fin <= 0) return null;
  if (fin > pub) return null; // todavía sin publicar
  const k = len - 1 - (pub - fin);
  return k >= 0 && k < len ? k : null;
}
