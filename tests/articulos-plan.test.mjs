import test from "node:test";
import assert from "node:assert/strict";
import { tocaAhora } from "../cron/src/articulos.js";
import { inicioJornada } from "../functions/_lib/articulos.mjs";

const madrid = (t) => { const pm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date(t)); return { dia: pm.find((x) => x.type === "weekday").value, hora: Number(pm.find((x) => x.type === "hour").value) % 24 }; };

test("semana de la J14: salen todos los artículos antes del viernes, 3 h entre ellos y 3 al día como mucho", () => {
  const t0 = Date.UTC(2026, 10, 23, 23, 7); // lun 24/11 00:07 Madrid
  const ini = inicioJornada([{ date: "27/11", time: "21:00" }], t0);
  const own = [], hechos = {}, salen = [];
  for (let now = t0; now < ini; now += 10 * 60000) {
    if (now % 3600000 < 600000) own.push({ auto: "estado", publishedAt: now }); // una noticia de jugador cada hora
    const { dia, hora } = madrid(now);
    const t = tocaAhora({ now, dia, hora, ini, jn: 14, own, hechos, paron: false, resumenListo: now > Date.UTC(2026, 10, 24, 6) });
    if (!t) continue;
    hechos[t === "artresumen" ? t + 13 : t + 14] = now;
    own.push({ tipo: "articulo", art: t, publishedAt: now });
    salen.push([t, dia, hora]);
  }
  assert.deepEqual(salen.map((x) => x[0]).sort(), ["artclaus", "artfichar", "artprevia", "artrachas", "artresumen", "artsuplente", "artvender", "artvuelven"]);
  const porDia = {}; salen.forEach((x) => { porDia[x[1]] = (porDia[x[1]] || 0) + 1; });
  assert.ok(Object.values(porDia).every((n) => n <= 3));
  assert.ok(!porDia.Mon);
  assert.deepEqual(salen.map((x) => x[1] + " " + x[0]), ["Tue artresumen", "Tue artvender", "Tue artrachas", "Wed artfichar", "Wed artsuplente", "Wed artprevia", "Thu artvuelven", "Thu artclaus"]);
});
