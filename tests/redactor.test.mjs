import test from "node:test";
import assert from "node:assert/strict";
import { _r, redactorSombra } from "../cron/src/redactor.js";

const XML = `<feed><entry><yt:videoId>AAA111</yt:videoId><title>Rueda de prensa de Luis García en la previa del #SevillaAlavés 📡 EN DIRECTO</title><published>2026-11-05T14:42:00+00:00</published></entry>
<entry><yt:videoId>BBB222</yt:videoId><title>De la élite a la base: el primer equipo femenino visita los entrenamientos</title><published>2026-11-04T16:00:00+00:00</published></entry></feed>`;

test("lee el feed de YouTube", () => {
  const v = _r.parseFeed(XML);
  assert.equal(v.length, 2);
  assert.equal(v[0].id, "AAA111");
});

test("solo ruedas de prensa del primer equipo masculino", () => {
  assert.equal(_r.esConferencia("Rueda de prensa de Luis García en la previa del #SevillaAlavés"), true);
  assert.equal(_r.esConferencia("Rueda de prensa | Antonio Hidalgo previa Espanyol"), true);
  assert.equal(_r.esConferencia("Rueda de prensa del Sevilla FC Femenino"), false);
  assert.equal(_r.esConferencia("Rueda de prensa de Manuel Pablo previa al Arenas Club de Getxo - Fabril"), false);
  assert.equal(_r.esConferencia("Rueda de prensa de Alberto Rodríguez previa al Madrid CFF - Dépor ABANCA"), false);
  assert.equal(_r.esConferencia("REAL ZARAGOZA-VILLARREAL B | RUEDA DE PRENSA ALBELDA | PRIMERA RFEF"), false);
  assert.equal(_r.esConferencia("Rueda de prensa de Giacomo Quagliata tras ser elegido Xogador Estrella Galicia del mes"), false);
  assert.equal(_r.esConferencia("VILLARREAL-GETAFE | RUEDA DE PRENSA PREVIA IÑIGO | LALIGA"), true);
  assert.equal(_r.esConferencia("Las reacciones de los protagonistas tras el Sevilla FC - Deportivo Alavés"), true);
  assert.equal(_r.esConferencia("Reacciones de Pellegrini, Ceballos, Aitor Ruibal y Ángel Ortiz tras el #BVBRealBetis"), true);
  assert.equal(_r.esConferencia("DECLARACIONES DE JAVIER AGUIRRE TRAS EL ENCUENTRO ANTE EL ELCHE CF | VALENCIA CF"), true);
  assert.equal(_r.esConferencia("PRIMERAS DECLARACIONES DE LUCAS PICCINATO COMO ENTRENADOR DEL VALENCIA CF FEMENINO"), false);
  assert.equal(_r.esConferencia("Rueda de prensa de Antonio Hidalgo previa al RCD Espanyol - RC Deportivo"), true);
  assert.equal(_r.esConferencia("Rueda de prensa Juvenil A"), false);
  assert.equal(_r.esConferencia("El Partido #SevillaAlavés EN DIRECTO"), false);
});

const TRANS = "[03:04] Casadó está completando entrenamientos con absoluta normalidad y esperamos que mañana pueda estar en la convocatoria [09:20] Adama es una opción como cualquier otro compañero";

test("la frase tiene que existir en la transcripción", () => {
  assert.equal(_r.fraseVerificada("está completando entrenamientos con absoluta normalidad", TRANS), true);
  assert.equal(_r.fraseVerificada("Adama es una opción como cualquier otro compañero", TRANS), true);
  assert.equal(_r.fraseVerificada("Aubameyang llega muy mal y no jugará", TRANS), false);
  assert.equal(_r.fraseVerificada("sí", TRANS), false);
});

const PL = [{ id: "1", name: "Marc Casadó" }, { id: "2", name: "Zakaria Eddahchouri" }, { id: "3", name: "Mella" }, { id: "4", name: "Adama Boiro" }];

test("cruzar con la plantilla: solo si hay un candidato claro", () => {
  assert.equal(_r.cruzarJugador("Casadó", PL).id, "1");
  assert.equal(_r.cruzarJugador("Adama", PL).id, "4");
  assert.equal(_r.cruzarJugador("Zaka", PL).id, "2");     // apodo confirmado por Edu
  assert.equal(_r.cruzarJugador("Márquez", PL), null);
});

test("filtrar: solo es publicable lo verificado, cruzado y con confianza alta", () => {
  const items = [
    { jugador: "Casadó", estado: "recuperacion_con_grupo", frase: "está completando entrenamientos con absoluta normalidad", minuto: "03:04", confianza: "alta" },
    { jugador: "Adama", estado: "opcion_titular", frase: "Adama es una opción como cualquier otro compañero", minuto: "09:20", confianza: "media" },
    { jugador: "Zaka", estado: "duda", frase: "cada vez está más cerca", minuto: "15:37", confianza: "alta" },
    { jugador: "Casadó", estado: "inventado", frase: "x y z w", minuto: "1", confianza: "alta" },
  ];
  const r = _r.filtrar(items, TRANS, PL);
  assert.equal(r.length, 3);                       // el estado inválido se descarta
  assert.equal(r[0].publicable, true);
  assert.equal(r[1].publicable, false);            // confianza media
  assert.equal(r[2].publicable, false);            // frase no verificada
});

test("parseJson tolera texto alrededor", () => {
  assert.deepEqual(_r.parseJson('Aquí va: [{"a":1}] fin'), [{ a: 1 }]);
  assert.equal(_r.parseJson("nada"), null);
});

test("sin clave de Gemini no hace nada", async () => {
  assert.deepEqual(await redactorSombra({ PORRA: {} }), { skipped: "sin clave" });
});

// KV y fetch falsos: flujo completo vídeo nuevo -> transcripción -> estados -> KV -> Telegram
const own0thumb = (kv) => JSON.parse(kv.get("own:news:v1"))[0].thumb;

test("flujo completo en modo sombra", async () => {
  const kv = new Map();
  const env = {
    GEMINI_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t",
    PORRA: {
      async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
      async put(k, v) { kv.set(k, v); },
    },
  };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  const tgMsgs = [];
  let llamadasGemini = 0;
  const fetchFalso = async (url, opts) => {
    url = String(url);
    if (url.includes("youtube.com/feeds")) return new Response(`<feed><entry><yt:videoId>AAA111</yt:videoId><title>Rueda de prensa de Hidalgo previa Espanyol</title><published>2026-11-06T09:12:00+00:00</published></entry></feed>`);
    if (url.includes("generativelanguage")) {
      llamadasGemini++;
      const body = JSON.parse(opts.body);
      const txt = llamadasGemini === 1 ? TRANS + " ".repeat(0) + " x".repeat(400)
        : JSON.stringify([{ jugador: "Casadó", estado: "recuperacion_con_grupo", frase: "está completando entrenamientos con absoluta normalidad", minuto: "03:04", confianza: "alta" }]);
      if (llamadasGemini === 1) assert.equal(body.contents[0].parts[0].video_metadata.fps, 0.1);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }], usageMetadata: { totalTokenCount: 29000 } }));
    }
    if (url.endsWith("/mercado")) return new Response(JSON.stringify({ players: [{ id: "1", name: "Marc Casadó", team: "Deportivo" }, { id: "9", name: "Otro", team: "Betis" }] }));
    if (url.includes("api.telegram.org")) { tgMsgs.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ ok: true })); }
    return new Response("", { status: 404 });
  };
  const now = Date.parse("2026-11-06T10:03:00Z");
  const r = await redactorSombra(env, { fetch: fetchFalso, now, fuentes: [{ club: "Deportivo", yt: "X" }] });
  assert.equal(r.procesado, "AAA111");
  assert.equal(r.tokens, 87000);
  const guardado = JSON.parse(kv.get("rd:res:v1:AAA111"));
  assert.equal(guardado.items[0].publicable, true);
  assert.equal(guardado.items[0].nombre, "Marc Casadó");
  assert.equal(tgMsgs.length, 1);
  assert.equal(tgMsgs[0].chat_id, "42");
  assert.match(tgMsgs[0].caption || tgMsgs[0].text, /📰/);
  assert.match(tgMsgs[0].caption || tgMsgs[0].text, /guiafantasy\/noticias\/ed-/);
  assert.match(own0thumb(kv), /i\.ytimg\.com\/vi\/AAA111\//);
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own.length, 1);
  assert.equal(own[0].status, "published");           // se publica sola
  assert.equal(own[0].source.videoId, "AAA111");
  assert.equal(own[0].via, "plantilla");              // el Gemini falso no devuelve noticia válida
  assert.match(own[0].body, /Entrena con el grupo\. «está completando/);
  assert.equal(own[0].title, "Marc Casadó: entrena con el grupo");
  // segunda pasada: ya está hecho, no vuelve a gastar
  const r2 = await redactorSombra(env, { fetch: fetchFalso, now: now + 10 * 60e3, fuentes: [{ club: "Deportivo", yt: "X" }] });
  assert.equal(r2.procesado, null);
  assert.equal(llamadasGemini, 3);                // transcripción + estados + redacción
  assert.equal(JSON.parse(kv.get('own:news:v1')).length, 1);
});

test("si el RSS de YouTube falla usa la API oficial (si hay clave) y si no, lo anota sin romper", async () => {
  const kv = new Map();
  const mk = (extra) => ({
    GEMINI_API_KEY: "k", ...extra,
    PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } },
  });
  const now = Date.parse("2026-11-06T10:03:00Z");
  const f = async (url) => {
    url = String(url);
    if (url.includes("youtube.com/feeds")) return new Response("no", { status: 404 });
    if (url.includes("googleapis.com/youtube/v3/playlistItems")) {
      assert.match(url, /playlistId=UUabc/);
      return new Response(JSON.stringify({ items: [{ snippet: { title: "Rueda de prensa de X", publishedAt: "2026-11-06T09:12:00Z", resourceId: { videoId: "VID1" } } }] }));
    }
    return new Response("", { status: 500 }); // Gemini cae: no pasa nada
  };
  const fuentes = [{ club: "Sevilla", yt: "UCabc" }];
  await redactorSombra(mk({}), { fetch: f, now, fuentes });
  let st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.fuentes.Sevilla.ok, false);                 // sin clave de YouTube: se anota el fallo
  assert.deepEqual(Object.keys(st.seen), []);
  await redactorSombra(mk({ YOUTUBE_API_KEY: "y" }), { fetch: f, now, fuentes, allTicks: true });
  st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.fuentes.Sevilla.via, "api");
  assert.ok(st.seen.VID1);
  assert.equal(st.seen.VID1.status, "pend");                  // Gemini falló: queda pendiente para reintentar
});

const IT = [{ jugador: "Casadó", nombre: "Marc Casadó", estado: "recuperacion_con_grupo", frase: "está completando entrenamientos con absoluta normalidad", minuto: "03:04", confianza: "alta", publicable: true }];

test("validarNoticia: acepta una noticia fiel y rechaza cifras inventadas o jugadores olvidados", () => {
  const ok = { titular: "Casadó se ejercita con normalidad en el Dépor", entradilla: "El centrocampista ya entrena con el grupo.", cuerpo: "Marc Casadó está completando entrenamientos con absoluta normalidad, según explicó el técnico en la rueda de prensa previa." };
  assert.ok(_r.validarNoticia(ok, IT));
  assert.equal(_r.validarNoticia({ ...ok, cuerpo: ok.cuerpo + " Estará tres semanas de baja." }, IT), null);
  assert.equal(_r.validarNoticia({ ...ok, cuerpo: "El centrocampista del Dépor entrena con normalidad desde esta semana sin ningún problema para el próximo encuentro de liga." }, IT), null); // no nombra al jugador
  assert.equal(_r.validarNoticia({ titular: "x", entradilla: "", cuerpo: "y" }, IT), null);
});

test("noticia escrita por la IA cuando pasa la validación", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t", PORRA: { async get(k, tp) { const v = kv.get(k); return v == null ? null : (tp === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  const tg = []; let n = 0;
  const f = async (url, o) => {
    url = String(url);
    if (url.includes("youtube.com/feeds")) return new Response(`<feed><entry><yt:videoId>AAA111</yt:videoId><title>Rueda de prensa de Hidalgo previa Espanyol</title><published>2026-11-06T09:12:00+00:00</published></entry></feed>`);
    if (url.includes("generativelanguage")) {
      n++;
      const txt = n === 1 ? TRANS + " x".repeat(400) : n === 2 ? JSON.stringify([{ jugador: "Casadó", estado: "recuperacion_con_grupo", frase: "está completando entrenamientos con absoluta normalidad", minuto: "03:04", confianza: "alta" }])
        : JSON.stringify([{ jugador: "Marc Casadó", titular: "Casadó se ejercita con normalidad en el Dépor", entradilla: "El centrocampista ya entrena con el grupo.", cuerpo: "Marc Casadó está completando entrenamientos con absoluta normalidad, según explicó el técnico en la rueda de prensa previa al partido." }]);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }], usageMetadata: { totalTokenCount: 1000 } }));
    }
    if (url.endsWith("/mercado")) return new Response(JSON.stringify({ players: [{ id: "1", name: "Marc Casadó", team: "Deportivo" }] }));
    if (url.includes("api.telegram.org")) { tg.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true })); }
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-06T10:03:00Z"), fuentes: [{ club: "Deportivo", yt: "X" }] });
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own[0].via, "ia");
  assert.equal(own[0].title, "Casadó se ejercita con normalidad en el Dépor");
  assert.equal(own[0].status, "published");
  assert.match(tg[0].caption || tg[0].text, /Casadó se ejercita/);
  assert.equal(own[0].players[0], "Marc Casadó");
});

test("una noticia antigua (una por vídeo) se rehace por jugador y se publica sola", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", PORRA: { async get(k, tp) { const v = kv.get(k); return v == null ? null : (tp === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  kv.set("rd:res:v1:OLD1", JSON.stringify({ id: "OLD1", club: "Sevilla", title: "r", pub: Date.parse("2026-11-06T08:00:00Z"), at: 1, items: IT }));
  kv.set("own:news:v1", JSON.stringify([{ id: "d1", status: "draft", createdAt: 5, updatedAt: 5, source: { videoId: "OLD1", name: "x", url: "https://youtu.be/OLD1" } }, { id: "d2", status: "draft", createdAt: 5, updatedAt: 9, source: { videoId: "OLD2" } }]));
  const f = async () => new Response("", { status: 500 });
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-06T10:03:00Z"), fuentes: [] });
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own.find((o) => o.id === "d1"), undefined);          // la noticia única de antes se sustituye
  const nueva = own.find((o) => o.key === "OLD1:" + "marc casado");
  assert.equal(nueva.status, "published");
  assert.equal(nueva.thumb, "https://i.ytimg.com/vi/OLD1/mqdefault.jpg");
  assert.equal(own.find((o) => o.id === "d2").status, "draft");   // el que Edu tocó no se toca
});

test("caducidad: una previa de hace más de 30 h ya no vale; una de después del partido aguanta 40 h", () => {
  const now = Date.parse("2026-11-07T10:00:00Z");
  const h = (n) => now - n * 3600e3;
  assert.equal(_r.caducada("Rueda de prensa de Luis García en la previa del #SevillaAlavés", h(20), now), false);
  assert.equal(_r.caducada("Rueda de prensa de Luis García en la previa del #SevillaAlavés", h(34), now), true);
  assert.equal(_r.caducada("Las reacciones de los protagonistas tras el Sevilla - Alavés", h(34), now), false);
  assert.equal(_r.caducada("Las reacciones de los protagonistas tras el Sevilla - Alavés", h(45), now), true);
});

test("la noticia de una previa caducada se retira de la web", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", PORRA: { async get(k, tp) { const v = kv.get(k); return v == null ? null : (tp === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  const now = Date.parse("2026-11-07T10:03:00Z");
  kv.set("rd:res:v1:V1", JSON.stringify({ id: "V1", club: "Sevilla", title: "Rueda de prensa en la previa del #SevillaAlavés", pub: now - 40 * 3600e3, items: IT }));
  kv.set("own:news:v1", JSON.stringify([{ id: "n1", status: "published", createdAt: 1, updatedAt: 1, source: { videoId: "V1" } }]));
  await redactorSombra(env, { fetch: async () => new Response("", { status: 500 }), now, fuentes: [] });
  const o = JSON.parse(kv.get("own:news:v1"))[0];
  assert.equal(o.status, "draft");
  assert.equal(o.caducada, true);
});

test("una noticia por jugador, agrupando sus frases", () => {
  const items = [
    { jugador: "Casadó", nombre: "Marc Casadó", id: "1", estado: "duda", frase: "a", minuto: "1:00", publicable: true },
    { jugador: "Casadó", nombre: "Marc Casadó", id: "1", estado: "duda", frase: "b", minuto: "2:00", publicable: true },
    { jugador: "Adama", nombre: "Adama Traore", id: "2", estado: "opcion_titular", frase: "c", minuto: "3:00", publicable: true },
    { jugador: "Otro", nombre: null, id: null, estado: "baja", frase: "d", minuto: "4:00", publicable: false },
  ];
  const g = _r.agruparPorJugador(items);
  assert.equal(g.length, 2);
  assert.equal(g[0].items.length, 2);
});

test("comparar con otras webs: coincidencias por jugador y lo que no cubrimos", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  const own = [{ id: "a", status: "published", publishedAt: now - 3600e3, title: "Casadó, duda", players: ["Marc Casadó"] }];
  const ext = [
    { title: "Casadó, duda para el domingo", link: "l1", src: "FutbolFantasy", seen: now - 1000 },
    { title: "Fofana pierde brillo", link: "l2", src: "FutbolFantasy", seen: now - 1000 },
  ];
  const c = _r.compararNoticias(own, ext, now);
  assert.equal(c.total, 1);
  assert.equal(c.coincide, 1);
  assert.equal(c.propias[0].matches[0].link, "l1");
  assert.deepEqual(c.sinCubrir.map((x) => x.link), ["l2"]);
});
