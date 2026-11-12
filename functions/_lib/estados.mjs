// Estado físico de los jugadores (lesión, duda, sanción, apercibido) leído de Biwenger y emparejado con
// nuestros jugadores de Futmondo. De Biwenger solo se usa el estado y su texto: precios, puntos e histórico
// siguen siendo solo de Futmondo.
export const BW_URL = "https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es&score=1";

export function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const teamKey = (t) => norm(t).replace(/ /g, "").slice(0, 5);
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
