import test from "node:test";
import assert from "node:assert/strict";
import { emparejar, fotoEstados, cambios } from "../functions/_lib/estados.mjs";

const teams = { 1: { name: "Atlético" }, 2: { name: "Athletic" } };
const fm = [
  { id: "a", name: "Julián Álvarez", team: "Atlético de Madrid", role: "delantero" },
  { id: "b", name: "Iñaki Williams", team: "Athletic de Bilbao", role: "delantero" },
  { id: "c", name: "Nico Williams", team: "Athletic de Bilbao", role: "delantero" },
  { id: "d", name: "J. Cardoso", team: "Atlético de Madrid", role: "centrocampista" },
];

test("empareja por equipo y nombre, con acentos y alias", () => {
  const m = emparejar([{ id: 1, name: "Julián Alvarez", teamID: 1, position: 4 }, { id: 2, name: "Johnny", teamID: 1, position: 3 }], teams, fm);
  assert.equal(m.get(1).id, "a"); assert.equal(m.get(2).id, "d");
});

test("si hay dos candidatos no empareja", () => {
  const m = emparejar([{ id: 3, name: "Williams", teamID: 2, position: 4 }], teams, fm);
  assert.equal(m.has(3), false);
});

test("no cruza equipos", () => {
  const m = emparejar([{ id: 4, name: "Julián Álvarez", teamID: 2, position: 4 }], teams, fm);
  assert.equal(m.has(4), false);
});

test("cambios: primera pasada nada; después solo lo que cambia", () => {
  const bw = (st, info) => ({ data: { teams, players: { 1: { id: 1, name: "Julián Álvarez", teamID: 1, position: 4, status: st, statusInfo: info, statusChange: 100 } } } });
  const f1 = fotoEstados(bw("ok"), fm), f2 = fotoEstados(bw("doubt", "Molestias."), fm);
  assert.deepEqual(cambios(null, f1, 1), []);
  assert.deepEqual(cambios(f1, f1, 1), []);
  const c = cambios(f1, f2, 5);
  assert.equal(c.length, 1); assert.equal(c[0].id, "a"); assert.equal(c[0].de, "ok"); assert.equal(c[0].a, "duda"); assert.equal(c[0].fuenteAt, 100000);
});
