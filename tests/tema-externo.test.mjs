import test from "node:test";
import assert from "node:assert/strict";
import { redactorSombra, _r } from "../cron/src/redactor.js";

const ART = "<html><body><article>" + "El Atlético descansa este lunes tras perder ante el Barcelona. Cristian Romero sigue sin jugar desde el 17 de octubre por molestias musculares y Simeone espera recuperarlo para el partido contra el Getafe del domingo. Johnny Cardoso se reincorporó al grupo y Koke recuperó su sitio en el equipo. ".repeat(2) + "</article></body></html>";
const PISTA = { id: "ff-154476-atletico", at: "2026-11-09T13:30:00.000Z", tipo: "lesion", equipo: "Atlético", jugadores: ["Cuti Romero"], entrenador: "", tema: "lesión de Cuti Romero", origen: "futbolfantasy", ref: "https://www.futbolfantasy.com/laliga/noticias/154476-el-atletico-descansa" };

async function correr(gem) {
  const kv = new Map();
  kv.set("rd:pistas:v1", JSON.stringify({ v: 1, items: [PISTA] }));
  kv.set("rd:reabrir:v1", "1");
  const env = { GEMINI_API_KEY: "k", PORRA: {
    async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
    async put(k, v) { kv.set(k, v); } } };
  const f = async (url) => {
    url = String(url);
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n");
    if (url === PISTA.ref) return new Response(ART);
    if (url.includes("generativelanguage")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(gem) }] } }], usageMetadata: { totalTokenCount: 900 } }));
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-09T14:00:00Z"), allTicks: true, fuentes: [] });
  if (process.env.DBG) console.log(kv.get("rd:sombra:v1"));
  return JSON.parse(kv.get("own:news:v1") || "[]");
}

test("un tema de otra web se publica reescrito", async () => {
  const own = await correr({ tipo: "hecho", titular: "Cuti Romero sigue sin jugar con el Atlético", entradilla: "El central sigue fuera del grupo, según el parte.", cuerpo: "El central lleva sin competir desde el 17 de octubre, con problemas musculares. Cardoso se ha sumado al grupo." });
  assert.equal(own.length, 1);
  assert.equal(own[0].source.name, "FutbolFantasy");
  assert.equal(own[0].key, "ext-ff-154476-atletico");
});
test("una opinión no se publica", async () => {
  assert.equal((await correr({ tipo: "opinion" })).length, 0);
});
test("si copia 9 palabras seguidas, no se publica", async () => {
  const own = await correr({ tipo: "hecho", titular: "Cuti Romero sigue sin jugar con el Atlético", entradilla: "El central acumula semanas fuera.", cuerpo: "Cristian Romero sigue sin jugar desde el 17 de octubre por molestias musculares y Simeone espera recuperarlo." });
  assert.equal(own.length, 0);
});
test("un dato que no está en la noticia se rechaza", async () => {
  const own = await correr({ tipo: "hecho", titular: "Cuti Romero estará tres semanas de baja", entradilla: "El central acumula semanas fuera.", cuerpo: "El defensa estará tres semanas de baja por una rotura." });
  assert.equal(own.length, 0);
});
test("copiaLiteral detecta copia y deja pasar lo reescrito", () => {
  assert.equal(_r.copiaLiteral("a b c d e f g h i", "x a b c d e f g h i y"), true);
  assert.equal(_r.copiaLiteral("a b c d e f g h", "x a b c d e f g h i y"), false);
});

test("un tema ya descartado por falta de nota oficial se reintenta con la otra web", () => {
  const doc = { v: 1, items: [PISTA, Object.assign({}, PISTA, { id: "ff-2", ref: "" }), Object.assign({}, PISTA, { id: "ff-3" })] };
  const vistas = { [PISTA.id]: { at: 1, estado: "descartada", motivo: "sin fuente permitida" }, "ff-2": { at: 1, estado: "descartada", motivo: "sin fuente permitida" }, "ff-3": { at: 1, estado: "descartada", motivo: "sin fuente permitida", ext: 6 } };
  const r = _r.pistasATratar(doc, vistas, 2);
  assert.deepEqual(r.nuevas.map((p) => p.id), [PISTA.id]);
});

test("un titular sin club se resuelve por el enlace o por el club del jugador", () => {
  const notas = [
    { url: "https://www.futbolfantasy.com/laliga/noticias/154499-malaga-confirma-lesion-muscular-rafita", title: "Rafita, lesionado en el tendón: parte médico oficial", published: 1 },
    { url: "https://www.futbolfantasy.com/laliga/noticias/154500-camello-no-para", title: "Camello no para de marcar", published: 1 },
  ];
  const sin = _r.pistasDesdeTitulares(notas, "futbolfantasy", 1, []);
  assert.equal(sin.length, 1); // solo el que trae el club en el enlace
  assert.equal(sin[0].equipo, "Málaga");
  const con = _r.pistasDesdeTitulares(notas, "futbolfantasy", 1, [{ name: "Camello", team: "Rayo Vallecano" }, { name: "Rafita", team: "Málaga" }]);
  assert.deepEqual(con.map((p) => p.equipo).sort(), ["Málaga", "Rayo Vallecano"]);
});

test("el texto de la noticia sale limpio: acentos bien, sin menú ni calendario", () => {
  const html = "<nav>Mercado Comunio Premier League</nav><h1>Rafita, lesionado</h1><p>Sigue todas las noticias Deja tu comentario El M&aacute;laga ha confirmado la lesi&oacute;n de Rafita, de tres a cuatro meses.</p><p>Ver comentarios</p><div>Sab 14:00h 1 2 Dom 21:00h 0 3</div>";
  const t = _r.textoDeArticulo(html);
  assert.equal(t, "El Málaga ha confirmado la lesión de Rafita, de tres a cuatro meses.");
  assert.equal(_r.decodificar("&iquest;S&iacute;&#33;"), "¿Sí!");
});

test("si el primer intento trae algo que no está en la noticia, se corrige y se publica", async () => {
  const kv = new Map();
  kv.set("rd:pistas:v1", JSON.stringify({ v: 1, items: [PISTA] }));
  kv.set("rd:reabrir:v1", "1");
  const env = { GEMINI_API_KEY: "k", PORRA: { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } } };
  const respuestas = [
    { tipo: "hecho", titular: "Cuti Romero sigue sin jugar con el Atlético", entradilla: "El central sigue apartado.", cuerpo: "Lleva 25 días sin competir por molestias musculares y Cardoso se ha sumado al grupo." },
    { tipo: "hecho", titular: "Cuti Romero continúa sin jugar en el Atlético", entradilla: "El central sigue apartado del grupo.", cuerpo: "El central lleva sin competir desde el 17 de octubre, con problemas musculares. Cardoso se ha sumado al grupo." },
  ];
  let n = 0; const prompts = [];
  const f = async (url, o) => {
    url = String(url);
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n");
    if (url === PISTA.ref) return new Response(ART);
    if (url.includes("generativelanguage")) { prompts.push(JSON.parse(o.body).contents[0].parts[0].text); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(respuestas[Math.min(n++, 1)]) }] } }], usageMetadata: { totalTokenCount: 500 } })); }
    return new Response("", { status: 404 });
  };
  await redactorSombra(env, { fetch: f, now: Date.parse("2026-11-09T14:00:00Z"), allTicks: true, fuentes: [] });
  const own = JSON.parse(kv.get("own:news:v1") || "[]");
  assert.equal(own.length, 1);
  assert.match(prompts[1], /RECHAZADO: .*25/);
});

test("la noticia más nueva del mismo jugador va primero y deja atrás a la vieja", () => {
  const vieja = { id: "ff-154485-malaga", at: "2026-11-08T23:00:00.000Z", tipo: "otro", equipo: "Málaga", jugadores: ["Rafita", "Puga"], origen: "futbolfantasy", ref: "https://www.futbolfantasy.com/laliga/noticias/154485-el-malaga-retoma" };
  const nueva = { id: "ff-154499-malaga", at: "2026-11-08T23:00:00.000Z", tipo: "lesion", equipo: "Málaga", jugadores: ["Rafita"], origen: "futbolfantasy", ref: "https://www.futbolfantasy.com/laliga/noticias/154499-malaga-confirma" };
  const otra = { id: "ff-154500-celta", at: "2026-11-08T23:00:00.000Z", tipo: "otro", equipo: "Celta", jugadores: ["Aspas"], origen: "futbolfantasy", ref: "https://www.futbolfantasy.com/laliga/noticias/154500-aspas" };
  const r = _r.pistasATratar({ v: 1, items: [vieja, nueva, otra] }, {}, 2);
  assert.deepEqual(r.nuevas.map((p) => p.id), ["ff-154500-celta", "ff-154499-malaga"]);
});
