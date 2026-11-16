import test from "node:test";
import assert from "node:assert/strict";
import { retorno, aVender, aFichar, clausulazos, paron, inicioJornada, esParon, subidasEntre, inicioParon } from "../functions/_lib/articulos.mjs";

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
  assert.match(a.body, /@ Largo \| Largo \| Finales de mayo \| vuelta \| -/);
  assert.match(a.body, /@ Cae \| Cae \| −2,2 M \| en 7 días \| −309\.513 € al día de media/);
  assert.ok(!/Corto|Sube|LesionadoCae/.test(a.body));
  assert.equal(a.id, "artvender13");
});
test("a fichar: vuelve de lesión con buena media; el que vuelve con mala media no", () => {
  const ps = [P({ name: "Vuelve", avg: 8 }), P({ name: "Malo", avg: 2 }), P({ name: "Forma", avg: 9, chg7: 2.7e6 }), P({ name: "Duda", avg: 9, chg7: 3e6, est: "duda" })];
  const a = aFichar(ps, [{ id: "Vuelve", de: "lesionado", a: "ok", at: NOW - 86400000 }, { id: "Malo", de: "lesionado", a: "ok", at: NOW - 86400000 }, { id: "Forma", de: "ok", a: "duda", at: NOW }], 13, NOW);
  assert.match(a.body, /## Vuelven[\s\S]*@ Vuelve/);
  assert.match(a.body, /## Vuelven[\s\S]*@ Vuelve \| Vuelve \| 8,0 \| de media \| Vuelve de lesión/);
  assert.match(a.body, /## En forma y subiendo[\s\S]*@ Forma \| Forma \| \+2,7 M \| en 7 días \| \+385\.714 € al día de media/);
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
  assert.match(a.body, /## Pueden volver para la jornada 13[\s\S]*@ Llega[\s\S]*## Siguen de baja[\s\S]*@ Sigue/);
  assert.ok(!/más han subido/.test(a.body)); // sin historial no hay gráfica
  // Con historial propio: los que más suben desde el día siguiente al lunes en que acabó la jornada anterior
  assert.equal(inicioParon(ini), "2026-11-10");
  const vh = { days: {}, copied: {} };
  ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].forEach((d, k) => { vh.days[d] = { Sube: 10e6 + k * 1e6, Llega: 5e6, Sigue: 5e6 - k * 1e5 }; });
  vh.days["2026-11-10"] = vh.days["2026-11-11"]; // día sin dato fiable: no se usa
  vh.days["2026-11-15"] = vh.days["2026-11-14"]; // foto de antes de actualizar (igual que la de ayer): se salta
  const sub = subidasEntre(vh, [P({ name: "Sube" }), P({ name: "Llega" }), P({ name: "Sigue" })], "2026-11-10", "2026-11-15");
  assert.deepEqual(sub.map((x) => x.p.name + ":" + x.sube), ["Sube:3000000"]);
  const b = paron([P({ name: "Sube" })], 13, ini, NOW, sub);
  assert.match(b.body, /~ Sube \| Sube \| 10000000,11000000,12000000,13000000 \| 11\/11 \| 14\/11/);
  assert.deepEqual(subidasEntre({ days: { "2026-11-12": {} } }, [], "2026-11-10", "2026-11-13"), []); // falta el primer día: sin gráfica
});

import { cuerpoAHtml } from "../functions/_lib/noticia-cuerpo.mjs";
test("cuerpo: fila de jugador y gráfica de valor", () => {
  const h = cuerpoAHtml("## Lista\n@ abc123 | Koke | −2,2 M | en 7 días | −309.513 € al día de media\n~ abc123 | Koke | 10000000,11000000,13000000 | 10/11 | 13/11");
  assert.match(h, /class="art-pl" data-pid="abc123"/);
  assert.match(h, /<span class="art-pl-v"><b>−2,2 M<\/b><small>en 7 días<\/small>/);
  assert.match(h, /class="art-gr"[\s\S]*\+3,0 M · \+30 %[\s\S]*10\/11 · 10,0 M[\s\S]*13\/11 · 13,0 M/);
});

test("subidas y bajadas: id fijo, cambio real de hoy y nada si no hay cambios", async () => {
  const { subidasBajadas } = await import("../functions/_lib/articulos.mjs");
  const ps = [{ id: 1, name: "Uno", value: 11e6, change: 1e6 }, { id: 2, name: "Dos", value: 4e6, change: -500000 }, { id: 3, name: "Tres", value: 5e6, change: 0 }];
  const a = subidasBajadas(ps, "16/11");
  assert.equal(a.id, "artmercado");
  assert.equal(a.title, "Subidas y bajadas del 16/11");
  assert.match(a.body, /^@ 1 \| Uno \| \+1 M \| hoy \| \+10,0 % sobre ayer$/m);
  assert.match(a.body, /^@ 2 \| Dos \| −500k \| hoy \| −11,1 % sobre ayer$/m);
  assert.doesNotMatch(a.body, /Tres/);
  assert.equal(subidasBajadas([{ id: 3, name: "Tres", value: 5e6, change: 0 }], "16/11"), null);
});
