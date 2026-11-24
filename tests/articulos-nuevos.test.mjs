import test from "node:test";
import assert from "node:assert/strict";
import { vuelven, previa, riesgoSuplente, rachas, resumenJornada, onceIdeal } from "../functions/_lib/articulos.mjs";
import { rachasDe } from "../functions/_lib/diario.mjs";
import { cuerpoAHtml } from "../functions/_lib/noticia-cuerpo.mjs";

const NOW = Date.UTC(2026, 10, 25, 10);
let n = 0;
const P = (o) => Object.assign({ id: "id" + String(++n).padStart(6, "0"), name: "J" + n, est: "", estInfo: "", value: 10e6, avg: 6, points: 60, matches: 10, chg7: 0, prob: 85, role: "centrocampista", role2: "", team: "T" + (n % 9), fitness: [5, 5, 5] }, o);

test("vuelven: altas reales de 7 días y lesionados con vuelta prevista para la jornada; nada inventado", () => {
  const a = P({ name: "Alta" }), viejo = P({ name: "Viejo" }), pronto = P({ name: "Pronto", est: "lesionado", estInfo: "x. Retorno estimado: Finales de Noviembre." }), lejos = P({ name: "Lejos", est: "lesionado", estInfo: "x. Retorno estimado: Finales de Marzo." });
  const r = vuelven([a, viejo, pronto, lejos], [{ id: a.id, de: "lesionado", a: "ok", at: NOW - 86400000 }, { id: viejo.id, de: "lesionado", a: "ok", at: NOW - 9 * 86400000 }], 14, NOW + 2 * 86400000, NOW);
  assert.match(r.body, /## Ya disponibles[\s\S]*Alta \| Lesión \| vuelve de \| Disponible desde el 24\/11/);
  assert.match(r.body, /## Pueden volver esta jornada[\s\S]*Pronto \| Finales de noviembre/);
  assert.ok(!/Viejo|Lejos/.test(r.body));
  assert.equal(r.id, "artvuelven14");
});

test("previa: cierres reales, partidos, rivales fáciles/difíciles y sancionados", () => {
  const jr = { matches: [{ day: "Vie", date: "27/11", time: "21:00", home: "Levante", away: "Racing" }, { day: "Sáb", date: "28/11", time: "21:00", home: "Real Madrid", away: "Alavés" }] };
  const porra = { matches: [{ label: "Real Madrid", matchday: 14, utcDate: "2026-11-28T20:00:00Z", home: "Real Madrid CF", away: "Deportivo Alavés", started: false }] };
  const dif = { jornadas: [14], equipos: [{ team: "Levante", celdas: [{ rival: "Racing", casa: true, nivel: 1 }] }, { team: "Racing", celdas: [{ rival: "Levante", casa: false, nivel: 4 }] }] };
  const s = P({ name: "Sancio", est: "sancionado" });
  const a = previa([s], jr, 14, porra, { nextWindow: Date.UTC(2026, 10, 30, 22, 59) }, dif);
  assert.match(a.body, /= QUINIELA \| Vie 27\/11 21:00/);
  assert.match(a.body, /= PORRA Real Madrid \| Sáb 28\/11 21:00/);
  assert.match(a.body, /= PUJA \| Lun 30\/11 23:59/);
  assert.match(a.body, /= Levante \| Rival fácil · 1\/5 \| ok \| En casa ante Racing/);
  assert.match(a.body, /= Racing \| Rival difícil · 4\/5/);
  assert.match(a.body, /## Sancionados[\s\S]*Sancio/);
});

test("riesgo de suplente: solo si se identifica al jugador en Futmondo", () => {
  const g = P({ name: "Anthony Gordon" }), ad = P({ name: "Karim Adeyemi" });
  const casar = (nm) => [g, ad].find((p) => p.name === nm) || null;
  const a = riesgoSuplente([g, ad], [{ n: "Anthony Gordon", team: "Barcelona", tit: 8, sale: 8, min: 77, rev: { n: "Karim Adeyemi", k: 7 } }, { n: "Desconocido", team: "X", tit: 9, sale: 9, min: 60, rev: null }], 14, casar);
  assert.match(a.body, /Anthony Gordon \| 8 de 8 \| partidos le cambian \| Sale en el minuto 77 de media · entra Karim Adeyemi/);
  assert.match(a.body, /Karim Adeyemi \| 7 veces \| entra por Gordon/);
  assert.ok(!/Desconocido/.test(a.body));
});

test("rachas: rachas de equipo con malas rachas y jugadores por sus últimos 3 partidos publicados", () => {
  const m = (h, a, s, d) => ({ home: { id: h, name: h }, away: { id: a, name: a }, status: { finished: true, scoreStr: s, utcTime: "2026-11-" + d + "T20:00:00Z" } });
  const eq = rachasDe([m("A", "B", "2 - 0", "01"), m("A", "C", "1 - 0", "08"), m("D", "A", "0 - 3", "15"), m("B", "C", "0 - 1", "16"), m("D", "B", "2 - 1", "20")]);
  const B = eq.find((t) => t.team === "B");
  assert.equal(B.l, 3); assert.equal(B.sg, 3);
  const cal = P({ name: "Caliente", fitness: [2, 9, 8, 12] }), fr = P({ name: "Frio", avg: 7, fitness: [9, 1, 2, -1] }), nojuega = P({ name: "NoJuega", avg: 7, fitness: [1, 0, 2, 1] });
  const a = rachas([cal, fr, nojuega], eq, 14);
  assert.match(a.body, /Caliente \| 9 · 8 · 12 \| últimos 3/);
  assert.match(a.body, /Frio \| 1 · 2 · −1 \| últimos 3/);
  assert.match(a.body, /= A \| 3 victorias seguidas \| ok/);
  assert.match(a.body, /= B \| 3 derrotas seguidas \| na/);
  assert.ok(!/NoJuega/.test(a.body));
});

test("resumen: once ideal con los puntos publicados, MVP y decepciones; el 0 es «no jugó»", () => {
  const ps = [], pts = {};
  for (const [r, k] of [["portero", 20], ["defensa", 60], ["centrocampista", 60], ["delantero", 40]]) for (let i = 0; i < k; i++) { const p = P({ role: r, value: (i % 3 + 1) * 4e6, team: "E" + (i % 20) }); ps.push(p); pts[p.id] = (i % 15) - 1; }
  const caro = P({ name: "Caro", value: 40e6, role: "delantero" }); ps.push(caro); pts[caro.id] = 1;
  const nada = P({ name: "NoJugo", value: 60e6 }); ps.push(nada); pts[nada.id] = 0;
  const I = onceIdeal(ps, pts);
  assert.equal(I.xi.length, 11);
  const a = resumenJornada(ps, pts, 13);
  assert.match(a.body, /= MVP \| 13 puntos/);
  assert.match(a.body, /# once \| [^|]+ \| ideal \| \d-\d-\d \| [0-9;]+/);
  assert.match(a.body, /## Decepciones[\s\S]*Caro \| 1 \| puntos en la J13/);
  assert.ok(!/NoJugo/.test(a.body));
  const h = cuerpoAHtml(a.body);
  assert.equal((h.match(/class="art-op" data-pid="[^"]+" data-e=/g) || []).length, 11);
  assert.equal(resumenJornada(ps.slice(0, 50), pts, 13), null);
});
