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
    out.push({ at: e.at, cat: "mercado", title: "Futmondo actualiza los valores", sub: sub || e.n + " jugadores cambian de valor", name: sube ? sube.name : "", href: "/futmondo/guiafantasy/mercado" });
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
