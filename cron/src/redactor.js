// Redactor automático en MODO SOMBRA.
// Detecta ruedas de prensa nuevas en el YouTube oficial de cada club, las transcribe con Gemini
// (la API oficial acepta la URL de YouTube; no descargamos nada), saca el estado de cada jugador
// con una frase literal y la VERIFICA contra la transcripción. Guarda el resultado en KV y manda un
// resumen privado a Edu por Telegram. NO publica nada en la web.
//
// Reglas: nunca inventar. Sin frase verificada = sin dato. Sin clave de Gemini = no hace nada.
import { _t } from "./avisos.js";

const { norm, sameTeam } = _t;
const SITE = "https://edumr.es/api/laquiniela/";
const STATE_KEY = "rd:sombra:v1";
const AVISOS_KEY = "tg:avisos:v1";
const RES_PREFIX = "rd:res:v1:";
const MODEL = "gemini-3.5-flash-lite";
const MAX_TOKENS_DIA = 450000;   // tope propio (el gratuito da 250.000 tokens/min); al llegar se para
const MAX_INTENTOS = 6;          // un directo aún no es grabación: se reintenta
const ESPERA_REINTENTO = 20 * 60e3;
const EDAD_MAX = 36 * 3600e3;    // solo vídeos de las últimas 36 h
const ESTADOS = ["disponible", "opcion_titular", "duda", "recuperacion_con_grupo", "recuperacion_parcial", "baja", "titular_confirmado", "rotacion"];

// Solo canales COMPROBADOS (el feed responde y es del club). Añadir un club = una línea.
export const FUENTES = [
  { club: "Deportivo de la Coruña", yt: "UCY2s1XaPzO60Hu6M_YZCTgA" },
  { club: "Sevilla", yt: "UCLy9lmj_0cqffXUzbGHNmYA" },
  // 07/11/2026: comprobados en su pestaña de vídeos (publican ruedas de prensa del primer equipo)
  { club: "Betis", yt: "UCeB7JZwcar2fVoK2w2f9OwA" },
  { club: "Valencia", yt: "UCgvyo5x49J8ht5H9imKfxMQ" },
  { club: "Villarreal", yt: "UC0MLWyQ0L7uEZY8wbkDSTkw" },
  { club: "Levante", yt: "UCvOegN2N1FGPPv4xBNN2F9A" },
  { club: "Oviedo", yt: "UCvpFN8tLnBsjPR2BCJ-FJQA" },
  { club: "Atlético", yt: "UCuzKFwdh7z2GHcIOX_tXgxA" }, // publica las ruedas de prensa de Simeone (directos)
];

// ---------- funciones puras (con pruebas) ----------
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = (e.match(/<yt:videoId>([^<]+)</) || [])[1];
    const title = (e.match(/<title>([^<]*)</) || [])[1];
    const pub = (e.match(/<published>([^<]+)</) || [])[1];
    if (id && title && pub) out.push({ id, title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), published: Date.parse(pub) });
  }
  return out;
}

// Rueda de prensa del primer equipo masculino (no femenino, cantera ni filiales).
export function esConferencia(title) {
  const t = norm(title);
  // Rueda de prensa, o (Sevilla) el vídeo "Las reacciones de los protagonistas tras el partido", donde habla el entrenador tras el partido
  // y los vídeos de reacciones/declaraciones tras el partido (Betis, Valencia, Sevilla)
  if (!/\brueda de prensa\b|\breacciones de\b|\bdeclaraciones de\b.*\b(tras|previa|post\w*)\b/.test(t)) return false;
  if (/\bprimeras declaraciones\b/.test(t)) return false;
  // Fuera: femenino (Dépor ABANCA, CFF), filiales y cantera (Fabril, Villarreal B, RFEF), premios y homenajes
  if (/\b(femenin\w*|xogadora\w*|jugadora\w*|abanca|cff|cantera|juvenil\w*|cadete|infantil|filial|fabril|academia|rfef|sub \d+|b|elegid[oa]s?|homenaje)\b/.test(t)) return false;
  return true;
}

function palabras(s) { return norm(s).split(" ").filter(Boolean); }
function trigramas(w) { const s = new Set(); for (let i = 0; i + 2 < w.length; i++) s.add(w[i] + " " + w[i + 1] + " " + w[i + 2]); return s; }

// La frase que dice la IA debe EXISTIR en la transcripción (tolera pequeños cambios).
export function fraseVerificada(frase, transcripcion) {
  const w = palabras(frase);
  if (w.length < 3) return false;
  const T = palabras(transcripcion);
  const tg = trigramas(T);
  const fg = trigramas(w);
  if (!fg.size) return false;
  let ok = 0;
  for (const g of fg) if (tg.has(g)) ok++;
  return ok / fg.size >= 0.6;
}

// Cruza el nombre que oyó la IA con la plantilla de Futmondo. Solo vale si hay UN candidato claro.
const ALIAS_JUGADOR = { zaka: "Zakaria Eddahchouri" }; // apodo -> nombre completo. Solo lo que Edu confirma (Zaka: 07/11).
export function cruzarJugador(nombre, plantilla) {
  const n = norm(ALIAS_JUGADOR[norm(nombre)] || nombre);
  const toks = n.split(" ").filter((t) => t.length > 2);
  if (!toks.length) return null;
  const c = plantilla.filter((p) => {
    const pt = norm(p.name).split(" ");
    return toks.every((t) => pt.includes(t));
  });
  return c.length === 1 ? c[0] : null;
}

export function parseJson(txt) {
  try { return JSON.parse(txt); } catch (e) {}
  const m = String(txt || "").match(/[\[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

// Pasa lo que dice la IA a resultado seguro: solo estados válidos y frases verificadas.
export function filtrar(items, transcripcion, plantilla) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it.jugador !== "string" || !ESTADOS.includes(it.estado)) continue;
    const frase = String(it.frase || "").slice(0, 200);
    const verificada = fraseVerificada(frase, transcripcion);
    const p = cruzarJugador(it.jugador, plantilla);
    out.push({
      jugador: it.jugador, id: p ? p.id : null, nombre: p ? p.name : null,
      estado: it.estado, frase, minuto: String(it.minuto || ""),
      verificada, cruzado: !!p,
      // Publicable solo si la frase existe, el jugador es de la plantilla y la IA no dudó.
      publicable: verificada && !!p && it.confianza === "alta",
    });
  }
  return out;
}

// ---------- Gemini ----------
async function gemini(env, f, body, intentos) {
  let ultimo = "";
  for (let i = 0; i < (intentos || 3); i++) {
    let r;
    try {
      r = await f("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body),
      });
    } catch (e) { ultimo = "red"; continue; }
    if (r.ok) { const j = await r.json(); return { j, tokens: (j.usageMetadata && j.usageMetadata.totalTokenCount) || 0 }; }
    ultimo = "http " + r.status;
    if (r.status === 429 || r.status === 503) { await new Promise((ok) => setTimeout(ok, 4000 * (i + 1))); continue; }
    break;
  }
  return { error: ultimo };
}
function textoDe(j) {
  const p = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  return (p || []).map((x) => x.text || "").join("");
}

const PROMPT_TRANSCRIPCION = "Transcribe de forma LITERAL y completa lo que se dice en esta rueda de prensa de fútbol, en español. " +
  "Incluye marcas de tiempo cada ~30 segundos con el formato [mm:ss]. No resumas, no corrijas, no añadas nada que no se oiga. Devuelve solo texto.";
function promptEstados(club, transcripcion, nombres) {
  return "Rueda de prensa de un entrenador o jugador del " + club + ". Con SOLO la transcripción de abajo, lista la DISPONIBILIDAD de cada FUTBOLISTA en activo para el próximo partido, " +
    "únicamente si se dice de forma explícita. Recorre la transcripción ENTERA de principio a fin y no te dejes a ningún jugador del que se hable.\nReglas:\n1. Ignora fallecimientos, homenajes, rivales y otros equipos.\n" +
    "2. estado: uno de " + ESTADOS.join(" | ") + ".\n3. Si no se compromete, usa duda. Si no habla de su disponibilidad, NO lo incluyas.\n" +
    "4. frase: cita LITERAL copiada de la transcripción (máx 20 palabras).\n5. minuto: el [mm:ss] más cercano.\n6. confianza: alta | media | baja.\n" +
    (nombres && nombres.length ? "7. jugador: la transcripción puede oír mal los nombres. Plantilla del equipo: " + nombres.join(", ") + ". Si el nombre oído corresponde claramente a alguien de la lista, devuelve EXACTAMENTE el nombre de la lista; si no corresponde a nadie, devuelve el nombre tal cual y confianza baja.\n" : "") +
    "Devuelve solo un array JSON de {jugador, estado, frase, minuto, confianza}.\n\nTRANSCRIPCIÓN:\n" + transcripcion;
}


// ---------- Borrador de noticia propia (solo con frases publicables) ----------
const OWN_KEY = "own:news:v1";
const ETIQ_TXT = { disponible: "disponible", opcion_titular: "opción de titular", duda: "duda", recuperacion_con_grupo: "entrena con el grupo", recuperacion_parcial: "entrena parcialmente", baja: "baja", titular_confirmado: "titular confirmado", rotacion: "rotación" };
export function borradorDesdeVideo(v) {
  const items = (v.items || []).filter((x) => x.publicable);
  if (!items.length) return null;
  const secs = (m) => { const a = String(m || "").split(":").map(Number); return a.length === 2 && a.every((n) => !isNaN(n)) ? a[0] * 60 + a[1] : 0; };
  const first = items.find((i) => i.minuto);
  return {
    title: v.club + ": así llegan sus jugadores tras la rueda de prensa",
    lead: items.length + " jugador" + (items.length === 1 ? "" : "es") + " mencionado" + (items.length === 1 ? "" : "s") + " por el entrenador.",
    body: items.map((it) => (it.nombre || it.jugador) + ": " + (ETIQ_TXT[it.estado] || it.estado) + ". «" + it.frase + "»" + (it.minuto ? " (min " + it.minuto + ")" : "")).join("\n"),
    club: v.club, players: items.map((i) => i.nombre || i.jugador),
    source: { name: "Rueda de prensa · " + v.club + " (YouTube)", url: "https://youtu.be/" + v.id + (first ? "?t=" + secs(first.minuto) : ""), videoId: v.id },
    original: items.map((i) => ({ jugador: i.jugador, estado: i.estado, frase: i.frase, minuto: i.minuto, confianza: i.confianza, verificada: !!i.verificada, cruzado: !!i.cruzado })),
  };
}
// ---------- Redacción de la noticia (con palabras propias, solo con datos verificados) ----------
const norm2 = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function promptNoticia(club, items) {
  return "Eres redactor de una web de fantasy de LaLiga. Escribe una noticia breve, en español y con tus propias palabras, con SOLO estos datos verificados de la rueda de prensa de un entrenador del " + club + ".\n" +
    "REGLAS: usa únicamente la información de la lista. No añadas lesiones, fechas, partidos, rivales, cifras, causas ni consecuencias que no estén. No inventes citas: si citas, copia la frase literal entre comillas. Tono informativo, sin exagerar. " +
    "Escribe el nombre de cada jugador exactamente como aparece en la lista. Titular de máximo 90 caracteres que mencione al club o a un jugador. Entradilla de máximo 160 caracteres. Cuerpo de 2 a 4 párrafos cortos separados por una línea en blanco.\n" +
    'Devuelve solo JSON: {"titular": "...", "entradilla": "...", "cuerpo": "..."}\n\nDATOS:\n' +
    items.map((i) => "- " + (i.nombre || i.jugador) + " | " + (ETIQ_TXT[i.estado] || i.estado) + " | frase literal: «" + i.frase + "»" + (i.minuto ? " | min " + i.minuto : "")).join("\n");
}
// Rechaza lo que se pase de largo, meta cifras que no están en las frases o se olvide de algún jugador
export function validarNoticia(n, items) {
  if (!n || typeof n !== "object") return null;
  const t = String(n.titular || "").trim(), l = String(n.entradilla || "").trim(), c = String(n.cuerpo || "").trim();
  if (t.length < 12 || t.length > 120 || l.length > 220 || c.length < 60 || c.length > 2500) return null;
  const fuente = norm2(items.map((i) => i.frase + " " + i.minuto).join(" "));
  const nums = (t + " " + l + " " + c).match(/\d+/g) || [];
  if (nums.some((x) => !fuente.includes(x))) return null;
  // Palabras de lesión/plazo/cifra que la IA podría colar: solo valen si salen en las frases del entrenador
  const riesgo = norm2(t + " " + l + " " + c).match(/\b(semanas?|meses|dias?|lesion\w*|operad[oa]|rotura|fractura|esguince|desgarro|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/g) || [];
  if (riesgo.some((w) => !new RegExp("\\b" + w + "\\b").test(fuente))) return null;
  const cuerpo = norm2(c + " " + t);
  for (const i of items) {
    const last = norm2(i.nombre || i.jugador).split(/\s+/).filter((w) => w.length > 2).pop();
    if (last && !cuerpo.includes(last)) return null;
  }
  return { title: t, lead: l, body: c };
}
async function redactarNoticia(env, f, res) {
  const items = (res.items || []).filter((x) => x.publicable);
  const base = borradorDesdeVideo(res);
  if (!base) return null;
  let tokens = 0;
  try {
    const r = await gemini(env, f, { contents: [{ parts: [{ text: promptNoticia(res.club, items) }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } });
    if (!r.error) {
      tokens = r.tokens;
      const v = validarNoticia(parseObj(textoDe(r.j)), items);
      if (v) return Object.assign(base, v, { via: "ia", tokens });
    }
  } catch (e) {}
  // Plantilla con las frases verificadas, si la IA falla o no pasa la validación
  const nombres = items.map((i) => i.nombre || i.jugador);
  base.title = items.length === 1 ? nombres[0] + ": " + (ETIQ_TXT[items[0].estado] || items[0].estado) + " (" + res.club + ")" : res.club + ": " + items.length + " jugadores en la rueda de prensa del entrenador";
  base.via = "plantilla"; base.tokens = tokens;
  return base;
}
function parseObj(t) { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } }

// Publica la noticia en la web (KV own:news:v1). Si había un borrador de ese vídeo, lo reescribe y lo publica.
async function publicarNoticia(env, f, res, now) {
  const own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  const prev = own.find((o) => o.source && o.source.videoId === res.id);
  if (prev && prev.status === "published") return null;
  const n = await redactarNoticia(env, f, res);
  if (!n) return null;
  let item;
  if (prev) { item = prev; Object.assign(item, n, { status: "published", publishedAt: now, updatedAt: now }); }
  else {
    const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    item = Object.assign({ id: hex, status: "published", createdAt: now, updatedAt: now, publishedAt: now }, n);
    own.unshift(item);
  }
  await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
  return item;
}

// ---------- Telegram (solo para Edu) ----------
const ETIQ = { disponible: "🟢 disponible", opcion_titular: "🟢 opción de titular", duda: "🟡 duda", recuperacion_con_grupo: "🟡 recuperación (con grupo)", recuperacion_parcial: "🟠 recuperación (parcial)", baja: "🔴 baja", titular_confirmado: "✅ titular", rotacion: "🔄 rotación" };
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function resumenTelegram(club, titulo, id, items, borrador) {
  const ok = items.filter((x) => x.publicable);
  const dud = items.filter((x) => !x.publicable);
  let t = "🧪 <b>SOMBRA · " + esc(club) + "</b>\n" + esc(titulo.slice(0, 90)) + "\n";
  t += "\n" + ok.length + " seguros · " + dud.length + " sin verificar\n";
  if (ok.length) t += "\n" + ok.map((x) => (ETIQ[x.estado] || x.estado) + " · <b>" + esc(x.nombre) + "</b>").join("\n");
  if (dud.length) t += "\n\n<i>No publicables:</i>\n" + dud.map((x) => "· " + esc(x.jugador) + " (" + (ETIQ[x.estado] || x.estado) + ")" + (x.cruzado ? "" : " — sin cruzar con Futmondo") + (x.verificada ? "" : " — frase no verificada")).join("\n");
  return t + "\n\nhttps://youtu.be/" + id + (borrador ? "\n\n📝 Borrador listo para revisar y publicar:\nhttps://edumr.es/futmondo/admin-noticias/" : "");
}
export function noticiaTelegram(item, sinVerificar) {
  const cuerpo = String(item.body || "").split(/\n+/).filter(Boolean).join("\n\n");
  let t = "📰 <b>" + esc(item.title) + "</b>\n\n" + (item.lead ? "<i>" + esc(item.lead) + "</i>\n\n" : "") + esc(cuerpo.slice(0, 1800));
  t += "\n\nFuente: " + esc(item.source && item.source.name) + (item.source && item.source.url ? "\n" + item.source.url : "");
  t += "\n\n🔗 https://edumr.es/futmondo/guiafantasy/noticias/ed-" + item.id;
  if (sinVerificar) t += "\n\n<i>" + sinVerificar + " dato" + (sinVerificar === 1 ? "" : "s") + " sin verificar (no publicado" + (sinVerificar === 1 ? "" : "s") + ")</i>";
  return t;
}
async function enviar(env, f, chat, text) {
  try {
    const r = await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }) });
    const j = await r.json(); return !!(j && j.ok);
  } catch (e) { return false; }
}


// Lee los últimos vídeos de un canal. 1º el RSS público de YouTube; si falla (a veces responde 404 a
// ciertas IPs) y hay clave oficial de YouTube Data API (YOUTUBE_API_KEY), usa la lista de subidas (1 unidad).
async function leerFuente(env, f, s) {
  let motivo = "";
  try {
    const r = await f("https://www.youtube.com/feeds/videos.xml?channel_id=" + s.yt, { headers: { "user-agent": "edumr-redactor/1.0 (+https://edumr.es)" } });
    if (r.ok) return { via: "rss", videos: parseFeed(await r.text()).map((v) => ({ ...v, club: s.club })) };
    motivo = "rss " + r.status;
  } catch (e) { motivo = "rss red"; }
  if (env.YOUTUBE_API_KEY && /^UC/.test(s.yt)) {
    const r = await f("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=UU" + s.yt.slice(2), { headers: { "x-goog-api-key": env.YOUTUBE_API_KEY } });
    if (r.ok) {
      const j = await r.json();
      const videos = (j.items || []).map((it) => it.snippet && { id: it.snippet.resourceId && it.snippet.resourceId.videoId, title: it.snippet.title, published: Date.parse(it.snippet.publishedAt), club: s.club }).filter((v) => v && v.id && v.title && v.published);
      return { via: "api", videos };
    }
    motivo += " · api " + r.status;
  }
  throw new Error(motivo);
}

// ---------- lo principal ----------
// deps solo sirve para las pruebas (fetch falso, reloj, fuentes).
export async function redactorSombra(env, deps) {
  const f = (deps && deps.fetch) || fetch;
  const now = (deps && deps.now) || Date.now();
  if (!env || !env.GEMINI_API_KEY || !env.PORRA) return { skipped: "sin clave" };
  const mnt = new Date(now).getUTCMinutes();
  if (!(deps && deps.allTicks) && mnt % 2 !== 1) return { skipped: "no toca" }; // cada 2 min (un vídeo por pasada)

  let st = null;
  try { st = await env.PORRA.get(STATE_KEY, "json"); } catch (e) { return { skipped: "sin estado" }; }
  if (!st) st = { seen: {}, tok: { d: "", n: 0 } };
  let dirty = false;
  const dia = new Date(now).toISOString().slice(0, 10);
  if (st.tok.d !== dia) { st.tok = { d: dia, n: 0 }; dirty = true; }

  // 1) vídeos nuevos
  const fuentes = (deps && deps.fuentes) || FUENTES;
  const feeds = await Promise.allSettled(fuentes.map((s) => leerFuente(env, f, s)));
  st.fuentes = st.fuentes || {};
  feeds.forEach((fd, i) => {
    const c = fuentes[i].club;
    const est = fd.status === "fulfilled" ? { ok: true, via: fd.value.via } : { ok: false, error: String(fd.reason && fd.reason.message || fd.reason) };
    if (JSON.stringify(st.fuentes[c] && { ok: st.fuentes[c].ok, via: st.fuentes[c].via, error: st.fuentes[c].error }) !== JSON.stringify(est)) dirty = true;
    st.fuentes[c] = { ...est, at: now };
  });
  for (const fd of feeds) {
    if (fd.status !== "fulfilled") continue;
    for (const v of fd.value.videos) {
      if (st.seen[v.id] || !esConferencia(v.title) || now - v.published > EDAD_MAX) continue;
      st.seen[v.id] = { club: v.club, title: v.title, pub: v.published, status: "pend", intentos: 0, last: 0 };
      dirty = true;
    }
  }
  // se olvidan los vistos con más de 10 días
  for (const id of Object.keys(st.seen)) if (now - st.seen[id].pub > 10 * 86400e3) { delete st.seen[id]; dirty = true; }

  // 2) procesar UNO por pasada
  const cola = Object.keys(st.seen).filter((id) => { const s = st.seen[id]; return s.status === "pend" && s.intentos < MAX_INTENTOS && now - s.last >= ESPERA_REINTENTO; })
    .sort((a, b) => st.seen[b].pub - st.seen[a].pub);
  let hecho = null;
  if (cola.length && st.tok.n < MAX_TOKENS_DIA) {
    const id = cola[0], s = st.seen[id];
    s.intentos++; s.last = now; dirty = true;
    const tr = await gemini(env, f, {
      contents: [{ parts: [{ file_data: { file_uri: "https://www.youtube.com/watch?v=" + id }, video_metadata: { fps: 0.1 } }, { text: PROMPT_TRANSCRIPCION }] }],
      generationConfig: { temperature: 0, mediaResolution: "MEDIA_RESOLUTION_LOW" },
    });
    if (tr.error) { s.err = tr.error; }
    else {
      st.tok.n += tr.tokens;
      const transcripcion = textoDe(tr.j).trim();
      if (transcripcion.length < 500) { s.err = "transcripción corta"; }
      else {
        let plantilla = [];
        try {
          const r = await f(SITE + "mercado", { headers: { "user-agent": "edumr-cron" } });
          plantilla = ((await r.json()).players || []).filter((p) => sameTeam(p.team, s.club)).map((p) => ({ id: p.id, name: p.name }));
        } catch (e) {}
        const es = await gemini(env, f, { contents: [{ parts: [{ text: promptEstados(s.club, transcripcion, plantilla.map((p) => p.name)) }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } });
        if (es.error) { s.err = es.error; }
        else {
          st.tok.n += es.tokens;
          const items = filtrar(parseJson(textoDe(es.j)), transcripcion, plantilla);
          s.status = "ok"; delete s.err; s.n = items.length; s.seguros = items.filter((x) => x.publicable).length;
          const res = { id, club: s.club, title: s.title, pub: s.pub, at: now, items, chars: transcripcion.length };
          try { await env.PORRA.put(RES_PREFIX + id, JSON.stringify(res), { expirationTtl: 14 * 86400 }); } catch (e) {}
          let noticia = null;
          try { noticia = await publicarNoticia(env, f, res, now); if (noticia) st.tok.n += noticia.tokens || 0; } catch (e) { s.err = "publicar: " + String(e && e.message || e).slice(0, 80); }
          hecho = { id, items, s, noticia };
        }
      }
    }
  }
  // 2b) borradores de antes (sin tocar por Edu): se reescriben y se publican, uno por pasada
  if (!hecho) {
    try {
      const own = (await env.PORRA.get(OWN_KEY, "json")) || [];
      const d = own.find((o) => o.status === "draft" && o.source && o.source.videoId && o.updatedAt === o.createdAt);
      if (d) {
        const res = await env.PORRA.get(RES_PREFIX + d.source.videoId, "json");
        const n = res ? await publicarNoticia(env, f, res, now) : null;
        if (n) { st.tok.n += n.tokens || 0; dirty = true; hecho = { id: res.id, items: res.items, s: { club: res.club, title: res.title }, noticia: n }; }
        else { await env.PORRA.put(OWN_KEY, JSON.stringify(own.filter((o) => o !== d && o.id !== d.id))); }
      }
    } catch (e) {}
  }
  if (dirty) { try { await env.PORRA.put(STATE_KEY, JSON.stringify(st)); } catch (e) {} }

  // 3) resumen privado a Edu (solo si hay token del bot y chat guardado)
  if (hecho && env.TELEGRAM_BOT_TOKEN) {
    try {
      const av = await env.PORRA.get(AVISOS_KEY, "json");
      const chat = String(env.TELEGRAM_CHAT_ID || (av && av.chat) || "");
      if (chat && hecho.noticia) await enviar(env, f, chat, noticiaTelegram(hecho.noticia, hecho.items.filter((x) => !x.publicable).length));
    } catch (e) {}
  }
  return { procesado: hecho ? hecho.id : null, pendientes: cola.length, tokens: st.tok.n };
}

export const _r = { validarNoticia, noticiaTelegram, parseFeed, esConferencia, fraseVerificada, cruzarJugador, filtrar, parseJson, resumenTelegram };
