import test from "node:test";
import assert from "node:assert/strict";
import { puntuarDuelo, compararOnce } from "../functions/_lib/analitica.mjs";

test("duelo por jugador: Brier de E y de F contra los titulares reales", () => {
  const ids = Array.from({ length: 11 }, (_, i) => "p" + i);
  const reales = new Set([...ids.slice(0, 9), "x1", "x2"]);
  const pe = {}, pf = {};
  ids.forEach((id, i) => { pe[id] = i < 9 ? 90 : 10; pf[id] = 70; });
  const r = puntuarDuelo({ propio: ids, ff: ids, pe, pf }, reales);
  assert.equal(r.jug.n, 11);
  assert.ok(r.jug.be < r.jug.bf); // E acierta más en este caso
  assert.equal(r.jug.real, 9);
});
test("sin % de los dos no hay Brier", () => {
  const ids = Array.from({ length: 11 }, (_, i) => "p" + i);
  const r = puntuarDuelo({ propio: ids, ff: ids }, new Set(ids));
  assert.equal(r.jug, undefined);
});
test("compararOnce devuelve el % de FutbolFantasy de cada titular emparejado", () => {
  const jug = [{ id: "a1", n: "Pedro Gómez", ro: "delantero" }, { id: "a2", n: "Luis Pérez", ro: "defensa" }];
  const c = compararOnce({ xi: [{ id: "a1", name: "Pedro Gómez" }] }, "Equipo", [{ name: "Pedro Gómez", full: "Pedro Gómez", prob: 85 }, { name: "Luis Pérez", full: "Luis Pérez", prob: 70 }], jug);
  assert.equal(c.pf.a1, 85);
  assert.equal(c.pf.a2, 70);
});
