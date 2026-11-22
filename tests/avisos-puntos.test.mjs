import test from "node:test";
import assert from "node:assert/strict";
import { colaPuntos, avisarPuntos, textoPuntos } from "../cron/src/avisos.js";

function kv() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => { m.set(k, v); } };
}
const item = { j: 12, home: "Atlético de Madrid", away: "Barcelona" };
const env = () => ({ TELEGRAM_BOT_TOKEN: "x", TELEGRAM_CHAT_ID: "42", PORRA: kv() });
// 10:00 de Madrid (09:00 UTC en noviembre) y 03:00 de Madrid (02:00 UTC)
const DIA = Date.parse("2026-11-09T09:00:00Z"), NOCHE = Date.parse("2026-11-09T02:00:00Z");
function fakeFetch(log) { return async (url, o) => { log.push(JSON.parse(o.body)); return { json: async () => ({ ok: true }) }; }; }

test("el texto lleva los dos equipos, la jornada y el enlace a edumr.es", () => {
  const t = textoPuntos(item);
  assert.match(t, /PUNTOS DE FUTMONDO/);
  assert.match(t, /Atlético de Madrid – Barcelona \(J12\)/);
  assert.match(t, /edumr\.es/);
});

test("el texto lleva los puntos de todos los jugadores de los dos equipos", () => {
  const t = textoPuntos({ j: 13, home: "Athletic", away: "Espanyol", marcador: "0 - 1", art: "artpuntos13athleticde", eq: [{ n: "Athletic", j: ["Williams 9", "Sancet 2"] }, { n: "Espanyol", j: ["Dolan 12", "Pol −1"] }] });
  assert.match(t, /Athletic 0-1 Espanyol \(J13\)/);
  assert.match(t, /Williams 9 · Sancet 2/);
  assert.match(t, /Dolan 12 · Pol −1/);
  assert.match(t, /ed-artpuntos13athleticde/);
});

test("un partido ya avisado no se vuelve a avisar aunque vuelva a entrar en la cola", async () => {
  const e = env(), log = [];
  await colaPuntos(e, [item]);
  assert.equal((await avisarPuntos(e, { fetch: fakeFetch(log), now: DIA })).sent, 1);
  assert.equal(await colaPuntos(e, [item]), 0);
  assert.equal((await avisarPuntos(e, { fetch: fakeFetch(log), now: DIA })).sent, 0);
  assert.equal(log.length, 1);
});

test("a medianoche en punto también rige el silencio", async () => {
  const e = env(), log = [];
  await colaPuntos(e, [item]);
  assert.equal((await avisarPuntos(e, { fetch: fakeFetch(log), now: Date.parse("2026-11-20T23:25:00Z") })).skipped, "noche");
  assert.equal(log.length, 0);
});

test("de día se manda una vez y la cola queda vacía", async () => {
  const e = env(), log = [];
  assert.equal(await colaPuntos(e, [item, item]), 1); // sin duplicados
  const r = await avisarPuntos(e, { fetch: fakeFetch(log), now: DIA });
  assert.equal(r.sent, 1);
  assert.equal(log.length, 1);
  assert.equal(log[0].chat_id, "42");
  assert.equal((await avisarPuntos(e, { fetch: fakeFetch(log), now: DIA })).sent, 0);
  assert.equal(log.length, 1);
});

test("de noche (00:00-08:00) no suena y se queda en la cola", async () => {
  const e = env(), log = [];
  await colaPuntos(e, [item]);
  assert.equal((await avisarPuntos(e, { fetch: fakeFetch(log), now: NOCHE })).skipped, "noche");
  assert.equal(log.length, 0);
  assert.equal((await avisarPuntos(e, { fetch: fakeFetch(log), now: DIA })).sent, 1);
});

test("si Telegram falla, el aviso no se pierde", async () => {
  const e = env();
  await colaPuntos(e, [item]);
  const malo = async () => ({ json: async () => ({ ok: false }) });
  const r = await avisarPuntos(e, { fetch: malo, now: DIA });
  assert.equal(r.sent, 0); assert.equal(r.pending, 1);
});

test("sin token no hace nada", async () => {
  assert.equal((await avisarPuntos({ PORRA: kv() }, { now: DIA })).skipped, "sin token");
});

test("22/11: el partido va en negrita como el resto de títulos y con el nombre completo del Barcelona", () => {
  const t = textoPuntos({ j: 13, home: "Barcelona", away: "Villarreal", marcador: "2 - 1", eq: [{ n: "Barcelona", j: ["Fermín −3"] }, { n: "Villarreal", j: ["Pau Navarro 1"] }] });
  assert.match(t, /<b>Barcelona 2-1 Villarreal \(J13\)<\/b>/);
  assert.doesNotMatch(t, /\barca\b/);
});
