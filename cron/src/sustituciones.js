// Quién sustituye a quién: guarda los cambios de cada partido terminado de LaLiga (FotMob) en KV «subs:v1».
// Cada pasada (cada 10 min, minuto 3) procesa hasta 40 partidos nuevos terminados hace más de 3 horas. Reglas: functions/_lib/sustituciones.mjs.
import { subsDePartido } from "../../functions/_lib/sustituciones.mjs";
const K = "subs:v1", UA = { "user-agent": "Mozilla/5.0 (compatible; edumr)" };
export async function apuntarSustituciones(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 10 !== 3) return { skipped: "no toca" };
  const lg = await (await f("https://www.fotmob.com/api/data/leagues?id=87&ccode3=ESP", { headers: UA })).json();
  const all = (((lg || {}).fixtures || {}).allMatches) || [];
  const st = (await env.PORRA.get(K, "json")) || { done: {}, p: [] };
  const pend = all.filter((m) => m && m.status && m.status.finished && !m.status.cancelled && Date.parse(m.status.utcTime) < now - 3 * 3600e3 && !st.done[m.id]).slice(0, 40);
  if (!pend.length) return { nuevos: 0 };
  let n = 0;
  for (const m of pend) {
    try {
      const md = await (await f("https://www.fotmob.com/api/data/matchDetails?matchId=" + m.id, { headers: UA })).json();
      const pt = subsDePartido(md);
      if (!pt) continue; // sin alineación todavía: se vuelve a intentar en otra pasada
      st.p.push(Object.assign({ id: String(m.id), at: Date.parse(m.status.utcTime) }, pt));
      st.done[m.id] = 1; n++;
    } catch (e) {}
  }
  if (n) await env.PORRA.put(K, JSON.stringify(st));
  return { nuevos: n, total: st.p.length };
}
