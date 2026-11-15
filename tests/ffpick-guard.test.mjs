// El 13/11/2026 ffPickEst se llamaba a sí misma: el mercado se quedó sin % de jugar, rival, tendencia y cambios a 7/14/30 días.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("ffPickEst no se llama a sí misma", () => {
  const src = readFileSync(new URL("../functions/api/laquiniela/[[path]].js", import.meta.url), "utf8");
  const m = src.match(/function ffPickEst\(p, map\) \{([\s\S]*?)\n\}/);
  assert.ok(m, "no se encuentra ffPickEst");
  assert.ok(!/ffPickEst\(/.test(m[1]), "ffPickEst se llama a sí misma");
  assert.ok(/ffPick\(/.test(m[1]), "ffPickEst debe usar ffPick");
});
