import test from "node:test";
import assert from "node:assert/strict";
import { CLUBES, urlsConvocatoria, parsearLista, leerConvocatoria, partidoDe, emparejarLista, articuloConvocatoria } from "../functions/_lib/convocatorias.mjs";

const RM = `<html><head><meta property="og:title" content="Convocatoria del Real Madrid ante el Celta"><meta property="article:published_time" content="2026-11-20T10:44:00.000Z"></head><body>
<p>Esta es la convocatoria del <a>Real Madrid</a> para enfrentarse al Celta.</p><p><b>CONVOCATORIA DEL REAL MADRID:</b></p>
<p><b>Porteros:</b></p><p>Courtois, Lunin y Mestre.</p>
<p><b>Defensas:</b></p><p>Militão, Huijsen, Trent, Konaté, Cucurella, Á. Carreras, Rüdiger y Dumfries.</p>
<p><b>Centrocampistas:</b></p><p>Bellingham, Camavinga, Valverde, Tchouameni, Arda Güler, Bernardo y Thiago.</p>
<p><b>Delanteros:</b></p><p>Vini Jr.,</p><p>Endrick, Mbappé, C. Espí, Brahim y Yan Diomande.</p>
<h3>Temas relacionados</h3><p>Fútbol</p></body></html>`;

test("lee la lista por puestos, con 'y', puntos y saltos de línea", () => {
  const c = leerConvocatoria(RM);
  assert.equal(c.total, 24);
  assert.deepEqual(c.puestos[1], ["Courtois", "Lunin", "Mestre"]);
  assert.ok(c.puestos[4].includes("Vini Jr") && c.puestos[4].includes("Yan Diomande"));
  assert.equal(c.titulo, "Convocatoria del Real Madrid ante el Celta");
  assert.equal(c.publicada, "2026-11-20T10:44:00.000Z");
});
test("una página sin lista no es convocatoria", () => {
  assert.equal(parsearLista("<p>Noticia cualquiera</p><p>Porteros:</p><p>Uno y Dos.</p>"), null);
  assert.equal(leerConvocatoria("<p>nada</p>"), null);
});
test("encuentra el enlace de la última convocatoria en la lista de noticias", () => {
  const h = '<a href="/es-ES/noticias/futbol/primer-equipo/convocatorias/convocatoria-ante-el-celta-20-11-2026">x</a><a href="/otra">y</a>';
  assert.deepEqual(urlsConvocatoria(CLUBES[0], h), ["https://www.realmadrid.com/es-ES/noticias/futbol/primer-equipo/convocatorias/convocatoria-ante-el-celta-20-11-2026"]);
});
const jor = { matchday: 13, matches: [{ home: "Real Madrid", away: "Celta", live: null }, { home: "Sevilla FC", away: "Real Betis", live: null }] };
test("solo vale si el rival citado es el de nuestro próximo partido de Liga", () => {
  assert.deepEqual(partidoDe(jor, "Real Madrid", "Convocatoria del Real Madrid ante el Celta"), { jornada: 13, rival: "Celta", casa: true });
  assert.equal(partidoDe(jor, "Real Madrid", "Convocatoria ante el PSV Eindhoven"), null);
  assert.equal(partidoDe(jor, "Real Betis", "lista para el encuentro ante el Sevilla FC").casa, false);
});
const P = (id, name, matches, value, est) => ({ id, name, team: "Real Madrid", role: "delantero", matches, value, est });
const ps = [P("a", "Mbappé", 12, 20e6), P("b", "Vinícius", 8, 15e6), P("c", "Asencio", 4, 3e6, "lesionado"), P("d", "Fulano Mestrez", 5, 5e6), P("e", "Rodrygo", 0, 1e6, "lesionado")];
test("empareja con Futmondo (alias Vini Jr) y deja aparte lo que no reconoce", () => {
  const r = emparejarLista({ 1: [], 2: [], 3: [], 4: ["Mbappé", "Vini Jr", "Mestre"] }, "Real Madrid", ps);
  assert.deepEqual([...r.ids].sort(), ["a", "b"]); assert.deepEqual(r.sinEmparejar, ["Mestre"]);
});
test("artículo: quién se queda fuera; no acusa a quien podría ser un nombre sin identificar", () => {
  const a = articuloConvocatoria({ club: CLUBES[0], convocados: new Set(["a", "b"]), sinEmparejar: ["Mestre"], prev: null, partido: { jornada: 13, rival: "Celta", casa: true }, ps });
  assert.equal(a.id, "artconvrealmadrid"); assert.match(a.title, /Real Madrid ante el Celta \(J13\)/);
  assert.match(a.body, /@ c \| Asencio \| Baja/);
  assert.doesNotMatch(a.body, /Mestrez/); // se parece a «Mestre»: no se afirma nada
  assert.doesNotMatch(a.body, /Rodrygo/); // 0 partidos y menos de 2 M: no cuenta
});
test("artículo: entran y salen respecto a la lista anterior", () => {
  const a = articuloConvocatoria({ club: CLUBES[0], convocados: new Set(["a", "c"]), sinEmparejar: [], prev: new Set(["a", "b"]), partido: null, ps });
  assert.match(a.body, /## Entran en la lista\n.*\n@ c \| Asencio/); assert.match(a.body, /= SALEN \| 1/);
});
