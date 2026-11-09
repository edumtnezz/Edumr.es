// Análisis propios de EduMR: salen SOLO de los datos de Futmondo de la web (puntos, valor, probabilidad, próximo rival).
// Los números van tal cual; la «lectura» es una regla sobre esos números, dicha como opinión, nunca como dato.
const norm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const num = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const mill = (v) => num(v / 1e6) + " M";
const media = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const desv = (a) => { const m = media(a); return Math.sqrt(media(a.map((x) => (x - m) ** 2))); };
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const elige = (arr, seed) => arr[hash(seed) % arr.length];

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
  return "Su próximo rival es el " + px.rival + (px.casa ? " en casa" : " fuera") + cuando + ".";
}
function serie(f) { return f.join(", "); }
function nombreClub(p) { return p.team; }

// Cada regla devuelve null o { tipo, titulo, entradilla, cuerpo, prio }
export function reglas(p, jornada) {
  const f = (Array.isArray(p.fitness) ? p.fitness : []).filter((x) => typeof x === "number");
  if (f.length < 4 || (p.matches || 0) < 6 || !(p.avg > 0)) return [];
  const last2 = f.slice(-2), last3 = f.slice(-3), ult = f[f.length - 1];
  const prob = typeof p.prob === "number" ? p.prob : null;
  const px = proximo(p, jornada);
  const sig = partidoTxt(px);
  const out = [];
  const base = "Media de " + num(p.avg) + " puntos en " + p.matches + " partidos. Sus últimos " + f.length + " con puntos: " + serie(f) + ".";
  const seed = p.id;
  // 1) Bajón: gran media y dos partidos flojos seguidos
  // Un 0 suele ser que no jugó (lesión, banquillo): eso no es un bajón de rendimiento
  if (p.avg >= 6.5 && last2.every((x) => x >= 1) && media(last2) <= p.avg * 0.5 && p.status !== "injured") {
    out.push({ tipo: "bajon", prio: 3 + p.avg / 10,
      titulo: elige([p.name + " baja el rendimiento tras dos partidos flojos", p.name + " se enfría: dos partidos por debajo de su nivel", "Dos partidos discretos de " + p.name + " con una media de " + num(p.avg)], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " promedia " + num(p.avg) + " puntos, pero sus dos últimos partidos han sido " + last2.join(" y ") + ".",
      cuerpo: base + (sig ? " " + sig : "") + "\nNuestra lectura: " + (prob != null && prob >= 70 ? "sigue siendo fijo (" + prob + " % de jugar), así que es un bache y no hay motivo para salir corriendo, aunque conviene vigilar el próximo partido." : "con " + (prob != null ? prob + " % de opciones de jugar" : "su situación poco clara") + ", es una venta a valorar si necesitas liquidez.") });
  }
  // 2) Racha: tres partidos seguidos muy por encima
  if (last3.length === 3 && last3.every((x) => x >= Math.max(8, p.avg)) && media(last3) >= p.avg * 1.1) {
    out.push({ tipo: "racha", prio: 3 + media(last3) / 10,
      titulo: elige([p.name + " enlaza tres partidos de más de " + Math.floor(Math.min(...last3)) + " puntos", p.name + " está en racha: " + last3.join(", ") + " en sus últimos tres", "Racha de " + p.name + " con tres partidos de nivel"], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " suma " + last3.join(", ") + " en sus tres últimos partidos y su valor es de " + mill(p.value) + ".",
      cuerpo: base + (sig ? " " + sig : "") + "\nNuestra lectura: " + (prob != null && prob < 70 ? "la racha es buena, pero solo tiene " + prob + " % de jugar: ojo antes de apostar por él." : "mientras siga jugando es un fijo en tu once; si lo tienes, no lo muevas.") });
  }
  // 3) Regular que flojea: tras cuatro partidos estables, un último claramente bajo
  const prev = f.slice(0, -1);
  if (prev.length >= 3 && prev.every((x) => x >= 1) && ult >= 1 && media(prev) >= 5 && desv(prev) <= 2.5 && ult <= media(prev) * 0.6) {
    out.push({ tipo: "regular", prio: 2.5 + media(prev) / 10,
      titulo: elige([p.name + ", tan regular, firma un " + ult + " en su último partido", "Tropiezo puntual de " + p.name + ": un " + ult + " tras partidos de " + num(media(prev)) + " de media", "Un " + ult + " de " + p.name + " rompe su regularidad"], seed),
      entradilla: "Hasta ahora el " + (p.role || "jugador") + " del " + nombreClub(p) + " promediaba " + num(media(prev)) + " en sus anteriores partidos con puntos.",
      cuerpo: base + (sig ? " " + sig : "") + "\nNuestra lectura: por su historial, lo normal es que recupere su nivel" + (prob != null ? " (tiene " + prob + " % de jugar)" : "") + ". Un partido flojo no cambia la tendencia." });
  }
  // 4) Chollo: barato, buena media y muy probable que juegue
  if (p.value > 0 && p.value <= 15e6 && p.avg >= 6 && prob != null && prob >= 70) {
    out.push({ tipo: "chollo", prio: 2 + p.avg / 10,
      titulo: elige(["Chollo en Futmondo: " + p.name + " rinde " + num(p.avg) + " de media por " + mill(p.value), p.name + " cuesta " + mill(p.value) + " y promedia " + num(p.avg) + " puntos", "Fichaje barato: " + p.name + ", " + num(p.avg) + " de media a " + mill(p.value)], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " tiene un " + prob + " % de jugar el próximo partido.",
      cuerpo: base + " Su valor actual es de " + mill(p.value) + (typeof p.chg7 === "number" ? " y ha cambiado " + (p.chg7 >= 0 ? "+" : "-") + mill(Math.abs(p.chg7)) + " en la última semana" : "") + "." + (sig ? " " + sig : "") + "\nNuestra lectura: puntos por millón muy buenos; mejor comprarlo antes de que suba." });
  }
  // 5) Duda: titular habitual marcado como duda
  if (p.status === "doubt" && p.avg >= 6) {
    out.push({ tipo: "duda", prio: 2.8 + p.avg / 10,
      titulo: elige([p.name + " es duda para el próximo partido", "Alerta en tu once: " + p.name + " aparece como duda", p.name + " no tiene el sitio asegurado"], seed),
      entradilla: "El " + (p.role || "jugador") + " del " + nombreClub(p) + " figura como duda en Futmondo" + (prob != null ? " con un " + prob + " % de opciones de jugar." : "."),
      cuerpo: base + (sig ? " " + sig : "") + "\nNuestra lectura: si lo tienes de titular, mira la alineación antes del partido y ten un cambio preparado." });
  }
  return out;
}

// Elige lo mejor que aún no está publicado. own = noticias propias ya guardadas.
export function elegirAnalisis(players, jornada, own, now, max) {
  const hoy = new Date(now).toISOString().slice(0, 10);
  const claves = new Set((own || []).map((o) => o.key).filter(Boolean));
  const hechasHoy = (own || []).filter((o) => String(o.key || "").startsWith("an-") && new Date(o.createdAt || 0).toISOString().slice(0, 10) === hoy).length;
  const cupo = Math.max(0, Math.min(max || 3, 30 - hechasHoy));
  const cand = [];
  for (const p of players || []) {
    for (const r of reglas(p, jornada)) {
      const key = "an-" + p.id + "-" + r.tipo + "-" + (p.jornadaFf || "x");
      if (claves.has(key)) continue;
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
  return elegirAnalisis(players, jornada, own, now, max).map((c) => {
    const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    return { id: hex, status: "published", createdAt: now, updatedAt: now, publishedAt: now, thumb: "", tipo: "analisis", club: c.p.team, players: [c.p.name], playerId: c.p.id, key: c.key, source: { name: "Datos de Futmondo", url: "", videoId: "" }, title: c.titulo, lead: c.entradilla.slice(0, 200), body: c.cuerpo, via: "datos" };
  });
}
