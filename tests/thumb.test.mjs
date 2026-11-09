import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join("futmondo", "thumb.js"), "utf8"), ctx);
const T = ctx.window.EduThumb;

// Hechos de la semana (8 nov 2026), redactados aquí. No son frases de FutbolFantasy.
const semana = [
  { title: "Atlético 1-2 Barcelona", lead: "Giuliano marcó en el 10'. Fermín empató en el 45 y hizo el 1-2 en el 66.", src: "EduMR" },
  { title: "De Jong salió de lateral", lead: "«El plan inicial era situar a Frenkie de Jong en el lateral.»", src: "EduMR" },
  { title: "El once del Barcelona en el Metropolitano", lead: "Joan Garcia; Cancelo, Cubarsí, Bernal, Pedri, Fermín, Lamine Yamal y Raphinha.", src: "EduMR" },
];

test("la miniatura de la crónica de la semana lleva el marcador", () => {
  assert.equal(T.tipo(semana[0]), "cronica");
  assert.equal(T.marcador(semana[0].title), "1–2");
  const s = T.svg(semana[0]);
  assert.match(s, /1–2/);
  assert.match(s, /CRÓNICA/);
  assert.doesNotMatch(s, /extermina|remontada de líder/i);
  assert.match(T.url(semana[0]), /^data:image\/svg\+xml/);
});

test("la miniatura de la rueda lleva la cita, no un relato", () => {
  assert.equal(T.tipo(semana[1]), "rueda");
  const s = T.svg(semana[1]);
  assert.match(s, /RUEDA/);
  assert.match(s, /Jong/);
});

test("la miniatura del once se distingue", () => {
  assert.equal(T.tipo(semana[2]), "once");
  assert.match(T.svg(semana[2]), /ONCE/);
});
