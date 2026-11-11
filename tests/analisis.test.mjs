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
  assert.equal(a.length, 1); // uno por pasada, repartidos en el tiempo
  const ahora = Date.now();
  const propias = a.map((x) => ({ key: x.key, createdAt: ahora }));
  assert.equal(elegirAnalisis(ps, J, propias, ahora + 10 * 60e3, 3).length, 0); // antes de 40 min no sale otro
  const ya = elegirAnalisis(ps, J, propias, ahora + 41 * 60e3, 3);
  assert.equal(ya.length, 1);
  assert.equal(ya.some((x) => a.some((y) => y.key === x.key)), false);
  assert.notEqual(ya[0].p.id, a[0].p.id); // un solo análisis por jugador y jornada
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

// Criterio del chollo (Edu 10/11/2026): valor que no baja y, si es portero/defensa, rival que no marque mucho
const gol = (o) => { const a = []; Object.defineProperty(a, "__goles", { value: o }); return a; };
const equipos = (rival, gf) => { const g = {}; for (let i = 0; i < 12; i++) g["eq" + i] = { gf: 4 + i, gc: 5, pj: 6 }; g[rival] = { gf, gc: 5, pj: 6 }; return g; };
const CH = (o) => P(Object.assign({ id: "c1", name: "Gulacsi", role: "portero", team: "Villarreal", rivalFf: "Barcelona", value: 5e6, avg: 7.6, prob: 90, chg7: 1e5, fitness: [10, 9, 5, 4, 6] }, o));
test("chollo: no si su valor está bajando", () => {
  assert.equal(reglas(CH({ chg7: -6e5 }), J, gol(equipos("barcelona", 5))).some((x) => x.tipo === "chollo"), false);
});
test("chollo: no si es portero y el rival marca mucho", () => {
  assert.equal(reglas(CH(), J, gol(equipos("barcelona", 30))).some((x) => x.tipo === "chollo"), false);
});
test("chollo: no si es portero y no hay datos de goles del rival", () => {
  assert.equal(reglas(CH(), J, null).some((x) => x.tipo === "chollo"), false);
});
test("chollo: sí si el valor sube y el rival marca poco", () => {
  assert.equal(reglas(CH(), J, gol(equipos("barcelona", 2))).some((x) => x.tipo === "chollo"), true);
});
const ME = (o) => CH(Object.assign({ id: "c2", name: "Medio", role: "centrocampista", fitness: [7, 8, 7, 8, 7] }, o));
const eqDef = (rival, gc) => { const g = {}; for (let i = 0; i < 12; i++) g["eq" + i] = { gf: 5, gc: 4 + i, pj: 6 }; g[rival] = { gf: 5, gc, pj: 6 }; return g; };
test("chollo: un medio no se recomienda si el rival encaja muy poco", () => {
  assert.equal(reglas(ME(), J, gol(eqDef("barcelona", 2))).some((x) => x.tipo === "chollo"), false);
  assert.equal(reglas(ME(), J, gol(eqDef("barcelona", 30))).some((x) => x.tipo === "chollo"), true);
});
test("chollo: no si juega fuera, está en duda o en bache", () => {
  const g = gol(eqDef("barcelona", 30));
  assert.equal(reglas(ME({ casaFf: false }), J, g).some((x) => x.tipo === "chollo"), false);
  assert.equal(reglas(ME({ status: "doubt" }), J, g).some((x) => x.tipo === "chollo"), false);
  assert.equal(reglas(ME({ fitness: [8, 9, 8, 2, 2] }), J, g).some((x) => x.tipo === "chollo"), false);
});

test("fijo: juega casi todo, casi nunca lo cambian y puntúa", () => {
  const p = P({ id: "f1", name: "Fijo", fitness: [7, 6, 7, 8, 6], avg: 6.8, matches: 11, status: "", chg7: 1e5 });
  const mins = { f1: { n: 12, j: 12, t: 1020, c: 10, s: 2, x: 70, b: 0, bm: 0, z: 0, rd: 0 } };
  const r = reglas(p, J, gol(eqDef("valencia", 30)), 11, mins).find((x) => x.tipo === "fijo");
  assert.ok(r);
  assert.match(r.cuerpo, /12\*\* de \*\*12\*\* partidos/);
  assert.match(r.cuerpo, /completado \*\*10\*\* de 12/);
});
test("fijo: no se recomienda si el valor baja o falta el dato de valor", () => {
  const mins = { f1: { n: 12, j: 12, t: 1020, c: 10, s: 2 } };
  const base = { id: "f1", name: "Fijo", fitness: [7, 6, 7, 8, 6], avg: 6.8, matches: 11, status: "" };
  assert.equal(reglas(P({ ...base, chg7: 1e5 }), J, gol(eqDef("valencia", 30)), 11, mins).some((x) => x.tipo === "fijo"), true);
  assert.equal(reglas(P({ ...base, chg7: -1e5 }), J, gol(eqDef("valencia", 30)), 11, mins).some((x) => x.tipo === "fijo"), false);
  assert.equal(reglas(P(base), J, gol(eqDef("valencia", 30)), 11, mins).some((x) => x.tipo === "fijo"), false);
  assert.equal(reglas(P({ ...base, chg7: 1e5, casaFf: false }), J, gol(eqDef("valencia", 30)), 11, mins).some((x) => x.tipo === "fijo"), false);
  assert.equal(reglas(P({ ...base, chg7: 1e5 }), J, gol(eqDef("valencia", 1)), 11, mins).some((x) => x.tipo === "fijo"), false); // rival que encaja muy poco
  assert.equal(reglas(P({ ...base, chg7: 1e5, role: "portero" }), J, gol(equipos("valencia", 30)), 11, mins).some((x) => x.tipo === "fijo"), false); // portero con rival que marca mucho
});
test("fijo: no sale sin minutos, ni si lo cambian mucho, ni si no puntúa", () => {
  const p = P({ id: "f1", fitness: [7, 6, 7, 8, 6], avg: 6.8, matches: 11 });
  assert.equal(reglas(p, J, null, 11, null).some((x) => x.tipo === "fijo"), false);
  assert.equal(reglas(p, J, null, 11, { f1: { n: 12, j: 12, t: 800, c: 4, s: 8 } }).some((x) => x.tipo === "fijo"), false);
  assert.equal(reglas(P({ id: "f1", fitness: [3, 4, 3, 5, 4], avg: 4, matches: 11 }), J, null, 11, { f1: { n: 12, j: 12, t: 1020, c: 10, s: 2 } }).some((x) => x.tipo === "fijo"), false);
});

test("revelación: barato, buena media, valor sube; no una estrella cara", () => {
  const p = P({ id: "r1", fitness: [8, 9, 7, 9, 10], avg: 8.5, matches: 11, value: 6e6, chg7: 5e5, chg14: 9e5, change: 1e5, prob: 85, status: "" });
  const t = (q) => reglas(q, J, null, 11, null).map((x) => x.tipo);
  assert.ok(t(p).includes("revelacion"));
  assert.equal(t({ ...p, value: 100e6 }).includes("revelacion"), false);
  assert.equal(t({ ...p, chg7: -1e5, chg14: -1e5 }).includes("revelacion"), false);
  assert.equal(t({ ...p, prob: 50 }).includes("revelacion"), false);
});

import { cambioReal } from "../cron/src/analisis.js";
test("solo se vuelve a hablar de un jugador en la misma jornada si cambia algo real", () => {
  const prev = { v: 10e6, pr: 90, st: "", rv: "Betis", j: "12" };
  assert.equal(cambioReal(prev, { value: 10.4e6, prob: 85, status: "", rivalFf: "Betis" }), false);
  assert.equal(cambioReal(prev, { value: 11.2e6, prob: 90, status: "", rivalFf: "Betis" }), true); // precio
  assert.equal(cambioReal(prev, { value: 10e6, prob: 60, status: "", rivalFf: "Betis" }), true); // probabilidad
  assert.equal(cambioReal(prev, { value: 10e6, prob: 90, status: "doubt", rivalFf: "Betis" }), true); // estado
  assert.equal(cambioReal(prev, { value: 10e6, prob: 90, status: "", rivalFf: "Getafe" }), true); // rival
});
