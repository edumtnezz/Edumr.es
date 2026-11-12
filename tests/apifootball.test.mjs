import test from "node:test";
import assert from "node:assert/strict";
import { probarApiFootball, resumenBajas } from "../cron/src/apifootball.js";

const kv = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => { m.set(k, v); } }; };

test("sin clave: lo anota y no llama a nadie", async () => {
  const PORRA = kv(); let llamadas = 0;
  const r = await probarApiFootball({ PORRA }, async () => { llamadas++; }, 1000);
  assert.equal(r.sinClave, true); assert.equal(llamadas, 0);
});

test("con clave: guarda resumen sin la clave ni datos de la cuenta", async () => {
  const PORRA = kv(); const urls = [];
  const f = async (u, o) => {
    urls.push(u); assert.equal(o.headers["x-apisports-key"], "CLAVE");
    let response = [];
    if (u.endsWith("/status")) response = { account: { email: "x@y.z" }, subscription: { plan: "Free", active: true }, requests: { current: 1, limit_day: 100 } };
    else if (u.includes("/leagues")) response = [{ seasons: [{ year: 2026, current: true, coverage: { injuries: true } }] }];
    else response = [{ player: { name: "A", type: "Missing Fixture", reason: "Knee" }, team: { name: "T" }, fixture: { date: "2026-11-08T20:00:00+00:00" } }];
    return { status: 200, json: async () => ({ errors: [], results: 1, response }) };
  };
  const r = await probarApiFootball({ PORRA, API_FOOTBALL_KEY: "CLAVE" }, f, 1000);
  assert.equal(r.liga.temporada, 2026); assert.equal(r.bajas.n, 1);
  const guardado = [...PORRA.m.values()][0];
  assert.ok(!guardado.includes("CLAVE")); assert.ok(!guardado.includes("x@y.z"));
  assert.ok(urls[2].includes("season=2026"));
  const r2 = await probarApiFootball({ PORRA, API_FOOTBALL_KEY: "CLAVE" }, f, 2000);
  assert.equal(r2.skipped, "reciente");
});

test("resumenBajas aguanta respuesta vacía", () => { assert.equal(resumenBajas(null).n, 0); });
