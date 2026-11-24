import test from "node:test";
import assert from "node:assert/strict";
import { publicarArticulos } from "../cron/src/articulos.js";

// Calendario de artículos (24/11/2026): uno por pasada, cada uno desde su día y su hora, 3 h o más entre ellos, una noticia de jugador
// entre medias (o 5 h) y un aviso de Telegram por artículo con su rótulo.
const jugadores = Array.from({ length: 320 }, (_, i) => ({ id: String(i + 1), name: "J" + (i + 1), value: (3 + (i % 20)) * 1e6, avg: 4 + (i % 6), matches: 8, points: 30, chg7: i % 3 === 0 ? 1.2e6 : -1.1e6, est: i % 17 === 0 ? "lesionado" : "", estInfo: i % 17 === 0 ? "x. Retorno estimado: Finales de Mayo." : "", prob: 80, role: "centrocampista", team: "T" + (i % 10), fitness: [5, 6, 7] }));
const kv = (init) => { const m = new Map(Object.entries(init || {})); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => { m.set(k, v); } }; };
const tg = [];
const fetchFalso = () => async (url, o) => {
  if (/telegram/.test(url)) { tg.push(JSON.parse(o.body).text); return { ok: true, json: async () => ({}) }; }
  return { ok: true, json: async () => (/jornada\?jornada=13$/.test(url) ? { matches: [] } : /jornada$/.test(url) ? { matchday: 14, matches: [{ date: "27/11", time: "21:00", day: "Vie", home: "A", away: "B" }] } : /mercado$/.test(url) ? { players: jugadores } : /lideres$/.test(url) ? { rachas: [] } : { cambios: [] }) };
};
const at = (d, h) => Date.UTC(2026, 10, d, h - 1, 7); // día de noviembre, HH:07 en Madrid (UTC+1)
const ini = () => kv({ "art:st:v1": JSON.stringify({ done: {}, v: 5 }), "own:news:v2": "[]", "tg:avisos:v1": JSON.stringify({ chat: "1" }) });

test("el lunes no sale nada; el martes antes de las 12 tampoco; a su hora sale A vender con su aviso", async () => {
  const PORRA = ini();
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(23, 15)), { esperando: true });
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(24, 11)), { esperando: true });
  tg.length = 0;
  const r = await publicarArticulos({ PORRA, TELEGRAM_BOT_TOKEN: "x" }, fetchFalso(), at(24, 12));
  assert.deepEqual(r.nuevas, ["artvender14"]);
  assert.match(tg[0], /^<b>🔻 A VENDER<\/b>\n\nJugadores a vender antes de la jornada 14\nhttps:\/\/edumr\.es\/futmondo\/guiafantasy\/noticias\/ed-artvender14$/);
});

test("3 horas entre artículos y, sin noticia de jugador entre medias, 5", async () => {
  const PORRA = ini();
  await publicarArticulos({ PORRA }, fetchFalso(), at(24, 12));
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(24, 14)), { esperando: true }); // 2 h
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(24, 16)), { esperando: true }); // 4 h sin noticia
  const own = JSON.parse(PORRA.m.get("own:news:v2"));
  own.push({ id: "x1", auto: "estado", publishedAt: at(24, 13), status: "published" });
  PORRA.m.set("own:news:v2", JSON.stringify(own));
  assert.deepEqual(await publicarArticulos({ PORRA }, fetchFalso(), at(24, 16)), { esperando: true }); // Rachas es desde las 17
  const r = await publicarArticulos({ PORRA }, fetchFalso(), at(24, 17));
  assert.ok(r.nuevas); // Rachas (sin equipos ni jugadores que cumplan: se da por hecho y no se publica nada)
});

test("si la fuente de un artículo no responde, se reintenta más tarde en vez de darlo por hecho", async () => {
  const PORRA = ini();
  const sinLideres = () => { const f = fetchFalso(); return async (u, o) => (/lideres$/.test(u) ? { ok: false, json: async () => null } : f(u, o)); };
  const st = JSON.parse(PORRA.m.get("art:st:v1")); st.done.artvender14 = 1; PORRA.m.set("art:st:v1", JSON.stringify(st));
  await publicarArticulos({ PORRA }, sinLideres(), at(24, 17));
  assert.ok(!JSON.parse(PORRA.m.get("art:st:v1")).done.artrachas14);
});
