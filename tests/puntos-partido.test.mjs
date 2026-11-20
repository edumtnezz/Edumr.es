import test from "node:test";
import assert from "node:assert/strict";
import { puntosPartido } from "../functions/_lib/articulos.mjs";

const P = (id, name, team, value) => ({ id, name, team, value });
const ps = [
  P("a1", "Williams", "Athletic", 30e6), P("a2", "Sancet", "Athletic", 20e6), P("a3", "Banquillo", "Athletic", 5e6),
  P("e1", "Dolan", "Espanyol", 9e6), P("e2", "Pol", "Espanyol", 6e6), P("e3", "Roca", "Espanyol", 4e6),
];
const it = { j: 13, home: "Athletic", away: "Espanyol" };

test("puntosPartido: ordena por puntos, no enseña los 0 y marca el mejor", () => {
  const a = puntosPartido(ps, { a1: 2, a2: 9, a3: 0, e1: 12, e2: -1, e3: 5 }, it, "0 - 1");
  assert.ok(a);
  assert.match(a.title, /Puntos del Athletic – Espanyol \(J13\)/);
  assert.ok(!a.body.includes("Banquillo"), "un 0 es no jugó");
  assert.ok(a.body.indexOf("Sancet") < a.body.indexOf("Williams"));
  assert.match(a.body, /MARCADOR \| 0 - 1/);
  assert.match(a.body, /MEJOR \| 12 puntos \| ok \| Dolan/);
  assert.match(a.body, /Pol \| −1/);
  assert.deepEqual(a.top, ["Dolan 12", "Sancet 9", "Roca 5"]);
});

test("puntosPartido: sin los dos equipos o sin marcador no inventa nada", () => {
  assert.equal(puntosPartido(ps, { a1: 2, a2: 9 }, it, "0 - 1"), null);
  const a = puntosPartido(ps, { a1: 2, e1: 4 }, it, "");
  assert.ok(a && !/MARCADOR/.test(a.body));
});
