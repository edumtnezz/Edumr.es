import test from "node:test";
import assert from "node:assert/strict";
import { probTitular, backtest } from "../functions/_lib/probjugar.mjs";
test("con menos de 3 partidos no hay dato", () => { assert.equal(probTitular([[1, 90, 0, 0], [2, 90, 0, 0]]), null); });
test("siempre titular da 1 y nunca juega da 0", () => {
  assert.equal(probTitular([[1, 90, 0, 0], [2, 80, 0, 0], [3, 90, 0, 0]]), 1);
  assert.equal(probTitular([[1, 0, 0, 0], [2, 0, 0, 0], [3, 0, 0, 0]]), 0);
});
test("lo reciente pesa más y el suplente que entra no cuenta como titular", () => {
  const sube = probTitular([[1, 0, 0, 0], [2, 0, 0, 0], [3, 90, 0, 0], [4, 90, 0, 0], [5, 90, 0, 0]]);
  const baja = probTitular([[1, 90, 0, 0], [2, 90, 0, 0], [3, 0, 0, 0], [4, 0, 0, 0], [5, 0, 0, 0]]);
  assert.ok(sube > baja); assert.equal(probTitular([[1, 20, 1, 0], [2, 20, 1, 0], [3, 20, 1, 0]]), 0);
});
test("la prueba con el pasado cuenta partidos", () => {
  const r = backtest({ a: { m: [[1, 90, 0, 0], [2, 90, 0, 0], [3, 90, 0, 0], [4, 90, 0, 0], [5, 0, 0, 0]] } });
  assert.equal(r.partidos, 2);
});
