// Estado físico de los jugadores (lesión, duda, sanción, apercibido) leído de Biwenger y emparejado con
// nuestros jugadores de Futmondo. De Biwenger solo se usa el estado y su texto: precios, puntos e histórico
// siguen siendo solo de Futmondo.
export const BW_URL = "https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es&score=1";

export function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
// Clave de club que iguala los nombres de Futmondo, Biwenger y el calendario («Barça», «Atleti», «Sevilla FC», «Real Betis»…)
export function clubKey(name) {
  let n = norm(name).replace(/\b(rcd|rc|cd|ca|ud|fc|cf|club|de|la)\b/g, " ").replace(/\s+/g, " ").trim();
  if (/^barca/.test(n)) n = "barcelona";
  if (/^atleti\b/.test(n)) n = "atletico";
  if (/betis/.test(n)) n = "betis";
  return n.replace(/ /g, "").slice(0, 5);
}
const teamKey = clubKey;
// Nombres que no se parecen entre Biwenger y Futmondo (comprobados a mano, 12/11/2026)
const ALIAS = { "ez abde": "abde ezzalzouli", "odysseas": "vlachodimos", "el hilali": "omar", "johnny": "j cardoso" };
const ROLES = { 1: "portero", 2: "defensa", 3: "centrocampista", 4: "delantero" };
// Estado de Biwenger → el nuestro
export const ESTADO = { ok: "ok", doubt: "duda", injured: "lesionado", sanctioned: "sancionado", warned: "apercibido" };

// Empareja cada jugador de Biwenger con uno de Futmondo del mismo equipo. Si hay duda entre dos, no empareja:
// es mejor no publicar que publicar sobre el jugador equivocado.
export function emparejar(bwPlayers, bwTeams, fmPlayers) {
  const porEquipo = new Map();
  for (const f of fmPlayers || []) {
    const k = teamKey(f.team);
    if (!porEquipo.has(k)) porEquipo.set(k, []);
    porEquipo.get(k).push({ f, n: norm(f.name), tok: norm(f.name).split(" ") });
  }
  const out = new Map(), usados = new Set();
  const pasadas = [
    (b, c) => c.n === b.n,
    (b, c) => b.tok.every((t) => c.tok.includes(t)) || c.tok.every((t) => b.tok.includes(t)),
    (b, c) => b.tok[b.tok.length - 1].length > 3 && b.tok[b.tok.length - 1] === c.tok[c.tok.length - 1],
    (b, c) => b.n.replace(/ /g, "").length > 4 && (c.n.replace(/ /g, "").includes(b.n.replace(/ /g, "")) || b.n.replace(/ /g, "").includes(c.n.replace(/ /g, ""))),
  ];
  const lista = (Array.isArray(bwPlayers) ? bwPlayers : Object.values(bwPlayers || {})).map((p) => { const n = ALIAS[norm(p.name)] || norm(p.name); return { p, n, tok: n.split(" "), k: teamKey(((bwTeams || {})[String(p.teamID)] || {}).name) }; });
  for (const test of pasadas) {
    for (const b of lista) {
      if (out.has(b.p.id) || !b.n) continue;
      let c = (porEquipo.get(b.k) || []).filter((x) => !usados.has(x.f.id) && test(b, x));
      if (c.length > 1) { const r = c.filter((x) => x.f.role === ROLES[b.p.position] || x.f.role2 === ROLES[b.p.position]); if (r.length === 1) c = r; }
      if (c.length === 1) { out.set(b.p.id, c[0].f); usados.add(c[0].f.id); }
    }
  }
  return out;
}

// Foto del estado actual: { [idFutmondo]: { e, info, at } } solo de los emparejados
export function fotoEstados(bw, fmPlayers) {
  const d = (bw && bw.data) || {};
  const m = emparejar(d.players, d.teams, fmPlayers);
  const foto = {};
  for (const p of Object.values(d.players || {})) {
    const f = m.get(p.id); if (!f) continue;
    const e = ESTADO[p.status] || "ok";
    foto[f.id] = { e, info: String(p.statusInfo || "").trim().slice(0, 240), at: p.statusChange ? p.statusChange * 1000 : 0 };
  }
  return foto;
}

// Cambios entre dos fotos. Sin foto anterior no hay cambios (primera pasada: solo se guarda).
export function cambios(prev, cur, now) {
  if (!prev) return [];
  const ev = [];
  for (const id of Object.keys(cur)) {
    const a = prev[id] || { e: "ok", info: "" }, b = cur[id];
    if (a.e === b.e && (a.info === b.info || !b.info)) continue;
    ev.push({ id, de: a.e, a: b.e, info: b.info, at: now, fuenteAt: b.at || 0, soloTexto: a.e === b.e });
  }
  return ev;
}

// ---------- Textos y datos para «Últimos cambios» y para las noticias de estado ----------
export const NOMBRE_ESTADO = { ok: "Disponible", duda: "Duda", lesionado: "Lesionado", sancionado: "Sancionado", apercibido: "Apercibido" };
const CAT = { duda: "duda", lesionado: "lesion", sancionado: "sancion", apercibido: "sancion", ok: "recuperado" };

// Separa «Lesión en X. Retorno estimado: Y.» en parte y retorno
export function partirInfo(info) {
  const s = String(info || "").trim();
  const m = s.match(/^(.*?)(?:\s*Retorno estimado:\s*(.+?))?\.?$/i);
  const parte = ((m && m[1]) || "").trim().replace(/\.$/, "");
  let retorno = ((m && m[2]) || "").trim().replace(/\.$/, "");
  if (/^vuelta indefinida$/i.test(retorno)) retorno = "sin fecha";
  return { parte, retorno };
}

export function tituloCambio(name, de, a) {
  if (a === "lesionado") return de === "duda" ? name + " pasa de duda a baja" : name + " cae lesionado";
  if (a === "duda") return de === "lesionado" ? name + " pasa de baja a duda" : name + " es duda";
  if (a === "sancionado") return name + " está sancionado";
  if (a === "apercibido") return name + " queda apercibido de sanción";
  if (a === "ok") return de === "sancionado" ? name + " cumple su sanción" : de === "apercibido" ? name + " deja de estar apercibido" : name + " vuelve a estar disponible";
  return name;
}
export const catCambio = (a) => CAT[a] || "otro";

// Titular habitual según sus minutos reales de Futmondo (perfil n/c/s): titular en el 60 % o más de los partidos de su equipo
export function esHabitual(mp) { return !!mp && mp.n >= 3 && (mp.c + mp.s + (mp.rd || 0)) / mp.n >= 0.6; }

// Recambio: compañero del mismo puesto, disponible y que no es titular habitual, con más minutos esta temporada.
// Solo se da si el que cae era titular habitual y el recambio ha jugado algo. Si no hay dato claro: null.
export function recambio(p, all, minMap, foto) {
  if (!p || !esHabitual((minMap || {})[p.id])) return null;
  const fuera = (id) => { const e = ((foto || {})[id] || {}).e; return e === "lesionado" || e === "sancionado" || e === "duda"; };
  const c = (all || []).filter((x) => x.id !== p.id && x.team === p.team && x.role === p.role && !fuera(x.id) && !esHabitual((minMap || {})[x.id]) && ((minMap || {})[x.id] || {}).t > 0)
    .sort((a, b) => minMap[b.id].t - minMap[a.id].t);
  return c[0] || null;
}

const eur = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
const PUESTO = { portero: "portero", defensa: "defensa", centrocampista: "centrocampista", delantero: "delantero" };

// Hechos comprobables de la noticia. Todo sale de Futmondo (puntos, valor, minutos), del calendario y del estado.
export function hechosNoticia({ p, de, a, info, mp, rec, prox }) {
  const { parte, retorno } = partirInfo(info);
  return {
    nombre: p.name, equipo: p.team, puesto: PUESTO[p.role] || "", de, a, parte, retorno,
    jornada: prox ? prox.jornada : null, rival: prox ? prox.rival : "", casa: prox ? !!prox.casa : null,
    puntos: p.points || 0, partidos: p.matches || 0, media: p.avg || 0, valor: p.value || 0,
    titular: mp ? mp.c + mp.s + (mp.rd || 0) : null, deEquipo: mp ? mp.n : null,
    recambio: rec ? rec.name : "",
  };
}

// Noticia con plantilla fija: no puede inventar nada porque solo coloca los hechos.
const enEl = (t) => (/^real sociedad/i.test(t) ? "en la " : "en el ") + t;
const conEl = (t) => (/^real sociedad/i.test(t) ? "con la " : "con el ") + t;
const min1 = (t) => t.charAt(0).toLowerCase() + t.slice(1);
// Titular con el motivo si cabe: «Mbappé, duda por molestias en los isquiotibiales»
function titular(h, base, generico) {
  if (!h.parte || h.parte.length > 62) return generico;
  return h.nombre + ", " + base + (/^molestias/i.test(h.parte) ? " por " : ": ") + min1(h.parte);
}
export function noticiaPlantilla(h) {
  const J = h.jornada ? "la jornada " + h.jornada : "la próxima jornada";
  const ante = h.rival ? (h.casa ? " ante el " : " en el campo del ") + h.rival : "";
  let title, lead, p1, consejo, tipo = "lesion", veredicto = "";
  if (h.a === "lesionado") {
    title = titular(h, "baja", h.nombre + ", baja " + enEl(h.equipo)); veredicto = "baja";
    lead = h.parte ? h.parte + "." : "Aparece como lesionado.";
    p1 = h.nombre + " es baja " + enEl(h.equipo) + " para " + J + ante + "." + (h.parte ? " Parte: " + min1(h.parte) + "." : "") + (h.retorno ? " Retorno estimado: " + h.retorno + "." : "");
    consejo = "No lo alinees." + (h.retorno ? " Vuelta estimada: " + h.retorno + "." : "") + (h.recambio ? " Su recambio más probable es " + h.recambio + "." : "");
  } else if (h.a === "duda") {
    title = titular(h, "duda", h.nombre + ", duda para " + J); veredicto = "duda";
    lead = h.parte ? h.parte + "." : "Aparece como duda.";
    p1 = h.nombre + " es duda " + enEl(h.equipo) + " para " + J + ante + "." + (h.parte ? " Motivo: " + h.parte.charAt(0).toLowerCase() + h.parte.slice(1) + "." : "");
    consejo = "No lo alinees de momento: espera a la convocatoria." + (h.recambio ? " Si no llega, su recambio más probable es " + h.recambio + "." : "");
  } else if (h.a === "sancionado") {
    title = h.nombre + ", sancionado para " + J; veredicto = "baja";
    lead = h.parte ? h.parte + "." : "No puede jugar por sanción.";
    p1 = h.nombre + " no puede jugar " + conEl(h.equipo) + " en " + J + ante + " por sanción." + (h.parte ? " Motivo: " + h.parte.charAt(0).toLowerCase() + h.parte.slice(1) + "." : "");
    consejo = "No lo alinees en " + J + "." + (h.recambio ? " Su recambio más probable es " + h.recambio + "." : "");
  } else {
    title = h.nombre + " vuelve a estar disponible"; veredicto = "alta"; tipo = "nota";
    lead = h.de === "sancionado" ? "Ya ha cumplido su sanción." : "Deja de aparecer como " + (h.de === "lesionado" ? "lesionado" : "duda") + ".";
    p1 = h.nombre + " vuelve a estar disponible " + enEl(h.equipo) + " para " + J + ante + ". " + lead;
    consejo = "Vuelve a ser opción. Comprueba si entra en el once antes de alinearlo.";
  }
  const p2 = h.partidos
    ? "Esta temporada suma " + h.puntos + " puntos en " + h.partidos + " partidos" + (h.media ? " (media " + String(h.media).replace(".", ",") + ")" : "") + (h.titular != null && h.deEquipo ? " y ha sido titular en " + h.titular + " de " + h.deEquipo : "") + ". Su valor en Futmondo es de " + eur(h.valor) + "."
    : "Todavía no ha jugado esta temporada. Su valor en Futmondo es de " + eur(h.valor) + ".";
  const claves = [];
  if (h.a === "ok") claves.push(h.nombre + " vuelve a estar disponible."); else claves.push(h.nombre + " es " + (h.a === "lesionado" ? "baja" : h.a === "duda" ? "duda" : "baja por sanción") + " para " + J + ".");
  if (h.parte && h.a !== "ok") claves.push(h.parte + ".");
  if (h.retorno) claves.push("Retorno estimado: " + h.retorno + ".");
  if (h.recambio && h.a !== "ok") claves.push("Recambio más probable: " + h.recambio + ".");
  return { title, lead, p1, p2, claves, consejo, tipo, veredicto, plazo: h.retorno || "" };
}

export function cuerpoNoticia(n, resumen) {
  // Un solo párrafo de texto: los números de la temporada se enseñan en casillas, con el dato de Futmondo del momento
  return [resumen || n.p1, "## Claves fantasy"].concat(n.claves.map((c) => "- " + c), ["## Consejo fantasy", n.consejo]).join("\n");
}

// Un resumen escrito por la IA solo vale si no trae ningún número ni nombre propio que no esté en los hechos.
export function resumenValido(texto, h) {
  const t = String(texto || "").trim();
  if (t.length < 60 || t.length > 500) return false;
  const base = norm([h.nombre, h.equipo, h.rival, h.recambio, h.parte, h.retorno, h.puesto, "Futmondo Biwenger"].join(" "));
  const nums = new Set([h.jornada, h.puntos, h.partidos, h.titular, h.deEquipo].filter((x) => x != null).map(String));
  String(h.media).split(/[.,]/).forEach((x) => nums.add(x)); String(Math.round(h.valor)).match(/\d{1,3}(?=(\d{3})*$)/g).forEach((x) => nums.add(String(Number(x)))); nums.add(String(Math.round(h.valor)));
  (base.match(/\d+/g) || []).forEach((x) => nums.add(x));
  for (const x of t.replace(/\.(?=\d{3}(\D|$))/g, "").match(/\d+/g) || []) if (!nums.has(String(Number(x))) && !nums.has(x)) return false;
  // Palabras con mayúscula en mitad de frase: deben estar en los hechos
  for (const m of t.matchAll(/(?<![.!?¿¡]\s|^|\n)\b([A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,})/g)) if (!base.split(" ").includes(norm(m[1]))) return false;
  return true;
}

// Once probable: si un titular está lesionado o sancionado según nuestro registro, sale del once (0 %) y entra su recambio.
// `side` = { name, starters:[{name, full, pos, prob, x, y, photo…}] } · devuelve los cambios hechos.
export function ajustarOnce(side, all, minMap, foto) {
  if (!side || !Array.isArray(side.starters) || !side.starters.length) return [];
  const m = emparejar(side.starters.map((p, i) => ({ id: i, name: p.full || p.name, teamID: 1 })), { 1: { name: side.name } }, all);
  const enOnce = new Set([...m.values()].map((f) => f.id)), hechos = [];
  side.starters = side.starters.map((p, i) => {
    const f = m.get(i), e = f && (foto || {})[f.id];
    if (!e || (e.e !== "lesionado" && e.e !== "sancionado")) return p;
    const cand = recambio(f, (all || []).filter((x) => !enOnce.has(x.id) || x.id === f.id), minMap, foto);
    hechos.push({ sale: f.name, motivo: e.e, info: e.info || "", entra: cand ? cand.name : "" });
    if (!cand) return { ...p, prob: 0, inj: e.e === "lesionado", san: e.e === "sancionado", fuera: e.e };
    enOnce.add(cand.id);
    const last = cand.name.split(" ").slice(-1)[0];
    return { ...p, name: cand.name, full: cand.name, last, photo: cand.photo || "", prob: null, inj: false, san: false, nat: "", edad: null, recambioDe: f.name };
  });
  return hechos;
}
