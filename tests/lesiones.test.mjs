import test from "node:test";
import assert from "node:assert/strict";
import { parseLesiones, marcarLesiones } from "../functions/_lib/lesiones.mjs";

const html = `<table class="items"><tbody>
<tr class="odd"><td>26/27</td><td>Lesión de cadera</td><td>14/11/2026</td><td></td><td>7 dias</td><td>1</td></tr>
<tr class="even"><td>26/27</td><td>Rotura del ligamento interno de la rodilla</td><td>01/07/2026</td><td>17/10/2026</td><td>109 dias</td><td>14</td></tr>
</tbody></table>`;

test("lee periodos de lesión, también el que sigue abierto", () => {
  const l = parseLesiones(html);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { t: "Lesión de cadera", d: "2026-11-14", h: "" });
  assert.deepEqual(l[1], { t: "Rotura del ligamento interno de la rodilla", d: "2026-07-01", h: "2026-10-17" });
});
test("sin tabla no devuelve nada", () => assert.deepEqual(parseLesiones("<html></html>"), []));

test("solo marca los no jugados que caen dentro de una lesión", () => {
  const l = parseLesiones(html);
  const ps = [
    { j: 5, cat: "n", f: "2026-09-20T19:00:00.000Z" },   // dentro de la rotura
    { j: 10, cat: "n", f: "2026-10-30T19:00:00.000Z" },  // fuera de cualquier lesión: no se dice nada
    { j: 11, cat: "c", f: "2026-09-21T19:00:00.000Z" },  // jugó: no se toca
    { j: 13, cat: "n", f: "2026-11-22T14:00:00.000Z" },  // lesión abierta
    { j: 4, cat: "n" },                                  // sin fecha: no se inventa
  ];
  const r = marcarLesiones(ps, l);
  assert.match(r[0].les, /ligamento/);
  assert.equal(r[1].les, undefined);
  assert.equal(r[2].les, undefined);
  assert.match(r[3].les, /cadera/);
  assert.equal(r[4].les, undefined);
});

import { parseEquipos, parseJugadores, slugEquipo, slugJugador, parseLesionesFichajes } from "../functions/_lib/lesiones.mjs";
test("fichajes.com: equipo, jugador y tabla", () => {
  const eq = parseEquipos('<a href="https://www.fichajes.com/equipo/fc-barcelona/">x</a><a href="https://www.fichajes.com/equipo/fc-barcelona/plantilla/">y</a><a href="https://www.fichajes.com/equipo/real-madrid-cf/">z</a><a href="https://www.fichajes.com/equipo/club-atletico-de-madrid/">a</a><a href="https://www.fichajes.com/equipo/real-sociedad-de-futbol/">b</a>');
  assert.deepEqual(eq, ["fc-barcelona", "real-madrid-cf", "club-atletico-de-madrid", "real-sociedad-de-futbol"]);
  assert.equal(slugEquipo("Barcelona", eq), "fc-barcelona");
  assert.equal(slugEquipo("Real Madrid", eq), "real-madrid-cf");
  assert.equal(slugEquipo("Atlético de Madrid", eq), "club-atletico-de-madrid");
  assert.equal(slugEquipo("Real Sociedad", eq), "real-sociedad-de-futbol");
  assert.equal(slugEquipo("Inventado", eq), "");
  const js = parseJugadores('<a href="https://www.fichajes.com/jugador/frenkie-de-jong/">a</a><a href="https://www.fichajes.com/jugador/pedro-gonzalez-lopez/">b</a><a href="https://www.fichajes.com/jugador/jose-gonzalez/">c</a>');
  assert.equal(slugJugador("De Jong", js), "frenkie-de-jong");
  assert.equal(slugJugador("Gonzalez", js), ""); // dos posibles: no se adivina
  const t = parseLesionesFichajes("<h2>Histórico de lesiones</h2><table><tr><th>Temporada</th><th>Tipo</th><th>Inicio</th><th>Final</th></tr><tr><td>2026/2027</td><td>Lesión del ligamento de la rodilla</td><td>01/07/2026</td><td>18/10/2026</td><td>106</td><td>12</td></tr></table>");
  assert.deepEqual(t, [{ t: "Lesión del ligamento de la rodilla", d: "2026-07-01", h: "2026-10-18" }]);
});
