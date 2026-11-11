// avisos.js — avisos de Telegram para Edu (liga "Con Permisoo").
// Se ejecuta dentro del cron de 15 min (index.js) y solo manda lo NUEVO:
//   1) TODAS las noticias nuevas de FutbolFantasy (⭐ si nombran a un jugador tuyo,
//      🔔 si hablan de lesiones / sanciones / dudas / titularidad).
//   2) Alineación confirmada de TODOS los partidos (⭐ marca a tus jugadores).
//   3) Once probable actualizado: quién entra y quién sale (de todos los partidos).
//   4) Cambios en tus jugadores: el % de jugar de FutbolFantasy y el estado de Futmondo.
// Corre cada MINUTO (plan de pago de Cloudflare desde 01/11/2026) y lee las fuentes DIRECTAMENTE (endpoints noticias-rapido, probables?...,
// alineaciones-confirmadas?fresh=1: sin caché ni escrituras de KV) para ser rápido sin gastar el
// escrituras de KV. Noticias y alineaciones confirmadas: cada minuto; once probable: cada minuto el día del partido, menos a menudo si falta más. Solo de día (08:00–24:00).
// Todo sale de la propia web (/api/laquiniela/...), que a su vez lee fuentes reales.
// Si un dato falta no se inventa: simplemente no se avisa.
// Sin TELEGRAM_BOT_TOKEN (secreto de Cloudflare) no hace nada.

const SITE = "https://edumr.es/api/laquiniela/";
const WEB = "https://edumr.es/futmondo/guiafantasy/";
const NEWS_PFX = "https://www.futbolfantasy.com/laliga/noticias/";
// Enlace del aviso: las noticias de otras webs ya no se publican en la nuestra, así que el aviso (privado, solo para ti)
// lleva al artículo original; Telegram saca de él la miniatura. Las noticias propias llevan a nuestra web.
const newsUrl = (link) => {
  link = String(link || "");
  let m;
  if ((m = link.match(/^https:\/\/edumr\.es\/n\/([a-z0-9]+)$/))) return WEB + "noticias/ed-" + m[1];
  if (/^https:\/\//.test(link)) return link;
  return WEB + "noticias";
};
// Palabras clave del titular para detectar la misma historia contada por varias fuentes
const TSTOP = new Set("para sobre ante tras este esta estos estas desde entre hasta como pero sino aunque cuando donde jornada fantasy segun mientras tiene tienen habla hablan confirma confirman vuelve vuelven sigue siguen sera tambien despues antes porque quien dice parte medico oficial lesion lesionado lesiones baja bajas partido equipo entrenador convocatoria convocados convocado jugador jugadores ultima hora ultimo tras sera podria puede pide pasa deja queda recupera recuperacion real madrid barcelona atletico athletic bilbao club sevilla betis valencia villarreal getafe osasuna celta espanyol girona levante alaves mallorca rayo vallecano racing santander deportivo coruna oviedo elche sociedad cadiz granada almeria laliga liga copa".split(" "));
const tokens = (t) => Array.from(new Set(norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !TSTOP.has(w))));
// Misma historia: al menos 2 palabras clave compartidas (nombre/apellido, tema) y el 40 % de las del título más corto
const sameTok = (A, B) => { if (!A.length || !B.length) return false; const bs = new Set(B); const n = A.filter((w) => bs.has(w)).length; return n >= 2 && n >= 0.4 * Math.min(A.length, B.length); };
const slugM = (h, a) => String(h + "-" + a).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const matchUrl = (h, a) => WEB + "partido/" + slugM(h, a);
const STATE_KEY = "tg:avisos:v1";
const MAX_MSGS = 10;                // mensajes por pasada; lo que sobre espera a la siguiente
const NEWS_MAX_AGE = 4 * 3600e3;    // no se avisa de noticias con más de 4 h
const QUIET_FROM = 0, QUIET_TO = 8; // silencio de 00:00 a 08:00 (hora de Madrid)

// ---------- utilidades de texto ----------
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function decode(s) {
  return String(s || "").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// Palabras que hacen que una noticia importe aunque no nombre a un jugador tuyo.
const KW = /\b(lesion\w*|baja|bajas|duda|dudas|dudoso|sancion\w*|apercibid\w*|expulsad\w*|suspendid\w*|molestias?|esguince|rotura|fractura|titular\w*|(no|tampoco|sin) (\w+ ){0,2}entren\w*|(sesion|entrenamiento) (\w+ ){0,10}sin)\b/;

const STOP = new Set(["de", "del", "la", "el", "da", "do", "dos", "van", "von", "di", "jr", "junior"]);
function hasWord(normText, tok) { return (" " + normText + " ").indexOf(" " + tok + " ") >= 0; }

// Jugadores tuyos que nombra un título. Devuelve los nombres tal cual vienen de Futmondo.
// `otros` = el resto de jugadores del mercado ({id, name}). Si el título nombra COMPLETO a otro jugador
// que comparte la palabra (ej. "Óscar Valentín" y tu "Valentín Gómez"), esa palabra no cuenta como tuyo.
function ownMatch(title, squad, otros) {
  const nt = norm(title);
  const mine = new Set((squad || []).map((p) => String(p.id)));
  const ajenos = (otros || []).filter((o) => o && o.name && !mine.has(String(o.id))).map((o) => norm(o.name)).filter((n) => n.indexOf(" ") >= 0 && hasWord(nt, n));
  const hits = [];
  for (const p of squad) {
    const full = norm(p.name);
    if (!full) continue;
    if (hasWord(nt, full)) { hits.push(p.name); continue; }
    if (full.indexOf(" ") >= 0 && full.split(" ").some((t) => t.length >= 5 && !STOP.has(t) && hasWord(nt, t) && !ajenos.some((a) => a.split(" ").indexOf(t) >= 0))) hits.push(p.name);
  }
  return hits;
}

// ---------- equipos ----------
const ALIAS = { barca: "barcelona", atleti: "atletico", santander: "racing" };
const FILL = new Set(["de", "del", "la", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie", "c", "f"]);
function teamSet(s) {
  return new Set(norm(s).split(" ").filter((w) => w && !FILL.has(w)).map((w) => ALIAS[w] || w));
}
// Mismo equipo si las palabras de uno están dentro de las del otro ("Betis" ⊂ "Real Betis").
// "Real Madrid" y "Atlético de Madrid" NO coinciden (ninguno contiene al otro).
function sameTeam(a, b) {
  const A = teamSet(a), B = teamSet(b);
  if (!A.size || !B.size) return false;
  const sub = (X, Y) => [...X].every((w) => Y.has(w));
  return sub(A, B) || sub(B, A);
}

// ---------- hora ----------
function madridOffsetMs(utcMs) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - utcMs;
}
function madridHour(now) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", hourCycle: "h23", hour: "2-digit" }).format(new Date(now)));
}
function hhmm(ms) {
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}
// "31/10" + "16:14" (hora de Madrid) -> milisegundos. 0 si falta algún dato.
function newsAt(date, time, now) {
  const dm = String(date || "").match(/(\d{1,2})\/(\d{1,2})/);
  const tm = String(time || "").match(/(\d{1,2}):(\d{2})/);
  if (!dm || !tm) return 0;
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", year: "numeric" }).format(new Date(now)));
  const naive = Date.UTC(year, Number(dm[2]) - 1, Number(dm[1]), Number(tm[1]), Number(tm[2]));
  let t = naive - madridOffsetMs(naive);
  t = naive - madridOffsetMs(t);
  if (t > now + 36 * 3600e3) t = Date.UTC(year - 1, Number(dm[2]) - 1, Number(dm[1]), Number(tm[1]), Number(tm[2])) - madridOffsetMs(naive);
  return t;
}

// ---------- plantilla ----------
function statusLabel(s) {
  s = String(s || "");
  if (!s) return "sin aviso";
  if (s === "doubt") return "duda";
  if (/^injured/.test(s)) return "lesionado";
  return s; // cualquier otro valor de Futmondo se enseña tal cual, sin traducirlo a ojo
}
function lineupNames(side) {
  const out = [];
  ["portero", "defensas", "medios", "delanteros"].forEach((k) => (side && side[k] || []).forEach((p) => { if (p && p.name) out.push(norm(p.name)); }));
  return out;
}
// Dentro del MISMO equipo basta con compartir una palabra de 4+ letras ("Vinícius Júnior" ≈ "Vinicius Jr").
function inLineup(pname, names) {
  const toks = norm(pname).split(" ").filter((t) => t.length >= 4 && !STOP.has(t));
  const pn = norm(pname);
  return names.some((ln) => ln === pn || ln.split(" ").some((t) => toks.indexOf(t) >= 0));
}

// ¿Es de mis jugadores? (mismo equipo + nombre parecido). Devuelve el nombre con ⭐ si lo es.
function star(squad, team, name) {
  const mine = squad.some((p) => sameTeam(p.team, team) && inLineup(p.name, [norm(name)]));
  return (mine ? "⭐" : "") + name;
}
function posLine(label, arr, squad, team) {
  return arr && arr.length ? label + ": " + arr.map((p) => esc(star(squad, team, p.name))).join(", ") : "";
}

// Dinero en español: 131484278 → "131,5M€", 552707 → "553k€"
function eur(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "").replace(".", ",") + "M€";
  return Math.round(a / 1e3) + "k€";
}
const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return String(h); };

// Aviso de noticia con titular llamativo (la primera línea es lo que se ve en la lista de chats)
function noticiaTexto(title, hits, resumen, link, src) {
  const t = norm(title);
  const tag = /\b(lesion\w*|rotura|fractura|esguince|baja|bajas)\b/.test(t) ? "🚑 <b>BAJA</b>"
    : /\b(sancion\w*|apercibid\w*|expulsad\w*|suspendid\w*)\b/.test(t) ? "🟥 <b>SANCIÓN</b>"
    : /\b(duda|dudas|dudoso|molestias?)\b/.test(t) ? "⚠️ <b>DUDA</b>"
    : /\btitular\w*/.test(t) ? "✅ <b>TITULAR</b>" : "📰 <b>ÚLTIMA HORA</b>";
  return tag + (hits.length ? "  ·  ⭐ <b>TU JUGADOR</b>" : "") + "\n<b>" + esc(title) + "</b>" +
    (resumen ? "\n\n" + esc(resumen) : "") + (hits.length ? "\n\n⭐ Afecta a: <b>" + esc(hits.join(", ")) + "</b>" : "") +
    "" +
    "\n\n👉 <b>Más información:</b>\n" + newsUrl(link);
}

// Aviso de mercado: 5 mayores subidas y 5 mayores bajadas (valores de Futmondo). null si no hay cambios.
function mercadoTexto(ps, own, sig) {
  const up = ps.filter((p) => p.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
  const down = ps.filter((p) => p.change < 0).sort((a, b) => a.change - b.change).slice(0, 5);
  if (!up.length && !down.length) return null;
  // Una línea por jugador, bien visible: "1 Berenguer 🟢▲ +888k€" / "1 Comesaña 🔻🔴 −395k€"
  const fila = (p, i, sube) => "<b>" + (i + 1) + "</b>  " + (own.has(String(p.id)) ? "⭐" : "") + "<b>" + esc(p.name) + "</b>  " + (sube ? "🟢▲ <b>+" : "🔻🔴 <b>−") + eur(p.change) + "</b>";
  // Primera línea (la que se ve en la lista de chats): quién sube más y quién baja más, sin adornos
  const gancho = [up[0] ? "📈 Sube más: <b>" + esc(up[0].name) + " +" + eur(up[0].change) + "</b>" : "", down[0] ? "📉 Baja más: <b>" + esc(down[0].name) + " −" + eur(down[0].change) + "</b>" : ""].filter(Boolean).join("\n");
  return "💹 <b>MERCADO ACTUALIZADO</b>\n" + gancho + "\n\n" +
    (up.length ? "📈 <b>TOP 5 SUBIDAS</b>\n" + up.map((p, i) => fila(p, i, true)).join("\n") : "") +
    (up.length && down.length ? "\n\n" : "") +
    (down.length ? "📉 <b>TOP 5 BAJADAS</b>\n" + down.map((p, i) => fila(p, i, false)).join("\n") : "") +
    "\n\n👉 <b>Todo el mercado:</b>\n" + WEB + "mercado?v=" + sig;
}

// ---------- Telegram ----------
async function tg(env, f, method, body) {
  try {
    const r = await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return null; }
}
async function send(env, f, chat, text, opts) {
  opts = opts || {};
  // Los onces van siempre en UN solo mensaje de texto, sin fotos ni vista previa del enlace (opts.noPreview).
  const lp = opts.noPreview ? { is_disabled: true } : opts.small ? { is_disabled: false, prefer_small_media: true } : { is_disabled: false, prefer_large_media: true };
  const j = await tg(env, f, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: lp });
  return !!(j && j.ok);
}
// "dom 1 nov · 16:15" (hora de Madrid)
function cuandoKo(ms) {
  if (!ms) return "";
  const d = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" }).format(new Date(ms)).replace(/\./g, "").replace(",", "");
  return d + " · " + hhmm(ms);
}
// El primer chat privado que escribe /start al bot queda como dueño (igual que el bot de la web).
async function findChat(env, f) {
  const j = await tg(env, f, "getUpdates", { limit: 100, allowed_updates: ["message"] });
  const ups = (j && j.ok && j.result) || [];
  for (const u of ups) {
    const m = u.message;
    if (m && m.chat && m.chat.type === "private" && /^\/start/.test(m.text || "")) return String(m.chat.id);
  }
  return "";
}

// Las noticias de otras webs ya no son públicas: la web las deja en KV (ff:news:cron:v1) cada vez que se refrescan; aquí se pide el refresco y se lee de ahí.
async function leerNoticias(env, f, now) {
  try { await f(SITE + "noticias?warm=1&t=" + now, { headers: { "user-agent": "edumr-cron" } }).then((r) => r.text()); } catch (e) {}
  const c = await env.PORRA.get("ff:news:cron:v1", "json");
  if (!c || !Array.isArray(c.noticias)) throw new Error("sin noticias");
  return { noticias: c.noticias };
}

async function getJson(f, path) {
  const r = await f(SITE + path, { headers: { "user-agent": "edumr-cron" } });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

// ---------- lo principal ----------
// deps solo sirve para las pruebas (fetch falso y reloj).
export async function avisar(env, deps) {
  const f = (deps && deps.fetch) || fetch;
  const now = (deps && deps.now) || Date.now();
  if (!env || !env.TELEGRAM_BOT_TOKEN || !env.PORRA) return { skipped: "sin token" };

  let st = null;
  try { st = await env.PORRA.get(STATE_KEY, "json"); } catch (e) { return { skipped: "sin estado" }; }
  const firstRun = !st || !st.init;
  if (!st) st = { init: false, chat: String(env.TELEGRAM_CHAT_ID || ""), news: [], conf: [], sq: {} };
  if (!st.chat) st.chat = String(env.TELEGRAM_CHAT_ID || "");
  let dirty = false;

  if (!st.chat) {
    st.chat = await findChat(env, f);
    if (!st.chat) return { skipped: "esperando /start" };
    dirty = true;
  }

  const quiet = madridHour(now) >= QUIET_FROM && madridHour(now) < QUIET_TO;
  const mnt = new Date(now).getUTCMinutes();
  const all = !!(deps && deps.allTicks);                  // solo para pruebas
  const near = (ko, a, b) => !ko || (ko >= now + a && ko <= now + b); // sin hora conocida: se mira por si acaso
  const doMios = all || mnt % 15 === 0 || !Object.keys(st.sq || {}).length; // plantilla: cada 15 min
  const doList = !quiet && (all || mnt === 0 || !st.ml);   // lista de partidos: cada hora
  // El once confirmado solo se pide si algún partido empieza en las próximas 2 h y media (o acaba de empezar).
  const wantConf = !quiet && (all || (st.ml || []).some((m) => near(m.ko, -20 * 60e3, 150 * 60e3)));
  const skip = () => Promise.reject(new Error("no toca"));

  // Lecturas directas de la fuente (sin caché ni escrituras de KV): así los avisos son rápidos.
  const [rNews, rCl, rConf] = await Promise.allSettled([
    leerNoticias(env, f, now),
    doMios ? getJson(f, "mios?t=" + now) : skip(),
    wantConf ? getJson(f, "alineaciones-confirmadas?run=1&fresh=1&t=" + now) : skip(),
  ]);
  const mios = rCl.status === "fulfilled" && Array.isArray(rCl.value.mios) ? rCl.value.mios : null;
  const cover = rCl.status === "fulfilled" ? rCl.value.cover : null;
  // Si esta vez no hay plantilla (no toca o fallo puntual de la fuente), se usa la última buena guardada.
  const squad = mios && mios.length ? mios : Object.keys(st.sq || {}).map((id) => ({ id, name: st.sq[id].n, team: st.sq[id].t }));

  const queue = []; // { text, commit, photos?, small? }
  let mkP; const getMk = () => mkP || (mkP = getJson(f, "mercado"));

  // 1) Noticias
  if (rNews.status === "fulfilled" && Array.isArray(rNews.value.noticias)) {
    const sent = new Set(st.news || []);
    const items = rNews.value.noticias.slice(0, 60).filter((x) => x && x.link && x.title);
    const ext = (x) => x.src && x.src !== "FutbolFantasy";
    // Historial de titulares de las últimas 12 h para no avisar dos veces de la misma historia (aunque la cuenten fuentes distintas)
    const migrar = !st.nt; // primera vez con varias fuentes: lo que ya hay de Comuniate/Jornada Perfecta se da por visto
    st.nt = (st.nt || []).filter((e) => now - e.t < 12 * 3600e3);
    if (migrar) items.filter((x) => !ext(x)).forEach((x) => { const at0 = newsAt(x.date, x.time, now); if (at0 && now - at0 < 12 * 3600e3) st.nt.push({ k: tokens(decode(x.title)), t: at0, s: x.src || "FutbolFantasy" }); });
    const cands = [];
    // Resto de jugadores del mercado: sirve para no confundir "Óscar Valentín" con tu "Valentín Gómez"
    let otros = [];
    if (items.some((x) => !sent.has(x.link))) { try { otros = ((await getMk()).players || []).map((p) => ({ id: p.id, name: p.name })); } catch (e) {} }
    for (const x of items) {
      if (sent.has(x.link)) continue;
      const title = decode(x.title);
      if (migrar && ext(x)) { st.news = (st.news || []).concat([x.link]).slice(-200); dirty = true; continue; }
      const at = x.dateOnly ? (x.hoy ? now : 0) : (x.ts || newsAt(x.date, x.time, now));
      if (!firstRun && !(at && now - at <= NEWS_MAX_AGE)) continue;
      const hits = ownMatch(title, squad, otros);
      const kw = KW.test(norm(title));
      cands.push({ x, title, at, hits, kw, k: tokens(title), s: x.src || "FutbolFantasy" });
    }
    cands.sort((a, b) => a.at - b.at); // las más antiguas primero
    const aceptadas = [];
    const nuevas = [];
    for (const c of cands) {
      // Solo cuenta como repetida si la historia ya salió en OTRA fuente (dos noticias seguidas de la misma fuente son distintas)
      const dup = st.nt.some((e) => e.s !== c.s && sameTok(c.k, e.k)) || aceptadas.some((e) => e.s !== c.s && sameTok(c.k, e.k));
      if (dup) { st.news = (st.news || []).concat([c.x.link]).slice(-200); dirty = true; continue; } // misma historia: se da por vista sin avisar
      aceptadas.push({ k: c.k, s: c.s }); nuevas.push(c);
    }
    for (const c of nuevas.slice(0, firstRun || quiet ? 0 : MAX_MSGS)) {
      let resumen = ""; // sin resumen: ya no se lee el texto de otras webs
      c.resumen = resumen;
    }
    // Decisión de Edu (08/11): ya no se avisa de noticias de otras webs. Solo se marcan como vistas; el redactor las compara por dentro.
    for (const c of nuevas) {
      st.news = (st.news || []).concat([c.x.link]).slice(-200); st.nt = (st.nt || []).concat([{ k: c.k, t: c.at || now, s: c.s }]).slice(-150); dirty = true;
    }
  }

  // 2) Alineaciones confirmadas (todos los partidos; ⭐ marca a tus jugadores). Solo cerca de cada partido.
  if (wantConf && rConf.status === "fulfilled" && Array.isArray(rConf.value.matches)) {
    const md = rConf.value.matchday || 0;
    const seenConf = new Set(st.conf || []);
    for (const m of rConf.value.matches) {
      if (!m || !m.home || !m.away) continue;
      const key = md + ":" + norm(m.home.name) + "-" + norm(m.away.name);
      if (seenConf.has(key)) continue;
      const commit = () => { st.conf = (st.conf || []).concat([key]).slice(-120); dirty = true; };
      if (firstRun) { commit(); continue; }
      const cuando = [m.day, m.time].filter(Boolean).join(" ");
      // nombres como los usa la web (lista de partidos) para que el enlace abra el partido correcto
      const web = (st.ml || []).find((x) => sameTeam(x.home, m.home.name) && sameTeam(x.away, m.away.name)) || { home: m.home.name, away: m.away.name };
      const fuera = [];
      for (const p of squad) {
        const side = sameTeam(p.team, m.home.name) ? m.home : sameTeam(p.team, m.away.name) ? m.away : null;
        if (side && !inLineup(p.name, lineupNames(side))) fuera.push(p.name);
      }
      // Una línea en blanco entre portero, defensas, medios y delanteros para que se lea sin apretar
      const bloque = (t) => "<b>" + esc(t.name) + "</b>" + (t.formation ? " (" + esc(t.formation) + ")" : "") + "\n\n" +
        [posLine("Por", t.portero, squad, t.name), posLine("Def", t.defensas, squad, t.name), posLine("Med", t.medios, squad, t.name), posLine("Del", t.delanteros, squad, t.name)].filter(Boolean).join("\n\n");
      const text = "✅ <b>ONCE CONFIRMADO · " + esc(m.home.name.toUpperCase()) + " - " + esc(m.away.name.toUpperCase()) + "</b>" + (cuando ? "\n🕒 " + esc(cuando) : "") +
        "\n\n" + bloque(m.home) + "\n\n\n" + bloque(m.away) + (fuera.length ? "\n\n\n⚠️ <b>Tuyos fuera del once:</b> " + esc(fuera.join(", ")) : "") +
        "\n\n👉 <b>Míralo en tu web:</b>\n" + matchUrl(web.home, web.away);
      queue.push({ text, commit, noPreview: true });
      try { await publicarOnceWeb(env, m, md, key); } catch (e) {}
    }
  }

  // Partidos que ya tienen el once confirmado en esta pasada (para no mandar además el probable)
  const confSet = wantConf && rConf.status === "fulfilled" && Array.isArray(rConf.value.matches)
    ? rConf.value.matches.filter((m) => m && m.home && m.away).map((m) => ({ home: m.home.name, away: m.away.name })) : [];

  // 2b) Once probable actualizado: quién entra y quién sale. Se lee directo de FutbolFantasy (partidos de las próximas 72 h, más seguido cuanto más cerca); solo avisa si el once cambia de verdad.
  if (!quiet) {
    try {
      if (doList) {
        const est = await getJson(f, "alineaciones-estado");
        const items = (est.items || []).filter((i) => i && i.home && i.away).map((i) => ({ home: i.home, away: i.away, ko: i.ko || 0, hc: i.hc || "", ac: i.ac || "" }));
        if (items.length && JSON.stringify(items) !== JSON.stringify(st.ml || null)) { st.ml = items; st.mlMd = est.matchday || 0; dirty = true; }
      }
      st.pr = st.pr || {};
      // Cuanto más cerca el partido, más seguido: <3 h cada minuto, <24 h cada 5 min, <72 h cada 15 min
      const todo = (st.ml || []).filter((m) => {
        if (all || !m.ko) return true;
        const falta = m.ko - now;
        if (falta > 72 * 3600e3 || falta < 0) return false;
        return falta <= 3 * 3600e3 || (falta <= 24 * 3600e3 ? mnt % 5 === 0 : mnt % 15 === 0);
      });
      const res = await Promise.all(todo.map(async (m) => {
        try { return { m, d: await getJson(f, "probables?home=" + encodeURIComponent(m.home) + "&away=" + encodeURIComponent(m.away) + "&t=" + now) }; } catch (e) { return null; }
      }));
      for (const r of res) {
        if (!r) continue;
        const { m, d } = r;
        const key = (st.mlMd || 0) + ":" + norm(m.home) + "-" + norm(m.away);
        const prev = st.pr[key];
        const posCod = (v) => { v = norm(v); return /portero/.test(v) ? "POR" : /defens/.test(v) ? "DEF" : /medi|centro/.test(v) ? "MED" : /delant/.test(v) ? "DEL" : ""; };
        const X = (side) => (side && side.starters || []).map((p) => ({ n: p.name, p: Number.isFinite(p.prob) ? p.prob : null, s: posCod(p.pos) }));
        const H = X(d.home), A = X(d.away);
        if (H.length < 10 || A.length < 10) continue; // página sin once: no se interpreta como "han salido todos"
        const nuevo = { h: H, a: A, fh: (d.home && d.home.formation) || "", fa: (d.away && d.away.formation) || "" };
        // Primera vez que lo vemos, o referencia antigua con más de 11 titulares (FutbolFantasy mezclaba dos onces): se guarda sin avisar
        if (!prev || firstRun || (prev.h || []).length > 11 || (prev.a || []).length > 11) { st.pr[key] = nuevo; dirty = true; continue; }
        const old = (arr) => (arr || []).map((x) => (typeof x === "string" ? { n: x, p: null, s: "" } : x)); // estado antiguo: solo nombres
        const ORD = { POR: 0, DEF: 1, MED: 2, DEL: 3, "": 4 };
        // Solo quién ENTRA y quién SALE del once (los cambios de % ya no avisan: era demasiado ruido)
        const diff = (team, ahora, antes, fAntes, fAhora) => {
          antes = old(antes);
          const mb = new Map(antes.map((x) => [norm(x.n), x])), mn = new Map(ahora.map((x) => [norm(x.n), x]));
          const nm = (x) => "<b>" + esc(star(squad, team, x.n)) + "</b>" + (x.s ? " (" + x.s + ")" : "");
          const byPos = (a, b) => (ORD[a.s || ""] - ORD[b.s || ""]);
          const entra = ahora.filter((x) => !mb.has(norm(x.n))).sort(byPos);
          const sale = antes.filter((x) => !mn.has(norm(x.n))).sort(byPos);
          if (!entra.length && !sale.length) return null;
          const sist = fAhora && fAntes && fAhora !== fAntes ? "\nSistema " + esc(fAntes) + " → " + esc(fAhora) : "";
          const l = [].concat(entra.map((x) => "🟢 Entra: " + nm(x)), sale.map((x) => "🔴 Sale: " + nm(x)));
          return { team, txt: l.join("\n") + sist };
        };
        const dd = [diff(m.home, H, prev.h, prev.fh, nuevo.fh), diff(m.away, A, prev.a, prev.fa, nuevo.fa)].filter(Boolean);
        const commit = () => { st.pr[key] = nuevo; dirty = true; };
        if (!dd.length) continue;
        // Si ese partido ya tiene el once CONFIRMADO, no se manda también el probable: solo se guarda
        if (confSet.some((c) => sameTeam(c.home, m.home) && sameTeam(c.away, m.away))) { commit(); continue; }
        const cu = cuandoKo(m.ko);
        // Título corto: "ONCE DEL ATHLETIC" (si cambian los dos equipos: "ONCE ATHLETIC - REAL SOCIEDAD")
        const titulo = dd.length === 1 ? "ONCE DEL " + dd[0].team.toUpperCase() : "ONCE " + m.home.toUpperCase() + " - " + m.away.toUpperCase();
        const cuerpo = dd.length === 1 ? dd[0].txt : dd.map((x) => "<b>" + esc(x.team) + "</b>\n" + x.txt).join("\n\n");
        const text = "🔄 <b>" + esc(titulo) + "</b>\n⚽ " + esc(m.home) + " vs " + esc(m.away) + (cu ? " · " + esc(cu) : "") + "\n\n" + cuerpo + "\n\n👉 <b>Míralo en tu web:</b>\n" + matchUrl(m.home, m.away);
        queue.push({ text, noPreview: true, commit });
      }
    } catch (e) {}
  }

  // 2c) Precios actualizados: top 5 subidas y top 5 bajadas del día (valores de Futmondo).
  // Se detecta por cambio real de los precios; de noche no se mira, así que el aviso sale a las 08:00.
  if (!quiet && (all || mnt % 10 === 0)) {
    try {
      const mk = await getMk();
      const ps = (mk.players || []).filter((p) => p && p.name && Number.isFinite(p.change));
      if (ps.length > 50) {
        const sig = hash(ps.map((p) => p.id + ":" + p.change).join("|"));
        if (sig !== st.px && (!st.pxAt || now - st.pxAt > 6 * 3600e3)) { // mínimo 6 h entre avisos, por si los precios se mueven a lo largo del día
          const own = new Set(squad.map((p) => String(p.id)));
          const mt = mercadoTexto(ps, own, sig);
          const commit = () => { st.px = sig; st.pxAt = now; dirty = true; };
          if (firstRun || !mt) commit();
          else queue.push({ text: mt, commit });
        }
      }
    } catch (e) {}
  }

  // 3) Cambios en tus jugadores (% de jugar de FutbolFantasy y estado de Futmondo)
  if (mios && mios.length) {
    const cambios = [];
    const nuevo = {};
    for (const p of mios) {
      const prevO = (st.sq || {})[p.id];
      const cur = { n: p.name, t: p.team, p: typeof p.prob === "number" ? p.prob : null, s: String(p.status || "") };
      nuevo[p.id] = cur;
      if (!prevO || firstRun) continue;
      const partes = [];
      if (cur.p !== null && prevO.p !== null && prevO.p !== cur.p) partes.push(prevO.p + " % → " + cur.p + " %");
      if (prevO.s !== cur.s) partes.push("estado: " + statusLabel(prevO.s) + " → " + statusLabel(cur.s));
      if (partes.length) cambios.push("• <b>" + esc(p.name) + "</b>: " + esc(partes.join(" · ")));
    }
    const commit = () => { st.sq = nuevo; dirty = true; };
    if (cambios.length) queue.push({ text: "🚨 <b>TUS JUGADORES CAMBIAN</b>\n" + cambios.join("\n") + "\n\n👉 <b>Míralo en tu web:</b>\n" + WEB, commit });
    else if (JSON.stringify(nuevo) !== JSON.stringify(st.sq || {})) commit();
  }

  // Envío
  let sentCount = 0;
  if (firstRun) {
    queue.forEach((q) => q.commit()); // primera vez: se guarda lo que hay sin mandarlo
    st.init = true; dirty = true;
    await send(env, f, st.chat, "✅ <b>Avisos activados</b>" + (mios && mios.length ? "\nVigilo " + mios.length + " jugadores tuyos" + (cover && cover.known < cover.total ? " (sigo localizando el resto de tu plantilla)" : "") + "." : "") + "\nTe aviso de todas las noticias nuevas (⭐ las de tus jugadores), del once probable (quién entra y sale), de alineaciones confirmadas y de cambios en tus jugadores.\nSilencio de 00:00 a 08:00.");
  } else if (quiet) {
    queue.forEach((q) => q.commit()); // de noche no suena nada: se guarda como visto
  } else {
    for (const q of queue) {
      if (sentCount >= MAX_MSGS) break;
      if (await send(env, f, st.chat, q.text, q)) { q.commit(); sentCount++; }
      else break; // si Telegram falla, se reintenta en la siguiente pasada
    }
  }

  // Registro de cuándo cambia el valor de mercado de Futmondo (también de noche). Solo se escribe cuando hay un cambio real.
  try {
    const mk = await getMk();
    const ps = (mk.players || []).filter((p) => p && p.name && Number.isFinite(p.value));
    if (ps.length > 50) {
      const vsig = hash(ps.map((p) => p.id + ":" + p.value).join("|"));
      if (st.vsig && vsig !== st.vsig) {
        const prev = st.vmap || {};
        const cambios = ps.filter((p) => prev[p.id] != null && prev[p.id] !== p.value);
        if (cambios.length >= 5) { // solo cambios reales de valor (el resto es ruido de la lista, no una actualización)
          const log = ((await env.PORRA.get("mkchg:v2", "json")) || []);
          log.push({ at: now, n: cambios.length });
          await env.PORRA.put("mkchg:v2", JSON.stringify(log.slice(-200)));
        }
      }
      if (vsig !== st.vsig) { st.vsig = vsig; st.vmap = Object.fromEntries(ps.map((p) => [p.id, p.value])); dirty = true; }
    }
  } catch (e) {}

  if (dirty) { try { await env.PORRA.put(STATE_KEY, JSON.stringify(st)); } catch (e) {} }
  return { sent: sentCount, pending: queue.length - sentCount, quiet, firstRun };
}


// ---------- Aviso: Futmondo ya ha publicado los puntos de un partido ----------
// El servidor (recordMatchPoints) devuelve los partidos que acaba de guardar; el cron los mete en una cola
// y aquí se mandan. De 00:00 a 08:00 no suena nada: se quedan en la cola y salen a las 08:00.
const PTS_Q_KEY = "tg:puntos-cola:v1";
export function textoPuntos(it) {
  return "✅ <b>PUNTOS DE FUTMONDO</b>\n" + esc(it.home) + " – " + esc(it.away) + " (J" + Number(it.j) + ")\n\n👉 " + WEB;
}
export async function colaPuntos(env, items) {
  if (!env || !env.PORRA || !Array.isArray(items) || !items.length) return 0;
  let q = [];
  try { q = (await env.PORRA.get(PTS_Q_KEY, "json")) || []; } catch (e) { return 0; }
  if (!Array.isArray(q)) q = [];
  let n = 0;
  items.forEach((it) => {
    if (!it || !it.home || !it.away || !it.j) return;
    if (q.some((x) => x.j === it.j && x.home === it.home && x.away === it.away)) return;
    q.push({ j: Number(it.j), home: String(it.home), away: String(it.away) }); n++;
  });
  if (n) { try { await env.PORRA.put(PTS_Q_KEY, JSON.stringify(q.slice(-40))); } catch (e) { return 0; } }
  return n;
}
export async function avisarPuntos(env, deps) {
  const f = (deps && deps.fetch) || fetch;
  const now = (deps && deps.now) || Date.now();
  if (!env || !env.TELEGRAM_BOT_TOKEN || !env.PORRA) return { skipped: "sin token" };
  if (madridHour(now) >= QUIET_FROM && madridHour(now) < QUIET_TO) return { skipped: "noche" };
  let q = [];
  try { q = (await env.PORRA.get(PTS_Q_KEY, "json")) || []; } catch (e) { return { skipped: "sin cola" }; }
  if (!Array.isArray(q) || !q.length) return { sent: 0 };
  let chat = String(env.TELEGRAM_CHAT_ID || "");
  if (!chat) { try { const st = await env.PORRA.get(STATE_KEY, "json"); chat = String((st && st.chat) || ""); } catch (e) {} }
  if (!chat) return { skipped: "sin chat" };
  const rest = [];
  let sent = 0;
  for (const it of q) {
    if (sent >= 8) { rest.push(it); continue; }
    const ok = await send(env, f, chat, textoPuntos(it), { noPreview: true });
    if (ok) sent++; else rest.push(it);
  }
  try { await env.PORRA.put(PTS_Q_KEY, JSON.stringify(rest)); } catch (e) {}
  return { sent, pending: rest.length };
}

// Solo para pruebas
// Noticia propia con el once CONFIRMADO de cada partido, solo con nuestros datos (los de la lista oficial).
// Nada de texto de otras webs. Se retira sola 2 h después (regla del redactor).
async function publicarOnceWeb(env, m, md, key) {
  const lado = (t) => [["Portero", t.portero], ["Defensas", t.defensas], ["Medios", t.medios], ["Delanteros", t.delanteros]]
    .map(([et, l]) => { const n = (l || []).map((p) => p && p.name).filter(Boolean); return n.length ? et + ": " + n.join(", ") : ""; }).filter(Boolean);
  const h = lado(m.home), a = lado(m.away);
  if (!h.length || !a.length) return;
  const OWN = "own:news:v1";
  const own = (await env.PORRA.get(OWN, "json")) || [];
  const k = "once-" + key;
  if (own.some((o) => o.key === k)) return;
  const now = Date.now();
  const id = Array.from({ length: 10 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const cab = (t) => t.name + (t.formation ? " (" + t.formation + ")" : "");
  own.unshift({
    id, status: "published", expira: true, createdAt: now, updatedAt: now, publishedAt: now, thumb: "", tipo: "once", key: k,
    title: "Once confirmado: " + m.home.name + " – " + m.away.name,
    lead: "Alineaciones oficiales de la jornada " + md + ".",
    body: [cab(m.home)].concat(h, [""], [cab(m.away)], a).filter((x) => x !== "").join("\n"),
    club: m.home.name, players: [], source: null,
  });
  await env.PORRA.put(OWN, JSON.stringify(own.slice(0, 300)));
}

export const _t = { norm, ownMatch, sameTeam, newsAt, KW, inLineup, statusLabel, mercadoTexto };
