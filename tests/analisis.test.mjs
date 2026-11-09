import test from "node:test";
import assert from "node:assert/strict";
import { reglas, elegirAnalisis, proximo } from "../cron/src/analisis.js";

const J = { matchday: 13, matches: [{ home: "Rayo Vallecano", away: "Valencia", day: "Sáb", date: "21/11", time: "16:15", tbc: false, live: null, aplazado: 0 }] };
const P = (o) => Object.assign({ id: "p1", name: "Camello", role: "delantero", team: "Rayo Vallecano", avg: 11, matches: 10, value: 41e6, prob: 80, fitness: [14, 12, 13, 3, 2], rivalFf: "Valencia", casaFf: true, jornadaFf: "13", status: "" }, o);

test("bajón: dos partidos flojos seguidos de un jugador de media alta", () => {
  const r = reglas(P(), J).find((x) => x.tipo === "bajon");
  assert.ok(r);
  assert.match(r.cuerpo, /11\*\* puntos en 10 partidos/);
  assert.match(r.cuerpo, /14, 12, 13, 3, 2/);
  assert.match(r.cuerpo, /Valencia\*\* en casa el Sáb 21\/11 a las 16:15/);
});
test("un 0 no es un bajón (no jugó)", () => {
  assert.equal(reglas(P({ fitness: [14, 12, 13, 0, 0] }), J).some((x) => x.tipo === "bajon"), false);
});
test("regular que flojea: Rafinha-style", () => {
  const r = reglas(P({ name: "Rafinha", avg: 7, fitness: [8, 7, 8, 7, 3], value: 20e6 }), J).find((x) => x.tipo === "regular");
  assert.ok(r);
  assert.match(r.titulo, /3/);
});
test("sin datos suficientes no se inventa nada", () => {
  assert.deepEqual(reglas(P({ fitness: [3, 4], matches: 2 }), J), []);
});
test("todo número del texto sale de los datos", () => {
  const p = P();
  const permitido = new Set(JSON.stringify(p).match(/\d+/g).concat(JSON.stringify(J).match(/\d+/g)));
  for (const r of reglas(p, J)) for (const n of (r.titulo + r.entradilla + r.cuerpo).match(/\d+/g) || []) {
    const ok = permitido.has(n) || [...permitido].some((x) => x.includes(n)) || n === String(Math.round(p.avg));
    assert.ok(ok, "número " + n + " no sale de los datos");
  }
});
test("no repite la misma noticia y hay variedad", () => {
  const ps = [P(), P({ id: "p2", name: "B", fitness: [8, 9, 9, 10, 9], avg: 6 }), P({ id: "p3", name: "C", value: 5e6, avg: 7, fitness: [7, 7, 6, 7, 8] })];
  const a = elegirAnalisis(ps, J, [], Date.now(), 3);
  assert.ok(a.length >= 2);
  const ya = elegirAnalisis(ps, J, a.map((x) => ({ key: x.key, createdAt: Date.now() })), Date.now(), 3);
  assert.equal(ya.some((x) => a.some((y) => y.key === x.key)), false);
});
test("próximo partido", () => {
  assert.equal(proximo(P(), J).hora, "16:15");
  assert.equal(proximo(P({ jornadaFf: "12" }), J).dia, "");
});

import { serieJornadas, canon } from "../cron/src/analisis.js";
test("puntos por jornada: solo con las jornadas reales del equipo", () => {
  const p = { team: "Barcelona" };
  const jug = { barcelona: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11] };
  assert.equal(serieJornadas(p, [4, 6, 8, 2, 9], jug, 10), "J6: 4 · J7: 6 · J9: 8 · J10: 2 · J11: 9");
  assert.equal(serieJornadas(p, [1, 2, 3], null, 10), null);
  assert.equal(canon("Barça"), canon("Barcelona"));
  assert.equal(canon("Atleti"), canon("Atlético de Madrid"));
});
