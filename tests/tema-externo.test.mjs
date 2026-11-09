import test from "node:test";
import assert from "node:assert/strict";
import { redactorSombra, _r } from "../cron/src/redactor.js";

const ART = "<html><body><article>" + "El Atlético descansa este lunes tras perder ante el Barcelona. Cristian Romero sigue sin jugar desde el 17 de octubre por molestias musculares y Simeone espera recuperarlo para el partido contra el Getafe del domingo. Johnny Cardoso se reincorporó al grupo y Koke recuperó su sitio en el equipo. ".repeat(2) + "</article></body></html>";
const PISTA = { id: "ff-154476-atletico", at: "2026-11-09T13:30:00.000Z", tipo: "lesion", equipo: "Atlético", jugadores: ["Cuti Romero"], entrenador: "", tema: "lesión de Cuti Romero", origen: "futbolfantasy", ref: "https://www.futbolfantasy.com/laliga/noticias/154476-el-atletico-descansa" };

async function correr(gem) {
  const kv = new Map();
  kv.set("rd:pistas:v1", JSON.stringify({ v: 1, items: [PISTA] }));
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
test("si copia 7 palabras seguidas, no se publica", async () => {
  const own = await correr({ tipo: "hecho", titular: "Cuti Romero sigue sin jugar con el Atlético", entradilla: "El central acumula semanas fuera.", cuerpo: "Cristian Romero sigue sin jugar desde el 17 de octubre por molestias musculares y Simeone espera recuperarlo." });
  assert.equal(own.length, 0);
});
test("un dato que no está en la noticia se rechaza", async () => {
  const own = await correr({ tipo: "hecho", titular: "Cuti Romero estará tres semanas de baja", entradilla: "El central acumula semanas fuera.", cuerpo: "El defensa estará tres semanas de baja por una rotura." });
  assert.equal(own.length, 0);
});
test("copiaLiteral detecta copia y deja pasar lo reescrito", () => {
  assert.equal(_r.copiaLiteral("a b c d e f g h", "x a b c d e f g y"), true);
  assert.equal(_r.copiaLiteral("a b c d e f", "x a b c d e f g y"), false);
});
