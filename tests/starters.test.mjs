import test from "node:test";
import assert from "node:assert/strict";
import { cleanStarters } from "../functions/_lib/starters.mjs";

const P = (full, pos, prob) => ({ name: full.split(" ").pop(), full, pos, prob });

test("22 titulares (11 buenos + 11 repetidos sin posición) -> 11 sin repetir", () => {
  const buenos = ["A Uno", "B Dos", "C Tres", "D Cuatro", "E Cinco", "F Seis", "G Siete", "H Ocho", "I Nueve", "J Diez", "K Once"].map((n, i) => P(n, i ? "Defensa" : "Portero", 100));
  const extra = buenos.slice(0, 9).concat([P("Z Otro", "", null), P("Y Otro", "", null)]).map((p) => ({ ...p, pos: "", prob: null }));
  const out = cleanStarters(buenos.concat(extra));
  assert.equal(out.length, 11);
  assert.equal(new Set(out.map((p) => p.full)).size, 11);
  assert.ok(out.every((p) => p.pos));
});

test("once normal de 11 no cambia", () => {
  const l = Array.from({ length: 11 }, (_, i) => P("Jugador " + i, "Defensa", 90));
  assert.deepEqual(cleanStarters(l), l);
});

test("sin posiciones: quita repetidos y corta en 11", () => {
  const l = Array.from({ length: 14 }, (_, i) => P("Jugador " + (i % 12), "", null));
  const out = cleanStarters(l);
  assert.equal(out.length, 11);
  assert.equal(new Set(out.map((p) => p.full)).size, 11);
});

test("vacío o raro no rompe", () => {
  assert.deepEqual(cleanStarters([]), []);
  assert.deepEqual(cleanStarters(null), []);
  assert.deepEqual(cleanStarters([null, undefined]), []);
});
