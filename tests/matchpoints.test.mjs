import test from "node:test";
import assert from "node:assert/strict";
import { sameTeam, pendingMatches, rosterFor, isComplete } from "../functions/_lib/matchpoints.mjs";

const keyOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
  .filter((w) => w && ["de", "del", "la", "cf", "fc", "club", "sd", "ud", "rcd", "rc"].indexOf(w) < 0).join("");

const NOW = Date.parse("2026-11-08T22:00:00Z");
const M = (home, away, status, iso) => ({ status, utcDate: iso, homeTeam: { shortName: home }, awayTeam: { shortName: away } });

test("sameTeam: igual o uno contenido en el otro", () => {
  assert.equal(sameTeam("realsociedad", "realsociedad"), true);
  assert.equal(sameTeam("rayovallecano", "rayo"), true);
  assert.equal(sameTeam("betis", "sevilla"), false);
  assert.equal(sameTeam("", "sevilla"), false);
});

test("pendingMatches: terminado hace más de 105 min y sin guardar", () => {
  const ms = [M("Real Sociedad", "Rayo Vallecano", "FINISHED", "2026-11-08T17:30:00Z")];
  const p = pendingMatches(ms, [], keyOf, NOW);
  assert.equal(p.length, 1);
  assert.equal(p[0].home, "realsociedad");
});

test("pendingMatches: aún no han pasado 105 min, no terminado, o ya guardado → nada", () => {
  const recent = [M("A", "B", "FINISHED", "2026-11-08T21:00:00Z")];
  assert.equal(pendingMatches(recent, [], keyOf, NOW).length, 0);
  const live = [M("Real Sociedad", "Rayo Vallecano", "IN_PLAY", "2026-11-08T17:30:00Z")];
  assert.equal(pendingMatches(live, [], keyOf, NOW).length, 0);
  const done = [M("Real Sociedad", "Rayo Vallecano", "FINISHED", "2026-11-08T17:30:00Z")];
  assert.equal(pendingMatches(done, ["realsociedad", "rayovallecano"], keyOf, NOW).length, 0);
  // Si solo uno de los dos equipos está guardado, el partido sigue pendiente
  assert.equal(pendingMatches(done, ["realsociedad"], keyOf, NOW).length, 1);
});

test("pendingMatches: pasadas 40 h ya no se insiste", () => {
  const old = [M("A", "B", "FINISHED", "2026-11-06T10:00:00Z")];
  assert.equal(pendingMatches(old, [], keyOf, NOW).length, 0);
});

test("rosterFor: jugadores de los dos equipos", () => {
  const players = [
    { id: "a1", team: "Real Sociedad" }, { id: "a2", team: "Real Sociedad" },
    { id: "b1", team: "Rayo Vallecano" }, { id: "c1", team: "Barcelona" }, { team: "Rayo Vallecano" },
  ];
  const r = rosterFor(players, ["realsociedad", "rayovallecano"], keyOf);
  assert.deepEqual(r.map((p) => p.id), ["a1", "a2", "b1"]);
});

test("isComplete: exige casi toda la plantilla con puntos finales", () => {
  const mk = (n, f) => { const o = {}; for (let i = 0; i < n; i++) o["p" + i] = f ? { p: 3, f: true } : { p: null, f: false }; return o; };
  assert.equal(isComplete(mk(40, true), 40), true);
  assert.equal(isComplete(mk(40, false), 40), false);
  assert.equal(isComplete(mk(10, true), 10), false); // muy pocos jugadores
  const mix = Object.assign(mk(20, true), { x: null, y: { p: null, f: false } });
  assert.equal(isComplete(mix, 40), false); // 20 de 40 = 50 %
});
