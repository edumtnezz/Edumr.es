import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ogDePropia } from "../functions/futmondo/guiafantasy/noticias/[[slug]].js";

test("el enlace corto /n/ abre la noticia larga que ya funciona", () => {
  const reglas = fs.readFileSync(new URL("../_redirects", import.meta.url), "utf8");
  assert.match(reglas, /^\/n\/:id \/futmondo\/guiafantasy\/noticias\/ed-:id 301$/m);
});

test("la vista previa de una noticia propia sale de lo guardado", () => {
  const og = ogDePropia("ed-b22eb497ee", [{ id: "b22eb497ee", status: "published", title: "Flick", lead: "Según el club", thumb: "" }]);
  assert.equal(og.t, "Flick");
  assert.equal(og.d, "Según el club");
  assert.equal(ogDePropia("ed-b22eb497ee", [{ id: "b22eb497ee", status: "draft", title: "Flick" }]).missing, true);
  assert.equal(ogDePropia("fermin-07", []), null);
});
