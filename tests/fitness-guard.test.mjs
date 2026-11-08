import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Guardia contra el fallo del 08/11/2026 (los puntos del partido anterior puestos en el partido nuevo).
// Cada sitio que reparte el array "fitness" entre partidos concretos (indexando desde el final) tiene que
// estar protegido: `lagN` (ficha/comparador, con fitLag del servidor), `fitIndex` (backend) o `jLab(`
// (pone la J con los partidos publicados). Si añades código nuevo con ese patrón y falla este test,
// léete functions/_lib/fitness.mjs y usa una de esas protecciones.
const FILES = ["futmondo/guiafantasy/mercado.js", "functions/api/laquiniela/[[path]].js"];
const PATRON = /\b(fit|fitness|fa|f)\.length - 1 - /;
const PROTEGIDO = /lagN|fitIndex|jLab\(/;

for (const file of FILES) {
  test("fitness repartido entre partidos con protección: " + file, () => {
    const lines = readFileSync(new URL("../" + file, import.meta.url), "utf8").split("\n");
    const sinProteger = [];
    lines.forEach((ln, i) => {
      if (!PATRON.test(ln)) return;
      const ventana = lines.slice(Math.max(0, i - 8), i + 7).join("\n");
      if (!PROTEGIDO.test(ventana)) sinProteger.push(file + ":" + (i + 1) + " " + ln.trim().slice(0, 100));
    });
    assert.deepEqual(sinProteger, [], "fitness sin comprobar si Futmondo ya publicó el partido");
  });
}
