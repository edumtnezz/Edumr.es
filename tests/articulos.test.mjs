import test from "node:test";
import assert from "node:assert/strict";
import { retorno, aVender, aFichar, clausulazos, paron, inicioJornada, esParon } from "../functions/_lib/articulos.mjs";

const NOW = Date.UTC(2026, 10, 15, 11);
const P = (o) => Object.assign({ id: o.name, est: "", estInfo: "", value: 10e6, avg: 6, points: 60, matches: 10, chg7: 0 }, o);

test("retorno: lee el texto del parte y no inventa fechas", () => {
  assert.equal(retorno("Rotura. Retorno estimado: Principios de Diciembre.", NOW).txt, "principios de diciembre");
  assert.equal(new Date(retorno("x. Retorno estimado: Mediados de Enero.", NOW).ms).getUTCFullYear(), 2027);
  assert.equal(retorno("x. Retorno estimado: Vuelta indefinida.", NOW).ms, Infinity);
  assert.equal(retorno("Roja directa.", NOW), null);
});
test("a vender: baja larga y sanos que caen; la baja corta y el que sube no salen", () => {
  const a = aVender([
    P({ name: "Largo", est: "lesionado", estInfo: "x. Retorno estimado: Finales de Mayo." }),
    P({ name: "Corto", est: "lesionado", estInfo: "x. Retorno estimado: Finales de Noviembre." }),
    P({ name: "Cae", chg7: -2166594 }), P({ name: "Sube", chg7: 2e6 }), P({ name: "LesionadoCae", est: "lesionado", estInfo: "", chg7: -3e6 }),
  ], 13, NOW);
  assert.match(a.body, /@ Largo \| Largo \| 10,0 M \| Vuelta: finales de mayo/);
  assert.match(a.body, /@ Cae \| Cae \| −2,2 M \| en 7 días · media 6,0/);
  assert.ok(!/Corto|Sube|LesionadoCae/.test(a.body));
  assert.equal(a.id, "artvender13");
});
test("a fichar: vuelve de lesión con buena media; el que vuelve con mala media no", () => {
  const ps = [P({ name: "Vuelve", avg: 8 }), P({ name: "Malo", avg: 2 }), P({ name: "Forma", avg: 9, chg7: 2.7e6 }), P({ name: "Duda", avg: 9, chg7: 3e6, est: "duda" })];
  const a = aFichar(ps, [{ id: "Vuelve", de: "lesionado", a: "ok", at: NOW - 86400000 }, { id: "Malo", de: "lesionado", a: "ok", at: NOW - 86400000 }, { id: "Forma", de: "ok", a: "duda", at: NOW }], 13, NOW);
  assert.match(a.body, /## Vuelven[\s\S]*@ Vuelve/);
  assert.match(a.body, /## En forma y subiendo[\s\S]*@ Forma \| Forma \| 9,0 \| de media · \+2,7 M en 7 días/);
  assert.ok(!/Malo|Duda/.test(a.body));
});
test("clausulazos: tres por franja, solo disponibles y con 6 partidos", () => {
  const ps = [P({ name: "A", value: 4e6, avg: 7 }), P({ name: "B", value: 4e6, avg: 9 }), P({ name: "C", value: 3e6, avg: 8 }), P({ name: "D", value: 2e6, avg: 6 }), P({ name: "Pocos", value: 2e6, avg: 12, matches: 2 }), P({ name: "Les", value: 2e6, avg: 12, est: "lesionado" })];
  const a = clausulazos(ps, 13);
  assert.deepEqual([...a.body.matchAll(/^@ (\w+)/gm)].map((m) => m[1]), ["B", "C", "A"]);
  assert.ok(!/cl[aá]usula de/i.test(a.body));
});
test("sin jugadores que cumplan no hay artículo", () => { assert.equal(aVender([P({ name: "Normal" })], 13, NOW), null); });
test("parón: faltan 5 días o más para el primer partido", () => {
  const ini = inicioJornada([{ date: "21/11", time: "14:00" }, { date: "20/11", time: "21:00" }], NOW);
  assert.equal(new Date(ini).toISOString(), "2026-11-20T20:00:00.000Z");
  assert.equal(esParon(ini, NOW), true);
  assert.equal(esParon(ini, NOW + 2 * 86400000), false);
  const a = paron([P({ name: "Llega", est: "lesionado", estInfo: "x. Retorno estimado: Finales de Noviembre." }), P({ name: "Sigue", est: "lesionado", estInfo: "x. Retorno estimado: Mediados de Enero." }), P({ name: "Sube", chg7: 2e6 })], 13, ini, NOW);
  assert.match(a.body, /## Pueden volver para la jornada 13[\s\S]*@ Llega[\s\S]*## Siguen de baja[\s\S]*@ Sigue[\s\S]*## Suben en el parón[\s\S]*@ Sube/);
});
