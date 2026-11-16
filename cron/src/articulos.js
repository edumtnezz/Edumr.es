// Artículos propios (a vender, a fichar, clausulazos y, solo en parones, el repaso de plantilla).
// Una edición por jornada y tipo, de martes a domingo a partir de las 10:00 (hora de Madrid). La edición nueva sustituye a la anterior del mismo tipo.
// Las reglas y los datos están en functions/_lib/articulos.mjs. Sin jugadores que cumplan, ese artículo no se publica.
import { aVender, aFichar, clausulazos, paron, inicioJornada, esParon, subidasEntre, inicioParon } from "../../functions/_lib/articulos.mjs";

const OWN_KEY = "own:news:v2", K_ST = "art:st:v1", SITE = "https://edumr.es/api/laquiniela/";
const FORMATO = 2; // súbelo cuando cambie el formato de las filas para rehacer los artículos publicados
const escT = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function publicarArticulos(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 10 !== 7) return { skipped: "no toca" };
  const pm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date(now));
  const dia = (pm.find((x) => x.type === "weekday") || {}).value, hora = Number((pm.find((x) => x.type === "hour") || {}).value);
  const st = (await env.PORRA.get(K_ST, "json")) || { done: {} };
  // Cambio de diseño de los artículos (FORMATO): se vuelven a escribir una vez, a cualquier hora y sin aviso de Telegram.
  const rehacer = st.v !== FORMATO;
  if (rehacer) st.done = {};
  if (!rehacer && (dia === "Mon" || !(hora >= 10 && hora < 23))) return { skipped: "fuera de hora" };
  const get = (p) => f(SITE + p, { headers: { "user-agent": "edumr-cron" } }).then((r) => (r.ok ? r.json() : null));
  const jr = await get("jornada");
  const jn = jr && Number(jr.matchday);
  if (!jn || !Array.isArray(jr.matches)) return { error: "sin jornada" };
  const ini = inicioJornada(jr.matches, now);
  const tipos = ["artvender", "artfichar", "artclaus"].concat(esParon(ini, now) ? ["artparon"] : []).filter((t) => !st.done[t + jn]);
  if (!tipos.length) return { nuevas: 0 };
  const [mk, es] = await Promise.all([get("mercado"), get("estados")]);
  const ps = mk && Array.isArray(mk.players) ? mk.players : [];
  // Sin mercado completo o sin cambios a 7 días no se escribe nada (saldrían listas falsas)
  if (ps.length < 300 || ps.filter((p) => p.chg7 != null).length < 300) return { error: "sin mercado" };
  const cambios = (es && Array.isArray(es.cambios)) ? es.cambios : [];
  // Parón: los que más han subido desde que acabó la jornada anterior, con el valor real de cada día (historial propio vh:v1)
  let subidas = null;
  if (tipos.indexOf("artparon") >= 0 && ini != null) {
    try { const vh = await env.PORRA.get("vh:v1", "json"); const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(now)); subidas = subidasEntre(vh, ps, inicioParon(ini), hoy); } catch (e) {}
  }
  const hechos = { artvender: () => aVender(ps, jn, now), artfichar: () => aFichar(ps, cambios, jn, now), artclaus: () => clausulazos(ps, jn), artparon: () => paron(ps, jn, ini, now, subidas) };
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  const nuevas = [];
  for (const t of tipos) {
    st.done[t + jn] = now;
    const a = hechos[t]();
    if (!a) continue;
    own = own.filter((x) => x.art !== t); // una sola edición viva de cada tipo
    const it = { id: a.id, title: a.title, lead: a.lead, body: a.body, status: "published", createdAt: now, publishedAt: now, thumb: "", club: "", players: a.players, tipo: "articulo", auto: "articulo", art: t, f: 1, fp: (a.body.match(/^@ (\S+) \|/m) || [])[1] || "" };
    own.unshift(it); nuevas.push(it);
  }
  if (nuevas.length) { own.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)); await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300))); }
  const ks = Object.keys(st.done);
  if (ks.length > 200) for (const k of ks.sort((a, b) => st.done[a] - st.done[b]).slice(0, ks.length - 150)) delete st.done[k];
  st.v = FORMATO;
  await env.PORRA.put(K_ST, JSON.stringify(st));
  if (nuevas.length && !rehacer && env.TELEGRAM_BOT_TOKEN) {
    let chat = String(env.TELEGRAM_CHAT_ID || "");
    if (!chat) { try { chat = String(((await env.PORRA.get("tg:avisos:v1", "json")) || {}).chat || ""); } catch (e) {} }
    if (chat) {
      const text = "📰 <b>ARTÍCULOS NUEVOS</b>\n\n" + nuevas.map((it) => "<b>" + escT(it.title) + "</b>\nhttps://edumr.es/futmondo/guiafantasy/noticias/ed-" + it.id).join("\n\n");
      try { await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) }); } catch (e) {}
    }
  }
  return { nuevas: nuevas.length };
}
