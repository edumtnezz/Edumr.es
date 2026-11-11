import test from "node:test";
import assert from "node:assert/strict";
import { promptFondo, ESCENAS_POR, ESTILOS, AMBIENTE, nombreColor, grupoTipo } from "../functions/_lib/portada-prompt.mjs";
import { coloresEscudoPx } from "../functions/_lib/portada-svg.mjs";

test("el prompt lleva los colores reales del escudo y las zonas reservadas", () => {
  const p = promptFondo({ club: "Atlético de Madrid", cols: [[206, 30, 40], [20, 40, 120]], tipo: "fijo", sem: 5 });
  assert.match(p, /#ce1e28 \(rojo\)/);
  assert.match(p, /#142878/);
  assert.match(p, /62 % del ancho/);
  assert.match(p, /NO uses azul si el escudo no es azul/);
});
test("ninguna escena es de fiesta, dinero ni lesión gráfica", () => {
  const malo = /fuegos|confeti|moneda|billete|trofeo|camilla|bengala/i, futbol = /césped|estadio|portería|balón|campo|túnel|banco|línea de cal|focos/i;
  for (const [t, l] of Object.entries(ESCENAS_POR)) for (const e of l) { assert.ok(!malo.test(e), t + ": " + e); assert.ok(futbol.test(e), "sin fútbol: " + e); }
});
test("cada tipo tiene ambiente, escena y estilo; lo serio usa estilos sobrios", () => {
  for (const t of Object.keys(ESCENAS_POR)) { assert.ok(AMBIENTE[t], t); for (let s = 0; s < 12; s++) assert.ok(promptFondo({ club: "X", cols: [null, null], tipo: t, sem: s }).includes("=== ESCENA ===")); }
  const serios = new Set(); for (let s = 0; s < 40; s++) serios.add(promptFondo({ club: "X", cols: [], tipo: "lesion", sem: s }).split("=== ESTILO VISUAL (aplicar solo este) ===\n")[1].split("\n")[0]);
  for (const e of serios) assert.ok([0, 3, 5, 6].map((i) => ESTILOS[i]).includes(e));
  assert.equal(grupoTipo("duda"), "serio"); assert.equal(grupoTipo("chollo"), "alegre"); assert.equal(grupoTipo("fijo"), "neutro");
});
test("colores del escudo: dos colores distintos y nombres", () => {
  const px = []; for (let i = 0; i < 100; i++) px.push(210, 30, 40, 255); for (let i = 0; i < 60; i++) px.push(20, 40, 150, 255);
  const [a, b] = coloresEscudoPx(px); assert.equal(nombreColor(a), "rojo"); assert.ok(b && nombreColor(b).startsWith("azul"));
});
import { etiquetaDe, portadaSvg } from "../functions/_lib/portada-svg.mjs";
test("toda portada lleva etiqueta (por tipo, o «NOTICIA» si no hay más datos)", () => {
  assert.equal(etiquetaDe(null, "titular").t, "POSIBLE TITULAR");
  assert.equal(etiquetaDe(null, "vender").t, "VENDER");
  assert.equal(etiquetaDe(null, "").t, "NOTICIA");
  assert.equal(etiquetaDe(null, undefined).i, "i");
});
test("en una lesión no se dibuja la MEDIA", () => {
  const o = { nombre: "X", face: "iVBORw0KGgo=", avg: 5, value: 2e6, tipoNoticia: "lesion", etiqueta: etiquetaDe(null, "lesion") };
  assert.ok(!portadaSvg(o).includes(">MEDIA<"));
  assert.ok(portadaSvg({ ...o, tipoNoticia: "duda", etiqueta: etiquetaDe(null, "duda") }).includes(">MEDIA<"));
});
test("portada de dos jugadores: ambos nombres, y la etiqueta del segundo solo si se le pasa", () => {
  const f = "iVBORw0KGgo=", base = { face: f, nombre: "Espí", avg: 5.9, value: 1e6, tipoNoticia: "duda", etiqueta: etiquetaDe(null, "duda") };
  const con = portadaSvg({ ...base, duo: { face: f, nombre: "Mbappé", avg: 13.2, value: 133.4e6, tipo: "lesion", etiqueta: etiquetaDe(null, "lesion") } });
  assert.ok(con.includes("ESPÍ") && con.includes("MBAPPÉ") && con.includes("LESIÓN") && con.includes("133,4 M"));
  const sin = portadaSvg({ ...base, duo: { face: f, nombre: "Mbappé", avg: 13.2, value: 133.4e6, tipo: "", etiqueta: null } });
  assert.ok(sin.includes("MBAPPÉ") && !sin.includes("LESIÓN"));
  assert.ok(!portadaSvg(base).includes("MBAPPÉ"));
});
