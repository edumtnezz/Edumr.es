import { analisisDatos } from "./analisis.js";
// Redactor automático. Publica en la web y avisa por Telegram al chat ya guardado.
// No crea borradores ni manda un resumen "sombra".
//
// De cada canal oficial: la API de YouTube (el RSS /feeds/videos.xml lo prohíbe robots.txt).
// Gemini transcribe. Solo se publica si la frase está en UN solo tramo de la transcripción,
// el jugador nombrado es el de ese tramo y el estado se sostiene en esas palabras
// (niega, duda y otro jugador tiran la noticia). Si no cuadra, no se publica y queda el motivo.
// Sin clave de Gemini no hace nada. Nunca se inventa un dato.
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

// Canales y listados comprobados el 09/11/2026. YouTube: la lista sigue saliendo de la API
// (1 unidad por canal, como mucho cada 15 min). El RSS de YouTube lo prohíbe su robots.txt.
// Athletic y Alavés no están. Si el robots.txt de un club no se puede leer, no hay listado.
export const FUENTES = [
  { club: "Barcelona", yt: "UC14UlmYlSNiQCBe9Eookf_A", noticias: "https://www.fcbarcelona.es/es/sitemap/articles/detailed.xml" },
  { club: "Atlético", yt: "UCuzKFwdh7z2GHcIOX_tXgxA", noticias: "https://www.atleticodemadrid.com/sitemaps/noticias.xml" },
  { club: "Real Madrid", yt: "UCWV3obpZVGgJ3j9FVhEjF2Q" },
  { club: "Betis", yt: "UCeB7JZwcar2fVoK2w2f9OwA" },
  { club: "Real Sociedad", yt: "UCfeqewEKWQ8CXY8OiXoMxxw", noticias: "https://www.realsociedad.eus/es/noticias" },
  { club: "Celta", yt: "UCCJLVZYqRb_85b2Flpg04cg" },
  { club: "Deportivo de la Coruña", yt: "UCY2s1XaPzO60Hu6M_YZCTgA", noticias: "https://www.rcdeportivo.es/es/sitemap.xml" },
  { club: "Rayo Vallecano", yt: "UCUTkI-vFAO7BjfpqIDFO8rQ", noticias: "https://www.rayovallecano.es/noticias" },
  { club: "Espanyol", yt: "UClywhnD01yUU5kO6OgAeHUQ", noticias: "https://www.rcdespanyol.com/es/noticias" },
  { club: "Getafe", yt: "UC34fUqq4rxJc0cj5Hart0zQ", noticias: "https://www.getafecf.com/noticias" },
  { club: "Elche", yt: "UCeY_BssoWHlT-juP90UcZZg", noticias: "https://www.elchecf.es/noticias" },
  { club: "Osasuna", yt: "UC2JTagDPIChbcEeiLjypuYA", noticias: "https://www.osasuna.es/noticias-primer-equipo" },
  { club: "Villarreal", yt: "UC0MLWyQ0L7uEZY8wbkDSTkw" },
  { club: "Valencia", yt: "UCgvyo5x49J8ht5H9imKfxMQ", noticias: "https://www.valenciacf.com/sitemaps/sitemap-club-2026.xml" },
  { club: "Sevilla", yt: "UCLy9lmj_0cqffXUzbGHNmYA" },
  { club: "Levante", yt: "UCvOegN2N1FGPPv4xBNN2F9A", noticias: "https://www.levanteud.com/noticias" },
  { club: "Málaga", yt: "UCo_PhWZulZooYfQRo00vU-Q", noticias: "https://www.malagacf.com/noticias" },
  { club: "Racing", yt: "UCPkCdE745MkHLx8YWOwi8ew", noticias: "https://www.realracingclub.es/noticias" },
  { club: "Oviedo", yt: "UCvpFN8tLnBsjPR2BCJ-FJQA", noticias: "https://www.realoviedo.es/noticias" },
];
const HOSTS_PROHIBIDOS = ["athletic-club.eus", "athletic-club.net", "deportivoalaves.com", "alaves.com", "marca.com", "as.com", "mundodeportivo.com", "twitter.com", "x.com"];
export function dominioProhibido(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return true; }
  return HOSTS_PROHIBIDOS.some((h) => host === h || host.endsWith("." + h));
}
// Solo esta rueda ya leída con 0 frases: se vuelve a mirar una vez con los temas nuevos. No se reabre el histórico.
const RELECTURA_UNA_VEZ = new Set(["szC6cvFXHDs"]);

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

// La frase tiene que estar en UN tramo corto de la transcripción, en orden.
// No vale juntar palabras sueltas de sitios distintos (el 60 % es dentro de esa ventana).
export function localizarFrase(frase, transcripcion) {
  const w = palabras(frase);
  const T = palabras(transcripcion);
  if (w.length < 3 || T.length < 3) return null;
  const joined = T.join(" ");
  const at = joined.indexOf(w.join(" "));
  if (at >= 0) {
    const before = joined.slice(0, at).trim();
    const start = before ? before.split(" ").length : 0;
    return { start, end: start + w.length };
  }
  const fg = trigramas(w);
  if (!fg.size) return null;
  const win = w.length + 2;
  for (let i = 0; i < T.length; i++) {
    const slice = T.slice(i, Math.min(T.length, i + win));
    if (slice.length < 3) break;
    const tg = trigramas(slice);
    let ok = 0;
    for (const g of fg) if (tg.has(g)) ok++;
    if (ok / fg.size < 0.6) continue;
    let j = 0;
    for (const word of slice) if (word === w[j]) j++;
    if (j >= 3 && j / w.length >= 0.6) return { start: i, end: i + slice.length };
  }
  return null;
}
export function fraseVerificada(frase, transcripcion) {
  return !!localizarFrase(frase, transcripcion);
}

// Ventana de la frase: unas pocas palabras antes, sin cruzar la marca de tiempo anterior.
export function ventanaFrase(frase, transcripcion) {
  const T = palabras(transcripcion);
  const loc = localizarFrase(frase, transcripcion);
  if (!loc) return "";
  let from = loc.start;
  const limit = Math.max(0, loc.start - 24);
  for (let i = loc.start - 1; i >= limit; i--) {
    if (/^\d+$/.test(T[i]) && i > 0 && /^\d+$/.test(T[i - 1])) { from = i + 1; break; }
    from = i;
  }
  return T.slice(from, loc.end).join(" ");
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

function clavesJugador(oido, oficial) {
  const s = new Set();
  for (const t of norm(oido).split(" ")) if (t.length >= 3) s.add(t);
  for (const t of norm(oficial).split(" ")) if (t.length >= 4) s.add(t);
  for (const [k, v] of Object.entries(ALIAS_JUGADOR)) if (norm(v) === norm(oficial)) s.add(norm(k));
  return [...s];
}
function ultimaClave(claves, texto) {
  const w = String(texto || "").split(" ").filter(Boolean);
  let best = -1;
  for (let i = 0; i < w.length; i++) if (claves.includes(w[i])) best = i;
  return best;
}

// El nombre tiene que caer en el mismo tramo que la frase, y más cerca que otro jugador de la plantilla.
export function atribucionJugador(jugador, oficial, plantilla, frase, transcripcion) {
  const texto = ventanaFrase(frase, transcripcion);
  if (!texto) return { ok: false, motivo: "frase no localizada junto al jugador" };
  const mia = ultimaClave(clavesJugador(jugador, oficial), texto);
  if (mia < 0) return { ok: false, motivo: "la frase no va con este jugador" };
  let otro = null, posOtro = -1;
  for (const pl of plantilla || []) {
    if (!pl || norm(pl.name) === norm(oficial)) continue;
    const p = ultimaClave(clavesJugador(pl.name, pl.name), texto);
    if (p > posOtro) { posOtro = p; otro = pl; }
  }
  if (otro && posOtro > mia) return { ok: false, motivo: "la frase parece de " + otro.name };
  if (otro && posOtro >= 0 && posOtro === mia) return { ok: false, motivo: "no se distingue de quién habla la frase" };
  return { ok: true };
}

const PISTAS_ESTADO = {
  baja: ["descartad", "de baja", "no podra jugar", "no puede jugar", "no jugara", "no esta disponible", "fuera de la convocatoria", "no entra en la convocatoria"],
  disponible: ["disponible", "sin problemas", "sin molestias", "alta medica", "apto para jugar", "puede jugar", "podra jugar"],
  recuperacion_con_grupo: ["completando entrenamiento", "entrena con el grupo", "entrenando con el grupo", "trabajando con el grupo"],
  recuperacion_parcial: ["entrenamiento parcial", "trabajo especifico", "al margen del grupo", "en el gimnasio", "parte de la sesion"],
  duda: ["duda", "no esta claro", "veremos", "habria que ver", "en el aire", "decision de ultima hora", "puede que"],
  opcion_titular: ["opcion", "puede ser titular", "entra en los planes"],
  titular_confirmado: ["sera titular", "va de inicio", "titular indiscutible", "en el once inicial"],
  rotacion: ["rotacion", "va a rotar", "descansara", "no sera titular", "gestionaremos minutos"],
};
const MARCA_DUDA = ["puede que", "quizas", "quiza", "veremos", "en principio", "no esta claro", "habria que ver", "todavia no se", "ya veremos", "no lo se"];
const ESTADO_FIRME = new Set(["baja", "titular_confirmado", "disponible", "recuperacion_con_grupo", "recuperacion_parcial", "rotacion"]);

function pistaApoya(pista, texto) {
  let from = 0;
  while (from < texto.length) {
    const i = texto.indexOf(pista, from);
    if (i < 0) return false;
    const antes = texto.slice(0, i).trim().split(" ").filter(Boolean).slice(-3);
    const negado = antes.includes("no") || antes.includes("nunca") || antes.includes("tampoco") || antes.includes("ni");
    if (pista.startsWith("no ") || !negado) return true;
    from = i + pista.length;
  }
  return false;
}

// El estado que propone la IA tiene que leerse en la misma ventana. Si no, no se publica (no se cambia por otro).
export function estadoRespaldado(estado, frase, transcripcion) {
  if (!ESTADOS.includes(estado)) return { ok: false, motivo: "estado no válido" };
  const texto = ventanaFrase(frase, transcripcion);
  if (!texto) return { ok: false, motivo: "frase no localizada" };
  if (ESTADO_FIRME.has(estado) && MARCA_DUDA.some((d) => texto.includes(d))) return { ok: false, motivo: "hay duda en la frase, no se afirma ese estado" };
  if (!(PISTAS_ESTADO[estado] || []).some((p) => pistaApoya(p, texto))) return { ok: false, motivo: "el estado no se sostiene en la frase" };
  return { ok: true };
}

// Declaraciones que no son de lesión ni de titularidad. El «no» puede ser el dato («no hemos sido contundentes»): no se invierte ni se tira.
const TEMAS = ["cambios", "rendimiento", "minutos", "tactica", "gestion_fisica", "valoracion"];
const PISTAS_TEMA = {
  cambios: ["cambio", "cambios", "sustitu", "plan inicial"],
  rendimiento: ["presion", "segunda parte", "segunda mitad", "ritmo", "intensidad"],
  minutos: ["minutos"],
  tactica: ["tactic", "lateral", "sistema", "plan inicial"],
  gestion_fisica: ["cansad", "fisic", "carga fisica"],
  valoracion: ["contundent", "creo mucho", "importante", "fantastic", "gran papel", "muy bien", "no hemos"],
};
export function temaRespaldado(tema, frase) {
  if (!PISTAS_TEMA[tema]) return { ok: false, motivo: "tema no válido" };
  const texto = norm(frase);
  if (!PISTAS_TEMA[tema].some((p) => texto.includes(p))) return { ok: false, motivo: "el tema no se sostiene en la frase" };
  return { ok: true };
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
    if (!it || typeof it.jugador !== "string") continue;
    const tema = TEMAS.includes(it.tema) ? it.tema : (ESTADOS.includes(it.estado) ? "disponibilidad" : "");
    if (!tema) continue;
    const frase = String(it.frase || "").slice(0, 220);
    const verificada = fraseVerificada(frase, transcripcion);
    const p = it.jugador ? cruzarJugador(it.jugador, plantilla) : null;
    let motivo = "";
    let atribOk = false;
    let estadoOk = false;
    if (!verificada) motivo = "frase no está en la transcripción";
    else if (tema === "disponibilidad") {
      if (!p) motivo = "sin cruzar con Futmondo";
      else {
        const a = atribucionJugador(it.jugador, p.name, plantilla, frase, transcripcion);
        if (!a.ok) motivo = a.motivo;
        else {
          atribOk = true;
          const e = estadoRespaldado(it.estado, frase, transcripcion);
          if (!e.ok) motivo = e.motivo;
          else estadoOk = true;
        }
      }
    } else {
      const t = temaRespaldado(tema, frase);
      if (!t.ok) motivo = t.motivo;
      else if (p) {
        const a = atribucionJugador(it.jugador, p.name, plantilla, frase, transcripcion);
        if (!a.ok) motivo = a.motivo;
        else { atribOk = true; estadoOk = true; }
      } else {
        const texto = ventanaFrase(frase, transcripcion);
        const otro = (plantilla || []).find((pl) => pl && ultimaClave(clavesJugador(pl.name, pl.name), texto) >= 0);
        if (otro) motivo = "la frase nombra a " + otro.name + " y no está cruzada";
        else { atribOk = true; estadoOk = true; }
      }
    }
    if (!motivo && it.confianza !== "alta") motivo = "confianza no alta";
    const publicable = verificada && atribOk && estadoOk && it.confianza === "alta" && (tema !== "disponibilidad" || !!p);
    out.push({
      jugador: it.jugador, id: p ? p.id : null, nombre: p ? p.name : (it.nombre || null),
      estado: tema === "disponibilidad" ? it.estado : tema, tema, frase, minuto: String(it.minuto || ""),
      confianza: it.confianza || "",
      verificada, cruzado: !!p, motivo: publicable ? "" : motivo,
      publicable,
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
    "2. tema: disponibilidad, o uno de " + TEMAS.join(" | ") + " si habla de cambios, rendimiento, minutos, táctica, gestión física o una valoración.\n" +
    "3. estado: solo si tema es disponibilidad, uno de " + ESTADOS.join(" | ") + ". Si no se compromete, usa duda. En los otros temas deja estado vacío.\n" +
    "4. Un «no» que forma parte de lo dicho (por ejemplo «no hemos sido contundentes») SÍ se incluye, con el tema que corresponda. No lo conviertas en una baja ni en un titular.\n" +
    "5. frase: cita LITERAL de la MISMA frase (máx 25 palabras). No juntes palabras de otro sitio.\n6. minuto: el [mm:ss] más cercano.\n7. confianza: alta si la frase es literal y se entiende de quién habla; baja si no.\n" +
    (nombres && nombres.length ? "8. jugador: plantilla del equipo: " + nombres.join(", ") + ". Si nombra a alguien de la lista, devuelve EXACTAMENTE ese nombre. Si habla del equipo y de nadie en concreto, jugador vacío.\n" : "") +
    "Devuelve solo un array JSON de {jugador, tema, estado, frase, minuto, confianza}.\n\nTRANSCRIPCIÓN:\n" + transcripcion;
}


// ---------- Borrador de noticia propia (solo con frases publicables) ----------
const OWN_KEY = "own:news:v1";
const ETIQ_TXT = { disponible: "disponible", opcion_titular: "opción de titular", duda: "duda", recuperacion_con_grupo: "entrena con el grupo", recuperacion_parcial: "entrena parcialmente", baja: "baja", titular_confirmado: "titular confirmado", rotacion: "rotación", cambios: "cambios", rendimiento: "rendimiento", minutos: "minutos", tactica: "planteamiento", gestion_fisica: "gestión física", valoracion: "valoración" };
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
    source: { name: "Según " + v.club, url: "https://youtu.be/" + v.id + (first ? "?t=" + secs(first.minuto) : ""), videoId: v.id },
    original: items.map((i) => ({ jugador: i.jugador, estado: i.estado, frase: i.frase, minuto: i.minuto, confianza: i.confianza, verificada: !!i.verificada, cruzado: !!i.cruzado })),
  };
}
// Una previa deja de valer cuando ya se ha jugado el partido (~30 h); las de después del partido, algo más
export function caducada(title, pub, now) {
  const t = norm2(title);
  const posterior = /\b(tras|reacciones|declaraciones|posterior\w*|despues)\b/.test(t);
  const p = Number(pub) || Date.parse(pub) || 0;
  return !!p && now - p > (posterior ? 40 : 30) * 3600e3;
}

// ---------- Redacción de la noticia (con palabras propias, solo con datos verificados) ----------
const norm2 = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function promptNoticias(club, grupos, extra) {
  return "Eres redactor de una web de fantasy de LaLiga. Para CADA jugador escribe la noticia en español periodístico natural. La única fuente son los datos de abajo y el contexto verificado. Si un dato no está escrito, no lo pongas.\n" +
    "Titular: quien habla y el tema, sin marcador y sin metáforas. Si es una rueda, ábrelo por el entrenador.\n" +
    "Entradilla: una frase, sin comillas, que no repita el titular. Di cuándo habló solo si el contexto trae una fecha escrita (día, mes y año). Si no hay fecha, no pongas día, mes ni año y no uses la fecha de hoy. Si el rival está en el contexto o en la cita, di tras qué partido habló.\n" +
    "Cuerpo: un párrafo que integre la cita literal entre comillas, copiada tal cual, sin repetir el nombre al empezar dos frases seguidas y sin encadenar plantillas. Si los datos traen titularidad, minutos, cambio, estado o el rol que dijo, añade un segundo párrafo con lo que eso implica para el fantasy. Si no hay ese dato, no escribas ese párrafo ni rellenes con una suposición.\n" +
    "Escribe el nombre exactamente como en la lista.\n" +
    (extra ? "CONTEXTO VERIFICADO:\n" + extra + "\n\n" : "") +
    'Devuelve solo JSON: [{"jugador": "nombre tal cual", "titular": "...", "entradilla": "...", "cuerpo": "..."}] con un elemento por jugador y en el mismo orden.\n\nDATOS:\n' +
    grupos.map((g) => "JUGADOR: " + g.nombre + "\n" + g.items.map((i) => "- " + (ETIQ_TXT[i.estado] || i.estado) + " | frase literal: «" + i.frase + "»" + (i.minuto ? " | min " + i.minuto : "")).join("\n")).join("\n\n");
}
// Rechaza lo que se pase de largo, meta cifras que no están en las frases o se olvide de algún jugador
export function validarNoticia(n, items, extra) {
  if (!n || typeof n !== "object") return null;
  const t = String(n.titular || "").trim(), l = String(n.entradilla || "").trim(), c = String(n.cuerpo || "").trim();
  if (t.length < 12 || t.length > 140 || l.length > 280 || c.length < 40 || c.length > 2500) return null;
  const fuente = norm2(items.map((i) => [i.frase, i.minuto, ETIQ_TXT[i.estado] || ""].join(" ")).join(" ") + " " + (extra || ""));
  const todo = norm2(t + " " + l + " " + c);
  const nums = (t + " " + l + " " + c).match(/\d+/g) || [];
  if (nums.some((x) => !fuente.includes(x))) return null;
  // Día, plazo, posición o estado que no esté en la frase (o en la etiqueta ya comprobada) se rechaza.
  const riesgo = todo.match(/\b(semanas?|meses|dias?|lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|ayer|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jornada|porteros?|porteras?|defensas?|delanteros?|delanteras?|centrocampistas?|extremos?|mediocentros?|laterales?|lesion\w*|operad[oa]|rotura|fractura|esguince|desgarro|baja|bajas|descartad\w*|titular|titulares|disponible|rotacion|duda|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/g) || [];
  if (riesgo.some((w) => !new RegExp("\\b" + w + "\\b").test(fuente))) return null;
  const utiles = [];
  for (const i of items) for (const w of norm2(i.frase).split(" ")) if (w.length > 4) utiles.push(w);
  if (utiles.length && utiles.filter((w) => todo.includes(w)).length / utiles.length < 0.34) return null;
  const cuerpo = norm2(c + " " + t);
  for (const i of items) {
    const last = norm2(i.nombre || i.jugador).split(/\s+/).filter((w) => w.length > 2).pop();
    if (last && !cuerpo.includes(last)) return null;
  }
  return { title: t, lead: l, body: c };
}
function parseArr(t) { const m = String(t || "").match(/\[[\s\S]*\]/); if (!m) return null; try { const j = JSON.parse(m[0]); return Array.isArray(j) ? j : null; } catch (e) { return null; } }
const secs2 = (m) => { const a = String(m || "").split(":").map(Number); return a.length === 2 && a.every((n) => !isNaN(n)) ? a[0] * 60 + a[1] : 0; };
function agruparPorJugador(items) {
  const g = new Map();
  for (const it of items.filter((x) => x.publicable)) {
    const k = it.id || norm2(it.nombre || it.jugador);
    if (!g.has(k)) g.set(k, { key: String(k), id: it.id || "", nombre: it.nombre || it.jugador, items: [] });
    g.get(k).items.push(it);
  }
  return [...g.values()];
}
// Una noticia por jugador (como hacen las webs de fantasy), con IA validada o, si falla, plantilla con las frases
async function redactarNoticias(env, f, res, opts) {
  const grupos = agruparPorJugador(res.items || []);
  if (!grupos.length) return [];
  let tokens = 0, arr = null;
  if (!(opts && opts.sinIa)) {
    try {
      const extra = [res.cuando, res.partidoTexto, res.speaker, res.club].filter(Boolean).join(". ");
      const r = await gemini(env, f, { contents: [{ parts: [{ text: promptNoticias(res.club, grupos, extra) }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } });
      if (!r.error) { tokens = r.tokens; arr = parseArr(textoDe(r.j)); }
    } catch (e) {}
  }
  return grupos.map((g, i) => {
    const v = arr && arr.find((x) => x && norm2(x.jugador) === norm2(g.nombre)) || (arr && arr[i]);
    const extra = [res.cuando, res.partidoTexto, res.speaker, res.club].filter(Boolean).join(". ");
    const ok = validarNoticia(v, g.items, extra);
    const first = g.items.find((x) => x.minuto) || g.items[0];
    const enlace = res.url || ("https://youtu.be/" + res.id + (first && first.minuto ? "?t=" + secs2(first.minuto) : ""));
    const base = {
      club: res.club, players: [g.nombre].filter(Boolean), playerId: g.id, key: res.id + ":" + g.key,
      source: { name: res.oficial ? "OFICIAL · " + res.club : (res.fuente || "Según " + res.club), url: enlace, videoId: res.sinMiniatura ? "" : res.id },
      original: g.items.map((x) => ({ jugador: x.jugador, estado: x.estado, frase: x.frase, minuto: x.minuto, confianza: x.confianza, verificada: !!x.verificada, cruzado: !!x.cruzado })),
      tokens: i === 0 ? tokens : 0,
    };
    const et = ETIQ_TXT[g.items[0].estado] || g.items[0].estado;
    const esRueda = g.items[0].tema && g.items[0].tema !== "disponibilidad";
    let title = g.nombre + ": " + et;
    let lead = res.lead || (res.oficial ? "Según " + (res.speaker ? res.speaker + ", fuente oficial." : res.club + ", fuente oficial.") : "Según " + res.club + ".");
    let body = g.items.map((x) => "«" + x.frase + "»" + (x.minuto ? " (min " + x.minuto + ")" : "")).join("\n");
    let via = "plantilla";
    if (ok) { title = ok.title; lead = ok.lead; body = ok.body; via = "ia"; }
    else if (esRueda) {
      title = res.speaker
        ? res.speaker + " habla de " + (g.nombre && g.nombre !== res.speaker ? g.nombre : et)
        : g.nombre + " habla de " + et;
    }
    if (esRueda) {
      const hechos = [extra, res.title || "", g.nombre || "", g.items.map((x) => x.frase).join(". ")].filter(Boolean).join("\n");
      body = depurarCuerpo("rueda", body, hechos);
      if (!body) return null;
      const leadOk = revisarEntradilla(title, lead, hechos);
      const reserva = (res.speaker ? res.speaker + " habló en la rueda oficial." : "Rueda oficial de " + (res.club || "el club") + ".");
      lead = leadOk || revisarEntradilla(title, reserva, hechos);
      if (!lead) return null;
    }
    return Object.assign(base, { title, lead, body, via });
  }).filter(Boolean);
}
// Miniatura grande: la del propio vídeo de la rueda de prensa en YouTube (la mejor que exista)
async function miniatura(f, id) {
  const foto = (q) => "https://i.ytimg.com/vi/" + id + "/" + q + ".jpg";
  const robots = await leerRobots(f, "https://i.ytimg.com");
  if (!robotsPermite(robots, foto("hqdefault"))) return "";
  for (const q of ["maxresdefault", "hqdefault"]) {
    try { const r = await f(foto(q), { method: "HEAD" }); if (r.ok) return foto(q); } catch (e) {}
  }
  return foto("mqdefault");
}

async function fotoDeMercado(f, nombres) {
  const lista = (nombres || []).map((n) => String(n || "").trim()).filter((n) => n.length > 2);
  if (!lista.length) return "";
  try {
    const r = await f(SITE + "mercado", { headers: { "user-agent": "edumr-cron" } });
    if (!r.ok) return "";
    const players = ((await r.json()).players) || [];
    for (const name of lista) {
      const p = cruzarJugador(name, players);
      const hit = p && players.find((pl) => String(pl.id) === String(p.id) && /^https:\/\//.test(String(pl.photo || "")));
      if (hit) return hit.photo;
    }
  } catch (e) {}
  return "";
}

// Publica las noticias en la web (KV own:news:v1). Las de ese vídeo que ya existían como una sola noticia se sustituyen.
async function publicarNoticias(env, f, res, now, opts) {
  if (caducada(res.title, res.pub, now)) return [];
  const nuevas = await redactarNoticias(env, f, res, opts);
  if (!nuevas.length) return [];
  let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  const claves = new Set(own.map((o) => o.key).filter(Boolean));
  own = own.filter((o) => !(o.source && o.source.videoId === res.id && !o.key));
  const thumb = res.sinMiniatura ? "" : await miniatura(f, res.id);
  const out = [];
  nuevas.forEach((n, i) => {
    if (claves.has(n.key)) return;
    if (textoConFuenteDetectada(n)) return;
    const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const item = Object.assign({ id: hex, status: "published", expira: true, createdAt: now + i, updatedAt: now + i, publishedAt: now + i, thumb, tipo: res.tipo || "" }, n);
    own.unshift(item); out.push(item);
  });
  await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
  return out;
}

export function noticiaTelegram(item) {
  let t = "📰 <b>" + esc(item.title) + "</b>\n\n" + (item.lead ? esc(item.lead) + "\n\n" : "") + esc(String(item.body || "").split(/\n+/).filter(Boolean).join("\n").slice(0, 500));
  return t + "\n\n🔗 https://edumr.es/futmondo/guiafantasy/noticias/ed-" + item.id;
}
async function enviarAviso(env, f, chat, n) {
  const caption = noticiaTelegram(n);
  const foto = n.thumb && /^https:\/\//.test(n.thumb) ? n.thumb : "";
  if (foto) {
    try {
      const r = await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendPhoto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, photo: foto, caption: caption.slice(0, 1000), parse_mode: "HTML" }) });
      const j = await r.json();
      if (j && j.ok) return { ok: true, via: "foto" };
    } catch (e) {}
  }
  try {
    const r = await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: caption, parse_mode: "HTML", link_preview_options: { is_disabled: true } }) });
    const j = await r.json();
    if (j && j.ok) return { ok: true, via: "texto" };
    return { ok: false, via: "texto", err: String((j && j.description) || "texto no aceptado").slice(0, 120) };
  } catch (e) { return { ok: false, via: "texto", err: "texto sin respuesta" }; }
}


// ---------- Comparación interna con las otras webs (solo para el panel; nada se publica ni se avisa) ----------
const CMP_KEY = "rd:cmp:v1", EXT_KEY = "rd:ext:v1";
export function compararNoticias(own, ext, now) {
  const palabras = (t) => new Set(norm2(t).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
  const fuertes = (n) => norm2(n).split(/\s+/).filter((w) => w.length >= 4);
  const recientes = (ext || []).filter((e) => e && e.title && (!e.seen || now - e.seen < 72 * 3600e3));
  const propias = (own || []).filter((o) => o.status === "published" && o.players && o.players[0] && now - (o.publishedAt || 0) < 72 * 3600e3);
  const usadas = new Set();
  const out = propias.map((o) => {
    const claves = fuertes(o.players[0]);
    const matches = recientes.filter((e) => { const w = palabras(e.title); return claves.some((k) => w.has(k)); });
    matches.forEach((m) => usadas.add(m.link));
    return { id: o.id, title: o.title, players: o.players, matches: matches.slice(0, 6).map((m) => ({ src: m.src || "FutbolFantasy", title: m.title, link: m.link, date: m.date, time: m.time })) };
  });
  return { at: now, propias: out, coincide: out.filter((x) => x.matches.length).length, total: out.length, sinCubrir: recientes.filter((e) => !usadas.has(e.link)).slice(0, 40).map((e) => ({ src: e.src || "FutbolFantasy", title: e.title, link: e.link, date: e.date, time: e.time })) };
}
async function compararConExternas(env, now) {
  const c = await env.PORRA.get("ff:news:cron:v1", "json");
  if (!c || !Array.isArray(c.noticias)) return;
  // registro de lo que publican las otras webs (titulares y primera vez que los vimos), para estudiar cómo redactan
  let ext = (await env.PORRA.get(EXT_KEY, "json")) || [];
  const vistos = new Set(ext.map((e) => e.link));
  for (const n of c.noticias) if (n && n.link && n.title && !vistos.has(n.link)) ext.unshift({ title: n.title, link: n.link, src: n.src || "FutbolFantasy", date: n.date, time: n.time, thumb: n.thumb || "", seen: now });
  ext = ext.slice(0, 400);
  await env.PORRA.put(EXT_KEY, JSON.stringify(ext));
  const own = (await env.PORRA.get(OWN_KEY, "json")) || [];
  await env.PORRA.put(CMP_KEY, JSON.stringify(compararNoticias(own, ext, now)));
}

// ---------- Telegram (solo para Edu) ----------
const ETIQ = { disponible: "🟢 disponible", opcion_titular: "🟢 opción de titular", duda: "🟡 duda", recuperacion_con_grupo: "🟡 recuperación (con grupo)", recuperacion_parcial: "🟠 recuperación (parcial)", baja: "🔴 baja", titular_confirmado: "✅ titular", rotacion: "🔄 rotación" };
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function resumenTelegram(club, titulo, id, items) {
  const ok = items.filter((x) => x.publicable);
  const dud = items.filter((x) => !x.publicable);
  let t = "📰 <b>" + esc(club) + "</b>\n" + esc(String(titulo || "").slice(0, 90)) + "\n";
  t += "\n" + ok.length + " publicados · " + dud.length + " sin publicar\n";
  if (dud.length) t += "\n" + dud.map((x) => "· " + esc(x.jugador) + (x.motivo ? " — " + esc(x.motivo) : "")).join("\n");
  return t + "\n\nhttps://edumr.es/futmondo/guiafantasy/";
}


// robots.txt: si no se puede leer, esa URL queda prohibida. YouTube prohíbe /feeds/videos.xml.
let robotsCache = new Map();
let robotsT0 = 0;
const UA_RED = { "user-agent": "edumr-redactor/1.0 (+https://edumr.es)" };
export function robotsPermite(txt, targetUrl) {
  if (txt == null || !String(txt).trim()) return false;
  if (/^\s*</.test(txt)) return false;
  let url;
  try { url = new URL(targetUrl); } catch (e) { return false; }
  const path = url.pathname || "/";
  const groups = [];
  let cur = null;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([^:]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === "user-agent") {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
    } else if ((k === "allow" || k === "disallow") && cur) cur.rules.push({ allow: k === "allow", path: v });
  }
  const ua = "edumr-redactor";
  let group = groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a.replace(/\*$/, ""))));
  if (!group) group = groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best = null;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    if (path.startsWith(rule.path) && (!best || rule.path.length >= best.len)) best = { len: rule.path.length, allow: rule.allow };
  }
  return best ? best.allow : true;
}
async function leerRobots(f, origin) {
  if (Date.now() - robotsT0 > 6 * 3600e3) { robotsCache = new Map(); robotsT0 = Date.now(); }
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let txt = null;
  try {
    const r = await f(origin + "/robots.txt", { headers: UA_RED });
    if (r.ok) {
      const t = await r.text();
      if (t && t.trim() && !/^\s*</.test(t)) txt = t;
    }
  } catch (e) {}
  robotsCache.set(origin, txt);
  return txt;
}

// El RSS de YouTube está prohibido por su robots.txt. La lista sale de la API oficial
// (clave ya existente). googleapis.com no publica robots.txt: no se raspa esa web, solo esta llamada.
async function leerFuente(env, f, s) {
  if (!s.yt) return { via: "web", videos: [] };
  const motivos = [];
  const feed = "https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(s.yt);
  const robots = await leerRobots(f, "https://www.youtube.com");
  if (!robotsPermite(robots, feed)) motivos.push(robots ? "robots prohíbe el RSS" : "robots de YouTube ilegible");
  else {
    try {
      const r = await f(feed, { headers: UA_RED });
      if (r.ok) return { via: "rss", videos: parseFeed(await r.text()).map((v) => ({ ...v, club: s.club })) };
      motivos.push("rss " + r.status);
    } catch (e) { motivos.push("rss red"); }
  }
  if (env.YOUTUBE_API_KEY && /^UC/.test(s.yt)) {
    try {
      const r = await f("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=UU" + s.yt.slice(2), { headers: { "x-goog-api-key": env.YOUTUBE_API_KEY } });
      if (r.ok) {
        const j = await r.json();
        const videos = (j.items || []).map((it) => it.snippet && { id: it.snippet.resourceId && it.snippet.resourceId.videoId, title: it.snippet.title, published: Date.parse(it.snippet.publishedAt), club: s.club }).filter((v) => v && v.id && v.title && v.published);
        return { via: "api", videos };
      }
      motivos.push("api " + r.status);
    } catch (e) { motivos.push("api red"); }
  } else if (!env.YOUTUBE_API_KEY) motivos.push("sin clave de YouTube");
  throw new Error(motivos.join(" · ") || "sin fuente");
}

const LISTA_MS = 15 * 60e3;
async function avisarPublicadas(env, f, st, noticias, now) {
  const hay = ((noticias || []).some((n) => n && n.id)) || ((st.tgPend || []).length > 0);
  if (!env.TELEGRAM_BOT_TOKEN) {
    if (hay) { st.tgUltimo = { ok: false, err: "sin token", at: now || Date.now() }; return true; }
    return false;
  }
  const nuevas = (noticias || []).filter((n) => n && n.id);
  if (!nuevas.length && !(st.tgPend || []).length) return false;
  st.tgHecho = st.tgHecho || {};
  let chat = "";
  try {
    const av = await env.PORRA.get(AVISOS_KEY, "json");
    chat = String(env.TELEGRAM_CHAT_ID || (av && av.chat) || "");
  } catch (e) {}
  const cola = (st.tgPend || []).concat(nuevas.map((n) => ({ id: n.id, title: n.title, lead: n.lead, body: n.body, thumb: n.thumb || "" }))).filter((n) => !textoConFuenteDetectada(n));
  const vistos = new Set();
  const queda = [];
  let enviados = 0;
  for (const n of cola) {
    if (!n || !n.id || vistos.has(n.id) || st.tgHecho[n.id]) continue;
    vistos.add(n.id);
    if (!chat || enviados >= 3) { queda.push(n); if (!chat) st.tgUltimo = { id: n.id, ok: false, err: "sin chat", at: now || Date.now() }; continue; }
    const res = await enviarAviso(env, f, chat, n);
    st.tgUltimo = { id: n.id, ok: !!res.ok, via: res.via || "", err: res.ok ? "" : (res.err || "no aceptado"), at: now || Date.now() };
    if (res.ok) { st.tgHecho[n.id] = st.tgUltimo.at; enviados++; }
    else queda.push(n);
  }
  const hechos = Object.keys(st.tgHecho);
  if (hechos.length > 40) hechos.slice(0, hechos.length - 40).forEach((id) => { delete st.tgHecho[id]; });
  st.tgPend = queda.slice(0, 5);
  return true;
}

// ---------- noticias escritas del club (solo las que robots.txt deja leer) ----------
export function parseSitemapNews(xml) {
  const out = [];
  for (const b of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const e = b[1];
    const loc = (e.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const title = (e.match(/<news:title>([^<]*)<\/news:title>/) || [])[1];
    const date = (e.match(/<news:publication_date>([^<]+)/) || [])[1];
    if (!loc || !title) continue;
    out.push({ url: loc.trim(), title: title.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'"), published: Date.parse(date || "") || 0 });
  }
  return out;
}
export function esNotaPrimerEquipo(url) {
  return /\/futbol\/primer-equipo\/noticias\/\d+\//.test(String(url || ""));
}
export function citaEnTitulo(title) {
  const m = String(title || "").match(/^([^:]{2,40}):\s*["«']([^"»']{10,180})["»']/);
  return m ? { speaker: m[1].trim(), frase: m[2].trim() } : null;
}
export function partidoEnTitulo(title) {
  const m = String(title || "").match(/^(.+?)\s[-–]\s(.+?):\s*.*\((\d+)\s*[-–]\s*(\d+)\)\s*$/);
  if (!m) return null;
  return { home: m[1].trim(), away: m[2].trim(), marcador: [Number(m[3]), Number(m[4])] };
}
export function citasDeHtml(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const p = m[1].replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    for (const q of p.matchAll(/["«]([^"»]{15,220})["»]/g)) {
      const frase = q[1].trim();
      if (frase && p.includes(frase)) out.push({ frase, parrafo: p });
    }
  }
  return out;
}
const MESES_FECHA = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function fechaTexto(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const mes = MESES_FECHA[Number(m[2]) - 1];
  const dia = Number(m[3]);
  if (!mes || dia < 1 || dia > 31) return "";
  return dia + " de " + mes + " de " + m[1];
}
// Solo una fecha que la fuente escribe como día de calendario. Un instante UTC
// (2026-11-08T23:02:26Z) no se convierte a Madrid: eso pasó el partido del 8 al 9.
export function fechaDeFuente(html) {
  const raw = String(html || "");
  const j = raw.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (j) return fechaTexto(j[1]);
  const vis = raw.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(20\d{2})\b/i);
  if (!vis) return "";
  return Number(vis[1]) + " de " + vis[2].toLowerCase() + " de " + vis[3];
}
export function minutosOficiales(html) {
  const text = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const out = [];
  const re = /\((\d+)\s*[-–]\s*(\d+),\s*min(?:uto)?\.?\s*(\d+)(?:\s*\+\s*(\d+))?\)/gi;
  for (const m of text.matchAll(re)) out.push({ h: Number(m[1]), a: Number(m[2]), min: Number(m[3]), extra: Number(m[4]) || 0 });
  return out;
}
// La fuente oficial (club o LaLiga) manda. Si solo hay fuentes no oficiales y no coinciden, no hay minuto.
export function elegirMinuto(lecturas) {
  const ok = (lecturas || []).filter((x) => x && Number.isFinite(Number(x.min)) && Number(x.min) >= 0 && Number(x.min) <= 130);
  const unicos = (arr) => [...new Set(arr.map((x) => Number(x.min)))];
  const oficiales = ok.filter((x) => x.oficial);
  if (oficiales.length) return unicos(oficiales).length === 1 ? unicos(oficiales)[0] : null;
  const u = unicos(ok);
  return u.length === 1 ? u[0] : null;
}
function ymdMadrid(ms) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)).replace(/-/g, "");
  } catch (e) { return ""; }
}
function ymdAdd(ymd, days) {
  const y = Number(String(ymd).slice(0, 4)), m = Number(String(ymd).slice(4, 6)), d = Number(String(ymd).slice(6, 8));
  if (!y || !m || !d) return "";
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10).replace(/-/g, "");
}
const MIN_CUERPO = { cronica: 40, rueda: 45, marcador: 8, once: 20, nota: 20 };
const PALABRAS_DE_RELLENO = new Set("el la los las un una y o de del al en con por para que se su sus le les lo es son fue fueron como mas pero tras ante sobre cuando donde este esta esto porque sin ya no si al".split(" "));
const DATOS_QUE_EXIGEN_FUENTE = ["titular", "titulares", "suplente", "banquillo", "minutos", "baja", "bajas", "lesion", "lesionado", "lesionada", "duda", "asistencia", "penalti", "expulsion"];
const PALABRAS_DE_FECHA = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|ayer";
function numerosDe(texto) {
  return new Set(String(texto || "").match(/\d+/g) || []);
}
function fraseRechazada(frase, bag) {
  const nums = numerosDe(bag);
  if ((frase.match(/\d+/g) || []).some((n) => !nums.has(n))) return true;
  const plano = norm2(frase);
  if (DATOS_QUE_EXIGEN_FUENTE.some((w) => new RegExp("\\b" + w + "\\b").test(plano) && !new RegExp("\\b" + w + "\\b").test(bag))) return true;
  const fechas = plano.match(new RegExp("\\b\\d{1,2}\\s+de\\s+(?:" + PALABRAS_DE_FECHA + ")(?:\\s+de\\s+20\\d{2})?", "g")) || [];
  if (fechas.some((d) => !bag.includes(d))) return true;
  const suelta = plano.match(new RegExp("\\b(" + PALABRAS_DE_FECHA + ")\\b", "g")) || [];
  if (suelta.some((w) => !new RegExp("\\b" + w + "\\b").test(bag))) return true;
  for (const trozo of frase.split(/\s+/)) {
    const raw = trozo.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/g, "");
    if (!raw || raw[0] !== raw[0].toUpperCase() || raw[0] === raw[0].toLowerCase()) continue;
    const n = norm2(raw);
    if (n.length < 4 || PALABRAS_DE_RELLENO.has(n)) continue;
    if (!bag.includes(n)) return true;
  }
  return false;
}
const PARADAS_TITULO = new Set("el la los las un una y o de del al en con por para que se su sus ante tras como".split(" "));
export function entradillaRepiteTitulo(titulo, entradilla) {
  const toks = (s) => norm2(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !PARADAS_TITULO.has(w) && !/^\d+$/.test(w));
  const t = toks(titulo);
  const e = toks(entradilla);
  if (!t.length || !e.length) return false;
  let i = 0;
  for (const w of e) if (w === t[i] && ++i === t.length) return true;
  return t.filter((w) => e.includes(w)).length / t.length >= 0.75;
}
export function revisarEntradilla(titulo, lead, hechos) {
  const bag = norm2(hechos);
  const frases = String(lead || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
  const ok = frases.filter((f) => !fraseRechazada(f, bag));
  const out = ok.join(" ");
  if (!out || entradillaRepiteTitulo(titulo, out)) return null;
  return out;
}
export function sujetosSeguidos(texto) {
  const frases = String(texto || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
  const cabeza = (f) => {
    const w = norm2(f).replace(/^[^a-z0-9]+/, "").split(/\s+/).filter(Boolean);
    const salto = new Set(["en", "el", "la", "los", "las", "un", "una", "y", "pero", "antes", "luego", "despues", "al", "del", "tras", "con", "para", "por"]);
    let i = 0;
    while (i < w.length && salto.has(w[i])) i++;
    return w.slice(i, i + 2).join(" ");
  };
  for (let i = 1; i < frases.length; i++) {
    const a = cabeza(frases[i - 1]), b = cabeza(frases[i]);
    if (a && a === b) return true;
  }
  return false;
}
export function depurarCuerpo(tipo, texto, hechos) {
  const bag = norm2(hechos);
  const minimo = MIN_CUERPO[tipo] || 40;
  const frases = String(texto || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
  const ok = frases.filter((frase) => !fraseRechazada(frase, bag));
  const out = ok.join(" ");
  if (!out || sujetosSeguidos(out)) return null;
  const pals = norm2(out).split(/\s+/).filter(Boolean).length;
  if (pals < minimo) return null;
  return out;
}
async function redactarCuerpo(env, f, tipo, hechos, cuenta) {
  if (!env || !env.GEMINI_API_KEY) return null;
  const guia = tipo === "rueda"
    ? "Entradilla de una frase, sin comillas: cuándo habló, si la fecha está en los hechos, y tras qué partido, si el rival está en los hechos. Luego un párrafo con la cita literal entre comillas, tal cual. Si los hechos traen titularidad, minutos, cambio o estado, cierra con un párrafo de qué implica eso para el fantasy. Si no está, no lo escribas."
    : tipo === "nota"
    ? "Uno o dos párrafos. Di que la web oficial del club ha publicado una nota. Si hay fecha en los hechos, ponla. Nombra solo a quien esté escrito y di de qué trata con esas palabras. No afirmes una lesión, una baja, un titular, unos minutos ni un resultado si esa palabra no está en los hechos. No cuentes un partido y no copies una frase de la nota."
    : "Dos o tres párrafos, separados por una línea en blanco. El primero sitúa el partido sin abrir por el nombre del goleador. Los siguientes cuentan sus goles con el minuto que figure en los hechos. El último, solo si los hechos dicen que fue titular, cuántos minutos jugó, un cambio o el estado físico, explica esa consecuencia para el fantasy. Si ese dato no está, no lo inventes y no rellenes. Sin citas y sin metáforas.";
  const prompt = "Redacta en español periodístico natural. Usa solo los hechos de abajo. Si un dato no está escrito, no lo pongas. No escribas una fecha que no esté en los hechos y no uses la fecha de hoy. No repitas el mismo sujeto al empezar dos frases seguidas. No encadenes frases con la misma plantilla. " + guia + " Devuelve solo el cuerpo.\n\nHECHOS:\n" + hechos;
  const r = await gemini(env, f, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } });
  if (cuenta) cuenta.n = (r && r.tokens) || 0;
  if (!r || r.error) return null;
  return depurarCuerpo(tipo, textoDe(r.j), hechos);
}

function minutoGol(g) {
  return Number(g.min) + (Number(g.extra) ? "+" + Number(g.extra) : "") + "'";
}
function cuentaEnPalabras(n) {
  return { 1: "un gol", 2: "dos goles", 3: "tres goles" }[n] || (n + " goles");
}
function tituloCronica(nombre, n, rival) {
  const pieza = n === 1 ? "gol" : n === 2 ? "doblete" : n === 3 ? "triplete" : "";
  if (!pieza) return nombre + " marcó " + cuentaEnPalabras(n) + " ante el " + rival;
  return (pieza === "gol" ? "El gol de " + nombre : "El " + pieza + " de " + nombre) + " ante el " + rival;
}
// Dos piezas, como en las webs de fantasy: la crónica habla de quien marcó; el marcador va en otra ficha.
// Si falta un nombre, hay propia o el marcador no cuadra, no se publica nada.
export function cronicaDesdeHechos(p) {
  if (!p || !p.home || !p.away || !Array.isArray(p.goles) || !p.goles.length) return null;
  let h = 0, a = 0;
  const buenos = [];
  for (const g of p.goles) {
    if (!g || g.og) return null;
    if (g.side !== "home" && g.side !== "away") return null;
    const name = String(g.name || "").trim();
    if (!name) return null;
    const sinMinuto = g.min == null || g.sinMinuto;
    if (!sinMinuto && (!Number.isFinite(Number(g.min)) || Number(g.min) < 0 || Number(g.min) > 130)) return null;
    if (g.side === "home") h++; else a++;
    buenos.push({ name, side: g.side, min: sinMinuto ? null : minutoGol(g) });
  }
  if (p.marcador && (Number(p.marcador[0]) !== h || Number(p.marcador[1]) !== a)) return null;
  const por = new Map();
  for (const g of buenos) por.set(g.name, (por.get(g.name) || []).concat(g));
  let protagonista = buenos[0].name, mejor = 0;
  for (const [name, gs] of por) if (gs.length >= mejor) { mejor = gs.length; protagonista = name; }
  const suyos = por.get(protagonista);
  const etiquetaMin = (g) => g.min || "sin datos";
  const cuando = suyos.map((g) => g.min ? "en el " + g.min : "sin datos de minuto").join(" y ");
  const rival = suyos[0].side === "home" ? p.away : p.home;
  const titulo = tituloCronica(protagonista, mejor, rival);
  const hechos = [
    "Partido: " + p.home + " contra " + p.away,
    "Marcador: " + h + "-" + a,
    p.fecha ? "Fecha: " + p.fecha : "",
    p.jornada ? "Jornada: " + p.jornada : "",
    p.efecto ? "Clasificación: " + p.efecto : "",
  ].filter(Boolean).concat(buenos.map((g) => "Gol: " + g.name + ", equipo " + (g.side === "home" ? p.home : p.away) + ", minuto " + etiquetaMin(g))).join("\n");
  let lead = (p.jornada ? "Jornada " + p.jornada + ". " : "") + (p.fecha ? p.fecha + ". " : "") + p.home + " y " + p.away + " acabaron " + h + "-" + a + ".";
  if (p.efecto) lead += " " + String(p.efecto).trim();
  if (entradillaRepiteTitulo(titulo, lead)) lead = "El partido acabó " + h + "-" + a + ".";
  const ficha = {
    title: (p.jornada ? "Jornada " + p.jornada + ": " : "") + p.home + " " + h + "-" + a + " " + p.away,
    lead: "Goles: " + buenos.map((g) => g.name + " " + etiquetaMin(g)).join(", ") + ".",
    body: buenos.map((g) => g.name + " " + etiquetaMin(g)).join("\n"),
    players: [...new Set(buenos.map((g) => g.name))],
  };
  const cronica = {
    title: titulo,
    lead,
    body: protagonista + (mejor > 1 ? " firmó " + cuentaEnPalabras(mejor) : " marcó") + " " + cuando + ". El partido acabó " + h + "-" + a + ".",
    hechos,
    players: [protagonista],
  };
  return { title: cronica.title, lead: cronica.lead, body: cronica.body, players: cronica.players, hechos, cronica, ficha };
}
export function cronicaDesdeEv(home, away, ev, marcador, extra) {
  if (!ev || !Array.isArray(ev.g) || !ev.g.length) return null;
  const oficiales = (extra && extra.oficiales) || [];
  const nombre = (id, side) => {
    const bag = side === "home" ? ev.home : ev.away;
    const all = [].concat((bag && bag.st) || [], (bag && bag.sb) || []);
    const hits = all.filter((x) => x && String(x[0]) === String(id) && x[1]);
    return hits.length === 1 ? String(hits[0][1]) : "";
  };
  const goles = [];
  let hh = 0, aa = 0;
  for (const g of ev.g) {
    if (!g || g.og) return null;
    const side = g.h ? "home" : "away";
    const name = nombre(g.p, side);
    if (!name) return null;
    if (side === "home") hh++; else aa++;
    const of = oficiales.find((o) => o && o.h === hh && o.a === aa);
    const lecturas = [{ min: Number(g.m), oficial: false }];
    if (of) lecturas.push({ min: of.min, oficial: true });
    const elegido = elegirMinuto(lecturas);
    goles.push({ name, min: elegido == null ? null : elegido, extra: elegido != null && of && elegido === of.min ? (of.extra || 0) : (Number(g.x) || 0), side, sinMinuto: elegido == null });
  }
  const out = cronicaDesdeHechos({ home, away, goles, marcador, fecha: (extra && extra.fecha) || "", jornada: extra && extra.jornada, efecto: extra && extra.efecto });
  if (!out) return null;
  const protagonista = out.players[0];
  const suyo = goles.find((g) => g.name === protagonista);
  const bag = suyo && (suyo.side === "home" ? ev.home : ev.away);
  const st = (bag && bag.st) || [];
  const iguales = st.filter((x) => x && x[1] && mismaPersona(protagonista, x[1]));
  if (iguales.length === 1) {
    const linea = protagonista + " salió de titular";
    out.hechos = out.hechos + "\n" + linea;
    out.cronica.hechos = out.hechos;
  }
  return out;
}
function mismaPersona(a, b) {
  const x = norm2(a), y = norm2(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const toks = (s) => s.split(" ").filter((w) => w.length > 3);
  const pa = toks(x), pb = toks(y);
  if (!pa.length || !pb.length) return false;
  const corto = pa.length <= pb.length ? pa : pb;
  const largo = pa.length <= pb.length ? pb : pa;
  return corto.every((w) => largo.includes(w));
}
function temaDeFrase(frase) {
  const texto = norm(frase);
  for (const tema of ["gestion_fisica", "tactica", "cambios", "minutos", "rendimiento", "valoracion"]) {
    if ((PISTAS_TEMA[tema] || []).some((p) => texto.includes(p))) return tema;
  }
  return "";
}
function quienEnFrase(frase, plantilla) {
  const texto = norm(frase);
  return (plantilla || []).filter((pl) => pl && ultimaClave(clavesJugador(pl.name, pl.name), texto) >= 0);
}

async function hechosPartido(f, home, away, ms) {
  const base = ymdMadrid(ms);
  const dias = [base, ymdAdd(base, -1)].filter(Boolean);
  for (const d of dias) {
    try {
      const r = await f(SITE + "fm-partido?d=" + d + "&h=" + encodeURIComponent(home) + "&a=" + encodeURIComponent(away), { headers: { "user-agent": "edumr-cron" } });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.ev && Array.isArray(j.ev.g) && j.ev.g.length) return j.ev;
    } catch (e) {}
  }
  return null;
}

// Una noticia escrita del club por pasada. No copia el artículo: o citas literales, o goles del partido si cuadran.
async function unaNoticiaWeb(env, f, st, now, fuentes) {
  const fuentesWeb = (fuentes || []).filter((s) => s.noticias);
  if (!fuentesWeb.length) return null;
  st.web = st.web || {};
  for (const s of fuentesWeb) {
    let origin = "";
    try { origin = new URL(s.noticias).origin; } catch (e) { continue; }
    const robots = await leerRobots(f, origin);
    if (!robotsPermite(robots, s.noticias)) {
      st.fuentes = st.fuentes || {};
      st.fuentes[s.club] = Object.assign({}, st.fuentes[s.club], { web: robots ? "robots prohíbe las noticias" : "robots de la web ilegible", webAt: now });
      return { dirty: true };
    }
    let lista = [];
    try {
      const r = await f(s.noticias, { headers: UA_RED });
      if (!r.ok) throw new Error("sitemap " + r.status);
      lista = parseSitemapNews(await r.text());
    } catch (e) {
      st.fuentes = st.fuentes || {};
      st.fuentes[s.club] = Object.assign({}, st.fuentes[s.club], { web: String(e && e.message || e).slice(0, 80), webAt: now });
      return { dirty: true };
    }
    const pendiente = lista.find((n) => {
      const id = (String(n.url).match(/\/noticias\/(\d+)\//) || [])[1];
      if (!id || !esNotaPrimerEquipo(n.url)) return false;
      const prev = st.web[id];
      if (prev && (prev.status === "ok" || prev.status === "caducada" || (prev.intentos || 0) >= 4)) return false;
      if (now - n.published > EDAD_MAX || n.published > now + 3600e3) return false;
      return !!(citaEnTitulo(n.title) || partidoEnTitulo(n.title));
    });
    if (!pendiente) continue;
    const id = (pendiente.url.match(/\/noticias\/(\d+)\//) || [])[1];
    const slot = st.web[id] || { intentos: 0 };
    slot.intentos = (slot.intentos || 0) + 1;
    slot.last = now;
    slot.title = pendiente.title;
    slot.pub = pendiente.published;
    if (!robotsPermite(robots, pendiente.url)) { slot.status = "ok"; slot.err = "robots prohíbe el artículo"; st.web[id] = slot; return { dirty: true }; }
    let html = "";
    try {
      const r = await f(pendiente.url, { headers: UA_RED });
      if (!r.ok) throw new Error("html " + r.status);
      html = await r.text();
    } catch (e) { slot.err = String(e && e.message || e).slice(0, 80); st.web[id] = slot; return { dirty: true }; }
    const partido = partidoEnTitulo(pendiente.title);
    if (partido) {
      const ev = await hechosPartido(f, partido.home, partido.away, pendiente.published);
      const cronica = cronicaDesdeEv(partido.home, partido.away, ev, partido.marcador, { oficiales: minutosOficiales(html), fecha: fechaDeFuente(html) });
      slot.status = "ok"; slot.n = cronica ? 1 : 0; slot.err = cronica ? "" : "sin datos del partido que cuadren";
      st.web[id] = slot;
      if (!cronica) return { dirty: true };
      const res = {
        id: "cronica-" + id, club: s.club, title: cronica.title, pub: pendiente.published, url: pendiente.url,
        fuente: "Según FotMob", lead: "Según los datos del partido. El marcador coincide con la web oficial del club.",
        sinMiniatura: true, speaker: "",
        items: [{ jugador: "", nombre: partido.home + " - " + partido.away, estado: "valoracion", tema: "valoracion", frase: cronica.body.replace(/^Goles: /, "").replace(/\.$/, ""), minuto: "", confianza: "alta", publicable: true, verificada: true, cruzado: false }],
      };
      // La crónica no pasa por el filtro de citas: el cuerpo ya son solo los goles comprobados.
      const piezas = [
        { suf: "cronica", data: cronica.cronica },
        { suf: "marcador", data: cronica.ficha },
      ];
      let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
      const pubs = [];
      for (const pz of piezas) {
        const key = pz.suf + "-" + id;
        // La misma clave ya está publicada: no se crea otra ni se avisa otra vez por Telegram.
        if (own.some((o) => o.key === key)) continue;
        let cuerpo = pz.data.body;
        let lead = pz.data.lead;
        if (pz.suf === "cronica") {
          lead = revisarEntradilla(pz.data.title, pz.data.lead, pz.data.hechos || "");
          cuerpo = lead && pz.data.hechos ? await redactarCuerpo(env, f, "cronica", pz.data.hechos) : null;
          if (!cuerpo || !lead) continue;
        }
        const thumb = await fotoDeMercado(f, pz.data.players);
        const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        pubs.push({ id: hex, status: "published", expira: true, createdAt: now, updatedAt: now, publishedAt: now, thumb, club: s.club, players: pz.data.players, key, source: { name: "Según FotMob", url: pendiente.url, videoId: "" }, title: pz.data.title, lead, body: cuerpo, via: pz.suf === "cronica" ? "ia" : "datos" });
        own.unshift(pubs[pubs.length - 1]);
      }
      if (!pubs.length) return { dirty: true };
      await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
      return { dirty: true, noticias: pubs, id: "cronica-" + id };
    }
    const citas = citasDeHtml(html);
    const titular = citaEnTitulo(pendiente.title);
    if (titular && html.includes(titular.frase) && !citas.some((c) => c.frase === titular.frase)) citas.unshift({ frase: titular.frase, parrafo: titular.frase });
    let plantilla = [];
    try {
      const r = await f(SITE + "mercado", { headers: { "user-agent": "edumr-cron" } });
      plantilla = ((await r.json()).players || []).filter((p) => sameTeam(p.team, s.club)).map((p) => ({ id: p.id, name: p.name }));
    } catch (e) {}
    const texto = citas.map((c) => c.parrafo).join(" ");
    const crudos = [];
    for (const c of citas) {
      const quienes = quienEnFrase(c.frase, plantilla);
      if (quienes.length > 1) continue;
      const tema = temaDeFrase(c.frase);
      if (!tema) continue;
      crudos.push({ jugador: quienes.length === 1 ? quienes[0].name : "", nombre: quienes.length === 1 ? quienes[0].name : (titular && titular.speaker) || "", tema, estado: "", frase: c.frase, minuto: "", confianza: "alta" });
    }
    const items = filtrar(crudos, texto, plantilla).filter((x) => x.publicable).slice(0, 4);
    slot.status = "ok"; slot.n = items.length; slot.err = items.length ? "" : "sin citas que cuadren";
    st.web[id] = slot;
    if (!items.length) return { dirty: true };
    const cerca = lista.find((n) => {
      const p = n.url !== pendiente.url && partidoEnTitulo(n.title);
      return p && Math.abs((n.published || 0) - (pendiente.published || 0)) < 6 * 3600e3;
    });
    const partidoCerca = cerca ? partidoEnTitulo(cerca.title) : null;
    const res = { id: "web-" + id, club: s.club, title: pendiente.title, pub: pendiente.published, url: pendiente.url, oficial: true, speaker: titular && titular.speaker || "", sinMiniatura: true, items, cuando: fechaDeFuente(html), partidoTexto: partidoCerca ? "Partido: " + partidoCerca.home + " contra " + partidoCerca.away + ". Marcador: " + partidoCerca.marcador[0] + "-" + partidoCerca.marcador[1] : "" };
    let noticias = [];
    try { noticias = await publicarNoticias(env, f, res, now, { sinIa: false }); } catch (e) { slot.err = "publicar"; }
    return { dirty: true, noticias, id: "web-" + id };
  }
  return null;
}

// ---------- pistas de tema (nunca son la fuente) ----------
// Un proceso de fuera escribe rd:pistas:v1. Aquí solo se usa para saber a quién buscar.
// El dato sale de la web oficial del club o de una transcripción ya verificada. Nunca de X:
// no se cita, no se enlaza y no se copia el texto de la pista.
const PISTAS_KEY = "rd:pistas:v1";
const PISTAS_MS = 2 * 60e3;
const PISTAS_TTL = 72 * 3600e3;
const TIPOS_PISTA = new Set(["lesion", "rueda", "cronica", "once", "convocatoria", "mercado", "otro"]);
export function clubProhibido(nombre) {
  const t = norm2(nombre);
  return /\bathletic\b|\bbilbao\b|\balaves\b/.test(t);
}
export function pistaAceptable(p) {
  if (!p || typeof p.id !== "string" || !p.id.trim() || !TIPOS_PISTA.has(p.tipo)) return { ok: false, motivo: "pista mal formada" };
  if (clubProhibido(p.equipo)) return { ok: false, motivo: "club prohibido" };
  const blob = [p.id, p.tema, p.equipo, p.entrenador].concat(p.jugadores || []).join(" ");
  if (/https?:|x\.com|twitter\.com|\bt\.co\b/i.test(blob)) return { ok: false, motivo: "pista con enlace" };
  if (p.tema && String(p.tema).length > 180) return { ok: false, motivo: "pista mal formada" };
  return { ok: true };
}
function apellidosPista(p) {
  return [p.entrenador].concat(p.jugadores || []).map((n) => norm2(n).split(/\s+/).filter((w) => w.length > 3).pop()).filter(Boolean);
}
export function pistasATratar(doc, vistas, now) {
  const items = (doc && Number(doc.v) === 1 && Array.isArray(doc.items) ? doc.items : []).slice(0, 200);
  const sig = {};
  for (const [id, v] of Object.entries(vistas || {})) {
    if (v && now - Number(v.at || 0) < PISTAS_TTL) sig[id] = v;
  }
  // Un tema descartado por falta de nota oficial se reintenta una vez con la noticia de otra web
  const reintento = (p) => { const v = sig[p.id]; return !!(p.ref && v && v.estado === "descartada" && v.ext !== 2 && ["sin fuente permitida", "sin hecho verificado", "robots prohíbe la fuente", "no pasa la revisión", "no se pudo leer", "sin hecho ni dato"].includes(v.motivo)); };
  const nuevas = items.filter((p) => p && p.id && (!sig[p.id] || reintento(p)));
  nuevas.sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));
  return { sig, nuevas };
}
const PISTAS_POR_CICLO = 12;
const PISTA_VENTANA = 48 * 3600e3;
export function notaParaPista(pista, notas, now) {
  const nombres = apellidosPista(pista);
  const tema = norm2(pista.tema || "").split(/\s+/).filter((w) => w.length > 4);
  const tipoClave = { lesion: ["lesion", "molest", "baja", "entren"], rueda: ["habla", "rueda", "analiza", "valora"], once: ["alineacion", "once"], convocatoria: ["convoc"], mercado: ["mercado", "fichaj", "entrenador"], cronica: ["gol", "entren"], otro: ["entren", "internacional"] }[pista.tipo] || [];
  let best = null, score = 0;
  for (const n of notas || []) {
    if (!n || !n.url) continue;
    if (n.published && now && now - n.published > PISTAS_TTL) continue;
    const t = norm2((n.title || "") + " " + n.url);
    let s = 0, propio = 0;
    for (const nom of nombres) if (t.includes(nom)) { s += 5; propio += 5; }
    for (const w of tema) if (t.includes(w)) { s += 1; propio += 1; }
    for (const c of tipoClave) if (t.includes(c)) s += 2;
    if (propio > 0 && s > score) { score = s; best = n; }
  }
  return score >= 2 ? best : null;
}
export function pistaDuplicada(pista, own, now) {
  const nombres = apellidosPista(pista);
  const cuandoP = Date.parse(pista.at || "") || now || 0;
  return (own || []).some((o) => {
    if (!o || o.status !== "published") return false;
    if (o.key && String(o.key).indexOf("pista-" + pista.id) === 0) return true;
    if (pista.fuenteUrl && o.source && o.source.url && o.source.url === pista.fuenteUrl) return true;
    if (!o.tipo || !pista.tipo || o.tipo !== pista.tipo) return false;
    const cuandoO = o.publishedAt || o.createdAt || 0;
    if (!cuandoP || !cuandoO || Math.abs(cuandoP - cuandoO) > PISTA_VENTANA) return false;
    const bag = norm2([o.title, o.lead].concat(o.players || []).join(" "));
    return nombres.some((n) => bag.includes(n));
  });
}
export function hechosDesdeNota(html, title, pista, club) {
  const text = norm2(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  const bolsa = norm2(title) + " " + text;
  const nombres = apellidosPista(pista).filter((n) => bolsa.includes(n));
  const tema = norm2(pista.tema || "").split(/\s+/).filter((w) => w.length > 4 && bolsa.includes(w));
  const coach = pista.entrenador && bolsa.includes(norm2(pista.entrenador)) ? pista.entrenador : "";
  if (!nombres.length && !tema.length && !coach) return "";
  const fecha = fechaDeFuente(html);
  return [
    "Club: " + (club || pista.equipo || ""),
    fecha ? "Fecha: " + fecha : "",
    coach ? "Entrenador escrito en la nota oficial: " + coach : "",
    nombres.length ? "Nombres escritos en la nota oficial: " + nombres.join(", ") : "",
    tema.length ? "La nota oficial trata de: " + tema.join(", ") : "",
  ].filter(Boolean).join("\n");
}
export function enlacesDeSitemap(xml) {
  const out = [];
  for (const b of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const e = b[1];
    const loc = (e.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    if (!loc) continue;
    const title = (e.match(/<news:title>([^<]*)<\/news:title>/) || [])[1];
    const date = (e.match(/<news:publication_date>([^<]+)/) || [])[1] || (e.match(/<lastmod>([^<]+)/) || [])[1];
    const slug = decodeURIComponent(loc.split("/").filter(Boolean).pop() || "").replace(/[-_]+/g, " ");
    out.push({ url: loc.trim(), title: title ? title.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'") : slug, published: Date.parse(date || "") || 0 });
  }
  return out;
}
// Sitemap, RSS o el HTML del listado (enlaces y el JSON que algunas webs meten en la página).
export function enlacesDeFuente(body, pageUrl) {
  const raw = String(body || "");
  const xml = enlacesDeSitemap(raw);
  if (xml.length) return xml;
  const rss = [];
  for (const m of raw.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const link = (m[1].match(/<link>([^<]+)<\/link>/) || [])[1];
    const title = (m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
    const date = (m[1].match(/<pubDate>([^<]+)/) || [])[1];
    if (link) rss.push({ url: link.trim(), title: String(title || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim(), published: Date.parse(date || "") || 0 });
  }
  if (rss.length) return rss;
  let origin = "";
  try { origin = new URL(pageUrl).origin; } catch (e) {}
  const out = [];
  const seen = new Set();
  const push = (url, title, published) => {
    if (!url || seen.has(url) || dominioProhibido(url)) return;
    seen.add(url);
    out.push({ url, title: title || "", published: published || 0 });
  };
  const nd = raw.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nd && origin) {
    try {
      const walk = (o) => {
        if (o && typeof o === "object" && !Array.isArray(o) && typeof o.slug === "string" && o.slug.includes("-") && o.publishedAt && typeof o.title === "string") {
          push(origin + "/noticias/" + o.slug, o.title, Date.parse(o.publishedAt) || 0);
        }
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === "object") Object.values(o).forEach(walk);
      };
      walk(JSON.parse(nd[1]));
    } catch (e) {}
  }
  if (out.length) return out;
  for (const m of raw.matchAll(/href="([^"]+)"/g)) {
    let href = m[1];
    if (href.startsWith("/")) { try { href = new URL(href, pageUrl).href; } catch (e) { continue; } }
    let u;
    try { u = new URL(href); } catch (e) { continue; }
    if (origin && u.origin !== origin) continue;
    const path = decodeURIComponent(u.pathname);
    const hy = (path.match(/-/g) || []).length;
    const esNoticia = /\/noticias?\//.test(path) && hy >= 1 && path.replace(/\/+$/, "").split("/").pop().length > 8;
    const raiz = path.split("/").filter(Boolean).length === 1 && hy >= 3;
    if (!esNoticia && !raiz) continue;
    push(u.origin + u.pathname, path.split("/").filter(Boolean).pop().replace(/[-_]+/g, " "), 0);
  }
  return out;
}
function sumaPista(st, campo, motivo) {
  const n = st.pistasN || { recibidas: 0, verificadas: 0, publicadas: 0, descartadas: 0, motivos: {} };
  if (campo) n[campo] = (n[campo] || 0) + 1;
  if (motivo) n.motivos[motivo] = (n.motivos[motivo] || 0) + 1;
  st.pistasN = n;
}
function itemsDeCitas(html, title, plantilla) {
  const citas = citasDeHtml(html);
  const titular = citaEnTitulo(title);
  if (titular && html.includes(titular.frase) && !citas.some((c) => c.frase === titular.frase)) citas.unshift({ frase: titular.frase, parrafo: titular.frase });
  const texto = citas.map((c) => c.parrafo).join(" ");
  const crudos = [];
  for (const c of citas) {
    const quienes = quienEnFrase(c.frase, plantilla);
    if (quienes.length > 1) continue;
    const tema = temaDeFrase(c.frase);
    if (!tema) continue;
    crudos.push({ jugador: quienes.length === 1 ? quienes[0].name : "", nombre: quienes.length === 1 ? quienes[0].name : (titular && titular.speaker) || "", tema, estado: "", frase: c.frase, minuto: "", confianza: "alta" });
  }
  return filtrar(crudos, texto, plantilla).filter((x) => x.publicable);
}
const DETECCION_MS = 10 * 60e3;
const DETECCION = [
  { origen: "futbolfantasy", url: "https://www.futbolfantasy.com/sitemap-news.xml" },
  { origen: "comuniate", url: "https://www.comuniate.com/sitemap_news.xml" },
];
const ALIAS_CLUB = [
  ["real sociedad", "Real Sociedad"], ["real madrid", "Real Madrid"], ["rayo vallecano", "Rayo Vallecano"], ["rayo", "Rayo Vallecano"],
  ["atletico de madrid", "Atlético"], ["atletico", "Atlético"], ["atleti", "Atlético"],
  ["deportivo alaves", "Alavés"], ["alaves", "Alavés"], ["athletic", "Athletic"], ["bilbao", "Athletic"],
  ["barcelona", "Barcelona"], ["barca", "Barcelona"], ["espanyol", "Espanyol"], ["espanol", "Espanyol"],
  ["villarreal", "Villarreal"], ["valencia", "Valencia"], ["sevilla", "Sevilla"], ["levante", "Levante"],
  ["malaga", "Málaga"], ["getafe", "Getafe"], ["osasuna", "Osasuna"], ["celta", "Celta"], ["elche", "Elche"],
  ["girona", "Girona"], ["mallorca", "Mallorca"], ["oviedo", "Oviedo"], ["racing", "Racing"],
  ["deportivo", "Deportivo"], ["depor", "Deportivo"], ["coruna", "Deportivo"],
];
const ENTRENADORES = ["flick", "simeone", "aguirre", "pellegrini", "ancelotti", "arrasate", "alguacil", "bordalas", "giraldez", "michel"];
const NO_JUGADOR = new Set("el la los las del para con por una como ante tras sobre pese parte medico lista jornada copa fifa seleccion selecciones fantasy comunio biwenger marca mister futmondo laliga portadas hoy bueno mala sorpresa alineaciones alineacion confirmadas confirmada probables probable noviembre internacional internacionales real club futbol entre del".split(" "));
export function textoConFuenteDetectada(item) {
  const s = item && item.source;
  const blob = [item && item.title, item && item.lead, item && item.body, item && item.url, s && s.url, s && s.name].join(" ");
  return /futbolfantasy\.com|comuniate\.com|twitter\.com|\bx\.com\b/i.test(blob);
}
function equiposEnTitulo(titulo) {
  const t = norm2(titulo);
  const hits = [];
  for (const [alias, nombre] of ALIAS_CLUB) {
    const re = new RegExp("\\b" + alias + "\\b", "g");
    let m;
    while ((m = re.exec(t))) hits.push({ nombre, i: m.index, len: alias.length });
  }
  hits.sort((a, b) => b.len - a.len || a.i - b.i);
  const kept = [];
  for (const h of hits) {
    if (kept.some((k) => h.i >= k.i && h.i < k.i + k.len)) continue;
    if (kept.some((k) => k.nombre === h.nombre)) continue;
    kept.push(h);
  }
  return kept.map((h) => h.nombre);
}
function tipoDeTitulo(titulo) {
  const t = norm2(titulo);
  if (/lesion|lesionad|molest|parte medico|baja|rotura|tobillo|rodilla|angina|problema fisico/.test(t)) return "lesion";
  if (/alineacion|once probable|once confirmad|probables|confirmad/.test(t)) return "once";
  if (/convoc/.test(t)) return "convocatoria";
  if (/mercado|fichaj|nuevo entrenador/.test(t)) return "mercado";
  if (/\bhabla\b|analiza|valora|explica|repasa/.test(t)) return "rueda";
  return "otro";
}
function nombresEnTitulo(titulo, equipos) {
  const equipoTok = new Set(equipos.flatMap((e) => norm2(e).split(/\s+/)));
  const toks = String(titulo || "").split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/).filter(Boolean);
  const jugadores = [];
  let entrenador = "";
  let buf = [];
  const cerrar = () => {
    if (buf.length) jugadores.push(buf.join(" "));
    buf = [];
  };
  for (const raw of toks) {
    const n = norm2(raw);
    const nombre = raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase() && n.length >= 4 && !NO_JUGADOR.has(n) && !equipoTok.has(n) && !ENTRENADORES.includes(n);
    if (nombre) buf.push(raw);
    else cerrar();
    if (!entrenador && ENTRENADORES.includes(n)) entrenador = raw;
  }
  cerrar();
  return { jugadores: jugadores.slice(0, 6), entrenador };
}
// Si el titular no nombra al club, se mira el final del enlace y, si no, el club de los jugadores que nombra (mercado de Futmondo)
function equiposDeNota(n, plantillas) {
  const slug = decodeURIComponent(String(n.url || "").split("/").filter(Boolean).pop() || "").replace(/^\d+-/, "").replace(/[-_]+/g, " ");
  let eq = equiposEnTitulo(n.title);
  if (!eq.length) eq = equiposEnTitulo(slug);
  if (!eq.length && plantillas && plantillas.length) {
    const toks = String(n.title).split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/).filter((w) => w.length >= 4).map(norm2);
    const hit = new Set();
    for (const t of toks) {
      const m = plantillas.filter((p) => { const parts = norm2(p.name).split(/\s+/); return parts.includes(t) && (parts.length === 1 || parts[parts.length - 1] === t || parts[0] === t); });
      if (m.length === 1) hit.add(m[0].team);
    }
    if (hit.size === 1) eq = equiposEnTitulo([...hit][0]);
  }
  return eq;
}
export function pistasDesdeTitulares(notas, origen, now, plantillas) {
  const out = [];
  const seen = new Set();
  for (const n of notas || []) {
    if (!n || !n.title || !n.url) continue;
    const todos = equiposDeNota(n, plantillas);
    const equipos = todos.filter((e) => !clubProhibido(e));
    if (!equipos.length) continue;
    if (todos.length && todos.every(clubProhibido)) continue;
    const tipo = tipoDeTitulo(n.title);
    const quienes = nombresEnTitulo(n.title, equipos);
    const num = (String(n.url).match(/\/(\d{3,})/) || [])[1] || "";
    if (!num) continue;
    const pref = origen === "comuniate" ? "cm-" : "ff-";
    for (const equipo of equipos) {
      const id = pref + num + "-" + norm2(equipo).replace(/\s+/g, "-");
      if (seen.has(id)) continue;
      seen.add(id);
      const tema = (tipo === "lesion" ? "lesión" : tipo) + (quienes.entrenador ? " de " + quienes.entrenador : quienes.jugadores.length ? " de " + quienes.jugadores.slice(0, 3).join(", ") : "");
      out.push({ id, at: n.published ? new Date(n.published).toISOString() : new Date(now || Date.now()).toISOString(), tipo, equipo, jugadores: quienes.jugadores, entrenador: quienes.entrenador || "", tema, origen, ref: String(n.url) });
    }
  }
  return out;
}
export function mezclarPistas(doc, nuevas) {
  const items = [];
  const seen = new Set();
  for (const p of [].concat(nuevas || [], (doc && doc.items) || [])) {
    if (!p || !p.id || seen.has(p.id) || clubProhibido(p.equipo)) continue;
    if (textoConFuenteDetectada(p)) continue;
    seen.add(p.id);
    items.push(p);
    if (items.length >= 200) break;
  }
  return { v: 1, items };
}
async function detectarTemas(env, f, st, now) {
  st.deteccion = st.deteccion || {};
  let doc = { v: 1, items: [] };
  try { doc = (await env.PORRA.get(PISTAS_KEY, "json")) || doc; } catch (e) {}
  let nuevas = [];
  let plantillas = [];
  try { const r = await f(SITE + "mercado", { headers: { "user-agent": "edumr-cron" } }); plantillas = ((await r.json()).players || []).map((p) => ({ name: p.name, team: p.team })); } catch (e) {}
  for (const src of DETECCION) {
    let origin = "";
    try { origin = new URL(src.url).origin; } catch (e) {}
    const robots = origin ? await leerRobots(f, origin) : null;
    if (!robotsPermite(robots, src.url)) {
      st.deteccion[src.origen] = { ok: false, at: now, n: 0, err: robots ? "robots" : "robots ilegible" };
      continue;
    }
    try {
      const r = await f(src.url, { headers: UA_RED });
      if (!r.ok) throw new Error("lista " + r.status);
      const notas = enlacesDeSitemap(await r.text()).slice(0, 80);
      const pistas = pistasDesdeTitulares(notas, src.origen, now, plantillas);
      nuevas = nuevas.concat(pistas);
      st.deteccion[src.origen] = { ok: true, at: now, n: pistas.length, err: "" };
    } catch (e) {
      st.deteccion[src.origen] = { ok: false, at: now, n: 0, err: String(e && e.message || e).slice(0, 80) };
    }
  }
  if (nuevas.length) {
    try { await env.PORRA.put(PISTAS_KEY, JSON.stringify(mezclarPistas(doc, nuevas))); } catch (e) {}
  }
  st.deteccionAt = now;
  return { dirty: true };
}

async function tratarPistas(env, f, st, now, fuentes) {
  let doc = null;
  try { doc = await env.PORRA.get(PISTAS_KEY, "json"); } catch (e) { return null; }
  st.pistas = st.pistas || {};
  const antes = Object.keys(st.pistas).length;
  const prep = pistasATratar(doc, st.pistas, now);
  st.pistas = prep.sig;
  const lote = prep.nuevas.slice(0, PISTAS_POR_CICLO);
  if (!lote.length) return { dirty: Object.keys(prep.sig).length !== antes };
  const todas = [];
  const listas = new Map();
  for (const pista of lote) {
    if (st.tok.n >= MAX_TOKENS_DIA) break;
    const una = await tratarUnaPista(env, f, st, now, fuentes, pista, listas);
    if (una && una.noticias) todas.push.apply(todas, una.noticias);
  }
  return { dirty: true, noticias: todas };
}
async function tratarUnaPistaOficial(env, f, st, now, fuentes, pista, listas) {
  const aceptable = pistaAceptable(pista);
  sumaPista(st, "recibidas");
  st.pistas[pista.id] = { at: now, estado: "descartada", motivo: aceptable.ok ? "" : aceptable.motivo };
  if (!aceptable.ok) { sumaPista(st, "descartadas", aceptable.motivo); return null; }
  let own = [];
  try { own = (await env.PORRA.get(OWN_KEY, "json")) || []; } catch (e) {}
  if (pistaDuplicada(pista, own, now)) {
    st.pistas[pista.id].motivo = "ya publicada";
    sumaPista(st, "descartadas", "ya publicada");
    return { dirty: true };
  }
  const fuente = (fuentes || []).find((s) => s && (sameTeam(s.club, pista.equipo) || sameTeam(pista.equipo, s.club)));
  if (!fuente || !fuente.noticias || clubProhibido(fuente.club)) {
    st.pistas[pista.id].motivo = "sin fuente permitida";
    sumaPista(st, "descartadas", "sin fuente permitida");
    return { dirty: true };
  }
  let origin = "";
  try { origin = new URL(fuente.noticias).origin; } catch (e) {}
  const robots = origin ? await leerRobots(f, origin) : null;
  if (!robotsPermite(robots, fuente.noticias)) {
    st.pistas[pista.id].motivo = "robots prohíbe la fuente";
    sumaPista(st, "descartadas", "robots prohíbe la fuente");
    return { dirty: true };
  }
  let notas = listas.get(fuente.noticias);
  if (!notas) {
    notas = [];
    try {
      const r = await f(fuente.noticias, { headers: UA_RED });
      if (r.ok) notas = enlacesDeFuente(await r.text(), fuente.noticias);
    } catch (e) {}
    listas.set(fuente.noticias, notas);
  }
  const nota = notaParaPista(pista, notas, now);
  if (!nota || !robotsPermite(robots, nota.url)) {
    st.pistas[pista.id].motivo = "sin fuente permitida";
    sumaPista(st, "descartadas", "sin fuente permitida");
    return { dirty: true };
  }
  let html = "";
  try {
    const r = await f(nota.url, { headers: UA_RED });
    if (r.ok) html = await r.text();
  } catch (e) {}
  let plantilla = [];
  try {
    const r = await f(SITE + "mercado", { headers: { "user-agent": "edumr-cron" } });
    plantilla = ((await r.json()).players || []).filter((p) => sameTeam(p.team, fuente.club)).map((p) => ({ id: p.id, name: p.name }));
  } catch (e) {}
  const items = itemsDeCitas(html, nota.title, plantilla);
  if (!items.length) {
    // «X en la nota del Y» no cuenta nada: no se publica (Edu 09/11/2026). Se prueba con el hecho de otra web.
    st.pistas[pista.id].motivo = "sin hecho verificado";
    sumaPista(st, "descartadas", "sin hecho verificado");
    return null;
  }
  const hechos = items.length ? "" : hechosDesdeNota(html, nota.title, pista, fuente.club);
  if (!items.length && !hechos) {
    st.pistas[pista.id].motivo = "sin hecho verificado";
    sumaPista(st, "descartadas", "sin hecho verificado");
    return null;
  }
  if (!items.length) {
    const cuenta = { n: 0 };
    const cuerpo = await redactarCuerpo(env, f, "nota", hechos, cuenta);
    st.tok.n += cuenta.n || 0;
    const personas = [pista.entrenador].concat(pista.jugadores || []).filter((n) => {
      const ap = norm2(n).split(/\s+/).filter((w) => w.length > 3).pop();
      return ap && norm2(hechos).includes(ap);
    });
    const title = personas.length ? personas[0] + " en la nota del " + fuente.club : "Nota oficial del " + fuente.club;
    const lead = revisarEntradilla(title, "La web oficial del " + fuente.club + " publica una nota.", hechos);
    if (!cuerpo || !lead || textoConFuenteDetectada({ title, lead, body: cuerpo, source: { url: nota.url } })) {
      st.pistas[pista.id].motivo = "sin hecho verificado";
      sumaPista(st, "descartadas", "sin hecho verificado");
      return null;
    }
    const key = "pista-" + pista.id;
    if (own.some((o) => o.key === key)) {
      st.pistas[pista.id].motivo = "ya publicada";
      sumaPista(st, "descartadas", "ya publicada");
      return null;
    }
    sumaPista(st, "verificadas");
    const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const item = { id: hex, status: "published", expira: true, createdAt: now, updatedAt: now, publishedAt: now, thumb: "", tipo: pista.tipo || "", club: fuente.club, players: personas, key, source: { name: "OFICIAL · " + fuente.club, url: nota.url, videoId: "" }, title, lead, body: cuerpo, via: "ia" };
    own.unshift(item);
    try { await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300))); } catch (e) {}
    st.pistas[pista.id] = { at: now, estado: "publicada", motivo: "" };
    sumaPista(st, "publicadas");
    return { noticias: [item] };
  }
  sumaPista(st, "verificadas");
  const titular = citaEnTitulo(nota.title);
  const res = { id: "pista-" + pista.id, club: fuente.club, title: nota.title, pub: nota.published || Date.parse(pista.at || "") || now, url: nota.url, oficial: true, speaker: (titular && titular.speaker) || pista.entrenador || "", sinMiniatura: true, items, cuando: fechaDeFuente(html), tipo: pista.tipo || "" };
  let noticias = [];
  try { noticias = await publicarNoticias(env, f, res, now, { sinIa: st.tok.n >= MAX_TOKENS_DIA }); } catch (e) { noticias = []; }
  if (!noticias.length) {
    st.pistas[pista.id].motivo = "ya publicada";
    sumaPista(st, "descartadas", "ya publicada");
    return { dirty: true };
  }
  st.tok.n += noticias.reduce((a, n) => a + (n.tokens || 0), 0);
  st.pistas[pista.id] = { at: now, estado: "publicada", motivo: "" };
  sumaPista(st, "publicadas");
  return { dirty: true, noticias };
}


// ---------- tema de otra web, reescrito con palabras propias ----------
// Edu (09/11/2026): si la nota oficial no está, se cogen los HECHOS de FutbolFantasy/Comuniate y se escriben de nuevo.
// Solo hechos (nada de opinión), robots.txt obligatorio, sin frases copiadas y con la fuente dicha: «Según …».
const ORIGEN_NOMBRE = { futbolfantasy: "FutbolFantasy", comuniate: "Comuniate" };
const MOTIVOS_EXT = new Set(["sin fuente permitida", "sin hecho verificado", "robots prohíbe la fuente", "no pasa la revisión", "no se pudo leer", "sin hecho ni dato"]);
const ENT = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", iexcl: "¡", iquest: "¿", quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", apos: "'", laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };
export function decodificar(t) {
  return String(t || "").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/&([a-zA-Z]+);/g, (m, n) => (ENT[n] != null ? ENT[n] : " "));
}
// Solo el cuerpo de la noticia: sin menú, sin calendario ni comentarios, con los acentos bien
export function textoDeArticulo(html) {
  let h = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<(nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, " ");
  const art = h.match(/<article[\s\S]*?<\/article>/i);
  if (art) h = art[0];
  else { const i = h.search(/<h1[\s>]/i); if (i >= 0) h = h.slice(i); }
  let t = decodificar(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const ini = t.indexOf("Deja tu comentario");
  if (ini >= 0) t = t.slice(ini + "Deja tu comentario".length).trim();
  const fin = t.search(/Ver comentarios|Noticias relacionadas|Comentarios \(|Jugadores lesionados de LaLiga/);
  if (fin > 0) t = t.slice(0, fin).trim();
  return t.slice(0, 5000);
}
// Si el texto nuevo repite 7 palabras seguidas del original, es copia: se tira
export function copiaLiteral(texto, fuente, n) {
  const k = n || 7;
  const w = norm2(texto).replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(Boolean);
  const base = " " + norm2(fuente).replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(Boolean).join(" ") + " ";
  for (let i = 0; i + k <= w.length; i++) if (base.includes(" " + w.slice(i, i + k).join(" ") + " ")) return true;
  return false;
}
function promptExterna(origen, texto) {
  return "Eres redactor de EduMR, una web de Futmondo (fantasy de LaLiga). Abajo hay una noticia de " + origen + ". Escribe tu propia noticia, corta y rápida, para alguien que juega a Futmondo y quiere saber si fichar, vender o cambiar su once.\n" +
    "Usa SOLO los hechos del texto (lesiones, plazos, convocatorias, entrenamientos, ruedas de prensa, onces, fichajes, datos de partido). Si es un análisis u opinión, quédate solo con los datos y cifras comprobables. Si no hay ningún hecho ni dato, devuelve tipo \"vacio\".\n" +
    "ESTILO: titular de 6 a 12 palabras, sin comillas, que diga qué pasa y a quién (ej. «Rafita se pierde de tres a cuatro meses»). Entradilla de una frase (máx 180) que describa al protagonista («El central del Málaga…», «El técnico del…»). Cuerpo de 2 a 4 frases cortas: el hecho, el dato que lo concreta (plazo, rival, minutos) y, si lo dicho lo permite, qué significa para quien lo tiene en su once. Si el club no da plazo o no se sabe algo, dilo claramente. Empieza describiendo, no por el nombre.\n" +
    "REGLAS: no añadas ningún dato, cifra, fecha, plazo ni causa que no esté escrito. No copies frases: cambia la estructura. No cites la web de origen. Una cita solo si es literal y corta.\n" +
    'Devuelve solo JSON: {"tipo":"hecho|analisis|vacio","titular":"...","entradilla":"...","cuerpo":"..."}\n\nNOTICIA:\n' + texto;
}
async function tratarExterna(env, f, st, now, pista, own) {
  const nombre = ORIGEN_NOMBRE[pista.origen];
  if (!nombre || !pista.ref || clubProhibido(pista.equipo)) return null;
  let u;
  try { u = new URL(pista.ref); } catch (e) { return null; }
  if (!/(^|\.)(futbolfantasy|comuniate)\.com$/.test(u.hostname)) return null;
  const robots = await leerRobots(f, u.origin);
  if (!robotsPermite(robots, pista.ref)) { st.pistas[pista.id].motivo = "robots prohíbe la fuente"; return null; }
  if (now - (Date.parse(pista.at || "") || now) > 30 * 3600e3) { st.pistas[pista.id].motivo = "tema viejo"; return null; }
  let html = "";
  try { const r = await f(pista.ref, { headers: UA_RED }); if (r.ok) html = await r.text(); } catch (e) {}
  const texto = textoDeArticulo(html);
  if (texto.length < 150) { st.pistas[pista.id].motivo = "no se pudo leer"; return null; }
  let r;
  try { r = await gemini(env, f, { contents: [{ parts: [{ text: promptExterna(nombre, texto) }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } }); } catch (e) { return null; }
  if (!r || r.error) return null;
  st.tok.n += r.tokens || 0;
  let j = null;
  try { j = parseJson(textoDe(r.j)); } catch (e) {}
  if (!j || (j.tipo !== "hecho" && j.tipo !== "analisis")) { st.pistas[pista.id].motivo = "sin hecho ni dato"; return null; }
  const fuenteNorm = norm2(texto);
  const personas = [pista.entrenador].concat(pista.jugadores || []).filter(Boolean).filter((n) => {
    const ap = norm2(n).split(/\s+/).filter((w) => w.length > 3).pop();
    return ap && fuenteNorm.includes(ap);
  });
  const val = validarNoticia({ titular: j.titular, entradilla: j.entradilla, cuerpo: j.cuerpo }, personas.map((n) => ({ frase: "", minuto: "", nombre: n })), texto);
  if (!val || copiaLiteral(val.title + " " + val.lead + " " + val.body, texto)) { st.pistas[pista.id].motivo = "no pasa la revisión"; return null; }
  const key = "ext-" + pista.id;
  if (own.some((o) => o.key === key)) { st.pistas[pista.id].motivo = "ya publicada"; return null; }
  const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const item = { id: hex, status: "published", expira: true, createdAt: now, updatedAt: now, publishedAt: now, thumb: "", tipo: pista.tipo || "", club: pista.equipo, players: personas, key, source: { name: nombre, url: pista.ref, videoId: "" }, title: val.title, lead: val.lead, body: val.body, via: "ia" };
  own.unshift(item);
  try { await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300))); } catch (e) {}
  st.pistas[pista.id] = { at: now, estado: "publicada", motivo: "" };
  sumaPista(st, "publicadas");
  return { dirty: true, noticias: [item] };
}
async function tratarUnaPista(env, f, st, now, fuentes, pista, listas) {
  const una = await tratarUnaPistaOficial(env, f, st, now, fuentes, pista, listas);
  const e = st.pistas[pista.id];
  if (e && e.estado !== "publicada") e.ext = 2; // 2 = probado con el lector de texto limpio
  if (una && una.noticias && una.noticias.length) return una;
  if (!e || e.estado === "publicada" || !MOTIVOS_EXT.has(e.motivo)) return una;
  let own = [];
  try { own = (await env.PORRA.get(OWN_KEY, "json")) || []; } catch (er) {}
  try {
    const ext = await tratarExterna(env, f, st, now, pista, own);
    if (ext) return ext;
  } catch (er) {}
  return una || { dirty: true };
}

// ---------- lo principal ----------
// deps solo sirve para las pruebas (fetch falso, reloj, fuentes).
export async function redactorSombra(env, deps) {
  const f = (deps && deps.fetch) || fetch;
  const now = (deps && deps.now) || Date.now();
  if (deps && deps.fetch) { robotsCache = new Map(); robotsT0 = Date.now(); }
  if (!env || !env.GEMINI_API_KEY || !env.PORRA) return { skipped: "sin clave" };
  const mnt = new Date(now).getUTCMinutes();
  if (!(deps && deps.allTicks) && mnt % 2 !== 1) return { skipped: "no toca" }; // cada 2 min (un vídeo por pasada)

  let st = null;
  try { st = await env.PORRA.get(STATE_KEY, "json"); } catch (e) { return { skipped: "sin estado" }; }
  if (!st) st = { seen: {}, tok: { d: "", n: 0 } };
  let dirty = false;
  const dia = new Date(now).toISOString().slice(0, 10);
  if (st.tok.d !== dia) { st.tok = { d: dia, n: 0 }; dirty = true; }

  // 1) vídeos nuevos. La lista de cada canal se refresca como mucho cada 15 min (la API gasta cuota).
  const fuentes = (deps && deps.fuentes) || FUENTES;
  const feeds = await Promise.allSettled(fuentes.map(async (s) => {
    const prev = (st.fuentes || {})[s.club];
    if (prev && prev.ok && Array.isArray(prev.videos) && now - (prev.listAt || 0) < LISTA_MS && !(deps && deps.allTicks)) {
      return { via: prev.via, videos: prev.videos, listAt: prev.listAt, cache: true };
    }
    const got = await leerFuente(env, f, s);
    got.listAt = now;
    return got;
  }));
  st.fuentes = st.fuentes || {};
  feeds.forEach((fd, i) => {
    const c = fuentes[i].club;
    const est = fd.status === "fulfilled"
      ? { ok: true, via: fd.value.via, listAt: fd.value.listAt || now, videos: (fd.value.videos || []).slice(0, 15).map((v) => ({ id: v.id, title: v.title, published: v.published, club: v.club })) }
      : { ok: false, error: String(fd.reason && fd.reason.message || fd.reason).slice(0, 160) };
    const firma = (x) => JSON.stringify({ ok: !!(x && x.ok), via: (x && x.via) || "", error: (x && x.error) || "", ids: ((x && x.videos) || []).map((v) => v.id).join(","), listAt: (x && x.listAt) || 0 });
    if (firma(st.fuentes[c]) !== firma(est)) dirty = true;
    st.fuentes[c] = Object.assign({}, est, { at: now });
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

  for (const id of Object.keys(st.seen)) { const v = st.seen[id]; if (v.status === "pend" && caducada(v.title, v.pub, now)) { v.status = "caducada"; dirty = true; } }
  for (const id of RELECTURA_UNA_VEZ) {
    const v = st.seen[id];
    if (v && v.status === "ok" && !v.releido && !(v.n > 0)) { v.status = "pend"; v.intentos = 0; v.last = 0; v.releido = 1; dirty = true; }
  }

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
          let noticias = [];
          try {
            noticias = await publicarNoticias(env, f, res, now, { sinIa: st.tok.n >= MAX_TOKENS_DIA });
            st.tok.n += noticias.reduce((a, n) => a + (n.tokens || 0), 0);
          } catch (e) { s.err = "publicar: " + String(e && e.message || e).slice(0, 80); }
          hecho = { id, items, s, noticias };
        }
      }
    }
  }
  let nuevas = (hecho && hecho.noticias) || [];
  try {
    const w = await unaNoticiaWeb(env, f, st, now, fuentes);
    if (w && w.dirty) dirty = true;
    if (w && w.noticias && w.noticias.length) {
      nuevas = nuevas.concat(w.noticias);
      if (!hecho) hecho = { id: w.id, noticias: w.noticias };
    }
  } catch (e) {}
  if ((deps && deps.allTicks) || now - (st.deteccionAt || 0) >= DETECCION_MS) {
    try {
      const d = await detectarTemas(env, f, st, now);
      if (d && d.dirty) dirty = true;
    } catch (e) {}
  }
  if ((deps && deps.allTicks) || now - (st.pistasAt || 0) >= PISTAS_MS) {
    if (st.tok.n < MAX_TOKENS_DIA) {
      try {
        const pz = await tratarPistas(env, f, st, now, fuentes);
        if (pz && pz.dirty) dirty = true;
        if (pz && pz.noticias && pz.noticias.length) {
          nuevas = nuevas.concat(pz.noticias);
          if (!hecho) hecho = { id: "pistas", noticias: pz.noticias };
        }
      } catch (e) {}
      st.pistasAt = now;
      dirty = true;
    }
  }
  // Análisis propios con los datos de Futmondo (3 por pasada, 30 al día)
  try {
    const own = (await env.PORRA.get(OWN_KEY, "json")) || [];
    const an = await analisisDatos(env, f, SITE, own, now, 3);
    if (an.length) {
      await env.PORRA.put(OWN_KEY, JSON.stringify(an.concat(own).slice(0, 300)));
      nuevas = nuevas.concat(an);
      if (!hecho) hecho = { id: "analisis", noticias: an };
      dirty = true;
    }
  } catch (e) {}
  // Los borradores y las noticias ya guardadas no se reescriben ni se reenvían.
  // 2d) comparación interna con las otras webs (cada 10 min). Solo el panel.
  if (mnt % 10 === 1 || (deps && deps.allTicks)) { try { await compararConExternas(env, now); } catch (e) {} }

  // Las previas NUEVAS (expira) se retiran pasadas 30 h / 40 h. Lo anterior se queda como está.
  try {
    const own = (await env.PORRA.get(OWN_KEY, "json")) || [];
    let cambio = false;
    for (const o of own.filter((x) => x.status === "published" && x.expira && x.source && x.source.videoId).slice(0, 12)) {
      const res = await env.PORRA.get(RES_PREFIX + o.source.videoId, "json");
      if (res && caducada(res.title, res.pub, now)) { o.status = "draft"; o.caducada = true; o.updatedAt = now; cambio = true; }
    }
    // Las notas vacías «X en la nota del Y» se retiran (Edu 09/11/2026)
    for (const o of own) if (o.status === "published" && /\ben la nota del\b|^Nota oficial del\b/i.test(o.title || "")) { o.status = "draft"; o.vacia = true; o.updatedAt = now; cambio = true; }
    if (cambio) await env.PORRA.put(OWN_KEY, JSON.stringify(own));
  } catch (e) {}

  try { if (await avisarPublicadas(env, f, st, nuevas, now)) dirty = true; } catch (e) { st.tgUltimo = { ok: false, err: String(e && e.message || e).slice(0, 120), at: now }; dirty = true; }
  if (dirty) { try { await env.PORRA.put(STATE_KEY, JSON.stringify(st)); } catch (e) {} }
  return { procesado: hecho ? hecho.id : null, pendientes: cola.length, tokens: st.tok.n };
}

export const _r = { compararNoticias, caducada, validarNoticia, noticiaTelegram, agruparPorJugador, parseFeed, esConferencia, fraseVerificada, localizarFrase, ventanaFrase, atribucionJugador, estadoRespaldado, temaRespaldado, robotsPermite, cruzarJugador, filtrar, parseJson, resumenTelegram, parseSitemapNews, esNotaPrimerEquipo, citaEnTitulo, partidoEnTitulo, citasDeHtml, cronicaDesdeHechos, cronicaDesdeEv, sujetosSeguidos, depurarCuerpo, elegirMinuto, minutosOficiales, fechaDeFuente, fechaTexto, entradillaRepiteTitulo, revisarEntradilla, clubProhibido, pistaAceptable, pistasATratar, notaParaPista, pistaDuplicada, enlacesDeSitemap, enlacesDeFuente, dominioProhibido, FUENTES, pistasDesdeTitulares, mezclarPistas, textoConFuenteDetectada, hechosDesdeNota, textoDeArticulo, copiaLiteral, decodificar };
