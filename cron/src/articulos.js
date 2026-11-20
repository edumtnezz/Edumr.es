// Artículos propios (a vender, a fichar, clausulazos y, solo en parones, el repaso de plantilla).
// Una edición por jornada y tipo, de martes a domingo a partir de las 10:00 (hora de Madrid). La edición nueva sustituye a la anterior del mismo tipo.
// Las reglas y los datos están en functions/_lib/articulos.mjs. Sin jugadores que cumplan, ese artículo no se publica.
import { aVender, aFichar, clausulazos, paron, inicioJornada, esParon, subidasEntre, inicioParon, subidasBajadas, chollo } from "../../functions/_lib/articulos.mjs";
import { oncesArticulo, cambiosOnce } from "../../functions/_lib/onces.mjs";

const OWN_KEY = "own:news:v2", K_ST = "art:st:v1", SITE = "https://edumr.es/api/laquiniela/";
const FORMATO = 5; // súbelo cuando cambie el formato de las filas para rehacer los artículos publicados
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
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  // El del parón se escribe si hay parón; al rehacer por cambio de formato, también si ya estaba publicado para esta jornada.
  const hayParon = esParon(ini, now) || (rehacer && own.some((x) => x.id === "artparon" + jn));
  let tipos = ["artvender", "artfichar", "artclaus"].concat(hayParon ? ["artparon"] : []).filter((t) => !st.done[t + jn]);
  if (!tipos.length) return { nuevas: 0 };
  // Reparto por horas (Edu, 17/11/2026): un artículo por pasada, cada uno desde su hora, con 3 horas o más entre artículos y sin juntar dos
  // seguidos si no ha salido antes alguna noticia de un jugador (las noticias de estado son lo dinámico; si no hay ninguna, se espera 6 h).
  if (!rehacer) {
    const SLOT = { artvender: 10, artfichar: 13, artclaus: 16, artparon: 19 };
    const arts = own.filter((x) => x && x.tipo === "articulo" && x.art !== "artmercado" && x.art !== "artchollo");
    const ult = arts.reduce((m, x) => Math.max(m, x.publishedAt || 0), 0);
    const h = (now - ult) / 3600000;
    const hayNoticia = own.some((x) => x && x.auto === "estado" && (x.publishedAt || 0) > ult);
    const toca = tipos.filter((t) => hora >= SLOT[t]);
    if (!toca.length || h < 3 || (!hayNoticia && h < 6)) return { esperando: true };
    tipos = [toca[0]];
  }
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
  const nuevas = [];
  for (const t of tipos) {
    st.done[t + jn] = now;
    const a = hechos[t]();
    if (!a) continue;
    const prev = own.find((x) => x.art === t);
    own = own.filter((x) => x.art !== t); // una sola edición viva de cada tipo
    const pa = rehacer && prev && prev.publishedAt ? prev.publishedAt : now; // al rehacer por formato se conserva su hora original
    const it = { id: a.id, title: a.title, lead: a.lead, body: a.body, status: "published", createdAt: pa, publishedAt: pa, thumb: "", club: "", players: a.players, tipo: "articulo", auto: "articulo", art: t, f: 1, fp: (a.body.match(/^@ (\S+) \|/m) || [])[1] || "" };
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

// Artículo «Subidas y bajadas»: se escribe cuando Futmondo actualiza los valores (lo llama el aviso de mercado de avisos.js).
// Id fijo: la edición nueva sustituye a la anterior. Devuelve el id publicado o "" si no hay datos.
export async function publicarMercado(env, ps, now = Date.now()) {
  if (!env || !env.PORRA) return "";
  const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" }).format(new Date(now));
  const a = subidasBajadas(ps, fecha);
  if (!a) return "";
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  own = own.filter((x) => x.art !== "artmercado" && x.id !== a.id);
  own.unshift({ id: a.id, title: a.title, lead: a.lead, body: a.body, status: "published", createdAt: now, publishedAt: now, thumb: "", club: "", players: a.players, tipo: "articulo", auto: "articulo", art: "artmercado", f: 1, fp: (a.body.match(/^@ (\S+) \|/m) || [])[1] || "" });
  own.sort((x, y) => (y.publishedAt || 0) - (x.publishedAt || 0));
  await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
  // Aviso de Telegram (20/11/2026): uno por jugador y día; de madrugada, en silencio. La vista previa es la portada del artículo (art-chollo.jpg).
  try {
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(now)), clave = dia + "|" + pid;
    const ya = await env.PORRA.get("art:chollo:tg:v1", "json");
    if (env.TELEGRAM_BOT_TOKEN && !(ya && ya.k === clave)) {
      let chat = String(env.TELEGRAM_CHAT_ID || "");
      if (!chat) { try { chat = String(((await env.PORRA.get("tg:avisos:v1", "json")) || {}).chat || ""); } catch (e) {} }
      const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(new Date(now)));
      if (chat) {
        const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "🏷️ <b>CHOLLO DEL DÍA</b>\n\n" + escT(a.title) + "\nhttps://edumr.es/futmondo/guiafantasy/noticias/ed-" + a.id, parse_mode: "HTML", disable_notification: hora < 8, link_preview_options: { is_disabled: false, prefer_large_media: true, show_above_text: true } }) });
        if (r && r.ok) await env.PORRA.put("art:chollo:tg:v1", JSON.stringify({ k: clave, at: now }));
      }
    }
  } catch (e) {}
  return a.id;
}

// Onces recomendados (caro, equilibrado y low cost): primera edición el lunes desde las 23:00 (cuando acaba la jornada) o, si no
// pudo ser, en cuanto se pueda de martes a viernes. Después, en cada pasada, si alguno de los elegidos pasa a lesionado o
// sancionado, se rehace y se dice quién sale y quién entra. Reglas en functions/_lib/onces.mjs.
const K_ONCE = "art:once:v1";
const FMT_ONCE = 3; // 1 = 1-4-3-3 fijo; 2 = mejor de 7 formaciones; 3 = mejor entre 3-4-3, 3-5-2 y 4-4-2 (17/11/2026). Al subirlo se rehace la edición de la jornada sin avisar.
export async function publicarOnces(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 10 !== 7) return { skipped: "no toca" };
  const pm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date(now));
  const dia = (pm.find((x) => x.type === "weekday") || {}).value, hora = Number((pm.find((x) => x.type === "hour") || {}).value);
  const get = (p) => f(SITE + p, { headers: { "user-agent": "edumr-cron" } }).then((r) => (r.ok ? r.json() : null));
  const st = (await env.PORRA.get(K_ONCE, "json")) || {};
  const jr = await get("jornada");
  const jn = jr && Number(jr.matchday);
  if (!jn) return { error: "sin jornada" };
  const nueva = st.jn !== jn;
  const rehacer = !nueva && st.fmt !== FMT_ONCE;
  // Primera edición de la jornada: lunes desde las 23:00, o de martes a viernes
  if (nueva && !((dia === "Mon" && hora >= 23) || ["Tue", "Wed", "Thu", "Fri"].indexOf(dia) >= 0)) return { skipped: "fuera de hora" };
  if (nueva) { // primera edición: no pegada a otro artículo (menos de 2 h)
    const own0 = (await env.PORRA.get(OWN_KEY, "json")) || [];
    const ult = own0.filter((x) => x && x.tipo === "articulo" && x.art !== "artmercado" && x.art !== "artchollo" && x.art !== "artonce").reduce((m, x) => Math.max(m, x.publishedAt || 0), 0);
    if (now - ult < 2 * 3600000) return { skipped: "hace poco otro artículo" };
  }
  const mk = await get("mercado");
  const ps = mk && Array.isArray(mk.players) ? mk.players : [];
  if (ps.length < 300 || ps.filter((p) => p.prob != null).length < 300) return { error: "sin mercado" };
  let cambios = {};
  if (!nueva) {
    const porId = new Map(ps.map((p) => [String(p.id), p]));
    const caidos = Object.values(st.ids || {}).flat().filter((id) => { const p = porId.get(id); return p && (p.est === "lesionado" || p.est === "sancionado"); });
    if (!caidos.length && !rehacer) return { sin_cambios: true };
  }
  const a = oncesArticulo(ps, jn);
  if (!a) return { error: "no se pudo completar" };
  if (!nueva) {
    cambios = rehacer ? {} : cambiosOnce(st.ids, a.ids, ps);
    // Se guardan también los cambios de antes para que la edición corregida los siga diciendo
    for (const k of Object.keys(st.cambios || {})) cambios[k] = (st.cambios[k] || []).concat(cambios[k] || []);
  }
  const fin = oncesArticulo(ps, jn, cambios);
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  own = own.filter((x) => x.art !== "artonce");
  own.unshift({ id: fin.id, title: fin.title, lead: fin.lead, body: fin.body, status: "published", createdAt: nueva ? now : (st.at || now), publishedAt: nueva ? now : (st.at || now), updatedAt: now, thumb: "", club: "", players: [], tipo: "articulo", auto: "articulo", art: "artonce", f: 1, fp: "" });
  own.sort((x, y) => (y.publishedAt || 0) - (x.publishedAt || 0));
  await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
  await env.PORRA.put(K_ONCE, JSON.stringify({ jn, ids: fin.ids, cambios, fmt: FMT_ONCE, at: nueva ? now : (st.at || now) }));
  if (nueva && env.TELEGRAM_BOT_TOKEN) {
    let chat = String(env.TELEGRAM_CHAT_ID || "");
    if (!chat) { try { chat = String(((await env.PORRA.get("tg:avisos:v1", "json")) || {}).chat || ""); } catch (e) {} }
    if (chat) { try { await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "🏆 <b>ONCES RECOMENDADOS</b>\n\n" + escT(fin.title) + "\nhttps://edumr.es/futmondo/guiafantasy/noticias/ed-" + fin.id, parse_mode: "HTML", link_preview_options: { is_disabled: false, prefer_large_media: true, show_above_text: true } }) }); } catch (e) {} } // la vista previa es la portada del artículo (art-once.jpg)
  }
  return { publicado: fin.id, nueva, cambios };
}

// Artículo «Chollo del día»: lo llama el diario cuando elige el chollo de hoy (mismo jugador y mismas reglas). Id fijo: sustituye al anterior.
export async function publicarChollo(env, ps, pid, now = Date.now(), dif) {
  if (!env || !env.PORRA) return "";
  const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" }).format(new Date(now));
  const a = chollo(ps, pid, fecha, dif);
  if (!a) return "";
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  own = own.filter((x) => x.art !== "artchollo" && x.id !== a.id);
  own.unshift({ id: a.id, title: a.title, lead: a.lead, body: a.body, status: "published", createdAt: now, publishedAt: now, thumb: "", club: "", players: a.players, tipo: "articulo", auto: "articulo", art: "artchollo", f: 1, fp: (a.body.match(/^@ (\S+) \|/m) || [])[1] || "" });
  own.sort((x, y) => (y.publishedAt || 0) - (x.publishedAt || 0));
  await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
  return a.id;
}

// ¿Falta el artículo del chollo de hoy? (el chollo ya elegido antes de existir el artículo, o corregido a otro jugador)
export async function cholloSinArticulo(env, pid, now = Date.now()) {
  if (!env || !env.PORRA || pid == null) return false;
  const dia = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(t));
  const own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  const x = own.find((y) => y && y.art === "artchollo");
  return !(x && String(x.fp) === String(pid) && dia(x.publishedAt || 0) === dia(now));
}
