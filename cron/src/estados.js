// Vigila el estado físico de los jugadores (Biwenger) y también el que marca Futmondo, y apunta cada cambio
// con su hora. Sirve para dos cosas: saber quién avisa antes y ser la base de las noticias y de «Últimos cambios» propios.
import { BW_URL, fotoEstados, cambios } from "../../functions/_lib/estados.mjs";

const K_FOTO = "est:foto:v1", K_EV = "est:eventos:v1";
const FM = { doubt: "duda", injured: "lesionado", injured2: "lesionado", redcard: "sancionado", yellowcard: "apercibido" };

export async function vigilarEstados(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 3 !== 0) return { skipped: "no toca" };
  const [rb, rm] = await Promise.all([
    f(BW_URL, { headers: { "user-agent": "edumr.es (contacto en la web)" } }),
    f("https://edumr.es/api/laquiniela/mercado", { headers: { "user-agent": "edumr-cron" } }),
  ]);
  if (!rb.ok || !rm.ok) return { error: "fuente " + rb.status + "/" + rm.status };
  const bw = await rb.json(), mk = await rm.json();
  const F = Array.isArray(mk.players) ? mk.players : [];
  if (F.length < 300 || !bw || !bw.data || Object.keys(bw.data.players || {}).length < 300) return { error: "datos incompletos" };
  const bwFoto = fotoEstados(bw, F);
  const fmFoto = {};
  for (const p of F) fmFoto[p.id] = { e: FM[p.statusFm != null ? p.statusFm : p.status] || "ok", info: "", at: 0 };
  const prev = await env.PORRA.get(K_FOTO, "json");
  const porId = new Map(F.map((p) => [p.id, p]));
  const nuevo = [];
  for (const [src, cur, old] of [["bw", bwFoto, prev && prev.bw], ["fm", fmFoto, prev && prev.fm]]) {
    for (const c of cambios(old, cur, now)) {
      const p = porId.get(c.id); if (!p) continue;
      nuevo.push(Object.assign({ src, name: p.name, team: p.team, role: p.role, photo: p.photo || null, logo: p.logo || null }, c));
    }
  }
  const igual = prev && JSON.stringify(prev.bw) === JSON.stringify(bwFoto) && JSON.stringify(prev.fm) === JSON.stringify(fmFoto);
  if (!igual) await env.PORRA.put(K_FOTO, JSON.stringify({ at: now, bw: bwFoto, fm: fmFoto }));
  if (nuevo.length) {
    const ev = (await env.PORRA.get(K_EV, "json")) || [];
    await env.PORRA.put(K_EV, JSON.stringify(ev.concat(nuevo).slice(-500)));
  }
  return { cambios: nuevo.length, primera: !prev };
}
