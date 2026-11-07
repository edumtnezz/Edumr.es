import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../functions/api/laquiniela/[[path]].js";

function mkEnv() {
  const kv = new Map();
  kv.set("sess:tok", JSON.stringify({ key: "edu", created: 1 }));
  kv.set("user:edu", JSON.stringify({ name: "Edu" }));
  kv.set("sess:otro", JSON.stringify({ key: "pepe", created: 1 }));
  kv.set("user:pepe", JSON.stringify({ name: "Pepe" }));
  kv.set("rd:res:v1:VID1", JSON.stringify({ id: "VID1", club: "Sevilla", title: "Rueda", pub: 1, at: 2, items: [
    { jugador: "Casadó", nombre: "Marc Casadó", estado: "recuperacion_con_grupo", frase: "entrena con normalidad", minuto: "03:04", confianza: "alta", verificada: true, cruzado: true, publicable: true },
    { jugador: "Zaka", estado: "duda", frase: "no sé", minuto: "05:00", confianza: "media", verificada: false, cruzado: false, publicable: false }] }));
  return { ADMIN_NAMES: "edu", PORRA: {
    async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" || (t && t.type === "json") ? JSON.parse(v) : v); },
    async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); },
    async list({ prefix }) { return { keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; } } };
}
const req = (path, tok, body) => new Request("https://edumr.es/api/laquiniela/" + path, { method: body ? "POST" : "GET", headers: Object.assign({ "content-type": "application/json" }, tok ? { cookie: "porra_session=" + tok } : {}), body: body ? JSON.stringify(body) : undefined });
const get = (env, path, tok) => api.onRequestGet({ request: req(path, tok), env, params: { path: path.split("?")[0].split("/") }, waitUntil() {} });
const post = (env, path, tok, body) => api.onRequestPost({ request: req(path, tok, body), env, params: { path: path.split("/") }, waitUntil() {} });

test("el panel solo responde al administrador", async () => {
  const env = mkEnv();
  assert.equal((await get(env, "admin-noticias")).status, 403);
  assert.equal((await post(env, "admin-noticias", null, { action: "crear" })).status, 403);
});

test("borrador desde la rueda de prensa, publicar y leer; lo de otras webs no sale en público", async () => {
  globalThis.fetch = async () => { throw new Error("sin red"); };
  const env = mkEnv();
  const a = await (await post(env, "admin-noticias", "tok", { action: "crear", videoId: "VID1" })).json();
  assert.equal(a.item.status, "draft");
  assert.match(a.item.body, /Marc Casadó: entrena con el grupo\. «entrena con normalidad» \(min 03:04\)/);
  assert.doesNotMatch(a.item.body, /Zaka/);                         // solo lo publicable
  assert.equal(a.item.source.url, "https://youtu.be/VID1?t=184");
  // sin publicar no se ve
  let pub = await (await get(env, "noticias")).json();
  assert.deepEqual(pub.noticias, []);
  assert.equal((await post(env, "admin-noticias", "otro", { action: "publicar", id: a.item.id })).status, 403);
  await post(env, "admin-noticias", "tok", { action: "guardar", id: a.item.id, title: "Casadó vuelve", lead: "x", body: a.item.body, source: a.item.source });
  const p = await (await post(env, "admin-noticias", "tok", { action: "publicar", id: a.item.id })).json();
  assert.equal(p.item.status, "published");
  pub = await (await get(env, "noticias")).json();
  assert.equal(pub.noticias.length, 1);
  assert.equal(pub.noticias[0].src, "EduMR");
  assert.equal(pub.noticias[0].link, "https://edumr.es/n/" + a.item.id);
  const art = await (await get(env, "noticia?u=" + encodeURIComponent(pub.noticias[0].link))).json();
  assert.match(art.html, /<p>Marc Casadó/);
  assert.match(art.html, /youtu\.be\/VID1/);
  // una web externa: solo el administrador
  const ext = "https://www.futbolfantasy.com/laliga/noticias/algo";
  assert.deepEqual(await (await get(env, "noticia?u=" + encodeURIComponent(ext))).json(), { removed: true });
  assert.deepEqual(await (await get(env, "noticia?u=" + encodeURIComponent(ext), "otro")).json(), { removed: true });
  // despublicar la quita
  await post(env, "admin-noticias", "tok", { action: "despublicar", id: a.item.id });
  assert.deepEqual((await (await get(env, "noticias")).json()).noticias, []);
  assert.deepEqual(await (await get(env, "noticia?u=" + encodeURIComponent(pub.noticias[0].link))).json(), { removed: true });
});
