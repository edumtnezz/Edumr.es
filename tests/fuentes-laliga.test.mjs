import test from "node:test";
import assert from "node:assert/strict";
import { _r } from "../cron/src/redactor.js";

const ROBOTS = {
  "https://www.fcbarcelona.es/es/sitemap/articles/detailed.xml": "User-agent: *\nDisallow:\n",
  "https://www.atleticodemadrid.com/sitemaps/noticias.xml": "User-agent: *\nDisallow: /documentacion_rrhh/\nDisallow: /pdf/\nDisallow: /ad/\nDisallow: /img-estaticos/\nDisallow: /banners/iframe/*\nDisallow: /atm/terminos-y-condiciones\nDisallow: /atm/movistar-touch\n",
  "https://www.valenciacf.com/sitemaps/sitemap-club-2026.xml": "User-agent: *\nDisallow:\n",
  "https://www.rcdeportivo.es/es/sitemap.xml": "User-agent: *\nDisallow: /es/perfil\nDisallow: /gl/perfil\n",
  "https://www.rcdespanyol.com/es/noticias": "User-agent: *\nDisallow: /assets/\n",
  "https://www.realracingclub.es/noticias": "User-agent: *\nDisallow:\n",
  "https://www.realsociedad.eus/es/noticias": "User-agent: *\nAllow: /\nDisallow: /cup\nDisallow: /es/hospitality\n",
  "https://www.osasuna.es/noticias-primer-equipo": "User-agent: *\nDisallow:\n",
};
const ROBOTS_MAKER = "User-agent: *\nDisallow: /api/\nDisallow: /preview/\nDisallow: /_next/\n";
for (const url of [
  "https://www.getafecf.com/noticias",
  "https://www.elchecf.es/noticias",
  "https://www.levanteud.com/noticias",
  "https://www.malagacf.com/noticias",
  "https://www.rayovallecano.es/noticias",
]) ROBOTS[url] = ROBOTS_MAKER;

const YT = "User-agent: *\nDisallow: /feeds/videos.xml\nDisallow: /api/\n";

test("ninguna fuente nueva es un dominio prohibido", () => {
  for (const s of _r.FUENTES) {
    assert.equal(_r.clubProhibido(s.club), false, s.club);
    if (s.noticias) assert.equal(_r.dominioProhibido(s.noticias), false, s.noticias);
    assert.match(s.yt, /^UC[A-Za-z0-9_-]{20,}$/);
  }
  assert.equal(_r.dominioProhibido("https://www.athletic-club.eus/noticias"), true);
  assert.equal(_r.dominioProhibido("https://www.deportivoalaves.com/noticias"), true);
  assert.equal(_r.dominioProhibido("https://www.marca.com/futbol"), true);
  assert.equal(_r.dominioProhibido("https://as.com/futbol"), true);
  assert.equal(_r.dominioProhibido("https://x.com/futbol_fantasy/status/1"), true);
  assert.equal(_r.FUENTES.some((s) => /athletic|alaves/i.test(s.club)), false);
});

test("cada listado nuevo lo deja pasar el robots.txt que leímos", () => {
  for (const [url, robots] of Object.entries(ROBOTS)) {
    assert.equal(_r.robotsPermite(robots, url), true, url);
    assert.equal(_r.FUENTES.some((s) => s.noticias === url), true, url);
  }
  for (const s of _r.FUENTES) {
    const canal = "https://www.youtube.com/channel/" + s.yt;
    const rss = "https://www.youtube.com/feeds/videos.xml?channel_id=" + s.yt;
    assert.equal(_r.robotsPermite(YT, canal), true, s.club);
    assert.equal(_r.robotsPermite(YT, rss), false, s.club);
    assert.equal(_r.dominioProhibido(canal), false);
  }
});

test("el listado HTML y el sitemap se leen sin copiar un enlace prohibido", () => {
  const html = '<a href="/noticias/el-club-confirma-la-baja"></a><a href="https://x.com/futbol_fantasy/1"></a><script id="__NEXT_DATA__">{"slug":"parte-medico-del-primer-equipo","title":"Parte médico","publishedAt":"2026-11-09T10:00:00Z"}</script>';
  const links = _r.enlacesDeFuente(html, "https://www.elchecf.es/noticias");
  assert.ok(links.some((n) => n.url.endsWith("/noticias/parte-medico-del-primer-equipo")));
  assert.equal(links.some((n) => /x\.com/.test(n.url)), false);
  const xml = "<url><loc>https://www.rcdeportivo.es/es/noticias/el-depor-confirma-una-baja</loc></url>";
  const depor = _r.enlacesDeFuente(xml, "https://www.rcdeportivo.es/es/sitemap.xml");
  assert.equal(depor[0].url.includes("/es/noticias/"), true);
});
