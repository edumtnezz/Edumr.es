// Análisis propios de EduMR: salen SOLO de los datos de Futmondo de la web (puntos, valor, probabilidad, próximo rival).
// Los números van tal cual; la «lectura» es una regla sobre esos números, dicha como opinión, nunca como dato.
const norm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const num = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const mill = (v) => num(v / 1e6) + " M";
const media = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const desv = (a) => { const m = media(a); return Math.sqrt(media(a.map((x) => (x - m) ** 2))); };
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const elige = (arr, seed) => arr[hash(seed) % arr.length];

// Nombre de equipo común entre el mercado («Atlético de Madrid») y el calendario («Atleti»)
const ALIAS = { barca: "barcelona", atleti: "atletico", "atletico de madrid": "atletico", athletic: "athletic", "athletic de bilbao": "athletic", celta: "celta", "celta de vigo": "celta", deportivo: "deportivo", "deportivo de la coruna": "deportivo", racing: "racing", "racing de santander": "racing", "real betis": "betis", "sevilla fc": "sevilla" };
export const canon = (t) => { const n = norm(t); return ALIAS[n] || n; };

// Jornadas que ha JUGADO cada equipo, en orden de fecha (los aplazados no cuentan). null si falta algún dato.
export async function jornadasJugadas(f, site, jornada) {
  const cur = Number(jornada && jornada.matchday) || 0;
  if (!cur) return null;
  const rs = await Promise.all(Array.from({ length: cur }, (_, i) => i + 1).map(async (n) => {
    if (n === cur) return { n, ms: jornada.matches || [] };
    try { const r = await f(site + "jornada?jornada=" + n, { headers: { "user-agent": "edumr-cron" } }); const j = await r.json(); return { n, ms: j.matches || [] }; } catch (e) { return null; }
  }));
  if (rs.some((x) => !x || !x.ms.length)) return null;
  const key = (d, t) => { const a = String(d || "").split("/").map(Number); const hm = Number(String(t || "0:0").replace(":", "")) || 0; return (((a[1] >= 7 ? a[1] : a[1] + 12) || 0) * 100 + (a[0] || 0)) * 10000 + hm; };
  const m = {};
  rs.forEach((r) => r.ms.forEach((x) => {
    if (!(x.live && x.live.state === "final")) return;
    [x.home, x.away].forEach((t) => { const k = canon(t); (m[k] = m[k] || []).push({ n: r.n, k: key(x.date, x.time) }); });
  }));
  const out = {};
  Object.keys(m).forEach((k) => { out[k] = m[k].sort((a, b) => a.k - b.k).map((z) => z.n); });
  // Goles a favor y en contra de cada equipo en los partidos ya terminados (datos reales de la liga en la web)
  const goles = {};
  rs.forEach((r) => r.ms.forEach((x) => {
    if (!(x.live && x.live.state === "final")) return;
    const sc = String(x.live.score || "").match(/(\d+)\s*-\s*(\d+)/);
    if (!sc) return;
    const gh = Number(sc[1]), ga = Number(sc[2]);
    [[x.home, gh, ga], [x.away, ga, gh]].forEach(([t, gf, gc]) => { const k = canon(t); const g = (goles[k] = goles[k] || { gf: 0, gc: 0, pj: 0 }); g.gf += gf; g.gc += gc; g.pj += 1; });
  }));
  Object.defineProperty(out, "__goles", { value: goles, enumerable: false });
  return out;
}
// «J8 6 · J9 10 · …» para los puntos del jugador, o null si no se sabe la jornada de cada uno
export function serieJornadas(p, f, jugadas, pub) {
  const l = jugadas && jugadas[canon(p.team)];
  if (!l || !pub) return null;
  const n = Math.min(l.length, pub);
  if (n < f.length) return null;
  return f.map((v, i) => "J" + l[n - f.length + i] + ": " + Math.round(v)).join(" · ");
}

// ¿El rival marca mucho? Está entre el 30 % de equipos con más goles por partido (mín. 4 partidos). null = sin datos.
export function ataqueFuerte(rival, jugadas) {
  const g = jugadas && jugadas.__goles;
  if (!g || !rival) return null;
  const me = g[canon(rival)];
  if (!me || me.pj < 4) return null;
  const todos = Object.values(g).filter((x) => x.pj >= 4).map((x) => x.gf / x.pj).sort((a, b) => b - a);
  if (todos.length < 10) return null;
  const corte = todos[Math.max(0, Math.ceil(todos.length * 0.3) - 1)];
  return me.gf / me.pj >= corte;
}

// ¿El rival encaja pocos goles? Entre el 30 % de equipos que menos encajan por partido (mín. 4 partidos). null = sin datos.
export function defensaFuerte(rival, jugadas) {
  const g = jugadas && jugadas.__goles;
  if (!g || !rival) return null;
  const me = g[canon(rival)];
  if (!me || me.pj < 4) return null;
  const todos = Object.values(g).filter((x) => x.pj >= 4).map((x) => x.gc / x.pj).sort((a, b) => a - b);
  if (todos.length < 10) return null;
  const corte = todos[Math.max(0, Math.ceil(todos.length * 0.3) - 1)];
  return me.gc / me.pj <= corte;
}

export function proximo(p, jornada) {
  if (!p || !p.rivalFf) return null;
  const rival = norm(p.rivalFf), equipo = norm(p.team);
  const ms = (jornada && jornada.matches) || [];
  const m = ms.find((x) => {
    const h = norm(x.home), a = norm(x.away);
    const par = (h.includes(rival) || rival.includes(h)) && (a.includes(equipo) || equipo.includes(a)) || (a.includes(rival) || rival.includes(a)) && (h.includes(equipo) || equipo.includes(h));
    return par && !x.live && !(x.aplazado > 0);
  });
  const ok = String(p.jornadaFf || "") === String(jornada && jornada.matchday || "");
  return { rival: p.rivalFf, casa: !!p.casaFf, dia: ok && m && !m.tbc ? m.day + " " + m.date : "", hora: ok && m && !m.tbc ? m.time : "" };
}
function partidoTxt(px) {
  if (!px) return "";
  const cuando = px.dia ? " el " + px.dia + (px.hora ? " a las " + px.hora : "") : "";
  return "Su próximo rival es **" + px.rival + "**" + (px.casa ? " en casa" : " fuera") + cuando + ".";
}
function serie(f) { return f.join(", "); }
function nombreClub(p) { return p.team; }

// Cada regla devuelve null o { tipo, titulo, entradilla, cuerpo, prio }
export function reglas(p, jornada, jugadas, pub, mins) {
  const f = (Array.isArray(p.fitness) ? p.fitness : []).filter((x) => typeof x === "number");
  if (f.length < 4 || (p.matches || 0) < 6 || !(p.avg > 0)) return [];
  const last2 = f.slice(-2), last3 = f.slice(-3), ult = f[f.length - 1];
  const prob = typeof p.prob === "number" ? p.prob : null;
  const px = proximo(p, jornada);
  const sig = partidoTxt(px);
  const out = [];
  const sj = serieJornadas(p, f, jugadas, pub);
  const base = "Media de **" + num(p.avg) + "** puntos en " + p.matches + " partidos. " + (sj ? "Sus últimos " + f.length + " partidos, por jornada: " + sj + "." : "Sus últimos " + f.length + " con puntos: " + serie(f) + ".");
  const seed = p.id;
  // 1) Bajón: gran media y dos partidos flojos seguidos
  // Un 0 suele ser que no jugó (lesión, banquillo): eso no es un bajón de rendimiento
  if (p.avg >= 6.5 && last2.every((x) => x >= 1) && media(last2) <= p.avg * 0.5 && p.status !== "injured") {
    out.push({ tipo: "bajon", prio: 3 + p.avg / 10,
      titulo: elige([p.name + " baja el rendimiento tras dos partidos flojos", p.name + " se enfría: dos partidos por debajo de su nivel", "Dos partidos discretos de " + p.name + " con una media de " + num(p.avg)], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " promedia " + num(p.avg) + " puntos, pero sus dos últimos partidos han sido " + last2.join(" y ") + ".",
      cuerpo: base + (sig ? " " + sig : "") + "\n**Nuestra lectura:** " + (prob != null && prob >= 70 ? "sigue siendo fijo (" + prob + " % de jugar), así que es un bache y no hay motivo para salir corriendo, aunque conviene vigilar el próximo partido." : "con " + (prob != null ? prob + " % de opciones de jugar" : "su situación poco clara") + ", es una venta a valorar si necesitas liquidez.") });
  }
  // 2) Racha: tres partidos seguidos muy por encima
  if (last3.length === 3 && last3.every((x) => x >= Math.max(8, p.avg)) && media(last3) >= p.avg * 1.1) {
    out.push({ tipo: "racha", prio: 3 + media(last3) / 10,
      titulo: elige([p.name + " enlaza tres partidos de más de " + Math.floor(Math.min(...last3)) + " puntos", p.name + " está en racha: " + last3.join(", ") + " en sus últimos tres", "Racha de " + p.name + " con tres partidos de nivel"], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " suma " + last3.join(", ") + " en sus tres últimos partidos y su valor es de " + mill(p.value) + ".",
      cuerpo: base + (sig ? " " + sig : "") + "\n**Nuestra lectura:** " + (prob != null && prob < 70 ? "la racha es buena, pero solo tiene " + prob + " % de jugar: ojo antes de apostar por él." : "mientras siga jugando es un fijo en tu once; si lo tienes, no lo muevas.") });
  }
  // 3) Regular que flojea: tras cuatro partidos estables, un último claramente bajo
  const prev = f.slice(0, -1);
  if (prev.length >= 3 && prev.every((x) => x >= 1) && ult >= 1 && media(prev) >= 5 && desv(prev) <= 2.5 && ult <= media(prev) * 0.6) {
    out.push({ tipo: "regular", prio: 2.5 + media(prev) / 10,
      titulo: elige([p.name + ", tan regular, firma un " + ult + " en su último partido", "Tropiezo puntual de " + p.name + ": un " + ult + " tras partidos de " + num(media(prev)) + " de media", "Un " + ult + " de " + p.name + " rompe su regularidad"], seed),
      entradilla: "Hasta ahora el " + (p.role || "jugador") + " del " + nombreClub(p) + " promediaba " + num(media(prev)) + " en sus anteriores partidos con puntos.",
      cuerpo: base + (sig ? " " + sig : "") + "\n**Nuestra lectura:** por su historial, lo normal es que recupere su nivel" + (prob != null ? " (tiene " + prob + " % de jugar)" : "") + ". Un partido flojo no cambia la tendencia." });
  }
  // 4) Chollo: barato, buena media y muy probable que juegue
  // Criterios de Edu (10/11/2026) para recomendar: prioridad puntos por millón; fuera si valor bajando, lesión/duda,
  // dos partidos flojos, juega fuera, o el rival lo penaliza (ataque fuerte para porteros/defensas, defensa sólida para medios/delanteros).
  const defensivo = /portero|defensa/i.test(String(p.role || ""));
  const valorSube = typeof p.chg7 === "number" && p.chg7 >= 0;
  const rivalOk = defensivo ? ataqueFuerte(p.rivalFf, jugadas) === false : defensaFuerte(p.rivalFf, jugadas) === false;
  const sano = p.status !== "doubt" && !/^injured/.test(String(p.status || ""));
  const enBache = last2.every((x) => x >= 1) && media(last2) <= p.avg * 0.5;
  const enCasa = p.casaFf !== false;
  const ppm = p.value > 0 ? p.avg / (p.value / 1e6) : 0;
  if (p.value > 0 && p.value <= 15e6 && p.avg >= 6 && prob != null && prob >= 70 && valorSube && rivalOk && sano && !enBache && enCasa) {
    out.push({ tipo: "chollo", prio: 2 + Math.min(ppm, 5) / 5,
      titulo: elige(["Chollo en Futmondo: " + p.name + " rinde " + num(p.avg) + " de media por " + mill(p.value), p.name + " cuesta " + mill(p.value) + " y promedia " + num(p.avg) + " puntos", "Fichaje barato: " + p.name + ", " + num(p.avg) + " de media a " + mill(p.value)], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " tiene un " + prob + " % de jugar el próximo partido.",
      cuerpo: base + " Su valor actual es de " + mill(p.value) + (typeof p.chg7 === "number" ? " y ha cambiado " + (p.chg7 >= 0 ? "+" : "-") + mill(Math.abs(p.chg7)) + " en la última semana" : "") + "." + (sig ? " " + sig : "") + "\n**Nuestra lectura:** puntos por millón muy buenos; mejor comprarlo antes de que suba." });
  }
  // 6) Fijo: juega casi todo, casi nunca lo cambian y puntúa (minutos reales de Futmondo; sin ese dato no sale)
  const mn = mins && mins[p.id];
  if (mn && mn.n >= 8 && mn.j >= 0.9 * mn.n && (mn.c + mn.s) >= 0.85 * mn.j && mn.c >= 0.6 * (mn.c + mn.s) && mn.t / mn.j >= 80 && p.avg >= 6 && prob != null && prob >= 70 && p.status !== "doubt" && !/^injured/.test(String(p.status || ""))) {
    const tit = mn.c + mn.s;
    out.push({ tipo: "fijo", prio: 2.2 + p.avg / 10,
      titulo: elige([p.name + " no se baja del once: " + mn.j + " partidos de " + mn.n, "Fijo en el " + nombreClub(p) + ": " + p.name + " juega casi todo y promedia " + num(p.avg), p.name + " juega " + mn.j + " de " + mn.n + " partidos y casi nunca sale del campo"], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " ha jugado " + mn.j + " de los " + mn.n + " partidos de su equipo y promedia " + num(p.avg) + " puntos.",
      cuerpo: "Ha jugado **" + mn.j + "** de **" + mn.n + "** partidos del " + nombreClub(p) + ": **" + mn.t + "** minutos, unos " + Math.round(mn.t / mn.j) + " por partido. Como titular, ha completado **" + mn.c + "** de " + tit + " y lo han cambiado " + mn.s + (mn.s === 1 ? " vez" : " veces") + ". Media de **" + num(p.avg) + "** puntos en " + p.matches + " partidos." + (sig ? " " + sig : "") + "\n**Nuestra lectura:** jugar casi todo y puntuar da seguridad a tu once" + (prob != null ? " (" + prob + " % de jugar el próximo partido)" : "") + "." });
  }
  // 7) Rentable: mismo criterio que "Jugadores rentables" de la web (media >= 8, valor que no baja, sin lesión) + prob >= 70
  if (p.value > 0 && ppm >= 0.3 && p.avg >= 8 && p.matches >= 6 && (Number(p.change) || 0) >= 0 && valorSube && !/injured|redcard/.test(String(p.status || "")) && sano && prob != null && prob >= 70 && enCasa) {
    out.push({ tipo: "rentable", prio: 2.4 + Math.min(ppm, 1.2) / 1.2 * 0.8,
      titulo: elige(["Rentable: " + p.name + " puntúa " + num(p.avg) + " de media y cuesta " + mill(p.value), p.name + ", de los más rentables: " + num(p.avg) + " puntos por " + mill(p.value), "Calidad-precio: " + p.name + " promedia " + num(p.avg) + " a " + mill(p.value)], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " rinde " + num(ppm) + " puntos de media por cada millón de valor.",
      cuerpo: base + " Su valor es de " + mill(p.value) + (typeof p.chg7 === "number" ? " y en la última semana ha cambiado " + (p.chg7 >= 0 ? "+" : "-") + mill(Math.abs(p.chg7)) : "") + "." + (sig ? " " + sig : "") + "\n**Nuestra lectura:** de los jugadores con mejor relación puntos-precio de la liga, con " + prob + " % de jugar el próximo partido." });
  }
  // 8) Revelación: jugador barato (no una estrella conocida) que rinde mucho y cuyo valor sube
  const subida = typeof p.chg14 === "number" ? p.chg14 : (typeof p.chg7 === "number" ? p.chg7 : 0);
  if (p.value > 0 && p.value <= 20e6 && p.avg >= 7 && p.matches >= 6 && subida > 0 && media(last3) >= p.avg * 0.9 && prob != null && prob >= 70 && sano && !/injured|redcard/.test(String(p.status || "")) && !enBache) {
    out.push({ tipo: "revelacion", prio: 2.7 + p.avg / 20,
      titulo: elige(["Revelación: " + p.name + " promedia " + num(p.avg) + " y solo cuesta " + mill(p.value), p.name + " sorprende: " + num(p.avg) + " de media a " + mill(p.value), "Ojo a " + p.name + ", la sorpresa del " + nombreClub(p)], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " cuesta " + mill(p.value) + ", suma " + num(p.avg) + " de media y su valor sube.",
      cuerpo: base + " Su valor es de " + mill(p.value) + " y ha subido " + mill(subida) + " en las últimas semanas." + (sig ? " " + sig : "") + "\n**Nuestra lectura:** barato, en buena dinámica y con " + prob + " % de jugar; de los que conviene fichar antes de que suban más." });
  }
  // 5) Duda: titular habitual marcado como duda
  if (p.status === "doubt" && p.avg >= 6) {
    out.push({ tipo: "duda", prio: 2.8 + p.avg / 10,
      titulo: elige([p.name + " es duda para el próximo partido", "Alerta en tu once: " + p.name + " aparece como duda", p.name + " no tiene el sitio asegurado"], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " figura como duda en Futmondo" + (prob != null ? " con un " + prob + " % de opciones de jugar." : "."),
      cuerpo: base + (sig ? " " + sig : "") + "\n**Nuestra lectura:** si lo tienes de titular, mira la alineación antes del partido y ten un cambio preparado." });
  }
  return out;
}

// Elige lo mejor que aún no está publicado. own = noticias propias ya guardadas.
const snapDe = (p) => ({ v: p.value || 0, pr: typeof p.prob === "number" ? p.prob : null, st: p.status || "", rv: p.rivalFf || "", j: String(p.jornadaFf || "x") });
const snapTxt = (p) => [Math.round((p.value || 0) / 1e6), p.status || "", typeof p.prob === "number" ? Math.round(p.prob / 20) : "", p.rivalFf || ""].join("|");
// Cambio que merece otra nota en la misma jornada: precio (≥ 1 M), situación (estado o ≥ 20 puntos de probabilidad) o rival
export function cambioReal(prev, p) {
  if (!prev) return false;
  if (Math.abs((p.value || 0) - (prev.v || 0)) >= 1e6) return true;
  if ((p.status || "") !== (prev.st || "")) return true;
  if (typeof p.prob === "number" && typeof prev.pr === "number" && Math.abs(p.prob - prev.pr) >= 20) return true;
  if ((p.rivalFf || "") !== (prev.rv || "")) return true;
  return false;
}
export function elegirAnalisis(players, jornada, own, now, max, jugadas, mins) {
  const hoy = new Date(now).toISOString().slice(0, 10);
  const claves = new Set((own || []).map((o) => o.key).filter(Boolean));
  // Sin tope diario: se reparten en el tiempo. Como mucho 1 cada 40 min (Edu 11/11/2026)
  const ultima = (own || []).filter((o) => String(o.key || "").startsWith("an-")).reduce((m, o) => Math.max(m, o.createdAt || 0), 0);
  const cupo = ultima && now - ultima < 40 * 60e3 ? 0 : 1;
  const yaTienen = new Set((own || []).map((o) => String(o.key || "")).filter((k) => k.startsWith("an-")).map((k) => { const m = k.match(/^an-(.+?)-[^-]+-([^-]+)$/); return m ? m[1] + "|" + m[2] : ""; }));
  const cand = [];
  const pubMax = {};
  for (const p of players || []) { const k = canon(p.team), m = Number(p.matches) || 0; if (m > (pubMax[k] || 0)) pubMax[k] = m; }
  // Último análisis de cada jugador con su foto del momento: solo se vuelve a hablar de él si algo ha cambiado de verdad
  const ultimo = {};
  for (const o of own || []) if (o.snap && o.playerId && (!ultimo[o.playerId] || (o.createdAt || 0) > (ultimo[o.playerId].at || 0))) ultimo[o.playerId] = Object.assign({ at: o.createdAt || 0 }, o.snap);
  for (const p of players || []) {
    const jx = String(p.jornadaFf || "x"), prev = ultimo[p.id];
    const cambio = !!prev && String(prev.j) === jx && cambioReal(prev, p);
    for (const r of reglas(p, jornada, jugadas, pubMax[canon(p.team)], mins)) {
      const key = "an-" + p.id + "-" + r.tipo + "-" + jx + (cambio ? "c" + hash(snapTxt(p)) : "");
      if (claves.has(key)) continue;
      if (!cambio && yaTienen.has(p.id + "|" + jx)) continue; // un solo análisis por jugador y jornada, salvo que cambie algo
      if (prev && String(prev.j) === jx && !cambio) continue;
      cand.push(Object.assign({ key, p }, r));
    }
  }
  cand.sort((a, b) => b.prio - a.prio);
  const usados = new Set();
  const porTipo = {};
  const out = [];
  for (const c of cand) {
    if (out.length >= cupo) break;
    if (usados.has(c.p.id)) continue; // una por jugador y pasada
    if ((porTipo[c.tipo] || 0) >= 1) continue; // y variedad: un tipo de cada por pasada
    porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1;
    usados.add(c.p.id);
    out.push(c);
  }
  return out;
}
export async function analisisDatos(env, f, site, own, now, max) {
  let players = [], jornada = null;
  try { const r = await f(site + "mercado", { headers: { "user-agent": "edumr-cron" } }); const d = await r.json(); players = Array.isArray(d.players) ? d.players : []; } catch (e) {}
  try { const r = await f(site + "jornada", { headers: { "user-agent": "edumr-cron" } }); jornada = await r.json(); } catch (e) {}
  if (!players.length) return [];
  let mins = null;
  try {
    const r = await f(site + "minutos", { headers: { "user-agent": "edumr-cron" } }); const d = await r.json();
    const mp = {};
    Object.keys((d && d.map) || {}).forEach((id) => { const v = d.map[id]; if (v && typeof v.n === "number") mp[id] = v; });
    mins = Object.keys(mp).length ? mp : null;
  } catch (e) {}
  const prev = elegirAnalisis(players, jornada, own, now, max, null, mins);
  let jugadas = null;
  if (prev.length) { try { jugadas = await jornadasJugadas(f, site, jornada); } catch (e) {} }
  return (jugadas ? elegirAnalisis(players, jornada, own, now, max, jugadas, mins) : prev).map((c) => {
    const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    return { id: hex, status: "published", createdAt: now, updatedAt: now, publishedAt: now, thumb: "", tipo: "analisis", club: c.p.team, players: [c.p.name], playerId: c.p.id, snap: snapDe(c.p), key: c.key, source: { name: "Datos de Futmondo", url: "", videoId: "" }, title: c.titulo, lead: c.entradilla.slice(0, 200), body: c.cuerpo, via: "datos" };
  });
}
