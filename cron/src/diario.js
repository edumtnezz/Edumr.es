// Diario de LaLiga para «Últimos cambios» del Inicio: compara la clasificación y los goleadores de ahora con la última foto
// guardada y apunta lo que cambia (nuevo líder, tres primeros, descenso, goles de los máximos goleadores).
// Fuente: FotMob, a través de la web (/tabla y /lideres). Con un partido en juego no se compara: la tabla baila en directo.
import { eventosTabla, eventosGoles, eventosRachas, cholloDe, cholloValido } from "../../functions/_lib/diario.mjs";

const K_FOTO = "diario:foto:v1", K_EV = "diario:v1";

export async function apuntarDiario(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 10 !== 4) return { skipped: "no toca" };
  const get = async (p) => { const r = await f("https://edumr.es/api/laquiniela/" + p, { headers: { "user-agent": "edumr-cron" } }); return r.ok ? r.json() : null; };
  const [jr, tb, ld] = await Promise.all([get("jornada"), get("tabla"), get("lideres")]);
  if (!jr || !Array.isArray(jr.matches)) return { error: "sin jornada" };
  if (jr.matches.some((m) => m.live && m.live.state === "live")) return { skipped: "partido en juego" };
  const tabla = tb && Array.isArray(tb.teams) && tb.teams.length >= 18 ? tb.teams.map((t) => ({ pos: t.pos, id: t.id, name: t.name })) : null;
  const goles = ld && Array.isArray(ld.goles) && ld.goles.length >= 5 ? ld.goles.map((p) => ({ id: p.id, n: p.n, team: p.team, tid: p.tid, v: p.v })) : null;
  const prev = (await env.PORRA.get(K_FOTO, "json")) || {};
  const nuevos = [];
  if (tabla && prev.tabla) nuevos.push(...eventosTabla(prev.tabla, tabla));
  if (goles && prev.goles) nuevos.push(...eventosGoles(prev.goles, goles));
  // Rachas de equipos: evento cuando un equipo juega y alarga la suya (la primera vez salen las que ya están vivas, con su fecha real)
  const rachas = ld && Array.isArray(ld.rachas) && ld.rachas.length >= 18 ? ld.rachas : null;
  if (rachas) nuevos.push(...eventosRachas(prev.rachas || null, rachas).filter((e) => now - e.at < 14 * 86400000));
  const fotoR = rachas ? Object.fromEntries(rachas.map((t) => [t.tid, { pj: t.pj }])) : (prev.rachas || null);
  // Chollo del día: uno al día, después de que Futmondo actualice los valores (si repite, sale marcado)
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(now));
  let chollo = prev.chollo || { dia: "", ids: [] };
  // Si el chollo de hoy ya no cumple el criterio (se cambió la regla o el jugador cayó en duda), se elige otro
  if (chollo.dia === hoy && chollo.ids && chollo.ids.length) {
    try { const mk0 = await get("mercado"); const p0 = mk0 && Array.isArray(mk0.players) ? mk0.players.find((q) => String(q.id) === String(chollo.ids[0])) : null; if (p0 && !cholloValido(p0)) { const mal = String(chollo.ids[0]); chollo = { dia: "", ids: chollo.ids.slice(1) }; const ev0 = (await env.PORRA.get(K_EV, "json")) || []; await env.PORRA.put(K_EV, JSON.stringify(ev0.filter((e) => !(e && e.cat === "chollo" && String(e.pid) === mal)))); } } catch (e) {}
  }
  if (chollo.dia !== hoy) {
    try {
      const log = (await env.PORRA.get("mkchg:v2", "json")) || [];
      const act = log.some((e) => e && e.n >= 50 && new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(e.at)) === hoy);
      if (act) {
        const mk = await get("mercado");
        const c = mk && Array.isArray(mk.players) && mk.players.length >= 300 ? cholloDe(mk.players, chollo.ids) : null;
        if (c) { nuevos.push(c); chollo = { dia: hoy, ids: [c.pid].concat(chollo.ids || []).slice(0, 30) }; }
      }
    } catch (e) {}
  }
  // Si una fuente falla en esta pasada, se conserva su foto anterior (no se pierde la comparación).
  const foto = { at: now, tabla: tabla || prev.tabla || null, goles: goles || prev.goles || null, rachas: fotoR, chollo };
  if (JSON.stringify([prev.tabla, prev.goles, prev.rachas, prev.chollo]) !== JSON.stringify([foto.tabla, foto.goles, foto.rachas, foto.chollo])) await env.PORRA.put(K_FOTO, JSON.stringify(foto));
  if (nuevos.length) {
    const ev = ((await env.PORRA.get(K_EV, "json")) || []).filter((e) => e && now - e.at < 15 * 86400000);
    await env.PORRA.put(K_EV, JSON.stringify(ev.concat(nuevos.map((e) => Object.assign({}, e, { at: e.at || now }))).slice(-120)));
  }
  return { eventos: nuevos.length, primera: !prev.at };
}
