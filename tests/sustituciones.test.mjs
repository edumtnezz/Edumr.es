import test from "node:test";
import assert from "node:assert/strict";
import { subsDePartido, agregarSubs, riesgoCambio } from "../functions/_lib/sustituciones.mjs";

const md = (gordonSale, i) => ({
  general: { homeTeam: { name: "Athletic", id: 1 }, awayTeam: { name: "Rival" + i, id: 100 + i } },
  content: {
    lineup: { homeTeam: { starters: [{ id: 10, name: "Gordon" }, { id: 11, name: "Otro" }] }, awayTeam: { starters: [{ id: 20 + i, name: "R" }] } },
    matchFacts: { events: { events: gordonSale ? [{ type: "Substitution", time: 70 + i, isHome: true, swap: [{ id: 30, name: "Adeyemi" }, { id: 10, name: "Gordon" }] }] : [] } },
  },
});

test("cambio: el primero entra y el segundo sale; sin alineación no se apunta", () => {
  const p = subsDePartido(md(true, 0));
  assert.deepEqual(p.subs[0], { h: 1, m: 70, i: ["30", "Adeyemi"], o: ["10", "Gordon"], l: 0 });
  assert.equal(subsDePartido({ general: {}, content: {} }), null);
});
test("Gordon sale en 4 de 5 y siempre entra Adeyemi", () => {
  const ps = [0, 1, 2, 3, 4].map((i) => subsDePartido(md(i < 4, i)));
  const r = riesgoCambio(agregarSubs(ps));
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { id: "10", n: "Gordon", team: "Athletic", tid: "1", tit: 5, sale: 4, min: 72, rev: { n: "Adeyemi", k: 4 } });
});
test("los cambios por lesión no cuentan", () => {
  const m = md(true, 0); m.content.matchFacts.events.events[0].injuredPlayerOut = true;
  assert.equal(agregarSubs([subsDePartido(m)]).find((x) => x.id === "10").sale, 0);
});
