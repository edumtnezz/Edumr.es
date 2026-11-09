import test from "node:test";
import assert from "node:assert/strict";
import { _r, redactorSombra } from "../cron/src/redactor.js";

const ahora = Date.parse("2026-11-09T12:00:00Z");

test("el apellido en una noticia vieja de otro tema no es un duplicado", () => {
  const propia = { status: "published", title: "Aguirre habla del grupo", players: ["Aguirre"], publishedAt: ahora - 10 * 86400e3, tipo: "rueda" };
  const pista = { id: "ff-1-valencia", at: "2026-11-09T11:00:00Z", tipo: "lesion", equipo: "Valencia", jugadores: ["Aguirre"], entrenador: "", tema: "molestia" };
  assert.equal(_r.pistaDuplicada(pista, [propia], ahora), false);
  const reciente = Object.assign({}, propia, { tipo: "lesion", publishedAt: ahora - 2 * 3600e3 });
  assert.equal(_r.pistaDuplicada(pista, [reciente], ahora), true);
  assert.equal(_r.pistaDuplicada(pista, [{ status: "published", source: { url: "https://www.valenciacf.com/x" }, tipo: "otro", publishedAt: ahora }], ahora), false);
  const misma = Object.assign({}, pista, { fuenteUrl: "https://www.valenciacf.com/x" });
  assert.equal(_r.pistaDuplicada(misma, [{ status: "published", source: { url: "https://www.valenciacf.com/x" } }], ahora), true);
});

test("una nota oficial sin cita ni marcador vale si el título encaja", () => {
  const pista = { tipo: "otro", equipo: "Barcelona", jugadores: ["Koundé"], entrenador: "", tema: "entrenamiento sin los internacionales" };
  const notas = [{ url: "https://www.fcbarcelona.es/es/futbol/primer-equipo/noticias/1/entrenamiento", title: "Entrenamiento sin los internacionales", published: ahora }];
  const nota = _r.notaParaPista(pista, notas, ahora);
  assert.match(nota.title, /Entrenamiento/);
  const html = "<p>Entrenamiento del primer equipo sin los internacionales. Koundé no viaja.</p>";
  const hechos = _r.hechosDesdeNota(html, nota.title, pista, "Barcelona");
  assert.match(hechos, /kounde/);
  assert.match(hechos, /entrenamiento/);
  assert.doesNotMatch(hechos, /no viaja/);
});

test("un ciclo mira varias pistas", async () => {
  const kv = new Map();
  const env = { GEMINI_API_KEY: "k", PORRA: {
    async get(k, t) { const v = kv.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
    async put(k, v) { kv.set(k, v); } } };
  kv.set("rd:pistas:v1", JSON.stringify({ v: 1, items: [
    { id: "a1", at: "2026-11-09T11:00:00Z", tipo: "lesion", equipo: "Getafe", jugadores: ["Uno"], entrenador: "", tema: "molestia" },
    { id: "a2", at: "2026-11-09T10:00:00Z", tipo: "lesion", equipo: "Elche", jugadores: ["Dos"], entrenador: "", tema: "molestia" },
    { id: "a3", at: "2026-11-09T09:00:00Z", tipo: "rueda", equipo: "Racing", jugadores: [], entrenador: "Tres", tema: "grupo" },
  ] }));
  const f = async () => new Response("", { status: 404 });
  await redactorSombra(env, { fetch: f, now: ahora, allTicks: true, fuentes: [] });
  const st = JSON.parse(kv.get("rd:sombra:v1"));
  assert.equal(st.pistasN.recibidas, 3);
  assert.equal(st.pistasN.publicadas, 0);
  assert.ok(st.pistas.a1 && st.pistas.a2 && st.pistas.a3);
});
