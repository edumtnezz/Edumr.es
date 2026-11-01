// avisos.js — avisos de Telegram para Edu (liga "Con Permisoo").
// Se ejecuta dentro del cron de 15 min (index.js) y solo manda lo NUEVO:
//   1) TODAS las noticias nuevas de FutbolFantasy (⭐ si nombran a un jugador tuyo,
//      🔔 si hablan de lesiones / sanciones / dudas / titularidad).
//   2) Alineación confirmada de TODOS los partidos (⭐ marca a tus jugadores).
//   3) Once probable actualizado: quién entra y quién sale (de todos los partidos).
//   4) Cambios en tus jugadores: el % de jugar de FutbolFantasy y el estado de Futmondo.
// Corre cada 5 min y lee las fuentes DIRECTAMENTE (endpoints noticias-rapido, probables?...,
// alineaciones-confirmadas?fresh=1: sin caché ni escrituras de KV) para ser rápido sin gastar el
// tope de 1.000 escrituras/día del plan gratis. Las alineaciones solo de día (08:00–24:00).
// Todo sale de la propia web (/api/laquiniela/...), que a su vez lee fuentes reales.
// Si un dato falta no se inventa: simplemente no se avisa.
// Sin TELEGRAM_BOT_TOKEN (secreto de Cloudflare) no hace nada.

const SITE = "https://edumr.es/api/laquiniela/";
const WEB = "https://edumr.es/futmondo/guiafantasy/";
const NEWS_PFX = "https://www.futbolfantasy.com/laliga/noticias/";
// Enlaces a TU web (nunca a la fuente): noticia → /noticias/<slug>, partido → /partido/<slug> (mismo slug que usa la web)
const newsUrl = (link) => { const sl = String(link || "").indexOf(NEWS_PFX) === 0 ? String(link).slice(NEWS_PFX.length).replace(/[?#].*$/, "").replace(/\/+$/, "") : ""; return WEB + "noticias" + (sl ? "/" + sl : ""); };
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
function ownMatch(title, squad) {
  const nt = norm(title);
  const hits = [];
  for (const p of squad) {
    const full = norm(p.name);
    if (!full) continue;
    if (hasWord(nt, full)) { hits.push(p.name); continue; }
    if (full.indexOf(" ") >= 0 && full.split(" ").some((t) => t.length >= 5 && !STOP.has(t) && hasWord(nt, t))) hits.push(p.name);
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
function noticiaTexto(title, hits, resumen, link) {
  const t = norm(title);
  const tag = /\b(lesion\w*|rotura|fractura|esguince|baja|bajas)\b/.test(t) ? "🚑 <b>BAJA</b>"
    : /\b(sancion\w*|apercibid\w*|expulsad\w*|suspendid\w*)\b/.test(t) ? "🟥 <b>SANCIÓN</b>"
    : /\b(duda|dudas|dudoso|molestias?)\b/.test(t) ? "⚠️ <b>DUDA</b>"
    : /\btitular\w*/.test(t) ? "✅ <b>TITULAR</b>" : "📰 <b>ÚLTIMA HORA</b>";
  return tag + (hits.length ? "  ·  ⭐ <b>TU JUGADOR</b>" : "") + "\n\n<b>" + esc(title) + "</b>" +
    (resumen ? "\n\n" + esc(resumen) : "") + (hits.length ? "\n\n⭐ Afecta a: <b>" + esc(hits.join(", ")) + "</b>" : "") +
    "\n\n👉 <b>Más información:</b>\n" + newsUrl(link);
}

// Aviso de mercado: 5 mayores subidas y 5 mayores bajadas (valores de Futmondo). null si no hay cambios.
function mercadoTexto(ps, own, sig) {
  const up = ps.filter((p) => p.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
  const down = ps.filter((p) => p.change < 0).sort((a, b) => a.change - b.change).slice(0, 5);
  if (!up.length && !down.length) return null;
  // Una línea por jugador, bien visible: "1 Berenguer 🟢▲ +888k€" / "1 Comesaña 🔻🔴 −395k€"
  const fila = (p, i, sube) => "<b>" + (i + 1) + "</b>  " + (own.has(String(p.id)) ? "⭐" : "") + "<b>" + esc(p.name) + "</b>  " + (sube ? "🟢▲ <b>+" : "🔻🔴 <b>−") + eur(p.change) + "</b>";
  const top = up.concat(down).filter((p) => own.has(String(p.id)));
  const gancho = [up[0] ? "🔥 <b>" + esc(up[0].name) + "</b> se dispara 🟢 <b>+" + eur(up[0].change) + "</b>" : "", down[0] ? "🧊 <b>" + esc(down[0].name) + "</b> se hunde 🔴 <b>−" + eur(down[0].change) + "</b>" : "", top.length ? "⭐ Tienes en el top: <b>" + esc(top.map((p) => p.name).join(", ")) + "</b>" : ""].filter(Boolean).join("\n");
  return "💹 <b>MERCADO EN MOVIMIENTO</b>\n\n" + gancho + "\n\n" +
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
  // Con fotos (escudos de los dos clubes): primero las fotos con un pie corto y luego el detalle en otro mensaje.
  // Si Telegram rechaza las fotos, sale todo como un solo texto.
  if (opts.photos && opts.photos.length >= 2 && opts.caption) {
    const media = opts.photos.slice(0, 10).map((u, i) => (i === 0 ? { type: "photo", media: u, caption: opts.caption, parse_mode: "HTML" } : { type: "photo", media: u }));
    const g = await tg(env, f, "sendMediaGroup", { chat_id: chat, media });
    if (g && g.ok) {
      const d = await tg(env, f, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      return !!(d && d.ok);
    }
    text = opts.caption + "\n\n" + text;
  }
  const lp = opts.small ? { is_disabled: false, prefer_small_media: true } : { is_disabled: false, prefer_large_media: true };
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
    getJson(f, "noticias-rapido?t=" + now).catch(() => getJson(f, "noticias")),
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
    const items = rNews.value.noticias.slice(0, 40).filter((x) => x && x.link && x.title);
    const cands = [];
    for (const x of items) {
      if (sent.has(x.link)) continue;
      const title = decode(x.title);
      const at = newsAt(x.date, x.time, now);
      if (!firstRun && !(at && now - at <= NEWS_MAX_AGE)) continue;
      const hits = ownMatch(title, squad);
      const kw = KW.test(norm(title));
      cands.push({ x, title, at, hits, kw });
    }
    cands.sort((a, b) => a.at - b.at); // las más antiguas primero
    for (const c of cands.slice(0, firstRun || quiet ? 0 : MAX_MSGS)) {
      // Resumen breve (la entradilla de la noticia); si no hay, el aviso sale sin él
      let resumen = "";
      try {
        const n = await getJson(f, "noticia?u=" + encodeURIComponent(c.x.link));
        resumen = decode(String(n.lead || "")).replace(/\s+/g, " ").trim();
        if (resumen.length > 150) resumen = resumen.slice(0, 150).replace(/\s+\S*$/, "") + "…";
      } catch (e) {}
      c.resumen = resumen;
    }
    for (const c of cands) {
      const text = noticiaTexto(c.title, c.hits, c.resumen, c.x.link);
      queue.push({ text, commit: () => { st.news = (st.news || []).concat([c.x.link]).slice(-200); dirty = true; } });
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
      const bloque = (t) => ["<b>" + esc(t.name) + "</b>" + (t.formation ? " (" + esc(t.formation) + ")" : ""),
        posLine("Por", t.portero, squad, t.name), posLine("Def", t.defensas, squad, t.name), posLine("Med", t.medios, squad, t.name), posLine("Del", t.delanteros, squad, t.name)].filter(Boolean).join("\n");
      const text = "✅ <b>ONCE CONFIRMADO</b>\n⚽ <b>" + esc(m.home.name) + " vs " + esc(m.away.name) + "</b>" + (cuando ? "\n🕒 " + esc(cuando) : "") +
        "\n\n" + bloque(m.home) + "\n\n" + bloque(m.away) + (fuera.length ? "\n\n⚠️ <b>Tuyos fuera del once:</b> " + esc(fuera.join(", ")) : "") +
        "\n\n👉 <b>Míralo en tu web:</b>\n" + matchUrl(web.home, web.away);
      queue.push({ text, commit });
    }
  }

  // 2b) Once probable actualizado: quién entra y quién sale. Se lee directo de FutbolFantasy en cada pasada
  // (cada 5 min) para los partidos de las próximas 72 h; solo avisa si el once cambia de verdad.
  if (!quiet) {
    try {
      if (doList) {
        const est = await getJson(f, "alineaciones-estado");
        const items = (est.items || []).filter((i) => i && i.home && i.away).map((i) => ({ home: i.home, away: i.away, ko: i.ko || 0, hc: i.hc || "", ac: i.ac || "" }));
        if (items.length && JSON.stringify(items) !== JSON.stringify(st.ml || null)) { st.ml = items; st.mlMd = est.matchday || 0; dirty = true; }
      }
      st.pr = st.pr || {};
      const todo = (st.ml || []).filter((m) => near(m.ko, 0, 72 * 3600e3));
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
        // Entra / sale / cambia el % (≥15 puntos) de un titular que sigue, con su posición
        const diff = (team, ahora, antes, fAntes, fAhora) => {
          antes = old(antes);
          const mb = new Map(antes.map((x) => [norm(x.n), x])), mn = new Map(ahora.map((x) => [norm(x.n), x]));
          const nm = (x) => "<b>" + esc(star(squad, team, x.n)) + "</b>";
          const pos = (x) => (x.s ? x.s + " · " : "");
          const byPos = (a, b) => (ORD[a.s || ""] - ORD[b.s || ""]);
          const entra = ahora.filter((x) => !mb.has(norm(x.n))).sort(byPos);
          const sale = antes.filter((x) => !mn.has(norm(x.n))).sort(byPos);
          const cambia = ahora.filter((x) => { const o = mb.get(norm(x.n)); return o && o.p != null && x.p != null && Math.abs(x.p - o.p) >= 15; }).sort(byPos);
          if (!entra.length && !sale.length && !cambia.length) return null;
          const sist = fAhora && fAntes && fAhora !== fAntes ? "  ·  sistema " + esc(fAntes) + " → " + esc(fAhora) : fAhora ? "  ·  " + esc(fAhora) : "";
          const l = [].concat(
            entra.map((x) => "🟢 <b>ENTRA</b> · " + pos(x) + nm(x) + (x.p == null ? "" : " · <b>" + x.p + "%</b>")),
            sale.map((x) => "🔴 <b>SALE</b> · " + pos(x) + nm(x) + (x.p == null ? "" : " · antes " + x.p + "%")),
            cambia.map((x) => { const o = mb.get(norm(x.n)); return "🟡 <b>%</b> · " + pos(x) + nm(x) + " · " + o.p + "% → <b>" + x.p + "%</b> " + (x.p > o.p ? "📈" : "📉"); }));
          return { txt: "<b>" + esc(team) + "</b>" + sist + "\n" + l.join("\n"), e: entra.length, s: sale.length, c: cambia.length };
        };
        const dd = [diff(m.home, H, prev.h, prev.fh, nuevo.fh), diff(m.away, A, prev.a, prev.fa, nuevo.fa)].filter(Boolean);
        if (!dd.length) continue;
        const upd = Math.max((d.home && d.home.updatedAt) || 0, (d.away && d.away.updatedAt) || 0);
        const cu = cuandoKo(m.ko);
        const tot = dd.reduce((a, x) => ({ e: a.e + x.e, s: a.s + x.s, c: a.c + x.c }), { e: 0, s: 0, c: 0 });
        const resumen = [tot.e ? tot.e + " entra" + (tot.e > 1 ? "n" : "") : "", tot.s ? tot.s + " sale" + (tot.s > 1 ? "n" : "") : "", tot.c ? tot.c + " con % distinto" : ""].filter(Boolean).join(" · ");
        const caption = "🔄 <b>ONCE PROBABLE ACTUALIZADO</b>\n⚽ <b>" + esc(m.home) + " vs " + esc(m.away) + "</b>\n" +
          [cu ? "🕒 " + esc(cu) : "", upd ? "Actualizado " + hhmm(upd) : ""].filter(Boolean).join("  ·  ");
        const text = dd.map((x) => x.txt).join("\n\n") + "\n\n📋 " + resumen + "\n\n👉 <b>Míralo en tu web:</b>\n" + matchUrl(m.home, m.away);
        queue.push({ text, caption, photos: m.hc && m.ac ? [m.hc, m.ac] : [], commit: () => { st.pr[key] = nuevo; dirty = true; } });
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
    if (cambios.length) queue.push({ text: "🚨 <b>TUS JUGADORES CAMBIAN</b>\n\n" + cambios.join("\n") + "\n\n👉 <b>Míralo en tu web:</b>\n" + WEB, commit });
    else if (JSON.stringify(nuevo) !== JSON.stringify(st.sq || {})) commit();
  }

  // PRUEBA ÚNICA (pedida por Edu, 01/11): manda una noticia real y la tabla de mercado real, marcadas como prueba. Se borra tras usarse.
  if (!firstRun && !quiet && !st.demo4 && !(deps && deps.noDemo)) {
    try {
      const own = new Set(squad.map((p) => String(p.id)));
      const ps = ((await getMk()).players || []).filter((p) => p && p.name && Number.isFinite(p.change));
      const mt = ps.length > 50 ? mercadoTexto(ps, own, hash(ps.map((p) => p.id + ":" + p.change).join("|"))) : null;
      const n0 = rNews.status === "fulfilled" && (rNews.value.noticias || []).find((x) => x && x.link && x.title);
      let nt = null;
      if (n0) {
        let resumen = "";
        try { const n = await getJson(f, "noticia?u=" + encodeURIComponent(n0.link)); resumen = decode(String(n.lead || "")).replace(/\s+/g, " ").trim(); if (resumen.length > 150) resumen = resumen.slice(0, 150).replace(/\s+\S*$/, "") + "…"; } catch (e) {}
        nt = "🧪 <i>PRUEBA</i>\n" + noticiaTexto(decode(n0.title), ownMatch(decode(n0.title), squad), resumen, n0.link);
      }
      const dcommit = () => { st.demo4 = 1; dirty = true; };
      if (mt) queue.unshift({ text: "🧪 <i>PRUEBA</i>\n" + mt, commit: dcommit });
      if (nt) queue.unshift({ text: nt, commit: dcommit });
      if (!mt && !nt) dcommit();
    } catch (e) {}
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

  if (dirty) { try { await env.PORRA.put(STATE_KEY, JSON.stringify(st)); } catch (e) {} }
  return { sent: sentCount, pending: queue.length - sentCount, quiet, firstRun };
}

// Solo para pruebas
export const _t = { norm, ownMatch, sameTeam, newsAt, KW, inLineup, statusLabel };
