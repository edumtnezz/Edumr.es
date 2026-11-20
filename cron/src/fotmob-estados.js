// Segunda fuente de estado físico (20/11/2026): la lista de «no disponibles» de FotMob para el próximo partido de cada club.
// Apunta cada cambio con la hora a la que lo detectamos, para saber quién avisa antes (Biwenger o FotMob).
// Las noticias (partes.js) solo usan esto cuando Biwenger aún no lo tiene. Nunca toca el estado del mercado.
import { FM_MATCHES, FM_DETAIL, partidosPendientes, equiposDelPartido, fotoFotmob, unirFotos } from "../../functions/_lib/fotmob-estados.mjs";

const K_FOTO = "est:fo:v1", K_EV = "est:fo:ev:v1";
const H = { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr.es)" } };
const DIAS = 4; // el próximo partido de cada club cae casi siempre en estos días
const ymd = (t) => { const d = new Date(t); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0"); };

export async function vigilarFotmob(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 6 !== 2) return { skipped: "no toca" };
  const rm = await f("https://edumr.es/api/laquiniela/mercado", { headers: { "user-agent": "edumr-cron" } });
  if (!rm.ok) return { error: "mercado " + rm.status };
  const mk = await rm.json();
  const F = Array.isArray(mk.players) ? mk.players : [];
  if (F.length < 300) return { error: "datos incompletos" };
  // Partidos pendientes de los próximos días (un solo club puede salir en un día y en otro: se queda el primero)
  const dias = [];
  for (let i = 0; i < DIAS; i++) dias.push(ymd(now + i * 86400000));
  const listas = await Promise.all(dias.map((d) => f(FM_MATCHES(d), H).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (listas.some((l) => !l)) return { error: "fotmob lista" };
  const vistos = new Set(), partidos = [];
  for (const l of listas) for (const m of partidosPendientes(l)) if (!vistos.has(m.id)) { vistos.add(m.id); partidos.push(m); }
  if (!partidos.length) return { skipped: "sin partidos" };
  const dets = await Promise.all(partidos.map((m) => f(FM_DETAIL(m.id), H).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (dets.some((d) => !d)) return { error: "fotmob partido" };
  const equipos = [], hechos = new Set();
  for (const d of dets) for (const e of equiposDelPartido(d)) if (!hechos.has(e.team)) { hechos.add(e.team); equipos.push(e); }
  if (!equipos.length) return { skipped: "sin alineaciones" };
  const { foto, cubiertos } = fotoFotmob(equipos, F);
  const prev = await env.PORRA.get(K_FOTO, "json");
  const { foto: nueva, eventos } = unirFotos(prev && prev.fo, foto, cubiertos, F, now);
  const porId = new Map(F.map((p) => [p.id, p]));
  const ev = eventos.filter((e) => porId.has(e.id)).map((e) => Object.assign({ src: "fo", name: porId.get(e.id).name, team: porId.get(e.id).team }, e));
  if (!prev || JSON.stringify(prev.fo) !== JSON.stringify(nueva)) await env.PORRA.put(K_FOTO, JSON.stringify({ at: now, fo: nueva }));
  if (ev.length) {
    const viejos = (await env.PORRA.get(K_EV, "json")) || [];
    await env.PORRA.put(K_EV, JSON.stringify(viejos.concat(ev).slice(-500)));
  }
  return { equipos: equipos.length, estados: Object.keys(nueva).length, cambios: ev.length, primera: !prev };
}
