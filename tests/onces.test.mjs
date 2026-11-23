import test from "node:test";
import assert from "node:assert/strict";
import { elegirOnce, mejorOnce, oncesArticulo, cambiosOnce, estPts } from "../functions/_lib/onces.mjs";
import { cuerpoAHtml } from "../functions/_lib/noticia-cuerpo.mjs";

let n = 0;
const P = (role, avg, value, o = {}) => Object.assign({ id: "id" + String(++n).padStart(6, "0"), name: "J" + n, role, role2: "", avg, value, matches: 8, prob: 85, est: "", team: "T" + (n % 7), points: avg * 8 }, o);
const plantel = () => {
  const ps = [];
  for (const [r, k] of [["portero", 4], ["defensa", 14], ["centrocampista", 12], ["delantero", 12]]) for (let i = 0; i < k; i++) ps.push(P(r, 4 + i * 0.5, (i % 2 ? 3e6 : 25e6) + i * 1e5));
  return ps;
};

test("once: 1-4-3-3, respeta el tope de precio y deja fuera lesionados y poco probables", () => {
  const ps = plantel();
  ps.push(P("delantero", 50, 1e6, { est: "lesionado" }), P("delantero", 49, 1e6, { prob: 40 }));
  const xi = elegirOnce(ps, 6e6);
  assert.equal(xi.length, 11);
  assert.deepEqual(["portero", "defensa", "centrocampista", "delantero"].map((r) => xi.filter((p) => p.role === r).length), [1, 4, 3, 3]);
  assert.ok(xi.every((p) => p.value <= 6e6 && p.est === "" && p.prob >= 70));
});
test("artículo: tres onces sin repetir jugadores y con el campo", () => {
  const a = oncesArticulo(plantel(), 13);
  const todos = Object.values(a.ids).flat();
  assert.equal(new Set(todos).size, todos.length);
  assert.match(a.body, /## Once caro[\s\S]*# once \| [^|]+ \| caro/);
  const h = cuerpoAHtml(a.body);
  assert.equal((h.match(/class="art-op"/g) || []).length, todos.length);
});
test("cambios: si uno de los elegidos se lesiona, se dice quién sale y quién entra", () => {
  const ps = plantel(); const a = oncesArticulo(ps, 13);
  const x = ps.find((p) => p.id === a.ids.caro[3]); x.est = "lesionado";
  const b = oncesArticulo(ps, 13);
  const c = cambiosOnce(a.ids, b.ids, ps);
  assert.match(c.caro[0], new RegExp("^Sale " + x.name + " \\(lesionado\\), entra J"));
});

test("mejor formación: si los delanteros rinden más, sale 3-4-3; si los medios, 3-5-2", () => {
  const ps = []; n = 0;
  ps.push(P("portero", 5, 1e6));
  for (let i = 0; i < 6; i++) ps.push(P("defensa", 4, 1e6, { team: "D" + i }));
  for (let i = 0; i < 6; i++) ps.push(P("centrocampista", 5, 1e6, { team: "M" + i }));
  for (let i = 0; i < 4; i++) ps.push(P("delantero", 9, 1e6, { team: "F" + i }));
  assert.deepEqual(mejorOnce(ps, Infinity).form, [3, 4, 3]);
  const qs = ps.map((p) => (p.role === "delantero" ? { ...p, avg: 4 } : p.role === "centrocampista" ? { ...p, avg: 9 } : p));
  assert.deepEqual(mejorOnce(qs, Infinity).form, [3, 5, 2]);
});
test("el campo se pinta con la formación indicada", () => {
  const a = oncesArticulo(plantel(), 13);
  assert.match(a.body, /# once \| [^|]+ \| caro \| \d-\d-\d/);
  assert.match(cuerpoAHtml(a.body), /data-form="\d-\d-\d"/);
  assert.doesNotMatch(a.lead + a.body, /1-4-3-3/);
});

test("puntos estimados: media × % de jugar, suma por once y cada hueco los lleva", () => {
  const ps = plantel();
  const a = oncesArticulo(ps, 14);
  const porId = new Map(ps.map((p) => [p.id, p]));
  for (const k of Object.keys(a.ids)) {
    const suma = a.ids[k].map((id) => estPts(porId.get(id))).reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(a.est[k] - suma) < 0.06);
    assert.match(a.body, new RegExp("puntos estimados " + String(a.est[k].toFixed(1)).replace(".", ",")));
  }
  assert.equal(estPts({ avg: 7, prob: 85 }), 6);
  assert.equal(estPts({ avg: 8, prob: 90 }), 7.2);
  const h = cuerpoAHtml(a.body);
  assert.equal((h.match(/data-e="\d{1,2}\.\d"/g) || []).length, Object.values(a.ids).flat().length);
});
