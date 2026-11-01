import test from "node:test";
import assert from "node:assert/strict";
import { teamPlayedMatches, playedDenominator } from "../functions/_lib/played.mjs";

// Misma idea que teamKey del backend: quita relleno y deja un nombre comparable.
const keyOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
  .filter((w) => w && ["de", "del", "la", "cf", "fc", "club", "sd", "ud", "rcd", "rc"].indexOf(w) < 0).join("");

const P = (team, matches) => ({ team, matches });

test("Athletic con el J8 aplazado: el equipo ha jugado 9, no 10", () => {
  const mercado = [P("Athletic de Bilbao", 9), P("Athletic de Bilbao", 8), P("Athletic de Bilbao", 6), P("Barcelona", 11)];
  assert.equal(teamPlayedMatches(mercado, "Athletic de Bilbao", keyOf), 9);
  assert.equal(teamPlayedMatches(mercado, "Barcelona", keyOf), 11);
});

test("ficha de un titular del Athletic: 9 de 9 (antes 9 de 10)", () => {
  // Unai Simón: jugó los 9 partidos de su equipo, última jornada con datos J10, 11 publicadas.
  assert.equal(playedDenominator(9, 10, 11, 9), 9);
  assert.equal(playedDenominator(11, 11, 11, 11), 11);
});

test("jugador recién llegado: el denominador es el de su equipo", () => {
  assert.equal(playedDenominator(11, 11, 11, 2), 11);
});

test("sin datos del equipo se usa su última jornada (lo de antes), nunca una cifra inventada", () => {
  assert.equal(playedDenominator(0, 10, 11, 9), 10);
  assert.equal(playedDenominator(0, 0, 0, 0), 0);
});

test("nunca baja de los partidos que ya ha jugado el propio jugador", () => {
  assert.equal(playedDenominator(8, 8, 11, 9), 9);
});

test("equipo sin jugadores en el mercado devuelve 0 (no se inventa)", () => {
  assert.equal(teamPlayedMatches([], "Athletic de Bilbao", keyOf), 0);
  assert.equal(teamPlayedMatches(null, "Athletic de Bilbao", keyOf), 0);
  assert.equal(teamPlayedMatches([P("Athletic de Bilbao", 9)], "", keyOf), 0);
});
