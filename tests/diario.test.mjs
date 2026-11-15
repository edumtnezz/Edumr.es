import test from "node:test";
import assert from "node:assert/strict";
import { eventosTabla, eventosGoles, itemsMercado, lideres } from "../functions/_lib/diario.mjs";

const tabla = (ids) => ids.map((id, i) => ({ pos: i + 1, id, name: "E" + id }));
const base = Array.from({ length: 20 }, (_, i) => i + 1);

test("clasificación: sin foto anterior o sin cambios no hay eventos", () => {
  assert.deepEqual(eventosTabla(null, tabla(base)), []);
  assert.deepEqual(eventosTabla(tabla(base), tabla(base)), []);
});
test("clasificación: nuevo líder, entra/sale de los tres primeros y descenso", () => {
  const cur = base.slice(); [cur[0], cur[1]] = [cur[1], cur[0]]; [cur[2], cur[3]] = [cur[3], cur[2]]; [cur[16], cur[17]] = [cur[17], cur[16]];
  const ks = eventosTabla(tabla(base), tabla(cur)).map((e) => e.k + ":" + e.tid).sort();
  assert.deepEqual(ks, ["baja:17", "lider:2", "sale3:3", "sube:18", "top3:4"]);
});
test("clasificación: los movimientos de la zona media no cuentan", () => {
  const cur = base.slice(); [cur[8], cur[9]] = [cur[9], cur[8]];
  assert.deepEqual(eventosTabla(tabla(base), tabla(cur)), []);
});

const gl = (arr) => arr.map(([id, v]) => ({ id, n: "J" + id, team: "T", tid: 1, v }));
test("goleadores: gol de uno de los cinco, entrada nueva y nuevo líder", () => {
  const prev = gl([[1, 15], [2, 13], [3, 10], [4, 9], [5, 8], [6, 7]]);
  assert.deepEqual(eventosGoles(prev, prev), []);
  assert.deepEqual(eventosGoles(prev, gl([[1, 15], [2, 14], [3, 10], [4, 9], [5, 8], [6, 7]])).map((e) => e.k + ":" + e.pid), ["gol:2"]);
  assert.deepEqual(eventosGoles(prev, gl([[1, 15], [2, 13], [3, 10], [6, 9], [4, 9], [5, 8]])).map((e) => e.k + ":" + e.pid), ["entra:6"]);
  assert.deepEqual(eventosGoles(prev, gl([[2, 16], [1, 15], [3, 10], [4, 9], [5, 8]])).map((e) => e.k + ":" + e.pid), ["lider:2"]);
});

test("mercado: una fila por día con la primera pasada grande", () => {
  const d = Date.UTC(2026, 10, 14, 3, 26); // 04:26 en Madrid
  const log = [{ at: d, n: 343, g: [{ name: "Nico Williams", d: 824978 }] }, { at: d + 180000, n: 343, g: [{ name: "Nico Williams", d: -824978 }] }, { at: d + 3600000, n: 3, g: [] }];
  const it = itemsMercado(log, d + 7200000);
  assert.equal(it.length, 1);
  assert.equal(it[0].at, d);
  assert.match(it[0].sub, /Más sube: Nico Williams \+825\.000/);
});

test("líderes: goles, penaltis marcados, empate de amarillas y faltas", () => {
  const r = (n, v, s) => ({ ParticiantId: n, ParticipantName: n, TeamName: "T", TeamId: 1, StatValue: v, SubStatValue: s });
  const L = lideres([r("A", 15, 3), r("B", 13, 3), r("C", 10, 1), r("D", 9, 0), r("E", 8, 4), r("F", 7, 0)], [r("X", 5, 0), r("Y", 5, 0), r("Z", 4, 1)], [{ ...r("P", 3.6, 4), MinutesPlayed: 775 }, { ...r("Q", 2.7, 0), MinutesPlayed: 1200 }]);
  assert.deepEqual(L.goles.map((x) => x.n), ["A", "B", "C", "D", "E"]);
  assert.deepEqual(L.penaltis.map((x) => x.n + x.v), ["E4", "A3", "B3"]);
  assert.deepEqual(L.amarillas.map((x) => x.n), ["X", "Y"]);
  assert.deepEqual(L.faltas.map((x) => x.n + x.v), ["Q36", "P31"]); // total = por 90 × minutos / 90
});
