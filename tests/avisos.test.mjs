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
