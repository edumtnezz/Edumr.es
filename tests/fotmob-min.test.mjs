import test from "node:test";
import assert from "node:assert/strict";
import { minutosEnAlineacion, mismoEquipo, partidoDelDia } from "../functions/_lib/fotmob-min.mjs";

const once = (extra) => ({ starters: Array.from({ length: 10 }, (_, i) => ({ name: "Jugador " + i, performance: {} })).concat(extra.starters || [{ name: "Otro Mas", performance: {} }]), subs: extra.subs || [] });

test("minutos de FotMob: titular completo, cambiado, suplente que entra, banquillo y fuera de la convocatoria", () => {
  assert.deepEqual(minutosEnAlineacion(once({ starters: [{ name: "Thomas Lemar", performance: {} }] }), "Lemar"), { c: "t", mins: 90 });
  assert.deepEqual(minutosEnAlineacion(once({ starters: [{ name: "Thomas Lemar", performance: { substitutionEvents: [{ time: 77, type: "subOut" }] } }] }), "Lemar"), { c: "t", mins: 77 });
  assert.deepEqual(minutosEnAlineacion(once({ subs: [{ name: "Thomas Lemar", performance: { substitutionEvents: [{ time: 69, type: "subIn" }] } }] }), "Lemar"), { c: "s", mins: 21 });
  assert.deepEqual(minutosEnAlineacion(once({ subs: [{ name: "Thomas Lemar", performance: {} }] }), "Lemar"), { c: "b", mins: 0 });
  assert.deepEqual(minutosEnAlineacion(once({}), "Lemar"), { c: "x", mins: 0 });
});

test("minutos de FotMob: si no es seguro, no se inventa", () => {
  assert.equal(minutosEnAlineacion(once({ starters: [{ name: "Thomas Lemar", performance: { events: [{ type: "redCard" }] } }] }), "Lemar"), null);
  assert.equal(minutosEnAlineacion(once({ starters: [{ name: "Luis García", performance: {} }], subs: [{ name: "Raúl García", performance: {} }] }), "García"), null);
  assert.equal(minutosEnAlineacion({ starters: [] }, "Lemar"), null);
});

test("partido del día en FotMob: solo terminado y con los dos equipos", () => {
  const lista = { leagues: [{ matches: [{ id: 7, home: { name: "Elche" }, away: { name: "Real Betis" }, status: { finished: true } }, { id: 8, home: { name: "Celta Vigo" }, away: { name: "Levante" }, status: { finished: false } }] }] };
  assert.equal(partidoDelDia(lista, "Elche", "Betis").id, 7);
  assert.equal(partidoDelDia(lista, "Celta de Vigo", "Levante"), null);
  assert.equal(mismoEquipo("Atleti", "Atlético Madrid"), true);
});
