import test from "node:test";
import assert from "node:assert/strict";
import { compacto, dificultad, calendarioDificultad, oncePropio, aciertoOnces, previsionValor } from "../functions/_lib/analitica.mjs";

const jug = (id, team, ro, cats, pts) => ({ id, n: id, t: team, ro, m: cats.map((c, i) => [i + 1, 1, "rival", pts == null ? null : pts, c, c === "c" ? 90 : c === "s" ? 60 : c === "b" ? 20 : 0]) });

test("compacto: solo partidos terminados de su club actual, con puntos de la liga", () => {
  const c = compacto({ id: "x", name: "X", team: "Osasuna", role: "portero", matches: [{ r: 2, home: "Osasuna", away: "Málaga", finished: true, lg: 7 }, { r: 3, home: "Betis", away: "Sevilla", finished: true, lg: 9 }, { r: 4, home: "Getafe", away: "Osasuna", finished: false, lg: 1 }], participacion: { byJornada: [{ r: 2, cat: "completo", mins: 90 }] } });
  assert.deepEqual(c.m, [[2, 1, "malag", 7, "c", 90]]);
});

test("dificultad: quien más puntos concede es nivel 1; cinco niveles", () => {
  const ds = [];
  for (let t = 0; t < 20; t++) ds.push({ id: "p" + t, n: "p", t: "Equipo" + String.fromCharCode(65 + t) + "x", ro: "defensa", m: [1, 2, 3].map((r) => [r, 1, ("equipo" + String.fromCharCode(65 + ((t + 1) % 20)).toLowerCase() + "x").slice(0, 5) + "", 10 + t, "c", 90]) });
  // claves de 5 letras iguales («equip»): este caso solo comprueba que no revienta con claves repetidas
  assert.ok(Array.isArray(dificultad(ds)));
  const real = [{ id: "a", n: "a", t: "Getafe", ro: "defensa", m: [[1, 1, "barce", 2, "c", 90], [2, 0, "malag", 20, "c", 90], [3, 1, "barce", 4, "c", 90], [4, 1, "barce", 3, "c", 90]] }, { id: "b", n: "b", t: "Barcelona", ro: "defensa", m: [[1, 0, "getaf", 30, "c", 90], [2, 1, "getaf", 30, "c", 90], [3, 0, "getaf", 30, "c", 90]] }, { id: "c", n: "c", t: "Málaga", ro: "defensa", m: [[1, 1, "getaf", 1, "c", 90], [2, 1, "getaf", 1, "c", 90], [3, 1, "getaf", 1, "c", 90]] }];
  const d = dificultad(real);
  assert.equal(d[0].team, "Getafe"); assert.equal(d[0].nivel, 1); assert.ok(d[0].concede > 10);
  const cal = calendarioDificultad(d, { teams: { 1: { n: "Getafe" }, 2: { n: "Barça" } }, matches: [[13, 1, 2, "x"], [14, 2, 1, "x"]] }, 13, 2);
  assert.deepEqual(cal.jornadas, [13, 14]);
  const ba = cal.equipos.find((e) => e.team === "Barcelona");
  assert.equal(ba.celdas[0].casa, false); assert.equal(ba.celdas[0].nivel, 1); assert.equal(ba.media, 1);
});

test("once propio: 11 con el dibujo del último partido; el lesionado fuera", () => {
  const eq = [jug("por", "T", "portero", ["c", "c", "c", "c", "c"]), jug("por2", "T", "portero", ["n", "n", "n", "n", "n"])];
  for (let i = 0; i < 4; i++) eq.push(jug("d" + i, "T", "defensa", ["c", "c", "c", "c", "c"]));
  eq.push(jug("d4", "T", "defensa", ["b", "n", "b", "n", "n"]));
  for (let i = 0; i < 4; i++) eq.push(jug("m" + i, "T", "centrocampista", ["c", "s", "c", "c", "c"]));
  for (let i = 0; i < 2; i++) eq.push(jug("f" + i, "T", "delantero", ["c", "c", "s", "c", "c"]));
  const o = oncePropio(eq, null, {});
  assert.equal(o.xi.length, 11); assert.equal(o.forma, "4-4-2"); assert.ok(!o.xi.some((x) => x.id === "d4"));
  const o2 = oncePropio(eq, null, { d0: { e: "lesionado" } });
  assert.ok(!o2.xi.some((x) => x.id === "d0")); assert.ok(o2.xi.some((x) => x.id === "d4"));
  assert.equal(oncePropio(eq.map((p) => ({ ...p, m: p.m.slice(0, 2) })), null, {}), null);
  const a = aciertoOnces(eq, 4); assert.equal(a.pct, 100);
});

test("previsión de valor: solo con cambios de 50.000 € o más", () => {
  assert.equal(previsionValor(90000, 120000), null); // menos de 100.000 €
  assert.equal(previsionValor(402000, -50000), null); // sin racha: ayer bajó
  assert.equal(previsionValor(402000, 0), null);
  assert.deepEqual(previsionValor(402345, 380000, 9e6), { dias: 3, min: 400000 });
  assert.deepEqual(previsionValor(-287740, -243942, 15480630), { dias: 3, min: -280000 });
  assert.deepEqual(previsionValor(-300000, -200000, 1120000), { dias: 3, min: -120000 }); // no baja del millón
  assert.equal(previsionValor(-300000, -200000, 1000000), null);
});
