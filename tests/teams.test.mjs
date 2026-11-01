import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

// Carga /futmondo/teams.js tal y como lo carga el navegador (script clásico en window).
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join("futmondo", "teams.js"), "utf8"), ctx);
const T = ctx.window.EduTeams;

test("Alavés y Deportivo no se confunden (el fallo del 01/11/2026)", () => {
  assert.equal(T.canon("Alavés"), "ala");
  assert.equal(T.canon("Deportivo Alavés"), "ala");
  assert.equal(T.canon("Deportivo de la Coruña"), "dep");
  assert.equal(T.canon("Deportivo A Coruña"), "dep");
  assert.equal(T.canon("RC Deportivo"), "dep");
});

test("nombres raros de cada fuente caen en el mismo club", () => {
  const casos = [
    ["Barça", "fcb"], ["FC Barcelona", "fcb"],
    ["Atleti", "atm"], ["Atlético de Madrid", "atm"], ["Atlético Madrid", "atm"],
    ["Athletic Club", "ath"], ["Athletic de Bilbao", "ath"], ["Athletic Bilbao", "ath"],
    ["Real Betis", "bet"], ["Betis", "bet"],
    ["Real Sociedad", "rso"], ["Celta", "cel"], ["Celta Vigo", "cel"],
    ["Espanyol", "esp"], ["RCD Espanyol", "esp"],
    ["Real Madrid", "rma"], ["Rayo Vallecano", "ray"], ["Racing Santander", "rac"],
    ["Las Palmas", "lpa"], ["UD Las Palmas", "lpa"], ["Málaga", "mal"],
  ];
  for (const [nombre, esperado] of casos) {
    assert.equal(T.canon(nombre), esperado, nombre + " debería ser " + esperado);
  }
});

test("cada club de LaLiga tiene su página y no hay slugs repetidos", () => {
  const conPagina = T.TEAMS.filter((t) => t.slug);
  assert.equal(conPagina.length, 20);
  assert.equal(new Set(conPagina.map((t) => t.slug)).size, 20);
  assert.equal(T.href("Alavés"), "/equipos/alaves");
  assert.equal(T.href("Deportivo Alavés"), "/equipos/alaves");
  assert.equal(T.href("Deportivo A Coruña"), "/equipos/deportivo-de-la-coruna");
  assert.equal(T.href("Girona"), "");
});

test("códigos cortos únicos (nada de dos clubes con el mismo código)", () => {
  const ks = T.TEAMS.map((t) => t.k);
  assert.equal(new Set(ks).size, ks.length);
});

test("las palabras de las noticias no se pisan entre clubes", () => {
  // Los arrays vienen de otro contexto (vm), así que se copian antes de comparar.
  assert.deepEqual([...T.alias("Alavés")], ["alaves"]);
  assert.deepEqual([...T.alias("Deportivo A Coruña")].sort(), ["coruna", "depor"]);
  assert.deepEqual([...T.alias("Real Sociedad")], ["real sociedad", "sociedad"]);
  // Un club que no está en la tabla usa su primera palabra y no revienta.
  assert.deepEqual([...T.alias("Recreativo de Huelva")], ["recreativo"]);
});
