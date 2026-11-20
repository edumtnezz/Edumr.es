// Diario de LaLiga para «Últimos cambios» del Inicio: cosas que NO son noticia de un jugador
// (valores actualizados, cambios en la clasificación, novedades en los goleadores).
// Todo sale de comparar dos fotos reales (antes / ahora). Sin foto anterior no hay evento: nunca se inventa.

const ord = (n) => n + ".º";

// Clasificación: solo lo que importa arriba (líder y los tres primeros) y abajo (descenso: 18.º, 19.º y 20.º).
// prev / cur = [{ pos, id, name }]
export function eventosTabla(prev, cur) {
  const out = [];
  if (!Array.isArray(prev) || !Array.isArray(cur) || prev.length < 18 || cur.length !== prev.length) return out;
  const n = cur.length, zona = n - 3; // con 20 equipos: desciende del 18.º en adelante
  const antes = new Map(prev.map((t) => [String(t.id), t]));
  for (const t of cur) {
    const a = antes.get(String(t.id));
    if (!a || a.pos === t.pos) continue;
    const base = { tid: t.id, team: t.name };
    if (t.pos === 1) out.push({ ...base, cat: "clasificacion", k: "lider", title: t.name + ", nuevo líder de LaLiga", sub: "Antes era " + ord(a.pos) });
    else if (t.pos <= 3 && a.pos > 3) out.push({ ...base, cat: "clasificacion", k: "top3", title: t.name + " entra entre los tres primeros", sub: "Ahora es " + ord(t.pos) + " · antes " + ord(a.pos) });
    else if (t.pos > 3 && a.pos <= 3) out.push({ ...base, cat: "clasificacion", k: "sale3", title: t.name + " sale de los tres primeros", sub: "Ahora es " + ord(t.pos) + " · antes " + ord(a.pos) });
    if (t.pos > zona && a.pos <= zona) out.push({ ...base, cat: "clasificacion", k: "baja", title: t.name + " cae a la zona de descenso", sub: "Ahora es " + ord(t.pos) + " · antes " + ord(a.pos) });
    else if (t.pos <= zona && a.pos > zona) out.push({ ...base, cat: "clasificacion", k: "sube", title: t.name + " sale del descenso", sub: "Ahora es " + ord(t.pos) + " · antes " + ord(a.pos) });
  }
  return out;
}

// Goleadores: nuevo máximo goleador, un jugador nuevo entre los cinco primeros y goles de los cinco primeros.
// prev / cur = [{ id, n, team, tid, v }] ordenados de más a menos goles.
export function eventosGoles(prev, cur) {
  const out = [];
  if (!Array.isArray(prev) || !Array.isArray(cur) || prev.length < 5 || cur.length < 5) return out;
  const antes = new Map(prev.map((p, i) => [String(p.id), { v: p.v, i }]));
  const top = cur.slice(0, 5), topAntes = new Set(prev.slice(0, 5).map((p) => String(p.id)));
  top.forEach((p, i) => {
    const a = antes.get(String(p.id));
    const base = { pid: p.id, name: p.n, tid: p.tid, team: p.team, cat: "goleadores" };
    const goles = p.v + (p.v === 1 ? " gol" : " goles");
    if (i === 0 && String(prev[0].id) !== String(p.id) && p.v > prev[0].v) out.push({ ...base, k: "lider", title: p.n + ", nuevo máximo goleador", sub: goles + " · " + p.team });
    else if (!topAntes.has(String(p.id))) out.push({ ...base, k: "entra", title: p.n + " entra entre los cinco máximos goleadores", sub: goles + " · " + p.team });
    else if (a && p.v > a.v) out.push({ ...base, k: "gol", title: p.n + " llega a " + goles, sub: (i + 1) + ".º máximo goleador · " + p.team });
  });
  return out;
}

// Valores de Futmondo: una fila por día (hora de Madrid) con la hora REAL a la que cambiaron.
// log = [{ at, n, g:[{name,d}], u:[{name,d}], b:[{name,d}] }]. Cuenta la primera pasada del día con muchos jugadores
// (las siguientes son la misma actualización que Futmondo sirve a trozos, a veces con el signo al revés).
export function itemsMercado(log, now = Date.now(), dias = 8) {
  const fD = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });
  const visto = new Set(), out = [];
  const k = (d) => (Math.abs(d) >= 1e6 ? (Math.abs(d) / 1e6).toFixed(2).replace(".", ",").replace(/0$/, "").replace(/,$/, "") + " M" : Math.round(Math.abs(d) / 1000) + ".000");
  for (const e of (log || [])) {
    if (!e || !e.at || now - e.at > dias * 86400000 || !(e.n >= 50)) continue;
    const dia = fD.format(new Date(e.at));
    if (visto.has(dia)) continue;
    visto.add(dia);
    const todos = (e.u || []).concat(e.b || [], e.g || []);
    const sube = todos.filter((x) => x.d > 0).sort((x, y) => y.d - x.d)[0], baja = todos.filter((x) => x.d < 0).sort((x, y) => x.d - y.d)[0];
    const sub = [sube ? "Más sube: " + sube.name + " +" + k(sube.d) : "", baja ? "Más baja: " + baja.name + " −" + k(baja.d) : ""].filter(Boolean).join(" · ");
    out.push({ at: e.at, cat: "mercado", title: "Futmondo actualiza los valores", sub: sub || e.n + " jugadores cambian de valor", name: sube ? sube.name : "", href: "/futmondo/guiafantasy/noticias/ed-artmercado" }); // lleva al artículo «Subidas y bajadas» (16/11/2026)
  }
  // Solo la ÚLTIMA actualización: las de días anteriores ya no dicen nada (Edu veía «dos cambios de Nico Williams», 15/11/2026).
  out.sort((x, y) => y.at - x.at);
  return out.slice(0, 1);
}

// Líderes de LaLiga a partir de las listas de FotMob (LaLiga, temporada en curso): goles con penaltis marcados y amarillas.
// lista = TopLists[0].StatList de cada archivo. Nada calculado: solo se ordena y se recorta.
// Comprobado el 15/11/2026: los 19 jugadores con 4 amarillas de esta lista son los mismos 19 «apercibidos» de nuestro registro de estados.
export function lideres(goles, amarillas) {
  const fila = (x, extra) => Object.assign({ id: x.ParticiantId, n: x.ParticipantName, team: x.TeamName, tid: x.TeamId, v: Number(x.StatValue) }, extra || {});
  const ok = (l) => (Array.isArray(l) ? l.filter((x) => x && x.ParticipantName && Number.isFinite(Number(x.StatValue))) : []);
  const G = ok(goles), A = ok(amarillas);
  const out = {};
  out.goles = G.slice(0, 5).map((x) => fila(x, { pen: Number(x.SubStatValue) || 0 }));
  out.penaltis = G.filter((x) => Number(x.SubStatValue) > 0).sort((x, y) => Number(y.SubStatValue) - Number(x.SubStatValue)).slice(0, 3).map((x) => fila(x, { v: Number(x.SubStatValue) }));
  // Amarillas: solo interesan los que están a UNA de la sanción (4, 9, 14…: el ciclo es de cinco). Los que ya llegaron a 5 no se enseñan.
  out.amarillas = A.filter((x) => Number(x.StatValue) % 5 === 4).slice(0, 60).map((x) => fila(x));
  // Todas las amarillas (para la ficha de cada jugador): nombre, club y cuántas lleva.
  out.tarjetas = A.filter((x) => Number(x.StatValue) >= 1).map((x) => ({ n: x.ParticipantName, team: x.TeamName, v: Number(x.StatValue) }));
  return out;
}

// Rachas de equipos con TODOS los resultados de la temporada (FotMob, fixtures.allMatches): victorias seguidas y partidos seguidos sin perder,
// contados desde el último partido hacia atrás. Devuelve [{ tid, team, w, u, pj, at }] (at = fecha del último partido).
export function rachasDe(allMatches) {
  const res = new Map();
  const fin = (allMatches || []).filter((x) => x && x.status && x.status.finished && !x.status.cancelled && x.home && x.away && x.status.utcTime)
    .sort((a, b) => Date.parse(a.status.utcTime) - Date.parse(b.status.utcTime));
  for (const x of fin) {
    const g = String(x.status.scoreStr || "").split("-").map((t) => Number(t.trim()));
    if (g.length !== 2 || g.some((n) => !Number.isFinite(n))) continue;
    const put = (t, r) => { const k = String(t.id); if (!res.has(k)) res.set(k, { tid: k, team: t.name, r: [], at: 0 }); const o = res.get(k); o.r.push(r); o.at = Date.parse(x.status.utcTime); };
    put(x.home, g[0] > g[1] ? "W" : g[0] < g[1] ? "L" : "D"); put(x.away, g[1] > g[0] ? "W" : g[1] < g[0] ? "L" : "D");
  }
  return [...res.values()].map((o) => {
    let w = 0, u = 0;
    for (let i = o.r.length - 1; i >= 0 && o.r[i] === "W"; i--) w++;
    for (let i = o.r.length - 1; i >= 0 && o.r[i] !== "L"; i--) u++;
    return { tid: o.tid, team: o.team, w, u, pj: o.r.length, at: o.at };
  });
}
// Evento de racha cuando un equipo juega y alarga la suya: 4 o más victorias seguidas, o 5 o más partidos sin perder.
// Sin foto anterior (primera vez) salen las rachas que ya están vivas, con la fecha real de su último partido.
export function eventosRachas(prev, cur) {
  const out = [];
  for (const t of (cur || [])) {
    const a = prev && prev[t.tid];
    if (prev && (!a || a.pj >= t.pj)) continue; // no ha jugado desde la última foto
    if (t.w >= 4) out.push({ cat: "rachas", k: "w", tid: t.tid, team: t.team, at: t.at, title: t.team + " lleva " + t.w + " victorias seguidas", sub: "" });
    else if (t.u >= 5) out.push({ cat: "rachas", k: "u", tid: t.tid, team: t.team, at: t.at, title: t.team + " lleva " + t.u + " partidos sin perder", sub: "" });
  }
  return out;
}
// Chollo del día: disponible, 8 M o menos, 6 partidos o más y media de 6 o más; gana el que más puntos de media da por cada millón.
// Puede repetir (Edu, 16/11/2026): si ya fue chollo en los días guardados (usados = ids), sale marcado con rep = veces anteriores.
// Criterio del chollo (Edu 16/11/2026): Turrientes (40 % de jugar) y Gulácsi (el valor bajaba y puntuaba poco PARA UN PORTERO) no son chollos.
// Barato, sano, titular, regular, con el valor sin bajar en 7 días y con media igual o mejor que la mediana de su posición.
export function medianasPos(players) {
  const out = {};
  for (const r of ["portero", "defensa", "centrocampista", "delantero"]) {
    const a = (players || []).filter((p) => p.role === r && p.matches >= 8).map((p) => p.avg).sort((x, y) => x - y);
    if (a.length >= 5) out[r] = a[Math.floor(a.length / 2)];
  }
  return out;
}
// Calendario (20/11/2026, pedido de Edu): un chollo con calendario difícil no sale. `dif` = respuesta de /dificultad ({ equipos: [{ team, media }] }):
// media del nivel de los rivales de las próximas 5 jornadas (1 muy fácil … 5 muy difícil); 3,5 o más = difícil. Sin dato del equipo no se puede confirmar: no vale.
const kn = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const CAL_DIFICIL = 3.5;
export const mediaCalendario = (p, dif) => { const e = ((dif && dif.equipos) || []).find((x) => kn(x.team) === kn(p && p.team)); return e && e.media != null ? Number(e.media) : null; };
export function cholloValido(p, med = {}, dif) {
  if (dif !== undefined) { const m = mediaCalendario(p, dif); if (m == null || m >= CAL_DIFICIL) return false; }
  return !!(p && p.id && (!p.est || p.est === "apercibido") && p.value > 0 && p.value <= 8e6 && p.matches >= 8 && p.avg >= 6 && p.avg >= (med[p.role] || 0)
    && (p.prob || 0) >= 70 && (p.fitness || []).filter((x) => x > 0).length >= 4 && !(p.chg7 < 0));
}
export function cholloDe(players, usados = [], dif) {
  const med = medianasPos(players);
  const c = (players || []).filter((p) => cholloValido(p, med, dif))
    .sort((a, b) => b.avg / b.value - a.avg / a.value)[0];
  if (!c) return null;
  const rep = (usados || []).filter((x) => String(x) === String(c.id)).length;
  return { cat: "chollo", pid: c.id, name: c.name, title: c.name, rep, prob: c.prob };
}
