import test from "node:test";
import assert from "node:assert/strict";
import { publicarArticulos } from "../cron/src/articulos.js";

// Reparto por horas (17/11/2026): un artículo por pasada, desde su hora, 3 h o más entre artículos y sin juntar dos si no ha salido una noticia de jugador.
const jugadores = Array.from({ length: 320 }, (_, i) => ({ id: String(i + 1), name: "J" + (i + 1), value: (3 + (i % 20)) * 1e6, avg: 4 + (i % 6), matches: 8, points: 30, chg7: i % 3 === 0 ? 1.2e6 : -1.1e6, est: i % 17 === 0 ? "lesionado" : "", estInfo: i % 17 === 0 ? "Retorno estimado: Principios de Enero." : "" }));
const kv = (init) => { const m = new Map(Object.entries(init || {})); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => { m.set(k, v); } }; };
const fetchFalso = (now) => async (url) => ({ ok: true, json: async () => (/jornada$/.test(url) ? { matchday: 14, matches: [{ date: "28/11", time: "21:00" }] } : /mercado$/.test(url) ? { players: jugadores } : { cambios: [] }) });
// 18/11/2026 a las HH:07 en Madrid (UTC+1)
const at = (h) => Date.UTC(2026, 10, 18, h - 1, 7);

test("antes de su hora no sale nada y a su hora sale solo uno", async () => {
  const PORRA = kv({ "art:st:v1": JSON.stringify({ done: {}, v: 5 }), "own:news:v2": "[]" });
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(9)), { skipped: "fuera de hora" });
  const r = await publicarArticulos({ PORRA }, fetchFalso(), at(14));
  assert.equal(r.nuevas, 1);
  const own = JSON.parse(PORRA.m.get("own:news:v2"));
  assert.equal(own.length, 1);
  assert.equal(own[0].art, "artvender"); // primero el de las 10 h aunque sean las 14
});

test("3 horas entre artículos y, sin noticia de jugador entre medias, 6", async () => {
  const PORRA = kv({ "art:st:v1": JSON.stringify({ done: {}, v: 5 }), "own:news:v2": "[]" });
  await publicarArticulos({ PORRA }, fetchFalso(), at(10));
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(12)), { esperando: true }); // 2 h
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(14)), { esperando: true }); // 4 h sin noticia de jugador
  const own = JSON.parse(PORRA.m.get("own:news:v2"));
  own.push({ id: "x1", auto: "estado", publishedAt: at(11), status: "published" }); // sale una noticia de un jugador
  PORRA.m.set("own:news:v2", JSON.stringify(own));
  const r = await publicarArticulos({ PORRA }, fetchFalso(), at(14));
  assert.equal(r.nuevas, 1);
  assert.deepEqual(JSON.parse(PORRA.m.get("own:news:v2")).filter((x) => x.tipo === "articulo").map((x) => x.art).sort(), ["artfichar", "artvender"]);
});

test("sin ninguna noticia de jugador, tras 6 horas sale el siguiente", async () => {
  const PORRA = kv({ "art:st:v1": JSON.stringify({ done: {}, v: 5 }), "own:news:v2": "[]" });
  await publicarArticulos({ PORRA }, fetchFalso(), at(10));
  const r = await publicarArticulos({ PORRA }, fetchFalso(), at(16));
  assert.equal(r.nuevas, 1);
});
