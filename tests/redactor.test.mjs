import test from "node:test";
import assert from "node:assert/strict";
import { _r, redactorSombra } from "../cron/src/redactor.js";

const ROBOTS_YT = "User-agent: *\nDisallow: /feeds/videos.xml\n";
const ROBOTS_IMG = "User-agent: *\nDisallow: /sb/\n";
const YT = "UCdeportivo0000001";
const RUEDA_TITULO = "Entrenador Inventado habla del grupo, el trabajo y la valoración del equipo";
const RUEDA_LEAD = "El técnico del Barcelona resumió la rueda oficial del grupo.";
const RUEDA_CUERPO = [
  "El técnico del Barcelona compareció en la rueda oficial y repasó el trabajo del grupo.",
  "Entrenador Inventado dejó por escrito las frases sobre el equipo de prueba.",
  "La nota oficial no trae un marcador y este texto no añade ninguno.",
  "El relato se queda en lo que dijo sobre el grupo y el trabajo.",
  "Y cada respuesta sale tal cual, sin recortar las palabras de la cita.",
  "Barcelona publica la rueda y aquí solo se usa esa nota.",
  "El grupo de prueba es el tema de las frases que siguen.",
  "Sobre el equipo habló Entrenador Inventado en la misma comparecencia.",
  "No hay otra cifra ni otro nombre en esta pieza de la rueda.",
  "La frase final vuelve sobre el trabajo de este grupo de prueba.",
].join(" ") + "\n\n**La valoración del grupo**\n«Creo mucho en este equipo de prueba»\n\n**El trabajo del equipo**\n«Ha sido muy bien el trabajo de este grupo de prueba»";
const CRONICA_TEXTO = [
  "En el partido entre Equipo A y Equipo B, el tanto llegó en el minuto 12.",
  "Delantero Fijo firmó ese gol para Equipo A.",
  "Equipo B no contestó en el marcador y el 1-0 se mantuvo.",
  "El dato del encuentro es ese gol de Delantero Fijo.",
  "Equipo A ya tenía el 1-0 antes del final.",
  "El partido no dejó otro tanto en los hechos.",
  "Con el 1-0 Equipo A cerró el encuentro frente a Equipo B.",
  "Sobre ese gol del minuto 12 no hay otra cifra en los hechos.",
  "Tras el 1-0 queda Delantero Fijo y también Equipo B.",
  "Al cierre Equipo A sumó el tanto y Equipo B se quedó sin otro gol.",
  "El minuto 12 es el único minuto escrito para Delantero Fijo.",
  "Equipo B encajó ese gol y el marcador siguió 1-0.",
  "Delantero Fijo es el nombre del tanto en el minuto 12.",
  "El 1-0 entre Equipo A y Equipo B queda con ese gol.",
].join(" ");

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
  assert.equal(r[0].confianza, "alta");
  assert.equal(r[1].publicable, false);            // confianza media
  assert.equal(r[1].motivo, "confianza no alta");
  assert.equal(r[2].publicable, false);            // frase no verificada
});

test("Leo Román: una frase real de otro jugador no se publica como suya (ejemplo ficticio, solo test)", () => {
  const texto = "[12:00] Leo Román ha estado hablando con la prensa sobre la afición del equipo. [14:10] Moleiro está descartado y no podrá jugar el domingo según el míster.";
  const plantilla = [{ id: "77", name: "Leo Román" }, { id: "88", name: "Moleiro" }];
  const frase = "está descartado y no podrá jugar";
  const leo = _r.filtrar([{ jugador: "Leo Román", estado: "baja", frase, minuto: "14:10", confianza: "alta" }], texto, plantilla);
  assert.equal(_r.fraseVerificada(frase, texto), true);
  assert.equal(leo[0].publicable, false);
  assert.match(leo[0].motivo, /no va con este jugador/);
  const moleiro = _r.filtrar([{ jugador: "Moleiro", estado: "baja", frase, minuto: "14:10", confianza: "alta" }], texto, plantilla);
  assert.equal(moleiro[0].publicable, true);
  assert.equal(moleiro[0].nombre, "Moleiro");
});

test("no junta palabras de frases distintas ni publica un «no» como si fuera una baja", () => {
  const collage = "Casadó está completando la sesión. El extremo podrá estar en la convocatoria del domingo si el míster lo decide.";
  assert.equal(_r.fraseVerificada("Casadó podrá estar en la convocatoria", collage), false);
  const t = "[01:02] Casadó no está descartado y sigue con el grupo";
  const r = _r.filtrar([{ jugador: "Casadó", estado: "baja", frase: "no está descartado", minuto: "01:02", confianza: "alta" }], t, PL);
  assert.equal(r[0].verificada, true);
  assert.equal(r[0].publicable, false);
  assert.match(r[0].motivo, /no se sostiene/);
});

test("robots.txt: el RSS de YouTube está prohibido; si no se puede leer, también", () => {
  const yt = "User-agent: *\nDisallow: /feeds/videos.xml\n";
  assert.equal(_r.robotsPermite(yt, "https://www.youtube.com/feeds/videos.xml?channel_id=UC1"), false);
  assert.equal(_r.robotsPermite(yt, "https://www.youtube.com/watch?v=abc"), true);
  assert.equal(_r.robotsPermite("User-agent: *\nDisallow: /sb/\n", "https://i.ytimg.com/vi/abc/hqdefault.jpg"), true);
  assert.equal(_r.robotsPermite("", "https://www.youtube.com/watch?v=abc"), false);
  assert.equal(_r.robotsPermite(null, "https://www.youtube.com/watch?v=abc"), false);
  assert.equal(_r.robotsPermite("<!doctype html><html>", "https://www.youtube.com/watch?v=abc"), false);
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

test("flujo completo: publica la noticia verificada y avisa una sola vez", async () => {
  const kv = new Map();
  const env = {
    GEMINI_API_KEY: "k", YOUTUBE_API_KEY: "y", TELEGRAM_BOT_TOKEN: "t",
    PORRA: {
      async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
      async put(k, v) { kv.set(k, v); },
    },
  };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  const tgMsgs = [];
  let llamadasGemini = 0;
  let feeds = 0;
  const fetchFalso = async (url, opts) => {
    url = String(url);
    if (url.includes("youtube.com/robots.txt")) return new Response(ROBOTS_YT);
    if (url.includes("i.ytimg.com/robots.txt")) return new Response(ROBOTS_IMG);
    if (url.includes("/feeds/videos.xml")) { feeds++; return new Response("no", { status: 500 }); }
    if (url.includes("playlistItems")) {
      assert.match(url, /playlistId=UUdeportivo0000001/);
      return new Response(JSON.stringify({ items: [{ snippet: { title: "Rueda de prensa de Hidalgo previa Espanyol", publishedAt: "2026-11-06T09:12:00Z", resourceId: { videoId: "AAA111" } } }] }));
    }
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
  const r = await redactorSombra(env, { fetch: fetchFalso, now, fuentes: [{ club: "Deportivo", yt: YT }] });
  assert.equal(r.procesado, "AAA111");
  assert.equal(r.tokens, 87000);
  const guardado = JSON.parse(kv.get("rd:res:v1:AAA111"));
  assert.equal(guardado.items[0].publicable, true);
  assert.equal(guardado.items[0].nombre, "Marc Casadó");
  assert.equal(tgMsgs.length, 1);
  assert.equal(tgMsgs[0].chat_id, "42");
  assert.match(tgMsgs[0].text, /guiafantasy\/noticias\/ed-/);
  assert.equal(tgMsgs[0].link_preview_options.prefer_large_media, true); // tarjeta con título, resumen e imagen
  assert.match(tgMsgs[0].caption || tgMsgs[0].text, /guiafantasy\/noticias\/ed-/);
  assert.match(own0thumb(kv), /i\.ytimg\.com\/vi\/AAA111\//);
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own.length, 1);
  assert.equal(own[0].status, "published");           // se publica sola
  assert.equal(own[0].source.videoId, "AAA111");
  assert.equal(own[0].via, "plantilla");              // el Gemini falso no devuelve noticia válida
  assert.match(own[0].body, /«está completando entrenamientos con absoluta normalidad»/);
  assert.doesNotMatch(own[0].body, /Entrena con el grupo/);
  assert.equal(own[0].title, "Marc Casadó: entrena con el grupo");
  assert.match(own[0].lead, /^Según Deportivo/);
  assert.match(own[0].source.name, /^Según Deportivo/);
  assert.equal(own[0].expira, true);
  assert.equal(feeds, 0);
  // segunda pasada: ya está hecho, no vuelve a gastar ni a reenviar
  const r2 = await redactorSombra(env, { fetch: fetchFalso, now: now + 10 * 60e3, fuentes: [{ club: "Deportivo", yt: YT }] });
  assert.equal(r2.procesado, null);
  assert.equal(llamadasGemini, 3);                // transcripción + estados + redacción
  assert.equal(tgMsgs.length, 1);
  assert.equal(JSON.parse(kv.get('own:news:v1')).length, 1);
});

test("el RSS prohibido no se pide; sin clave de YouTube se anota y con clave se usa la API", async () => {
  const kv = new Map();
  const mk = (extra) => ({
    GEMINI_API_KEY: "k", ...extra,
    PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } },
  });
  const now = Date.parse("2026-11-06T10:03:00Z");
  let feeds = 0;
  const f = async (url) => {
    url = String(url);
    if (url.includes("youtube.com/robots.txt")) return new Response(ROBOTS_YT);
    if (url.includes("/feeds/videos.xml")) { feeds++; return new Response("<feed></feed>"); }
    if (url.includes("googleapis.com/youtube/v3/playlistItems")) {
      assert.match(url, /playlistId=UUabc/);
      return new Response(JSON.stringify({ items: [{ snippet: { title: "Rueda de prensa de X", publishedAt: "2026-11-06T09:12:00Z", resourceId: { videoId: "VID1" } } }] }));
    }
    return new Response("", { status: 500 }); // Gemini cae: no pasa nada
  };
  const fuentes = [{ club: "Sevilla", yt: "UCabc" }];
  await redactorSombra(mk({}), { fetch: f, now, fuentes });
  let st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(feeds, 0);
  assert.equal(st.fuentes.Sevilla.ok, false);
  assert.match(st.fuentes.Sevilla.error, /robots/);
  assert.deepEqual(Object.keys(st.seen), []);
  await redactorSombra(mk({ YOUTUBE_API_KEY: "y" }), { fetch: f, now, fuentes, allTicks: true });
  st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(feeds, 0);
  assert.equal(st.fuentes.Sevilla.via, "api");
  assert.ok(st.seen.VID1);
  assert.equal(st.seen.VID1.status, "pend");                  // Gemini falló: queda pendiente para reintentar
});

test("si robots.txt no se puede leer no se toca el RSS", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", YOUTUBE_API_KEY: "y", PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  let feeds = 0;
  const f = async (url) => {
    url = String(url);
    if (url.includes("/feeds/videos.xml")) { feeds++; return new Response("<feed><entry><yt:videoId>Z</yt:videoId><title>Rueda de prensa</title><published>2026-11-06T09:12:00Z</published></entry></feed>"); }
    return new Response("no", { status: 503 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-06T10:03:00Z"), fuentes: [{ club: "Sevilla", yt: "UCabc" }] });
  assert.equal(feeds, 0);
  const st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.fuentes.Sevilla.ok, false);
  assert.match(st.fuentes.Sevilla.error, /ilegible|robots/);
});

const IT = [{ jugador: "Casadó", nombre: "Marc Casadó", estado: "recuperacion_con_grupo", frase: "está completando entrenamientos con absoluta normalidad", minuto: "03:04", confianza: "alta", publicable: true }];

test("validarNoticia: acepta una noticia fiel y rechaza cifras inventadas o jugadores olvidados", () => {
  const ok = { titular: "Casadó se ejercita con normalidad en el Dépor", entradilla: "Ya entrena con el grupo.", cuerpo: "Marc Casadó está completando entrenamientos con absoluta normalidad, según explicó el técnico en la rueda de prensa previa." };
  assert.ok(_r.validarNoticia(ok, IT));
  assert.equal(_r.validarNoticia({ ...ok, cuerpo: ok.cuerpo + " Estará tres semanas de baja." }, IT), null);
  assert.equal(_r.validarNoticia({ ...ok, cuerpo: "El jugador del Dépor entrena con normalidad desde esta semana sin ningún problema para el próximo encuentro de liga." }, IT), null); // no nombra al jugador
  assert.equal(_r.validarNoticia({ ...ok, cuerpo: ok.cuerpo + " El domingo." }, IT), null);
  assert.equal(_r.validarNoticia({ ...ok, titular: "Casadó, baja en el Dépor" }, IT), null);
  assert.equal(_r.validarNoticia({ titular: "x", entradilla: "", cuerpo: "y" }, IT), null);
});

test("noticia escrita por la IA cuando pasa la validación", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", YOUTUBE_API_KEY: "y", TELEGRAM_BOT_TOKEN: "t", PORRA: { async get(k, tp) { const v = kv.get(k); return v == null ? null : (tp === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  const tg = []; let n = 0;
  const f = async (url, o) => {
    url = String(url);
    if (url.includes("youtube.com/robots.txt")) return new Response(ROBOTS_YT);
    if (url.includes("i.ytimg.com/robots.txt")) return new Response(ROBOTS_IMG);
    if (url.includes("playlistItems")) return new Response(JSON.stringify({ items: [{ snippet: { title: "Rueda de prensa de Hidalgo previa Espanyol", publishedAt: "2026-11-06T09:12:00Z", resourceId: { videoId: "AAA111" } } }] }));
    if (url.includes("generativelanguage")) {
      n++;
      const txt = n === 1 ? TRANS + " x".repeat(400) : n === 2 ? JSON.stringify([{ jugador: "Casadó", estado: "recuperacion_con_grupo", frase: "está completando entrenamientos con absoluta normalidad", minuto: "03:04", confianza: "alta" }])
        : JSON.stringify([{ jugador: "Marc Casadó", titular: "Casadó se ejercita con normalidad en el Dépor", entradilla: "Ya entrena con el grupo.", cuerpo: "Marc Casadó está completando entrenamientos con absoluta normalidad, según explicó el técnico en la rueda de prensa previa al partido." }]);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: txt }] } }], usageMetadata: { totalTokenCount: 1000 } }));
    }
    if (url.endsWith("/mercado")) return new Response(JSON.stringify({ players: [{ id: "1", name: "Marc Casadó", team: "Deportivo" }] }));
    if (url.includes("api.telegram.org")) { tg.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true })); }
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-06T10:03:00Z"), fuentes: [{ club: "Deportivo", yt: YT }] });
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own[0].via, "ia");
  assert.equal(own[0].title, "Casadó se ejercita con normalidad en el Dépor");
  assert.equal(own[0].status, "published");
  assert.match(tg[0].text, /guiafantasy\/noticias\/ed-/);
  assert.equal(tg[0].link_preview_options.prefer_large_media, true);
  assert.equal(own[0].players[0], "Marc Casadó");
});

test("los borradores ya guardados no se republican ni se borran", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", PORRA: { async get(k, tp) { const v = kv.get(k); return v == null ? null : (tp === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  kv.set("rd:res:v1:OLD1", JSON.stringify({ id: "OLD1", club: "Sevilla", title: "r", pub: Date.parse("2026-11-06T08:00:00Z"), at: 1, items: IT }));
  kv.set("own:news:v1", JSON.stringify([{ id: "d1", status: "draft", createdAt: 5, updatedAt: 5, source: { videoId: "OLD1", name: "x", url: "https://youtu.be/OLD1" } }, { id: "d2", status: "draft", createdAt: 5, updatedAt: 9, source: { videoId: "OLD2" } }]));
  const f = async () => new Response("", { status: 500 });
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-06T10:03:00Z"), fuentes: [] });
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own.length, 2);
  assert.equal(own.find((o) => o.id === "d1").status, "draft");
  assert.equal(own.find((o) => o.id === "d2").status, "draft");
  assert.equal(own.some((o) => o.status === "published"), false);
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
  kv.set("own:news:v1", JSON.stringify([
    { id: "n1", status: "published", expira: true, createdAt: 1, updatedAt: 1, source: { videoId: "V1" } },
    { id: "vieja", status: "published", createdAt: 1, updatedAt: 1, source: { videoId: "V1" } },
  ]));
  await redactorSombra(env, { fetch: async () => new Response("", { status: 500 }), now, fuentes: [] });
  const own = JSON.parse(kv.get("own:news:v1"));
  const o = own.find((x) => x.id === "n1");
  assert.equal(o.status, "draft");
  assert.equal(o.caducada, true);
  assert.equal(own.find((x) => x.id === "vieja").status, "published");
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

test("un «no» de valoración se publica; no se convierte en baja", () => {
  const texto = "[20:10] No hemos sido contundentes en el área rival";
  const r = _r.filtrar([{ jugador: "", tema: "valoracion", frase: "No hemos sido contundentes en el área", confianza: "alta" }], texto, PL);
  assert.equal(r[0].publicable, true);
  assert.equal(r[0].estado, "valoracion");
  assert.notEqual(r[0].estado, "baja");
});

test("crónica solo con goles nombrados; si el marcador no cuadra, nada", () => {
  const ok = _r.cronicaDesdeHechos({ home: "Local", away: "Visitante", marcador: [1, 0], goles: [{ name: "Jugador Prueba", min: 10, side: "home" }] });
  assert.equal(ok.title, "El gol de Jugador Prueba ante el Visitante");
  assert.equal(_r.entradillaRepiteTitulo(ok.title, ok.lead), false);
  assert.equal(_r.entradillaRepiteTitulo("Fermín López marcó dos goles", "Fermín López marcó dos goles ante el Atlético de Madrid."), true);
  assert.doesNotMatch(ok.title, /\d+\s*[-–]\s*\d+/);
  assert.match(ok.ficha.title, /Local 1-0 Visitante/);
  assert.match(ok.body, /10'/);
  assert.equal(_r.cronicaDesdeHechos({ home: "Local", away: "Visitante", marcador: [2, 0], goles: [{ name: "Jugador Prueba", min: 10, side: "home" }] }), null);
  assert.equal(_r.cronicaDesdeHechos({ home: "Local", away: "Visitante", goles: [{ name: "", min: 10, side: "home" }] }), null);
  const ev = { g: [{ m: 12, x: 0, p: "9", h: 1, og: 0 }], home: { st: [["9", "Delantero Fijo"]], sb: [] }, away: { st: [], sb: [] } };
  const deEv = _r.cronicaDesdeEv("Local", "Visitante", ev, [1, 0]);
  assert.match(deEv.title, /El gol de Delantero Fijo ante el Visitante/);
  assert.match(deEv.ficha.lead, /Delantero Fijo 12'/);
  assert.equal(_r.cronicaDesdeEv("Local", "Visitante", { g: [{ m: 1, p: "1", h: 1, og: 1 }], home: { st: [["1", "Portero"]], sb: [] }, away: { st: [], sb: [] } }, [1, 0]), null);
});

test("nota oficial: se lee la cita del título y el marcador, no el resto", () => {
  const sm = `<url><loc>https://www.fcbarcelona.es/es/futbol/primer-equipo/noticias/9/x</loc><news:title>Entrenador: "Creo mucho en este equipo"</news:title><news:publication_date>2026-11-08T23:02:26Z</news:publication_date></url>`;
  const n = _r.parseSitemapNews(sm)[0];
  assert.equal(_r.esNotaPrimerEquipo(n.url), true);
  assert.equal(_r.esNotaPrimerEquipo("https://www.fcbarcelona.es/es/futbol/femenino-a/noticias/1/x"), false);
  assert.equal(_r.citaEnTitulo(n.title).frase, "Creo mucho en este equipo");
  assert.deepEqual(_r.partidoEnTitulo("Equipo A - Equipo B: un encuentro (1-0)"), { home: "Equipo A", away: "Equipo B", marcador: [1, 0] });
  assert.deepEqual(_r.partidoEnTitulo("Atlético de Madrid - FC Barcelona: Remontada de líder (1-2)").marcador, [1, 2]);
  const html = '<p>El técnico ha dicho: "No hemos sido contundentes en el área". El resto del párrafo no es una cita.</p>';
  const c = _r.citasDeHtml(html);
  assert.equal(c.length, 1);
  assert.match(c[0].frase, /^No hemos sido contundentes/);
});

test("la web oficial publica la cita literal y no el párrafo de alrededor", async () => {
  const kv = new Map();
  const env = {
    GEMINI_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t",
    PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } },
  };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  const tg = [];
  let gemini = 0;
  const f = async (url, o) => {
    url = String(url);
    if (url.includes("youtube.com/robots.txt")) return new Response(ROBOTS_YT);
    if (url.includes("club.test/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
    if (url.endsWith("/sitemap.xml")) return new Response(`<url><loc>https://club.test/es/futbol/primer-equipo/noticias/9/flick</loc><news:title>Entrenador Inventado: "Creo mucho en este equipo de prueba"</news:title><news:publication_date>2026-11-08T23:02:26Z</news:publication_date></url>`);
    if (url.includes("/noticias/9/")) return new Response('<p>Entrenador Inventado ha dicho: "Creo mucho en este equipo de prueba". Luego añadió: "Ha sido muy bien el trabajo de este grupo de prueba". El resto no va entre comillas y no se copia.</p>');
    if (url.endsWith("/mercado")) return new Response(JSON.stringify({ players: [{ id: "1", name: "Marc Casadó", team: "Barcelona" }] }));
    if (url.includes("generativelanguage")) {
      gemini++;
      const cuerpo = RUEDA_CUERPO;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ jugador: "Entrenador Inventado", titular: RUEDA_TITULO, entradilla: RUEDA_LEAD, cuerpo }]) }] } }], usageMetadata: { totalTokenCount: 20 } }));
    }
    if (url.includes("api.telegram.org")) { tg.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true })); }
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-09T01:03:00Z"), fuentes: [{ club: "Barcelona", noticias: "https://club.test/sitemap.xml" }] });
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own.length, 1);
  assert.equal(own[0].status, "published");
  assert.match(own[0].body, /«Creo mucho en este equipo de prueba»/);
  assert.doesNotMatch(own[0].body, /no se copia|resto/);
  assert.match(own[0].source.name, /OFICIAL/);
  assert.match(own[0].source.url, /club\.test\/es\/futbol\/primer-equipo\/noticias\/9\//);
  assert.match(tg[0].caption || tg[0].text, /guiafantasy\/noticias\/ed-/);
  assert.equal(gemini, 1);
});

test("crónica: publica los goles del partido de prueba y no un relato", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  const f = async (url) => {
    url = String(url);
    if (url.includes("youtube.com/robots.txt")) return new Response(ROBOTS_YT);
    if (url.includes("club.test/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
    if (url.endsWith("/sitemap.xml")) return new Response(`<url><loc>https://club.test/es/futbol/primer-equipo/noticias/8/partido</loc><news:title>Equipo A - Equipo B: encuentro de prueba (1-0)</news:title><news:publication_date>2026-11-08T22:00:00Z</news:publication_date></url>`);
    if (url.includes("/noticias/8/")) return new Response("<p>Este relato largo no debe copiarse.</p>");
    if (url.includes("fm-partido")) return new Response(JSON.stringify({ ev: { g: [{ m: 12, x: 0, p: "9", h: 1, og: 0 }], home: { st: [["9", "Delantero Fijo"]], sb: [] }, away: { st: [], sb: [] } } }));
    if (url.includes("generativelanguage")) {
      const texto = CRONICA_TEXTO;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }], usageMetadata: { totalTokenCount: 12 } }));
    }
    if (url.endsWith("/mercado")) return new Response(JSON.stringify({ players: [{ id: "9", name: "Delantero Fijo", photo: "https://fotos.test/delantero.jpg" }] }));
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-09T01:03:00Z"), fuentes: [{ club: "Barcelona", noticias: "https://club.test/sitemap.xml" }] });
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own.length, 3);
  const historia = own.find((o) => o.key.indexOf("lupa-") === 0);
  const equipo = own.find((o) => o.key.indexOf("cronica-") === 0);
  const ficha = own.find((o) => o.key.indexOf("marcador-") === 0);
  assert.equal(historia.tipo, "lupa");
  assert.equal(equipo.tipo, "cronica");
  assert.match(equipo.title, /El encuentro de liga/);
  assert.doesNotMatch(equipo.title, /\d+\s*[-–]\s*\d+/);
  assert.equal(historia.title, "El gol de Delantero Fijo ante el Equipo B");
  assert.equal(_r.entradillaRepiteTitulo(historia.title, historia.lead), false);
  assert.doesNotMatch(historia.lead, /9 de noviembre|marcó un gol/);
  assert.doesNotMatch(historia.title, /\d+\s*[-–]\s*\d+/);
  assert.match(ficha.title, /Equipo A 1-0 Equipo B/);
  assert.match(ficha.lead, /Delantero Fijo 12'/);
  assert.equal(historia.thumb, "https://fotos.test/delantero.jpg");
  assert.match(historia.body, /minuto 12/);
  assert.equal(_r.sujetosSeguidos(historia.body), false);
  assert.doesNotMatch(historia.body, /Delantero Fijo marcó/);
  assert.doesNotMatch(own[0].body + own[0].title, /relato|remontada|liderato/);
  assert.match(own[0].source.name, /FotMob/);
});

test("un cuerpo no puede repetir el sujeto ni quedarse por debajo del mínimo", () => {
  assert.equal(_r.sujetosSeguidos("Fermín López marcó el primero. Fermín López marcó el segundo."), true);
  const hechos = "Fermín López Atlético de Madrid Barcelona 1 2 45 66 10 Giuliano Simeone Lamine Yamal";
  const corto = "Fermín López marcó en el 45. El partido acabó 1-2.";
  assert.equal(_r.depurarCuerpo("cronica", corto, hechos), null);
  const repetido = "Fermín López marcó en el 45 tras una jugada del Barcelona. Fermín López marcó en el 66 con un pase de Lamine Yamal. El partido acabó 1-2 y Giuliano Simeone había marcado en el 10 para el Atlético de Madrid.";
  assert.equal(_r.depurarCuerpo("cronica", repetido, hechos), null);
  const bueno = [
    "En el partido, el Barcelona dio la vuelta al Atlético de Madrid.",
    "Fermín López firmó el empate en el 45 y el segundo tanto en el 66, con un pase de Lamine Yamal.",
    "Giuliano Simeone adelantó a los locales en el 10.",
    "El encuentro acabó 1-2.",
    "Barcelona sostuvo el 1-2 frente al Atlético de Madrid.",
    "Lamine Yamal participó en la jugada del 66.",
    "El 1 lo firmó Giuliano Simeone para el Atlético de Madrid.",
    "En el 66 llegó el segundo de Fermín López.",
    "El 45 dejó el empate entre Barcelona y Atlético de Madrid.",
    "Con el 1-2 terminó el partido de Fermín López, Lamine Yamal y Giuliano Simeone.",
    "Atlético de Madrid empezó por delante y Barcelona dio la vuelta.",
    "El tanto del 10 fue de Giuliano Simeone y los del 45 y del 66 fueron de Fermín López.",
  ].join(" ");
  assert.equal(_r.sujetosSeguidos(bueno), false);
  assert.ok(_r.depurarCuerpo("cronica", bueno, hechos));
  const conDatoInventado = bueno + " Fue titular y jugó muchos minutos.";
  const limpio = _r.depurarCuerpo("cronica", conDatoInventado, hechos);
  assert.ok(limpio);
  assert.doesNotMatch(limpio, /titular|minutos/);
  assert.equal(_r.depurarCuerpo("rueda", "Hansi Flick habló tras el partido. «Creo mucho en este equipo».", "Hansi Flick Creo mucho en este equipo"), null);
});

test("el minuto oficial manda; si no hay oficial y las fuentes no coinciden, sin datos", () => {
  assert.equal(_r.elegirMinuto([{ min: 9, oficial: false }, { min: 10, oficial: true }]), 10);
  assert.equal(_r.elegirMinuto([{ min: 9, oficial: false }, { min: 10, oficial: false }]), null);
  assert.equal(_r.elegirMinuto([{ min: 9, oficial: false }]), 9);
  const html = "<p>Giuliano abrió el marcador (1-0, min 10).</p>";
  assert.deepEqual(_r.minutosOficiales(html), [{ h: 1, a: 0, min: 10, extra: 0 }]);
  const ev = { g: [{ m: 9, x: 0, p: "7", h: 1, og: 0 }], home: { st: [["7", "Giuliano Simeone"]], sb: [] }, away: { st: [], sb: [] } };
  const oficial = _r.cronicaDesdeEv("Atlético", "Barcelona", ev, [1, 0], { oficiales: _r.minutosOficiales(html) });
  assert.match(oficial.ficha.lead, /10'/);
  assert.doesNotMatch(oficial.ficha.lead + oficial.hechos, /9'/);
  const sin = _r.cronicaDesdeHechos({ home: "Atlético", away: "Barcelona", marcador: [1, 0], goles: [{ name: "Giuliano Simeone", min: null, side: "home" }] });
  assert.match(sin.ficha.lead, /sin datos/);
  assert.doesNotMatch(sin.hechos, /\b9\b/);
});

test("la fecha sale de la fuente y una frase con otro día se tira", () => {
  assert.equal(_r.fechaDeFuente('<script type="application/ld+json">{"datePublished":"2026-11-08"}</script>'), "8 de noviembre de 2026");
  assert.equal(_r.fechaDeFuente('<script type="application/ld+json">{"datePublished":"2026-11-08T23:02:26Z"}</script>'), "");
  assert.equal(_r.fechaTexto("2026-11-08"), "8 de noviembre de 2026");
  const hechos = "Fecha: 8 de noviembre de 2026. Gol: Giuliano Simeone, minuto 9.";
  const malo = "Flick habló el 9 de noviembre de 2026 tras el partido.";
  assert.equal(_r.depurarCuerpo("rueda", malo + " " + "palabra ".repeat(40), hechos), null);
  const limpio = _r.revisarEntradilla("Hansi Flick habla del equipo", "Habló el 9 de noviembre. Giuliano Simeone marcó en el minuto 9.", hechos);
  assert.doesNotMatch(limpio, /9 de noviembre/);
  assert.match(limpio, /minuto 9/);
  assert.equal(_r.revisarEntradilla("Hansi Flick habla del equipo", "Habló el 9 de noviembre de 2026.", hechos), null);
  const conFecha = _r.cronicaDesdeHechos({ home: "Atlético de Madrid", away: "Barcelona", marcador: [1, 2], fecha: "8 de noviembre de 2026", goles: [{ name: "Fermín López", min: 45, side: "away" }, { name: "Fermín López", min: 66, side: "away" }, { name: "Giuliano Simeone", min: 10, side: "home" }] });
  assert.match(conFecha.title, /El doblete de Fermín López/);
  assert.doesNotMatch(conFecha.title, /\d+\s*[-–]\s*\d+/);
  assert.match(conFecha.lead, /8 de noviembre de 2026/);
  assert.doesNotMatch(conFecha.lead, /9 de noviembre/);
  assert.equal(_r.entradillaRepiteTitulo(conFecha.title, conFecha.lead), false);
  assert.equal(_r.entradillaRepiteTitulo(conFecha.title, "Fermín López marcó dos goles ante el Atlético de Madrid."), true);
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

test("el aviso usa la página larga y no queda como enviado si Telegram no acepta", async () => {
  assert.match(_r.noticiaTelegram({ id: "b22eb497ee", title: "T", body: "c" }), /https:\/\/edumr\.es\/futmondo\/guiafantasy\/noticias\/ed-b22eb497ee/);
  assert.doesNotMatch(_r.noticiaTelegram({ id: "b22eb497ee", title: "T", body: "c" }), /edumr\.es\/n\//);
  const kv = new Map();
  const env = {
    GEMINI_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t",
    PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } },
  };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  let acepta = false;
  const tg = [];
  const f = async (url, o) => {
    url = String(url);
    if (url.includes("youtube.com/robots.txt")) return new Response(ROBOTS_YT);
    if (url.includes("club.test/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
    if (url.endsWith("/sitemap.xml")) return new Response(`<url><loc>https://club.test/es/futbol/primer-equipo/noticias/9/flick</loc><news:title>Entrenador Inventado: "Creo mucho en este equipo de prueba"</news:title><news:publication_date>2026-11-08T23:02:26Z</news:publication_date></url>`);
    if (url.includes("/noticias/9/")) return new Response('<p>"Creo mucho en este equipo de prueba" "Ha sido muy bien el trabajo de este grupo de prueba"</p>');
    if (url.endsWith("/mercado")) return new Response(JSON.stringify({ players: [] }));
    if (url.includes("generativelanguage")) {
      const cuerpo = RUEDA_CUERPO;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ jugador: "Entrenador Inventado", titular: RUEDA_TITULO, entradilla: RUEDA_LEAD, cuerpo }]) }] } }], usageMetadata: { totalTokenCount: 20 } }));
    }
    if (url.includes("api.telegram.org")) {
      const body = JSON.parse(o.body);
      tg.push(url);
      assert.doesNotMatch(url, /sendPhoto/);
      assert.match(body.text, /guiafantasy\/noticias\/ed-/);
      return new Response(JSON.stringify(acepta ? { ok: true } : { ok: false, description: "rechazado" }));
    }
    return new Response("", { status: 404 });
  };
  const now = Date.parse("2026-11-09T01:03:00Z");
  const fuentes = [{ club: "Barcelona", noticias: "https://club.test/sitemap.xml" }];
  await redactorSombra(env, { fetch: f, now, fuentes });
  let st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.tgUltimo.ok, false);
  assert.equal(st.tgPend.length, 1);
  assert.equal(st.tgHecho[st.tgPend[0].id], undefined);
  acepta = true;
  await redactorSombra(env, { fetch: f, now: now + 2 * 60e3, fuentes });
  st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.tgUltimo.ok, true);
  assert.equal(st.tgPend.length, 0);
  assert.equal(typeof st.tgHecho[st.tgUltimo.id], "number");
  const enviados = tg.length;
  await redactorSombra(env, { fetch: f, now: now + 4 * 60e3, fuentes });
  assert.equal(tg.length, enviados);
});

test("una pista sin fuente permitida no publica, y un club prohibido tampoco", async () => {
  assert.equal(_r.clubProhibido("Athletic Club"), true);
  assert.equal(_r.clubProhibido("Deportivo Alavés"), true);
  assert.equal(_r.clubProhibido("Atlético de Madrid"), false);
  assert.equal(_r.pistaAceptable({ id: "x1", tipo: "lesion", equipo: "Athletic", tema: "baja" }).motivo, "club prohibido");
  assert.equal(_r.pistaAceptable({ id: "x2", tipo: "rueda", equipo: "Barcelona", tema: "ver https://x.com/futbol_fantasy/1" }).motivo, "pista con enlace");
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  kv.set("rd:pistas:v1", JSON.stringify({ v: 1, items: [{ id: "p-getafe", at: "2026-11-08T21:00:00Z", tipo: "lesion", equipo: "Getafe", jugadores: ["Jugador Sin Ficha"], entrenador: "", tema: "molestia en un entrenamiento" }] }));
  const f = async (url) => {
    url = String(url);
    if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /\n");
    if (url.endsWith("/sitemap.xml")) return new Response("<urlset></urlset>");
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-09T01:03:00Z"), allTicks: true, fuentes: [{ club: "Barcelona", noticias: "https://club.test/sitemap.xml" }] });
  assert.equal(kv.get("own:news:v1"), undefined);
  const st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.pistasN.recibidas, 1);
  assert.equal(st.pistasN.publicadas, 0);
  assert.equal(st.pistasN.descartadas, 1);
  assert.equal(st.pistasN.motivos["sin fuente permitida"], 1);
  assert.equal(st.pistas["p-getafe"].motivo, "sin fuente permitida");
});

test("una pista verificada en la web oficial se publica una vez y la repetida no", async () => {
  const kv = new Map();
  const env = {
    GEMINI_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t",
    PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } },
  };
  kv.set("tg:avisos:v1", JSON.stringify({ chat: "42" }));
  const pista = { id: "post1", at: "2026-11-08T21:00:00Z", tipo: "rueda", equipo: "Barcelona", jugadores: [], entrenador: "Entrenador Inventado", tema: "sensaciones del vestuario" };
  kv.set("rd:pistas:v1", JSON.stringify({ v: 1, items: [pista] }));
  const tg = [];
  const f = async (url, o) => {
    url = String(url);
    if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /\n");
    if (url.endsWith("/sitemap.xml")) return new Response(`<url><loc>https://club.test/noticias/inventado-habla</loc><news:title>Entrenador Inventado: "Creo mucho en este equipo de prueba"</news:title><news:publication_date>2026-11-08T20:00:00Z</news:publication_date></url>`);
    if (url.includes("/noticias/inventado-habla")) return new Response('<p>Entrenador Inventado ha dicho: "Creo mucho en este equipo de prueba". Luego añadió: "Ha sido muy bien el trabajo de este grupo de prueba". El resto no se copia.</p>');
    if (url.endsWith("/mercado")) return new Response(JSON.stringify({ players: [] }));
    if (url.includes("generativelanguage")) {
      const cuerpo = RUEDA_CUERPO;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ jugador: "Entrenador Inventado", titular: RUEDA_TITULO, entradilla: RUEDA_LEAD, cuerpo }]) }] } }], usageMetadata: { totalTokenCount: 20 } }));
    }
    if (url.includes("api.telegram.org")) { tg.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true })); }
    return new Response("", { status: 404 });
  };
  const fuentes = [{ club: "Barcelona", noticias: "https://club.test/sitemap.xml" }];
  const now = Date.parse("2026-11-09T01:03:00Z");
  await redactorSombra(env, { fetch: f, now, allTicks: true, fuentes });
  const own = JSON.parse(kv.get("own:news:v1"));
  assert.equal(own.length, 1);
  assert.equal(own[0].status, "published");
  assert.match(own[0].body, /«Creo mucho en este equipo de prueba»/);
  assert.doesNotMatch(own[0].body + own[0].title + own[0].lead, /vestuario|x\.com|twitter/i);
  assert.match(own[0].source.url, /club\.test\/noticias\/inventado-habla/);
  assert.match(own[0].source.name, /OFICIAL/);
  assert.equal(tg.length, 1);
  let st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.pistasN.verificadas, 1);
  assert.equal(st.pistasN.publicadas, 1);
  await redactorSombra(env, { fetch: f, now: now + 60e3, allTicks: true, fuentes });
  assert.equal(JSON.parse(kv.get("own:news:v1")).length, 1);
  assert.equal(tg.length, 1);
  kv.set("rd:pistas:v1", JSON.stringify({ v: 1, items: [pista, Object.assign({}, pista, { id: "post2" })] }));
  await redactorSombra(env, { fetch: f, now: now + 120e3, allTicks: true, fuentes });
  assert.equal(JSON.parse(kv.get("own:news:v1")).length, 1);
  assert.equal(tg.length, 1);
  st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.pistas.post2.motivo, "ya publicada");
});

import { decisionDe } from "../cron/src/redactor.js";
import test2 from "node:test";
import assert2 from "node:assert/strict";
test2("decisionDe: vender exige plazo escrito en el texto", () => {
  const t = "El club confirma que será baja de tres a cuatro meses por lesión.";
  assert2.equal(decisionDe({ veredicto: "vender", plazo: "tres a cuatro meses", motivo: "x" }, t).veredicto, "vender");
  assert2.equal(decisionDe({ veredicto: "vender", plazo: "6 meses", motivo: "x" }, t).veredicto, "duda");
  assert2.equal(decisionDe({ veredicto: "raro" }, t).veredicto, "ninguno");
});
