import test from "node:test";
import assert from "node:assert/strict";
import { _t } from "../cron/src/avisos.js";

const squad = [{ id: "1", name: "Valentín Gómez", team: "Betis" }, { id: "2", name: "Lemar", team: "Elche" }];
const otros = [{ id: "1", name: "Valentín Gómez" }, { id: "2", name: "Lemar" }, { id: "9", name: "Óscar Valentín" }];

test("Óscar Valentín no se confunde con Valentín Gómez (22 del pedido de Edu)", () => {
  const t = "Parte médico jornada 11: Gerard Moreno, Óscar Valentín, Isaac Romero, Lemar";
  assert.deepEqual(_t.ownMatch(t, squad, otros), ["Lemar"]);
});

test("Valentín Gómez sigue saliendo si lo nombran completo", () => {
  assert.deepEqual(_t.ownMatch("Valentín Gómez, duda para el domingo", squad, otros), ["Valentín Gómez"]);
});

test("sin lista de otros jugadores se comporta como antes", () => {
  assert.deepEqual(_t.ownMatch("Gómez se retira lesionado", squad), ["Valentín Gómez"]);
});

test("mercado: 'Sube más / Baja más' y sin 'se dispara' ni 'tienes en el top' (23)", () => {
  const ps = [
    { id: "1", name: "Berenguer", change: 888000 }, { id: "2", name: "Pedri", change: 300000 },
    { id: "3", name: "Comesaña", change: -395000 }, { id: "4", name: "Otro", change: -100000 },
  ];
  const t = _t.mercadoTexto(ps, new Set(["1"]), "x");
  assert.match(t, /MERCADO ACTUALIZADO/);
  assert.match(t, /Sube más: <b>Berenguer \+888k€/);
  assert.match(t, /Baja más: <b>Comesaña −395k€/);
  assert.doesNotMatch(t, /se dispara|se hunde|Tienes en el top/);
});

test("estado de mis jugadores: ok y vacío son lo mismo, y el aviso va en español claro", () => {
  assert.equal(_t.estadoClave("ok"), _t.estadoClave(""));
  assert.equal(_t.estadoClave("injured2"), "injured");
  assert.equal(_t.fraseEstado("", ""), "vuelve a estar disponible");
  assert.match(_t.fraseEstado("yellowcard", ""), /^apercibido/);
  assert.equal(_t.fraseEstado("injured", "Rotura fibrilar."), "lesionado (Rotura fibrilar)");
  assert.doesNotMatch(_t.fraseEstado("yellowcard", "") + _t.fraseEstado("redcard", "") + _t.fraseEstado("doubt", ""), /yellowcard|redcard|doubt|sin aviso/);
});

test("mercado: un solo aviso al día, cuando los valores llevan 6 min quietos", () => {
  const t = Date.UTC(2026, 10, 14, 3, 30);
  assert.equal(_t.mercadoListo({ pxV: "a", pxVAt: t }, t + 2 * 60e3, "2026-11-14"), false); // aún entrando
  assert.equal(_t.mercadoListo({ pxV: "a", pxVAt: t }, t + 7 * 60e3, "2026-11-14"), true);
  assert.equal(_t.mercadoListo({ pxV: "b", pxVAt: t + 9 * 3600e3, pxSent: "a", pxDay: "2026-11-14" }, t + 10 * 3600e3, "2026-11-14"), false); // por la tarde no se repite
  assert.equal(_t.mercadoListo({ pxV: "a", pxVAt: 0 }, t, "2026-11-14"), false); // primera vez: solo se guarda
  assert.equal(_t.mercadoListo({ pxV: "b", pxVAt: t + 9 * 3600e3, pxSent: "a", pxDay: "2026-11-14" }, t + 10 * 3600e3, "2026-11-14", 3), false); // retoque suelto: no avisa
  assert.equal(_t.mercadoListo({ pxV: "b", pxVAt: t + 9 * 3600e3, pxSent: "a", pxDay: "2026-11-14", pxMap: {} }, t + 10 * 3600e3, "2026-11-14", 300), true); // segunda actualización real el mismo día
  // Retoque suelto por la tarde y llega la medianoche: NO se manda (pasó el 16/11/2026 a las 00:00)
  assert.equal(_t.mercadoListo({ pxV: "b", pxVAt: t + 9 * 3600e3, pxSent: "a", pxDay: "2026-11-14", pxMap: {} }, t + 20 * 3600e3, "2026-11-15", 3), false);
  assert.equal(_t.mercadoListo({ pxV: "c", pxVAt: t + 24 * 3600e3, pxSent: "a", pxDay: "2026-11-14", pxMap: {} }, t + 24 * 3600e3 + 7 * 60e3, "2026-11-15", 350), true); // la actualización de verdad, a su hora
});

test("⭐ solo para Nico Williams si es el único Williams de tu plantilla (once Athletic, 20/11/2026)", () => {
  const sq = [{ id: "7", name: "Nico Williams", team: "Athletic" }];
  const once = ["unai simon", "hugo rincon", "alex berenguer", "williams", "nico williams"];
  assert.equal(_t.star(sq, "Athletic", "Williams", once), "Williams");
  assert.equal(_t.star(sq, "Athletic", "Nico Williams", once), "⭐Nico Williams");
});

test("⭐ solo para Iñaki si es el tuyo, aunque Nico esté en el once", () => {
  const sq = [{ id: "8", name: "Iñaki Williams", team: "Athletic" }];
  const once = ["williams", "nico williams"];
  assert.equal(_t.star(sq, "Athletic", "Williams", once), "⭐Williams");
  assert.equal(_t.star(sq, "Athletic", "Nico Williams", once), "Nico Williams");
});

test("apellido suelto sigue marcando si no hay otro con ese apellido", () => {
  const sq = [{ id: "1", name: "Valentín Gómez", team: "Betis" }];
  assert.equal(_t.star(sq, "Betis", "Gómez", ["gomez", "pedri"]), "⭐Gómez");
});

test("cambio del once probable: se espera al confirmado entre 75 y 25 min antes del partido (21/11/2026)", async () => {
  const { esperaOnce } = await import("../cron/src/avisos.js");
  const ko = Date.parse("2026-11-21T13:00:00Z"), min = 60e3;
  assert.equal(esperaOnce(ko, ko - 55 * min), true);   // 13:05 hora Madrid de un 14:00: justo cuando salen las alineaciones
  assert.equal(esperaOnce(ko, ko - 74 * min), true);
  assert.equal(esperaOnce(ko, ko - 90 * min), false);  // un cambio editorial de antes sí avisa
  assert.equal(esperaOnce(ko, ko - 24 * min), false);  // si el confirmado no llegó, avisa como plan B
  assert.equal(esperaOnce(0, ko), false);              // sin hora conocida, como siempre
});
