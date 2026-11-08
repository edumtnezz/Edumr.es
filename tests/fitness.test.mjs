import test from "node:test";
import assert from "node:assert/strict";
import { fitLagOf, fitIndex } from "../functions/_lib/fitness.mjs";

// Datos reales del 08/11/2026 (Atlético–Barça, J12): el equipo lleva 12 partidos terminados y
// Futmondo solo tiene publicados 11.
test("partido terminado sin publicar: retraso de 1", () => {
  assert.equal(fitLagOf(11, 12), 1);
});

test("todo publicado: sin retraso", () => {
  assert.equal(fitLagOf(12, 12), 0);
  assert.equal(fitLagOf(12, 11), 0);
});

test("sin datos no se inventa un retraso", () => {
  assert.equal(fitLagOf(0, 12), 0);
  assert.equal(fitLagOf(11, 0), 0);
  assert.equal(fitLagOf(null, undefined), 0);
});

test("el partido nuevo (12º) aún no está en fitness: no hay valor", () => {
  assert.equal(fitIndex(5, 11, 12), null);
});

test("el último publicado (11º) es el último valor de fitness", () => {
  assert.equal(fitIndex(5, 11, 11), 4);
  assert.equal(fitIndex(5, 11, 10), 3);
  assert.equal(fitIndex(5, 11, 7), 0);
});

test("con todo publicado el último partido es el último valor", () => {
  assert.equal(fitIndex(5, 12, 12), 4);
});

test("partidos de hace más de 5 publicados no caben", () => {
  assert.equal(fitIndex(5, 11, 6), null);
});

test("Jonathan David: llegó tarde, su lista tiene 9 partidos pero el equipo lleva 12", () => {
  // Contando solo su lista (9) y con 11 publicados se creía que el J12 era fit[2] (=4, mal).
  // Con los partidos del equipo (12) no hay valor del J12.
  assert.equal(fitIndex(5, 11, 12), null);
  // Y el J11 (11º del equipo) es el último valor publicado: fit[4].
  assert.equal(fitIndex(5, 11, 11), 4);
});

test("sin fitness no hay índice", () => {
  assert.equal(fitIndex(0, 11, 11), null);
  assert.equal(fitIndex(5, 0, 11), null);
});
