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
  // 09/11/2026: canal oficial @fcbarcelona (externalId en la página del canal) y sitemap de noticias del primer equipo, permitido por su robots.txt.
  { club: "Barcelona", yt: "UC14UlmYlSNiQCBe9Eookf_A", noticias: "https://www.fcbarcelona.es/es/sitemap/articles/detailed.xml" },
];
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
function promptNoticias(club, grupos) {
  return "Eres redactor de una web de fantasy de LaLiga. Para CADA jugador de la lista escribe una noticia corta, en español y con tus propias palabras, usando SOLO los datos verificados de la rueda de prensa de un entrenador del " + club + ".\n" +
    "REGLAS: usa únicamente la información de su lista. No añadas posición, día de la semana, fecha, plazo, rival, cifra, lesión ni un estado distinto al de la lista. No inventes citas: si citas, copia la frase literal entre comillas. Tono breve, de móvil, con palabras propias. " +
    "Titular de máximo 80 caracteres que mencione al jugador. Entradilla de una sola frase, máximo 160 caracteres. Cuerpo de un párrafo de 40 a 400 caracteres. Escribe el nombre del jugador exactamente como en la lista.\n" +
    'Devuelve solo JSON: [{"jugador": "nombre tal cual", "titular": "...", "entradilla": "...", "cuerpo": "..."}] con un elemento por jugador y en el mismo orden.\n\nDATOS:\n' +
    grupos.map((g) => "JUGADOR: " + g.nombre + "\n" + g.items.map((i) => "- " + (ETIQ_TXT[i.estado] || i.estado) + " | frase literal: «" + i.frase + "»" + (i.minuto ? " | min " + i.minuto : "")).join("\n")).join("\n\n");
}
// Rechaza lo que se pase de largo, meta cifras que no están en las frases o se olvide de algún jugador
export function validarNoticia(n, items) {
  if (!n || typeof n !== "object") return null;
  const t = String(n.titular || "").trim(), l = String(n.entradilla || "").trim(), c = String(n.cuerpo || "").trim();
  if (t.length < 12 || t.length > 120 || l.length > 220 || c.length < 40 || c.length > 2500) return null;
  const fuente = norm2(items.map((i) => [i.frase, i.minuto, ETIQ_TXT[i.estado] || ""].join(" ")).join(" "));
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
      const r = await gemini(env, f, { contents: [{ parts: [{ text: promptNoticias(res.club, grupos) }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } });
      if (!r.error) { tokens = r.tokens; arr = parseArr(textoDe(r.j)); }
    } catch (e) {}
  }
  return grupos.map((g, i) => {
    const v = arr && arr.find((x) => x && norm2(x.jugador) === norm2(g.nombre)) || (arr && arr[i]);
    const ok = validarNoticia(v, g.items);
    const first = g.items.find((x) => x.minuto) || g.items[0];
    const enlace = res.url || ("https://youtu.be/" + res.id + (first && first.minuto ? "?t=" + secs2(first.minuto) : ""));
    const base = {
      club: res.club, players: [g.nombre].filter(Boolean), playerId: g.id, key: res.id + ":" + g.key,
      source: { name: res.oficial ? "OFICIAL · " + res.club : (res.fuente || "Según " + res.club), url: enlace, videoId: res.sinMiniatura ? "" : res.id },
      original: g.items.map((x) => ({ jugador: x.jugador, estado: x.estado, frase: x.frase, minuto: x.minuto, confianza: x.confianza, verificada: !!x.verificada, cruzado: !!x.cruzado })),
      tokens: i === 0 ? tokens : 0,
    };
    if (ok) return Object.assign(base, ok, { via: "ia" });
    const et = ETIQ_TXT[g.items[0].estado] || g.items[0].estado;
    return Object.assign(base, {
      title: g.nombre + ": " + et,
      lead: res.lead || (res.oficial ? "Según " + (res.speaker ? res.speaker + ", fuente oficial." : res.club + ", fuente oficial.") : "Según " + res.club + "."),
      body: g.items.map((x) => "«" + x.frase + "»" + (x.minuto ? " (min " + x.minuto + ")" : "")).join("\n"),
      via: "plantilla",
    });
  });
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
    const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const item = Object.assign({ id: hex, status: "published", expira: true, createdAt: now + i, updatedAt: now + i, publishedAt: now + i, thumb }, n);
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
  const cola = (st.tgPend || []).concat(nuevas.map((n) => ({ id: n.id, title: n.title, lead: n.lead, body: n.body, thumb: n.thumb || "" })));
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
// Crónica solo con goles nombrados. Si falta un nombre, hay propia o el marcador no cuadra, no se publica.
export function cronicaDesdeHechos(p) {
  if (!p || !p.home || !p.away || !Array.isArray(p.goles) || !p.goles.length) return null;
  let h = 0, a = 0;
  const lineas = [];
  for (const g of p.goles) {
    if (!g || g.og) return null;
    if (g.side !== "home" && g.side !== "away") return null;
    const name = String(g.name || "").trim();
    if (!name) return null;
    if (!Number.isFinite(Number(g.min)) || Number(g.min) < 0 || Number(g.min) > 130) return null;
    if (g.side === "home") h++; else a++;
    lineas.push(name + " " + Number(g.min) + (Number(g.extra) ? "+" + Number(g.extra) : "") + "'");
  }
  if (p.marcador && (Number(p.marcador[0]) !== h || Number(p.marcador[1]) !== a)) return null;
  return {
    title: p.home + " " + h + "-" + a + " " + p.away,
    lead: "Según los datos del partido.",
    body: "Goles: " + lineas.join(", ") + ".",
    players: [...new Set(p.goles.map((g) => String(g.name).trim()))],
  };
}
export function cronicaDesdeEv(home, away, ev, marcador) {
  if (!ev || !Array.isArray(ev.g) || !ev.g.length) return null;
  const nombre = (id, side) => {
    const bag = side === "home" ? ev.home : ev.away;
    const all = [].concat((bag && bag.st) || [], (bag && bag.sb) || []);
    const hits = all.filter((x) => x && String(x[0]) === String(id) && x[1]);
    return hits.length === 1 ? String(hits[0][1]) : "";
  };
  const goles = [];
  for (const g of ev.g) {
    if (!g || g.og) return null;
    const side = g.h ? "home" : "away";
    const name = nombre(g.p, side);
    if (!name) return null;
    goles.push({ name, min: Number(g.m), extra: Number(g.x) || 0, side });
  }
  return cronicaDesdeHechos({ home, away, goles, marcador });
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
      const cronica = cronicaDesdeEv(partido.home, partido.away, ev, partido.marcador);
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
      const item = {
        club: s.club, players: cronica.players, key: "cronica-" + id,
        source: { name: "Según FotMob", url: pendiente.url, videoId: "" },
        title: cronica.title, lead: res.lead, body: cronica.body, via: "datos",
      };
      let own = (await env.PORRA.get(OWN_KEY, "json")) || [];
      if (own.some((o) => o.key === item.key)) return { dirty: true };
      const hex = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      const pub = Object.assign({ id: hex, status: "published", expira: true, createdAt: now, updatedAt: now, publishedAt: now, thumb: "" }, item);
      own.unshift(pub);
      await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300)));
      return { dirty: true, noticias: [pub], id: "cronica-" + id };
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
    const res = { id: "web-" + id, club: s.club, title: pendiente.title, pub: pendiente.published, url: pendiente.url, oficial: true, speaker: titular && titular.speaker || "", sinMiniatura: true, items };
    let noticias = [];
    try { noticias = await publicarNoticias(env, f, res, now, { sinIa: true }); } catch (e) { slot.err = "publicar"; }
    return { dirty: true, noticias, id: "web-" + id };
  }
  return null;
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
    if (cambio) await env.PORRA.put(OWN_KEY, JSON.stringify(own));
  } catch (e) {}

  try { if (await avisarPublicadas(env, f, st, nuevas, now)) dirty = true; } catch (e) { st.tgUltimo = { ok: false, err: String(e && e.message || e).slice(0, 120), at: now }; dirty = true; }
  if (dirty) { try { await env.PORRA.put(STATE_KEY, JSON.stringify(st)); } catch (e) {} }
  return { procesado: hecho ? hecho.id : null, pendientes: cola.length, tokens: st.tok.n };
}

export const _r = { compararNoticias, caducada, validarNoticia, noticiaTelegram, agruparPorJugador, parseFeed, esConferencia, fraseVerificada, localizarFrase, ventanaFrase, atribucionJugador, estadoRespaldado, temaRespaldado, robotsPermite, cruzarJugador, filtrar, parseJson, resumenTelegram, parseSitemapNews, esNotaPrimerEquipo, citaEnTitulo, partidoEnTitulo, citasDeHtml, cronicaDesdeHechos, cronicaDesdeEv };
