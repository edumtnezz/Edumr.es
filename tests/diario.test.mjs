import test from "node:test";
import assert from "node:assert/strict";
import { eventosTabla, eventosGoles, itemsMercado, lideres, rachasDe, eventosRachas, cholloDe } from "../functions/_lib/diario.mjs";

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
  assert.equal(itemsMercado(log.concat([{ at: d + 86400000, n: 300, g: [{ name: "Otro", d: 600000 }] }]), d + 90000000).length, 1); // solo la última actualización
  assert.match(it[0].sub, /Más sube: Nico Williams \+825\.000/);
});

test("líderes: goles, penaltis y amarillas a una de la sanción", () => {
  const r = (n, v, s) => ({ ParticiantId: n, ParticipantName: n, TeamName: "T", TeamId: 1, StatValue: v, SubStatValue: s });
  const L = lideres([r("A", 15, 3), r("B", 13, 3), r("C", 10, 1), r("D", 9, 0), r("E", 8, 4), r("F", 7, 0)], [r("X", 5, 0), r("Y", 4, 0), r("Z", 4, 1), r("W", 3, 0), r("V", 9, 0), r("N", 0, 0)]);
  assert.deepEqual(L.goles.map((x) => x.n), ["A", "B", "C", "D", "E"]);
  assert.deepEqual(L.penaltis.map((x) => x.n + x.v), ["E4", "A3", "B3"]);
  assert.deepEqual(L.amarillas.map((x) => x.n), ["Y", "Z", "V"]); // 4 y 9: a una de la sanción; el de 5 no sale
  assert.equal(L.tarjetas.length, 5); // todos los que llevan alguna
  assert.equal(L.faltas, undefined);
});

test("rachas: victorias seguidas y partidos sin perder, solo al jugar", () => {
  const mk = (d, h, a, sc) => ({ home: { id: h, name: "E" + h }, away: { id: a, name: "E" + a }, status: { finished: true, cancelled: false, utcTime: "2026-09-" + String(d).padStart(2, "0") + "T18:00:00Z", scoreStr: sc } });
  const ms = [mk(1, 1, 2, "1 - 0"), mk(2, 1, 3, "2 - 0"), mk(3, 1, 2, "3 - 1"), mk(4, 1, 3, "1 - 0"), mk(5, 2, 3, "0 - 0")];
  const r = rachasDe(ms), e1 = r.find((x) => x.tid === "1");
  assert.deepEqual([e1.w, e1.u, e1.pj], [4, 4, 4]);
  assert.deepEqual(eventosRachas(null, r).map((e) => e.title), ["E1 lleva 4 victorias seguidas"]);
  assert.deepEqual(eventosRachas({ 1: { pj: 4 } }, r), []); // no ha vuelto a jugar: no se repite
  assert.equal(eventosRachas({ 1: { pj: 3 } }, r).length, 1);
});
test("chollo del día: barato, disponible y rindiendo; si repite, se marca", () => {
  const P = (o) => Object.assign({ est: "", value: 4e6, avg: 7, matches: 8, prob: 90, fitness: [5, 6, 7, 8, 9] }, o);
  const ps = [P({ id: "a", name: "A", avg: 7.6, value: 4.3e6 }), P({ id: "b", name: "B", avg: 9, value: 20e6 }), P({ id: "c", name: "C", avg: 9, est: "lesionado" }), P({ id: "d", name: "D", avg: 6.5, value: 4e6 })];
  assert.deepEqual(cholloDe(ps), { cat: "chollo", pid: "a", name: "A", title: "A", rep: 0, prob: 90 });
  assert.equal(cholloDe(ps, ["a", "x", "a"]).rep, 2);
  assert.equal(cholloDe([P({ id: "x", name: "X", avg: 3 })]), null);
});

test("chollo: no sale quien juega poco, tiene dudas o puntúa a ratos (Turrientes, 16/11)", () => {
  const base = { id: "1", name: "A", value: 3e6, matches: 10, avg: 7, prob: 90, fitness: [5, 6, 7, 8, 9] };
  assert.equal(cholloDe([base]).pid, "1");
  assert.equal(cholloDe([{ ...base, prob: 40 }]), null);
  assert.equal(cholloDe([{ ...base, matches: 7 }]), null);
  assert.equal(cholloDe([{ ...base, fitness: [0, 0, 15, 3, 7] }]), null);
});
