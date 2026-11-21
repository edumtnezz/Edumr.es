import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { formacionesDe, sumar, publico, formOk, terminados } from "../functions/_lib/formaciones.mjs";

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join("futmondo", "formaciones.js"), "utf8"), ctx);
const EF = ctx.window.EduFormaciones;

const once = (n) => Array.from({ length: 11 }, (_, i) => ({ id: i, name: n + i }));
const det = (a, b, tipo = "lineup") => ({ content: { lineup: { lineupType: tipo, homeTeam: { name: "Athletic Club", formation: a, starters: once("a") }, awayTeam: { name: "Espanyol", formation: b, starters: once("e") } } } });

test("formOk: solo formaciones de 3 o 4 filas que suman 10", () => {
  assert.ok(formOk("4-2-3-1") && formOk("5-3-2") && formOk("4-4-2") && formOk("3-4-3"));
  assert.ok(!formOk("4-6-0") && !formOk("4-3-3-1") && !formOk("4-1-2-1-2") && !formOk("") && !formOk(null));
});

test("formacionesDe: solo con alineación oficial y 11 titulares", () => {
  const r = formacionesDe(det("4-2-3-1", "5-3-2"));
  assert.deepEqual(r.map((x) => x.f), ["4-2-3-1", "5-3-2"]);
  assert.deepEqual(formacionesDe(det("4-2-3-1", "5-3-2", "predicted")), []);
  assert.equal(formacionesDe(det("4-6-0", "5-3-2")).length, 1, "una formación inválida no cuenta");
  assert.deepEqual(formacionesDe({}), []);
});

test("sumar: cada partido cuenta una sola vez", () => {
  let reg = sumar(null, 1, formacionesDe(det("4-2-3-1", "5-3-2")));
  reg = sumar(reg, 1, formacionesDe(det("4-2-3-1", "5-3-2")));
  reg = sumar(reg, 2, formacionesDe(det("4-3-3", "5-3-2")));
  const p = publico(reg);
  assert.equal(p.partidos, 2);
  const ath = p.equipos.find((e) => e.name === "Athletic Club");
  assert.equal(ath.n, 2);
  assert.deepEqual(ath.f, { "4-2-3-1": 1, "4-3-3": 1 });
});

test("terminados: solo partidos acabados y no cancelados", () => {
  const l = [{ id: 1, home: {}, away: {}, status: { finished: true } }, { id: 2, home: {}, away: {}, status: { finished: false } }, { id: 3, home: {}, away: {}, status: { finished: true, cancelled: true } }];
  assert.deepEqual(terminados(l), ["1"]);
});

test("elegir: deja la formación que el equipo ya ha jugado", () => {
  assert.equal(EF.elegir("4-2-3-1", { "4-2-3-1": 7, "4-3-3": 2 }), "4-2-3-1");
});

test("elegir: una formación que nunca ha jugado se cambia por la más parecida de las suyas (el 4-6-0 de Athletic)", () => {
  const r = EF.elegir("4-6-0", { "4-2-3-1": 7, "4-3-3": 2 });
  assert.ok(r === "4-2-3-1" || r === "4-3-3");
  assert.ok(EF.valida(r));
});

test("elegir: a igual parecido gana la más usada; sin datos no toca nada", () => {
  assert.equal(EF.elegir("4-4-1-1", { "4-2-3-1": 1, "4-4-2": 9 }), "4-4-2");
  assert.equal(EF.elegir("4-6-0", null), null);
  assert.equal(EF.elegir("4-6-0", {}), null);
});

test("repartir: de atrás hacia delante, y a igual altura el más centrado va más atrás", () => {
  const ps = [90, 90, 90, 90, 60, 60, 40, 40, 40, 15].map((y, i) => ({ y, x: i * 10 }));
  const rows = EF.repartir(ps, "4-2-3-1");
  assert.deepEqual([...rows.map((r) => r.length)], [4, 2, 3, 1]);
  assert.ok(rows[0].every((p) => p.y === 90) && rows[3][0].y === 15);
  const par = EF.repartir([{ y: 50, x: 10 }, { y: 50, x: 50 }, { y: 50, x: 90 }], "1-2");
  assert.equal(par[0][0].x, 50);
});
