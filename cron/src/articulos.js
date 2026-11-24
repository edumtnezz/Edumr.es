// Artículos propios por jornada: a vender, rachas, a fichar, riesgo de suplente, antes de la jornada, vuelven, clausulazos, parón y resumen.
// Una edición por jornada y tipo, repartidas por la semana (ver PLAN). La edición nueva sustituye a la anterior del mismo tipo.
// Las reglas y los datos están en functions/_lib/articulos.mjs. Sin jugadores que cumplan, ese artículo no se publica.
import { aVender, aFichar, clausulazos, paron, inicioJornada, esParon, subidasEntre, inicioParon, subidasBajadas, chollo, puntosPartido, vuelven, previa, riesgoSuplente, rachas, resumenJornada } from "../../functions/_lib/articulos.mjs";
import { emparejar } from "../../functions/_lib/estados.mjs";
import { oncesArticulo, cambiosOnce } from "../../functions/_lib/onces.mjs";

const OWN_KEY = "own:news:v2", K_ST = "art:st:v1", SITE = "https://edumr.es/api/laquiniela/";
const FORMATO = 5; // súbelo cuando cambie el formato de las filas para rehacer los artículos publicados
const escT = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Calendario de artículos (24/11/2026, Edu: «varios todos los días y que tengan sentido»). Cada tipo, una edición por jornada,
// desde X horas antes del primer partido y desde su hora del día (Madrid). Entre artículos 3 h o más, como mucho 3 al día de estos,
// de 09:00 a 22:59 y nunca el lunes (la jornada aún se juega), salvo «Antes de la jornada». Los de «antes» no salen si ya empezó.
// Semana normal (jornada de viernes a lunes):
//   Mar: Resumen de la jornada anterior (cuando están todos los puntos), A vender, Rachas
//   Mié: A fichar, Riesgo de suplente, Antes de la jornada (Puja, Quiniela y Porra)
//   Jue: Vuelven, Onces actualizados (12:00, publicarOnces), Clausulazos
//   Todos los días: Chollo del día y Subidas y bajadas (madrugada) · Vie–Lun: Puntos de cada partido · Lun 23:00: Onces recomendados
export const PLAN = [
  { t: "artvender", h: 96, hora: 12, antes: true },
  { t: "artrachas", h: 96, hora: 17 },
  { t: "artfichar", h: 72, hora: 10, antes: true },
  { t: "artsuplente", h: 72, hora: 13 },
  { t: "artprevia", h: 60, hora: 10, antes: true, lunes: true },
  { t: "artvuelven", h: 48, hora: 10, antes: true },
  { t: "artclaus", h: 48, hora: 16, antes: true },
  { t: "artparon", h: 999, hora: 19, antes: true, paron: true },
];
const SEMANALES = new Set(PLAN.map((x) => x.t).concat(["artresumen"]));
const AVISO = { artvender: "🔻 A VENDER", artfichar: "✅ A FICHAR", artclaus: "💰 CLAUSULAZOS", artparon: "⏸️ PARÓN", artvuelven: "🔙 VUELVEN", artprevia: "⏰ ANTES DE LA JORNADA", artsuplente: "🔄 RIESGO DE SUPLENTE", artrachas: "🔥 RACHAS", artresumen: "🏆 RESUMEN DE LA JORNADA" };
const diaDe = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(t));

// Qué toca ahora (función pura, probada en tests/articulos-plan.test.mjs). own = artículos publicados; hechos = st.done.
export function tocaAhora({ now, dia, hora, ini, jn, own, hechos, paron, resumenListo }) {
  if (hora < 9 || hora >= 23) return null;
  const sem = (own || []).filter((x) => x && x.tipo === "articulo" && SEMANALES.has(String(x.art || "")));
  const ult = sem.reduce((m, x) => Math.max(m, x.publishedAt || 0), 0);
  if (now - ult < 3 * 3600000) return null;
  if (sem.filter((x) => diaDe(x.publishedAt || 0) === diaDe(now)).length >= 3) return null;
  // Entre dos artículos, alguna noticia de un jugador (si no hay ninguna, se espera 5 h)
  const hayNoticia = (own || []).some((x) => x && x.auto === "estado" && (x.publishedAt || 0) > ult);
  if (ult && !hayNoticia && now - ult < 5 * 3600000) return null;
  if (resumenListo && !hechos["artresumen" + (jn - 1)] && dia !== "Mon") return "artresumen";
  for (const x of PLAN) {
    if (hechos[x.t + jn]) continue;
    if (dia === "Mon" && !x.lunes) continue;
    if (x.paron ? !paron : (ini == null || now < ini - x.h * 3600000)) continue;
    if (x.antes && ini != null && now >= ini) continue;
    if (hora < x.hora) continue;
    return x.t;
  }
  return null;
}

export async function publicarArticulos(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 10 !== 7) return { skipped: "no toca" };
  const pm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date(now));
  const dia = (pm.find((x) => x.type === "weekday") || {}).value, hora = Number((pm.find((x) => x.type === "hour") || {}).value) % 24;
  const st = (await env.PORRA.get(K_ST, "json")) || { done: {} };
  st.done = st.done || {};
  // Cambio de diseño de los artículos (FORMATO): se vuelven a escribir los ya publicados de esta jornada, sin aviso de Telegram.
  const rehacer = st.v !== FORMATO;
  const get = (p) => f(SITE + p, { headers: { "user-agent": "edumr-cron" } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const jr = await get("jornada");
  const jn = jr && Number(jr.matchday);
  if (!jn || !Array.isArray(jr.matches)) return { error: "sin jornada" };
  const ini = inicioJornada(jr.matches, now);
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  let tipos;
  let jRes = null;
  if (rehacer) {
    tipos = PLAN.map((x) => x.t).filter((t) => own.some((x) => x.id === t + jn));
  } else {
    // ¿Está completa la jornada anterior? Todos sus partidos (menos aplazados) con su artículo de puntos, o todos terminados hace 24 h.
    let listo = false;
    if (!st.done["artresumen" + (jn - 1)] && dia !== "Mon" && hora >= 9 && hora < 23) {
      jRes = await get("jornada?jornada=" + (jn - 1));
      const ms = (jRes && Array.isArray(jRes.matches) ? jRes.matches : []).filter((m) => !m.aplazado);
      const conPuntos = own.filter((x) => x && x.art === "artpuntos" && new RegExp("\\(J" + (jn - 1) + "\\)$").test(String(x.title || ""))).length;
      const fin = ms.length && ms.every((m) => m.live && m.live.state === "final");
      const ultimo = ms.reduce((m, x) => Math.max(m, inicioJornada([x], now) || 0), 0);
      listo = ms.length >= 5 && (conPuntos >= ms.length || (fin && now - ultimo >= 24 * 3600000));
      // 24/11/2026: el Athletic–Espanyol no tuvo artículo de puntos y el resumen esperaba 24 h. Si todos los partidos han terminado y
      // Futmondo ya ha publicado puntos de jugadores de todos los equipos de la jornada, está listo.
      if (!listo && fin) {
        const [pj0, mk0] = await Promise.all([get("puntos-jornada?jornada=" + (jn - 1)), get("mercado")]);
        const eqDe = new Map(((mk0 && mk0.players) || []).map((p) => [String(p.id), p.team]));
        const eqs = new Set(Object.entries((pj0 && pj0.pts) || {}).filter(([, v]) => Number(v) !== 0).map(([id]) => eqDe.get(id)).filter(Boolean));
        listo = eqs.size >= ms.length * 2;
      }
    }
    const t = tocaAhora({ now, dia, hora, ini, jn, own, hechos: st.done, paron: esParon(ini, now), resumenListo: listo });
    if (!t) return { esperando: true };
    tipos = [t];
  }
  const [mk, es] = await Promise.all([get("mercado"), get("estados")]);
  const ps = mk && Array.isArray(mk.players) ? mk.players : [];
  // Sin mercado completo o sin cambios a 7 días no se escribe nada (saldrían listas falsas)
  if (ps.length < 300 || ps.filter((p) => p.chg7 != null).length < 300) return { error: "sin mercado" };
  const cambios = (es && Array.isArray(es.cambios)) ? es.cambios : [];
  const hechos = {
    artvender: async () => aVender(ps, jn, now),
    artfichar: async () => aFichar(ps, cambios, jn, now),
    artclaus: async () => clausulazos(ps, jn),
    artparon: async () => {
      let subidas = null;
      if (ini != null) { try { const vh = await env.PORRA.get("vh:v1", "json"); subidas = subidasEntre(vh, ps, inicioParon(ini), diaDe(now)); } catch (e) {} }
      return paron(ps, jn, ini, now, subidas);
    },
    artvuelven: async () => vuelven(ps, cambios, jn, ini, now),
    artprevia: async () => { const [po, pu, di] = await Promise.all([get("porra"), get("puja"), get("dificultad")]); return previa(ps, jr, jn, po, pu, di); },
    artsuplente: async () => {
      const su = await get("sustituciones");
      if (!su || !Array.isArray(su.jugadores)) return undefined;
      const casar = (nombre, club) => emparejar([{ id: "x", name: nombre, teamID: 1, position: 0 }], { 1: { name: club } }, ps, { estricto: true }).get("x") || null;
      return riesgoSuplente(ps, su.jugadores, jn, casar);
    },
    artrachas: async () => { const li = await get("lideres"); return li && Array.isArray(li.rachas) ? rachas(ps, li.rachas, jn) : undefined; },
    artresumen: async () => { const pj = await get("puntos-jornada?jornada=" + (jn - 1)); return pj && pj.pts ? resumenJornada(ps, pj.pts, jn - 1) : undefined; },
  };
  const nuevas = [];
  for (const t of tipos) {
    const clave = t === "artresumen" ? t + (jn - 1) : t + jn;
    let a;
    try { a = await hechos[t](); } catch (e) { a = undefined; }
    // undefined = la fuente no respondió: se reintenta en las siguientes pasadas (hasta 6). null = con datos, pero nadie cumple: se da por hecho.
    if (a === undefined) { st.fallos = st.fallos || {}; st.fallos[clave] = (st.fallos[clave] || 0) + 1; if (st.fallos[clave] < 6) continue; }
    st.done[clave] = now;
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
  // Un aviso de Telegram por artículo, con su portada como vista previa (como los onces y el chollo)
  if (nuevas.length && !rehacer) for (const it of nuevas) await avisarArticulo(env, f, it, now);
  return { nuevas: nuevas.map((x) => x.id) };
}

async function avisarArticulo(env, f, it, now) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  let chat = String(env.TELEGRAM_CHAT_ID || "");
  if (!chat) { try { chat = String(((await env.PORRA.get("tg:avisos:v1", "json")) || {}).chat || ""); } catch (e) {} }
  if (!chat) return;
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(new Date(now))) % 24;
  const text = "<b>" + (AVISO[it.art] || "📰 ARTÍCULO NUEVO") + "</b>\n\n" + escT(it.title) + "\nhttps://edumr.es/futmondo/guiafantasy/noticias/ed-" + it.id;
  try { await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_notification: hora < 8, link_preview_options: { is_disabled: false, prefer_large_media: true, show_above_text: true } }) }); } catch (e) {}
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
const FMT_ONCE = 4; // 4 = con puntos estimados (24/11/2026); 1 = 1-4-3-3 fijo; 2 = mejor de 7 formaciones; 3 = mejor entre 3-4-3, 3-5-2 y 4-4-2 (17/11/2026). Al subirlo se rehace la edición de la jornada sin avisar.
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
  // Segunda edición de la semana (24/11/2026, pedido de Edu: «un par de veces por semana»): el jueves desde las 12:00 se rehacen los tres
  // onces con los datos de ese día (estado, % de jugar, media) y se avisa. Una vez por jornada (st.ed2).
  const ed2 = !nueva && dia === "Thu" && hora >= 12 && st.ed2 !== jn && st.fmt === FMT_ONCE;
  const rehacer = !nueva && st.fmt !== FMT_ONCE;
  // Primera edición de la jornada: lunes desde las 23:00, o de martes a viernes
  if (nueva && !((dia === "Mon" && hora >= 23) || ["Tue", "Wed", "Thu", "Fri"].indexOf(dia) >= 0)) return { skipped: "fuera de hora" };
  if (nueva || ed2) { // primera y segunda edición: no pegadas a otro artículo (menos de 2 h)
    const own0 = (await env.PORRA.get(OWN_KEY, "json")) || [];
    const ult = own0.filter((x) => x && x.tipo === "articulo" && x.art !== "artmercado" && x.art !== "artchollo" && x.art !== "artpuntos" && x.art !== "artonce").reduce((m, x) => Math.max(m, x.publishedAt || 0), 0);
    if (now - ult < 2 * 3600000) return { skipped: "hace poco otro artículo" };
  }
  const mk = await get("mercado");
  const ps = mk && Array.isArray(mk.players) ? mk.players : [];
  if (ps.length < 300 || ps.filter((p) => p.prob != null).length < 300) return { error: "sin mercado" };
  let cambios = {};
  if (!nueva) {
    const porId = new Map(ps.map((p) => [String(p.id), p]));
    const caidos = Object.values(st.ids || {}).flat().filter((id) => { const p = porId.get(id); return p && (p.est === "lesionado" || p.est === "sancionado"); });
    if (!caidos.length && !rehacer && !ed2) return { sin_cambios: true };
  }
  const a = oncesArticulo(ps, jn);
  if (!a) return { error: "no se pudo completar" };
  if (!nueva) {
    cambios = rehacer ? {} : cambiosOnce(st.ids, a.ids, ps);
    // Se guardan también los cambios de antes para que la edición corregida los siga diciendo (la segunda edición de la semana empieza limpia)
    if (!ed2) for (const k of Object.keys(st.cambios || {})) cambios[k] = (st.cambios[k] || []).concat(cambios[k] || []);
    else cambios = {};
  }
  const fin = oncesArticulo(ps, jn, cambios);
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  own = own.filter((x) => x.art !== "artonce");
  own.unshift({ id: fin.id, title: fin.title, lead: fin.lead, body: fin.body, status: "published", createdAt: nueva ? now : (st.at || now), publishedAt: nueva || ed2 ? now : (st.at || now), updatedAt: now, thumb: "", club: "", players: [], tipo: "articulo", auto: "articulo", art: "artonce", f: 1, fp: "" });
  own.sort((x, y) => (y.publishedAt || 0) - (x.publishedAt || 0));
  await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
  await env.PORRA.put(K_ONCE, JSON.stringify({ jn, ids: fin.ids, cambios, fmt: FMT_ONCE, at: nueva ? now : (st.at || now), ed2: ed2 ? jn : (nueva ? 0 : (st.ed2 || 0)) }));
  if ((nueva || ed2) && env.TELEGRAM_BOT_TOKEN) {
    let chat = String(env.TELEGRAM_CHAT_ID || "");
    if (!chat) { try { chat = String(((await env.PORRA.get("tg:avisos:v1", "json")) || {}).chat || ""); } catch (e) {} }
    if (chat) { try { await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "🏆 <b>ONCES RECOMENDADOS" + (ed2 ? " · ACTUALIZADOS" : "") + "</b>\n\n" + escT(fin.title) + "\nhttps://edumr.es/futmondo/guiafantasy/noticias/ed-" + fin.id, parse_mode: "HTML", link_preview_options: { is_disabled: false, prefer_large_media: true, show_above_text: true } }) }); } catch (e) {} } // la vista previa es la portada del artículo (art-once.jpg)
  }
  return { publicado: fin.id, nueva, ed2, cambios };
}

// Artículo «Chollo del día»: lo llama el diario cuando elige el chollo de hoy (mismo jugador y mismas reglas). Id fijo: sustituye al anterior.
export async function publicarChollo(env, ps, pid, now = Date.now(), dif) {
  if (!env || !env.PORRA) return "";
  const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" }).format(new Date(now));
  const a = chollo(ps, pid, fecha, dif);
  if (!a) return "";
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  own = own.filter((x) => x.art !== "artchollo" && x.id !== a.id);
  own.unshift({ id: a.id, title: a.title, lead: a.lead, body: a.body, status: "published", createdAt: now, publishedAt: now, thumb: "", club: "", players: a.players, tipo: "articulo", auto: "articulo", art: "artchollo", f: 1, cf: 2, fp: (a.body.match(/^@ (\S+) \|/m) || [])[1] || "" });
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
  return !(x && x.cf === 2 && String(x.fp) === String(pid) && dia(x.publishedAt || 0) === dia(now)); // cf = formato del cuerpo (2: recuadros de colores)
}


// Artículo «Puntos del X – Y»: se escribe en cuanto el servidor guarda los puntos de un partido (los publica Futmondo).
// Devuelve los mismos partidos con `art` (id del artículo) y `top` (los tres mejores) para el aviso de Telegram. Si algo falla, el aviso sale sin enlace.
export async function publicarPuntos(env, items, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA || !Array.isArray(items) || !items.length) return items || [];
  const get = (p) => f(SITE + p + (p.indexOf("?") < 0 ? "?" : "&") + "t=" + now, { headers: { "user-agent": "edumr-cron" } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "").replace(/^barca$/, "barcelona"); // «Barça» del calendario = «Barcelona» de Futmondo (22/11/2026)
  const mismo = (a, b) => { a = fold(a); b = fold(b); return !!a && !!b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0); };
  const mk = await get("mercado");
  const ps = mk && Array.isArray(mk.players) ? mk.players : [];
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  let cambio = false;
  const out = [];
  for (const it of items) {
    try {
      const [pj, jr] = await Promise.all([get("puntos-jornada?jornada=" + Number(it.j)), get("jornada?jornada=" + Number(it.j))]);
      if (ps.length < 300 || !pj || !pj.pts) { out.push(it); continue; }
      const m = jr && Array.isArray(jr.matches) ? jr.matches.find((x) => mismo(x.home, it.home) && mismo(x.away, it.away)) : null;
      const a = puntosPartido(ps, pj.pts, it, m && m.live && m.live.state === "final" && m.live.score ? m.live.score : "");
      if (!a) { out.push(it); continue; }
      const prev = own.find((x) => x.id === a.id); // si ya existía (rehacer en otro formato), conserva su hora de publicación
      own = own.filter((x) => x.id !== a.id);
      own.unshift({ id: a.id, title: a.title, lead: a.lead, body: a.body, status: "published", createdAt: prev ? prev.createdAt || now : now, publishedAt: prev ? prev.publishedAt || now : now, thumb: "", club: "", players: a.players, tipo: "articulo", auto: "articulo", art: "artpuntos", f: 2, mr: 1, fp: (a.body.match(/^@ (\S+) \|/m) || [])[1] || "" });
      cambio = true;
      out.push(Object.assign({}, it, { art: a.id, top: a.top, eq: a.equipos, marcador: a.marcador }));
    } catch (e) { out.push(it); }
  }
  if (cambio) { own.sort((x, y) => (y.publishedAt || 0) - (x.publishedAt || 0)); await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300))); }
  return out;
}


// Rehace, de uno en uno y sin aviso de Telegram, los artículos de puntos escritos con un formato anterior (f distinto de 2: solo 5 mejores por equipo).
export async function rehacerPuntos(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return 0;
  const own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  // mr = ya se intentó poner el marcador: sin él, los artículos sin marcador (el calendario no emparejaba «Barça») se rehacen una vez más
  const x = own.find((y) => y && y.art === "artpuntos" && (y.f !== 2 || (!y.mr && !/^= MARCADOR/m.test(String(y.body || "")))));
  if (!x) return 0;
  const m = String(x.title || "").match(/^Puntos del (.+) – (.+) \(J(\d+)\)$/);
  if (!m) return 0;
  const r = await publicarPuntos(env, [{ j: Number(m[3]), home: m[1], away: m[2] }], f, now);
  return r && r[0] && r[0].art ? 1 : 0;
}
