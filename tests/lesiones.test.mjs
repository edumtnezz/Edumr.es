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
