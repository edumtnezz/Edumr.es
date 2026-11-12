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

import { noticiaPlantilla, hechosNoticia, cuerpoNoticia, resumenValido, recambio, ajustarOnce, partirInfo, clubKey } from "../functions/_lib/estados.mjs";
import { candidatos, proximo, idNoticia } from "../cron/src/partes.js";

const P = { id: "p1", name: "Aitor Fernández", team: "Osasuna", role: "portero", points: 40, matches: 11, avg: 3.6, value: 1300000 };
const H = () => hechosNoticia({ p: P, de: "duda", a: "lesionado", info: "Lesión muscular en el gemelo. Retorno estimado: Mediados de Diciembre.", mp: { n: 12, c: 11, s: 0, rd: 0 }, rec: { name: "Sergio Herrera" }, prox: { jornada: 13, rival: "Málaga", casa: true } });

test("partirInfo separa parte y retorno", () => {
  assert.deepEqual(partirInfo("Lesión en el menisco. Retorno estimado: Vuelta indefinida."), { parte: "Lesión en el menisco", retorno: "sin fecha" });
  assert.deepEqual(partirInfo("Molestias en la rodilla."), { parte: "Molestias en la rodilla", retorno: "" });
});

test("la plantilla solo coloca los hechos", () => {
  const n = noticiaPlantilla(H()), body = cuerpoNoticia(n);
  assert.match(n.title, /^Aitor Fernández, baja/);
  assert.match(body, /jornada 13 ante el Málaga/); assert.match(body, /titular en 11 de 12/); assert.match(body, /1\.300\.000 €/);
  assert.match(body, /## Claves fantasy\n- /); assert.match(body, /## Consejo fantasy\nNo lo alinees\./); assert.match(body, /Sergio Herrera/);
});

test("el resumen de la IA se rechaza si trae un número o un nombre que no está en los hechos", () => {
  const h = H();
  assert.equal(resumenValido("Aitor Fernández es baja en el Osasuna para la jornada 13 ante el Málaga por una lesión muscular en el gemelo. Suma 40 puntos en 11 partidos y vale 1.300.000 €.", h), true);
  assert.equal(resumenValido("Aitor Fernández es baja en el Osasuna para la jornada 13 ante el Málaga y estará fuera 5 semanas, según ha podido saber esta redacción.", h), false);
  assert.equal(resumenValido("Aitor Fernández es baja en el Osasuna para la jornada 13 ante el Málaga y el técnico Lisci tendrá que buscar otro portero para ese partido.", h), false);
});

test("recambio: solo si el que cae es titular habitual; el suplente del puesto con más minutos", () => {
  const all = [P, { id: "p2", name: "Sergio Herrera", team: "Osasuna", role: "portero" }, { id: "p3", name: "Otro", team: "Osasuna", role: "portero" }, { id: "p4", name: "Defensa", team: "Osasuna", role: "defensa" }];
  const min = { p1: { n: 12, c: 11, s: 0, rd: 0, t: 990 }, p2: { n: 12, c: 1, s: 0, rd: 0, t: 90 }, p3: { n: 12, c: 0, s: 0, rd: 0, t: 0 }, p4: { n: 12, c: 2, s: 0, rd: 0, t: 300 } };
  assert.equal(recambio(P, all, min, {}).id, "p2");
  assert.equal(recambio(P, all, { ...min, p1: { n: 12, c: 3, s: 0, rd: 0, t: 270 } }, {}), null);
  assert.equal(recambio(P, all, min, { p2: { e: "lesionado" } }), null);
  const side = { name: "Osasuna", starters: [{ name: "Aitor", full: "Aitor Fernández", pos: "Portero", prob: 90, x: 50, y: 87 }] };
  const r = ajustarOnce(side, all, min, { p1: { e: "lesionado", info: "x" } });
  assert.equal(r[0].entra, "Sergio Herrera"); assert.equal(side.starters[0].full, "Sergio Herrera"); assert.equal(side.starters[0].prob, null); assert.equal(side.starters[0].x, 50);
});

test("clubKey iguala los nombres del calendario y de Futmondo", () => {
  for (const [a, b] of [["Barça", "Barcelona"], ["Atleti", "Atlético de Madrid"], ["Sevilla FC", "Sevilla"], ["Real Betis", "Betis"], ["Racing de Santander", "Racing"], ["Athletic", "Athletic de Bilbao"], ["Deportivo", "Deportivo de la Coruña"]]) assert.equal(clubKey(a), clubKey(b));
  assert.notEqual(clubKey("Real Madrid"), clubKey("Real Sociedad")); assert.notEqual(clubKey("Athletic"), clubKey("Atlético"));
  assert.deepEqual(proximo({ matchday: 13, matches: [{ home: "Barça", away: "Villarreal" }] }, "Barcelona"), { jornada: 13, rival: "Villarreal", casa: true });
});

test("candidatos: estados recientes y altas; sin duplicar jugador", () => {
  const now = 10 * 86400000;
  const foto = { bw: { a: { e: "duda", info: "x", at: now - 86400000 }, b: { e: "lesionado", info: "y", at: now - 9 * 86400000 }, c: { e: "apercibido", info: "", at: now - 1000 } } };
  const ev = [{ src: "bw", id: "d", de: "lesionado", a: "ok", at: now - 5000 }, { src: "fm", id: "z", de: "ok", a: "duda", at: now - 5000 }, { src: "bw", id: "a", de: "duda", a: "lesionado", info: "roto", at: now - 4000, fuenteAt: now - 6000 }];
  const c = candidatos(foto, ev, now);
  assert.deepEqual(c.map((x) => x.id + ":" + x.a).sort(), ["a:lesionado", "d:ok"]);
  assert.match(idNoticia(c[0]), /^[a-z0-9]{2,16}$/);
});
