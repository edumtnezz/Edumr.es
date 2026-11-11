import test from "node:test";
import assert from "node:assert/strict";
import { staleChange, actualizadoHoy, tocadosDe, marcarTocados } from "../functions/_lib/change.mjs";

test("cambio viejo: el valor no se movió ni ayer ni anteayer (Guruzeta 11/11/2026)", () => {
  assert.equal(staleChange(-237946, 0, 0), true);
});
test("cambio bueno: el valor se movió hoy", () => {
  assert.equal(staleChange(555397, 555397, 1025765), false);
});
test("de madrugada (hoy = ayer, pero ayer sí se movió) no se toca", () => {
  assert.equal(staleChange(470368, 0, 470368), false);
});
test("bajó ayer y hoy no se ha movido: viejo solo si Futmondo ya actualizó hoy (Uche 11/11/2026)", () => {
  assert.equal(staleChange(-237422, 0, -237422, true), true);
  assert.equal(staleChange(-237422, 0, -237422, false), false);
  assert.equal(actualizadoHoy(Array(60).fill(1000).concat(Array(400).fill(0))), true);
  assert.equal(actualizadoHoy(Array(10).fill(1000).concat(Array(400).fill(0))), false);
  assert.equal(actualizadoHoy([undefined, null]), false);
});
test("sin histórico no se toca", () => {
  assert.equal(staleChange(-100, undefined, undefined), false);
  assert.equal(staleChange(-100, 0, undefined), false);
  assert.equal(staleChange(0, 0, 0), false);
});

const days = [
  { day: "Miércoles 11", items: [
    { time: "14:05", cat: "recuperado", title: "Bellerín está ahora recuperado" },
    { time: "11:27", cat: "tocado", title: "Mbappé está ahora tocado o al margen" },
    { time: "11:18", cat: "tocado", title: "Ryan está ahora tocado o al margen" },
    { time: "09:00", cat: "tocado", title: "Bellerín está ahora tocado o al margen" },
    { time: "08:00", cat: "once", title: "Actualizado el once tipo de Real Madrid" },
  ] },
  { day: "Martes 10", items: [{ time: "20:00", cat: "tocado", title: "Gueye está ahora tocado o al margen" }] },
  { day: "Lunes 9", items: [{ time: "20:00", cat: "tocado", title: "Pedri está ahora tocado o al margen" }] },
];
test("tocados: hoy y ayer, manda la última novedad", () => {
  const m = tocadosDe(days, 11, 10);
  assert.deepEqual(m.mbappe, { t: "11:27", d: "hoy" });
  assert.deepEqual(m.ryan, { t: "11:18", d: "hoy" });
  assert.equal(m.bellerin, undefined); // se recuperó después
  assert.deepEqual(m.gueye, { t: "20:00", d: "ayer" });
  assert.equal(m.pedri, undefined); // hace dos días: ya no cuenta
});
test("tocados: solo si el nombre es de un único jugador", () => {
  const m = tocadosDe(days, 11, 10);
  const ps = marcarTocados([{ name: "Mbappé" }, { name: "Ryan" }, { name: "Gueye" }, { name: "Gueye" }, { name: "Koke" }], m);
  assert.deepEqual(ps[0].toc, { t: "11:27", d: "hoy" });
  assert.ok(ps[1].toc);
  assert.equal(ps[2].toc, undefined); // hay dos Gueye: no se adivina
  assert.equal(ps[4].toc, undefined);
});
