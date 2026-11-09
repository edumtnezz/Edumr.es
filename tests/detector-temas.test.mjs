import test from "node:test";
import assert from "node:assert/strict";
import { _r, redactorSombra } from "../cron/src/redactor.js";

const FF = `<?xml version="1.0"?><urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
<url><loc>https://www.futbolfantasy.com/laliga/noticias/154001-valencia</loc><news:title>Jesús Vázquez lesionado en el Valencia</news:title><news:publication_date>2026-11-09T10:00:00Z</news:publication_date></url>
<url><loc>https://www.futbolfantasy.com/laliga/noticias/154002-alaves</loc><news:title>Sivera vuelve con el Alavés</news:title><news:publication_date>2026-11-09T10:00:00Z</news:publication_date></url>
<url><loc>https://www.futbolfantasy.com/laliga/noticias/154003-flick</loc><news:title>Flick habla del Barcelona</news:title><news:publication_date>2026-11-09T10:00:00Z</news:publication_date></url>
</urlset>`;
const CM = `<?xml version="1.0"?><urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
<url><loc>https://www.comuniate.com/noticias/38901/rayo</loc><news:title>Barrenetxea lesionado ante el Rayo Vallecano</news:title><news:publication_date>2026-11-09T11:00:00Z</news:publication_date></url>
<url><loc>https://www.comuniate.com/articulos/1/no</loc><news:title>Nota que no debe pedirse</news:title></url>
</urlset>`;
const ROBOTS_CM = "User-agent: *\nDisallow: /ajax/\nDisallow: /php/\nDisallow: /intranet/\nDisallow: /articulos/\nAllow: /intranet/noticias/fotos/\n";

test("robots: Comuniate tapa /articulos y deja el sitemap; sin robots no se lee", () => {
  assert.equal(_r.robotsPermite("User-agent: *\nDisallow:\n", "https://www.futbolfantasy.com/sitemap-news.xml"), true);
  assert.equal(_r.robotsPermite("User-agent: *\nDisallow:\n", "https://www.futbolfantasy.com/laliga/noticias"), true);
  assert.equal(_r.robotsPermite(ROBOTS_CM, "https://www.comuniate.com/sitemap_news.xml"), true);
  assert.equal(_r.robotsPermite(ROBOTS_CM, "https://www.comuniate.com/noticias/comunio"), true);
  assert.equal(_r.robotsPermite(ROBOTS_CM, "https://www.comuniate.com/articulos/foo"), false);
  assert.equal(_r.robotsPermite(null, "https://www.comuniate.com/sitemap_news.xml"), false);
});

test("de un titular solo salen equipo, persona y tipo que están escritos", () => {
  const notas = _r.enlacesDeSitemap(FF);
  const p = _r.pistasDesdeTitulares(notas, "futbolfantasy", Date.parse("2026-11-09T12:00:00Z"));
  const val = p.find((x) => x.equipo === "Valencia");
  assert.ok(val);
  assert.equal(val.tipo, "lesion");
  assert.deepEqual(val.jugadores, ["Jesús Vázquez"]);
  assert.equal(val.origen, "futbolfantasy");
  assert.equal(val.id, "ff-154001-valencia");
  assert.equal(p.some((x) => x.equipo === "Alavés"), false);
  const flick = p.find((x) => x.entrenador === "Flick");
  assert.equal(flick.equipo, "Barcelona");
  assert.equal(flick.tipo, "rueda");
  assert.equal(JSON.stringify(p).includes("futbolfantasy.com"), false);
  const rayo = _r.pistasDesdeTitulares(_r.enlacesDeSitemap(CM), "comuniate", Date.now());
  assert.equal(rayo[0].equipo, "Rayo Vallecano");
  assert.deepEqual(rayo[0].jugadores, ["Barrenetxea"]);
  assert.equal(rayo[0].origen, "comuniate");
});

test("la misma pista no se duplica y el tope es 200", () => {
  const una = _r.pistasDesdeTitulares(_r.enlacesDeSitemap(FF), "futbolfantasy", Date.now()).filter((x) => x.equipo === "Valencia");
  const doc = _r.mezclarPistas({ v: 1, items: una }, una);
  assert.equal(doc.items.length, 1);
  const muchas = [];
  for (let i = 0; i < 205; i++) muchas.push({ id: "ff-" + i + "-getafe", at: "2026-11-09T00:00:00Z", tipo: "otro", equipo: "Getafe", jugadores: [], entrenador: "", tema: "tema", origen: "futbolfantasy" });
  assert.equal(_r.mezclarPistas({ v: 1, items: [] }, muchas).items.length, 200);
  assert.equal(_r.mezclarPistas({ v: 1, items: [{ id: "x", equipo: "Alavés", tipo: "otro", tema: "a", jugadores: [], entrenador: "" }] }, []).items.length, 0);
});

test("una URL de esas webs no llega a la noticia ni a Telegram", async () => {
  assert.equal(_r.textoConFuenteDetectada({ title: "Algo", body: "ver https://www.futbolfantasy.com/laliga/noticias/1", source: { url: "https://www.fcbarcelona.es/x" } }), true);
  assert.equal(_r.textoConFuenteDetectada({ title: "Algo", body: "cita oficial", source: { url: "https://www.fcbarcelona.es/x" } }), false);
  assert.doesNotMatch(_r.noticiaTelegram({ id: "abc", title: "T", body: "cuerpo" }), /futbolfantasy|comuniate/);
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t", PORRA: {
    async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
    async put(k, v) { kv.set(k, v); } } };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  const tg = [];
  const f = async (url, o) => {
    url = String(url);
    if (url === "https://www.futbolfantasy.com/robots.txt") return new Response("User-agent: *\nDisallow:\n");
    if (url === "https://www.comuniate.com/robots.txt") return new Response(ROBOTS_CM);
    if (url === "https://www.futbolfantasy.com/sitemap-news.xml") return new Response(FF);
    if (url === "https://www.comuniate.com/sitemap_news.xml") return new Response(CM);
    if (url.includes("api.telegram.org")) { tg.push(JSON.parse(o.body).text || ""); return new Response(JSON.stringify({ ok: true })); }
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-09T01:03:00Z"), allTicks: true, fuentes: [] });
  const doc = JSON.parse(kv.get("rd:pistas:v1"));
  assert.ok(doc.items.length >= 2);
  assert.equal(JSON.stringify(doc).includes("futbolfantasy.com"), false);
  assert.equal(JSON.stringify(doc).includes("comuniate.com"), false);
  assert.equal(kv.get("own:news:v1"), undefined);
  assert.equal(tg.length, 0);
  const st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.deteccion.futbolfantasy.ok, true);
  assert.equal(st.deteccion.comuniate.ok, true);
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-09T01:05:00Z"), allTicks: true, fuentes: [] });
  assert.equal(JSON.parse(kv.get("rd:pistas:v1")).items.length, doc.items.length);
});
