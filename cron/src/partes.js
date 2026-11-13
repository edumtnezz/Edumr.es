// Noticias nuevas (12/11/2026): una noticia corta cada vez que cambia el estado de un jugador (baja, duda, sanción, alta).
// Los hechos salen del registro de estados (Biwenger), de Futmondo (puntos, minutos, valor) y del calendario.
// La IA solo redacta el resumen con esos hechos; si mete un número o un nombre que no está en ellos, se usa la plantilla fija.
import { hechosNoticia, noticiaPlantilla, cuerpoNoticia, resumenValido, recambio, norm, clubKey } from "../../functions/_lib/estados.mjs";

const OWN_KEY = "own:news:v2", K_ST = "partes:st:v1", K_FOTO = "est:foto:v1", K_EV = "est:eventos:v1";
const MODEL = "gemini-3.5-flash-lite";
const SITE = "https://edumr.es/api/laquiniela/";
const MALO = new Set(["duda", "lesionado", "sancionado"]);

export { clubKey };
export function proximo(jor, team) {
  const k = clubKey(team);
  for (const m of (jor && jor.matches) || []) {
    if (m.live && m.live.state === "final") continue;
    if (clubKey(m.home) === k) return { jornada: jor.matchday, rival: m.away, casa: true };
    if (clubKey(m.away) === k) return { jornada: jor.matchday, rival: m.home, casa: false };
  }
  return jor && jor.matchday ? { jornada: jor.matchday, rival: "", casa: null } : null;
}

export function candidatos(foto, eventos, now) {
  const out = new Map();
  // Estados que ya estaban al empezar: valen los de los últimos 5 días (con la hora real en que cambió)
  for (const id of Object.keys((foto && foto.bw) || {})) {
    const s = foto.bw[id];
    if (MALO.has(s.e) && s.at && now - s.at < 5 * 86400000) out.set(id, { id, de: "ok", a: s.e, info: s.info, at: s.at });
  }
  for (const e of eventos || []) {
    if (e.src !== "bw" || now - e.at > 2 * 86400000) continue;
    if (MALO.has(e.a)) out.set(e.id, { id: e.id, de: e.de, a: e.a, info: e.info, at: e.fuenteAt && e.fuenteAt <= e.at ? e.fuenteAt : e.at });
    else if (e.a === "ok" && MALO.has(e.de)) out.set(e.id, { id: e.id, de: e.de, a: "ok", info: "", at: e.at });
    else if (MALO.has(e.de)) out.delete(e.id);
  }
  return [...out.values()].sort((a, b) => b.at - a.at);
}

// «f3»: versión del formato. Al cambiarla se vuelven a escribir las noticias vivas con el formato nuevo.
const clave = (c) => "f5:" + c.id + ":" + c.a + ":" + norm(c.info).slice(0, 80);
export const idNoticia = (c) => ("e" + String(c.id).slice(-10) + c.a.charAt(0)).toLowerCase().replace(/[^a-z0-9]/g, "");

async function resumenIA(env, f, h, n) {
  if (!env.GEMINI_API_KEY) return null;
  const prompt = "Eres redactor de una web de fútbol fantasy. Escribe en español de España UN párrafo corto (máximo 45 palabras), claro y sin adornos, sobre esta novedad.\n" +
    "REGLAS: usa SOLO los hechos de abajo. No añadas nombres, cifras, plazos, causas, declaraciones ni opiniones que no estén. No menciones al entrenador. No des consejos ni estadísticas.\n" +
    "HECHOS:\n" + n.p1 + "\n" +
    'Devuelve JSON: {"p1":"..."}';
  try {
    const r = await f("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const t = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const o = JSON.parse(t.map((x) => x.text || "").join(""));
    const p1 = String(o.p1 || "").trim();
    if (!p1 || !resumenValido(p1, h)) return null;
    return p1;
  } catch (e) { return null; }
}

const escT = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function publicarPartes(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  if (new Date(now).getUTCMinutes() % 3 !== 1) return { skipped: "no toca" };
  const [foto, eventos, st0] = await Promise.all([env.PORRA.get(K_FOTO, "json"), env.PORRA.get(K_EV, "json"), env.PORRA.get(K_ST, "json")]);
  if (!foto) return { skipped: "sin foto" };
  const st = st0 || { done: {} };
  const pend = candidatos(foto, eventos, now).filter((c) => !st.done[clave(c)]);
  if (!pend.length) return { nuevas: 0 };
  const get = (p) => f(SITE + p, { headers: { "user-agent": "edumr-cron" } }).then((r) => r.json());
  const [mk, mn, jor] = await Promise.all([get("mercado"), get("minutos"), get("jornada")]);
  const all = Array.isArray(mk.players) ? mk.players : [];
  if (all.length < 300) return { error: "sin mercado" };
  const porId = new Map(all.map((p) => [p.id, p]));
  const minMap = (mn && mn.map) || {};
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  const nOwn = own.length;
  // Las de un formato anterior se retiran: si el estado sigue vivo, se vuelven a escribir en esta misma tanda o en la siguiente
  own = own.filter((x) => x.auto !== "estado" || x.f === 5);
  const nuevas = [];
  for (const c of pend.slice(0, 4)) {
    st.done[clave(c)] = now;
    const p = porId.get(c.id);
    // Solo jugadores que cuentan en el fantasy: han jugado o valen 1 M o más
    if (!p || !((p.matches || 0) > 0 || (p.value || 0) >= 1000000)) continue;
    const h = hechosNoticia({ p, de: c.de, a: c.a, info: c.info, mp: minMap[c.id], rec: c.a === "ok" ? null : recambio(p, all, minMap, foto.bw), prox: proximo(jor, p.team) });
    const n = noticiaPlantilla(h);
    // El texto es una sola frase de hechos: la IA no añade nada y podría repetir el motivo, así que no se usa (resumenIA queda disponible)
    const ia = null;
    const item = {
      id: idNoticia(c), pid: p.id, title: n.title, lead: n.lead, body: cuerpoNoticia(n), status: "published",
      createdAt: now, publishedAt: Math.min(now, c.at || now), thumb: "", club: p.team, players: [p.name], tipo: n.tipo, veredicto: n.veredicto, plazo: n.plazo, ia: !!ia, auto: "estado", f: 5, img: foto.bw[c.id] && foto.bw[c.id].b ? "https://cdn.biwenger.com/i/p/" + foto.bw[c.id].b + ".png" : "",
    };
    // Cartel en imagen (para Telegram, WhatsApp y la vista previa del enlace). Si falla, la noticia sale igual, sin imagen.
    try {
      // Se carga solo aquí (lleva la librería de dibujo): las pruebas y el resto del cron no la necesitan
      const { cartelPng, colorClub } = await import("./cartel.js");
      const b = foto.bw[c.id] && foto.bw[c.id].b;
      const png = await cartelPng({ nombre: p.name, club: p.team, veredicto: n.veredicto, plazo: n.plazo, color: colorClub(p.team), foto: b ? "https://cdn.biwenger.com/i/p/" + b + ".png" : "", escudo: p.logo ? String(p.logo).replace(/\/teams\/64\//, "/teams/256/") : "" }, f);
      if (png && png.byteLength > 2000) { await env.PORRA.put("cartel:" + item.id, png, { expirationTtl: 60 * 86400 }); item.cartel = now; }
    } catch (e) { console.error("cartel", String(e && e.message || e).slice(0, 160)); }
    // Una sola noticia viva por jugador: la nueva sustituye a la anterior
    own = own.filter((x) => x.pid !== p.id);
    own.unshift(item);
    nuevas.push(item);
  }
  own.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  const keys = Object.keys(st.done);
  if (keys.length > 1500) for (const k of keys.sort((a, b) => st.done[a] - st.done[b]).slice(0, keys.length - 1200)) delete st.done[k];
  if (nuevas.length || own.length !== nOwn) await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
  await env.PORRA.put(K_ST, JSON.stringify(st));
  // Aviso de Telegram solo de lo reciente (menos de 2 h): al arrancar no se manda una tanda de avisos viejos
  if (env.TELEGRAM_BOT_TOKEN) {
    let chat = String(env.TELEGRAM_CHAT_ID || "");
    if (!chat) { try { chat = String(((await env.PORRA.get("tg:avisos:v1", "json")) || {}).chat || ""); } catch (e) {} }
    for (const it of nuevas) {
      if (!chat || now - it.publishedAt > 2 * 3600000) continue;
      const text = "<b>" + escT(it.title) + "</b>\n" + escT(it.lead) + "\n\nhttps://edumr.es/futmondo/guiafantasy/noticias/ed-" + it.id;
      const api = "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/";
      const post = (m, body) => f(api + m, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      try {
        // Con cartel: foto + texto. Si Telegram no acepta la foto, se manda solo el texto.
        let ok = false;
        if (it.cartel) { const r = await post("sendPhoto", { chat_id: chat, photo: "https://edumr.es/api/laquiniela/cartel?id=" + it.id + "&v=" + it.cartel, caption: text, parse_mode: "HTML" }); ok = !!(r && r.ok); }
        if (!ok) await post("sendMessage", { chat_id: chat, text, parse_mode: "HTML" });
      } catch (e) {}
    }
  }
  return { nuevas: nuevas.length, pendientes: Math.max(0, pend.length - 4) };
}
