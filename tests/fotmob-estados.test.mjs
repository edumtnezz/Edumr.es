import test from "node:test";
import assert from "node:assert/strict";
import { retornoEs, estadoFotmob, partidosPendientes, equiposDelPartido, fotoFotmob, unirFotos } from "../functions/_lib/fotmob-estados.mjs";
import { candidatos } from "../cron/src/partes.js";

const U = (type, expectedReturn) => ({ id: 1, name: "X", unavailability: { type, expectedReturn } });

test("plazos de FotMob en español, sin inventar", () => {
  assert.equal(retornoEs("Early December 2026").retorno, "principios de diciembre de 2026");
  assert.equal(retornoEs("Mid February 2027").retorno, "mediados de febrero de 2027");
  assert.equal(retornoEs("Late November 2026").retorno, "finales de noviembre de 2026");
  assert.equal(retornoEs("Out for season").retorno, "final de temporada");
  assert.equal(retornoEs("About 1-2 weeks").retorno, "dentro de 1-2 semanas");
  assert.equal(retornoEs("Doubtful").duda, true);
  assert.equal(retornoEs("Algo raro de FotMob").ok, false);
});

test("estado: duda, lesión con plazo, sanción; selección y «ya entrena» no cuentan; texto raro se descarta", () => {
  assert.deepEqual(estadoFotmob(U("injury", "Doubtful")), { e: "duda", info: "" });
  assert.deepEqual(estadoFotmob(U("injury", "Early January 2027")), { e: "lesionado", info: "Retorno estimado: principios de enero de 2027." });
  assert.deepEqual(estadoFotmob(U("injury", "Unknown")), { e: "lesionado", info: "" });
  assert.deepEqual(estadoFotmob(U("suspension", "Late November 2026")), { e: "sancionado", info: "" });
  assert.equal(estadoFotmob(U("internationalDuty", "Mid December 2026")), null);
  assert.equal(estadoFotmob(U("injury", "Back in training")), null);
  assert.equal(estadoFotmob(U("injury", "Cualquier cosa")), null);
});

test("partidos: se quitan los terminados y los de otras ligas", () => {
  const l = { leagues: [{ id: 87, matches: [{ id: 1, status: { finished: true } }, { id: 2, status: { finished: false } }] }, { id: 47, matches: [{ id: 3, status: {} }] }] };
  assert.deepEqual(partidosPendientes(l).map((m) => m.id), [2]);
});

test("sin alineación de FotMob no hay lista (no se confunde con «nadie lesionado»)", () => {
  const t = { name: "Getafe", unavailable: [] };
  assert.deepEqual(equiposDelPartido({ content: { lineup: { homeTeam: t, awayTeam: t } } }), []);
  assert.equal(equiposDelPartido({ content: { lineup: { lineupType: "predicted", homeTeam: t, awayTeam: { name: "Elche", unavailable: [U("injury", "Doubtful")] } } } }).length, 2);
});

const F = [
  { id: "a", name: "Aitor Fernández", team: "Osasuna", role: "portero" },
  { id: "b", name: "Gudelj", team: "Getafe", role: "centrocampista" },
  { id: "c", name: "Otro", team: "Elche", role: "defensa" },
];
const eq = (team, lista) => ({ team, lista });

test("empareja con Futmondo y avisa de qué clubes se han leído", () => {
  const { foto, cubiertos } = fotoFotmob([eq("Osasuna", [{ id: 9, name: "Aitor Fernández", e: "lesionado", info: "x" }])], F);
  assert.deepEqual(Object.keys(foto), ["a"]); assert.equal(cubiertos.has("osasu"), true);
});

test("cambios: la primera pasada no avisa; después solo cambia el estado, no el plazo", () => {
  const cub = new Set(["osasu"]);
  const p1 = unirFotos(null, { a: { e: "duda", info: "" } }, cub, F, 10);
  assert.equal(p1.eventos.length, 0);
  const p2 = unirFotos(p1.foto, { a: { e: "duda", info: "" } }, cub, F, 20);
  assert.equal(p2.eventos.length, 0); assert.equal(p2.foto.a.at, 10);
  const p3 = unirFotos(p2.foto, { a: { e: "lesionado", info: "Retorno estimado: final de temporada." } }, cub, F, 30);
  assert.equal(p3.eventos.length, 1); assert.equal(p3.eventos[0].de, "duda"); assert.equal(p3.eventos[0].a, "lesionado");
  const p4 = unirFotos(p3.foto, { a: { e: "lesionado", info: "Retorno estimado: principios de enero de 2027." } }, cub, F, 40);
  assert.equal(p4.eventos.length, 0);
});

test("sale de la lista con su club leído → vuelve a ok; con su club sin leer → se conserva", () => {
  const prev = { a: { e: "lesionado", info: "", at: 1 }, b: { e: "duda", info: "", at: 1 } };
  const r = unirFotos(prev, {}, new Set(["osasu"]), F, 50);
  assert.deepEqual(r.eventos.map((e) => [e.id, e.a]), [["a", "ok"]]);
  assert.equal(r.foto.a, undefined); assert.equal(r.foto.b.e, "duda");
});

test("noticias: FotMob solo cuenta si Biwenger aún lo tiene disponible", () => {
  const now = 1e9;
  const evFo = [{ src: "fo", id: "a", de: "ok", a: "lesionado", info: "Retorno estimado: final de temporada.", at: now - 1000 }, { src: "fo", id: "b", de: "ok", a: "duda", info: "", at: now - 1000 }, { src: "fo", id: "c", de: "ok", a: "ok", info: "", at: now - 1000 }];
  const foto = { bw: { a: { e: "ok", info: "", at: 0 }, b: { e: "lesionado", info: "Lesión.", at: 5 } } };
  const c = candidatos(foto, [], now, evFo, true);
  assert.deepEqual(c.map((x) => x.id), ["a"]);
  assert.equal(c[0].src, "fo"); assert.equal(c[0].a, "lesionado");
});

test("noticias: pasados dos días el aviso de FotMob caduca", () => {
  const now = 1e10;
  assert.equal(candidatos({ bw: {} }, [], now, [{ src: "fo", id: "a", a: "duda", info: "", at: now - 3 * 86400000 }], true).length, 0);
});

test("sin FotMob activado no publica; con él, lo que ya tenía apuntado y Biwenger no también cuenta", () => {
  const now = 1e9, bw = { a: { e: "ok", info: "", at: 0 }, b: { e: "lesionado", info: "x", at: 1 } };
  assert.equal(candidatos({ bw }, [], now, [{ src: "fo", id: "a", a: "lesionado", info: "", at: now - 1000 }], false).length, 0);
  const fo = { a: { e: "duda", info: "", at: now - 5000 }, b: { e: "duda", info: "", at: now - 5000 }, c: { e: "ok", info: "", at: now - 5000 } };
  const c = candidatos({ bw }, [], now, [], true, fo);
  assert.deepEqual(c.map((x) => x.id), ["a"]); assert.equal(c[0].a, "duda");
});
