// Diario de LaLiga para «Últimos cambios» del Inicio: compara la clasificación y los goleadores de ahora con la última foto
// guardada y apunta lo que cambia (nuevo líder, tres primeros, descenso, goles de los máximos goleadores).
// Fuente: FotMob, a través de la web (/tabla y /lideres). Con un partido en juego no se compara: la tabla baila en directo.
import { eventosTabla, eventosGoles } from "../../functions/_lib/diario.mjs";

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
  // Si una fuente falla en esta pasada, se conserva su foto anterior (no se pierde la comparación).
  const foto = { at: now, tabla: tabla || prev.tabla || null, goles: goles || prev.goles || null };
  if (JSON.stringify([prev.tabla, prev.goles]) !== JSON.stringify([foto.tabla, foto.goles])) await env.PORRA.put(K_FOTO, JSON.stringify(foto));
  if (nuevos.length) {
    const ev = ((await env.PORRA.get(K_EV, "json")) || []).filter((e) => e && now - e.at < 15 * 86400000);
    await env.PORRA.put(K_EV, JSON.stringify(ev.concat(nuevos.map((e) => Object.assign({ at: now }, e))).slice(-120)));
  }
  return { eventos: nuevos.length, primera: !prev.at };
}
