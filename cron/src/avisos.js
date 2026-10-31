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

// ---------- Telegram ----------
async function tg(env, f, method, body) {
  try {
    const r = await f("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return null; }
}
async function send(env, f, chat, text) {
  const j = await tg(env, f, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: false } });
  return !!(j && j.ok);
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

  const queue = []; // { text, commit }

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
    for (const c of cands) {
      const text = (c.hits.length ? "⭐ " : c.kw ? "🔔 " : "📰 ") + "<b>" + esc(c.title) + "</b>" + (c.hits.length ? "\nCoincide con tu jugador: " + esc(c.hits.join(", ")) : "") + "\n" + newsUrl(c.x.link);
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
      const text = "✅ <b>Alineación confirmada</b>\n" + esc(m.home.name) + " – " + esc(m.away.name) + (cuando ? " · " + esc(cuando) : "") +
        "\n\n" + bloque(m.home) + "\n\n" + bloque(m.away) + (fuera.length ? "\n\nTuyos fuera del once: " + esc(fuera.join(", ")) : "") +
        "\n\n" + matchUrl(web.home, web.away);
      queue.push({ text, commit });
    }
  }

  // 2b) Once probable actualizado: quién entra y quién sale. Se lee directo de FutbolFantasy en cada pasada
  // (cada 5 min) para los partidos de las próximas 72 h; solo avisa si el once cambia de verdad.
  if (!quiet) {
    try {
      if (doList) {
        const est = await getJson(f, "alineaciones-estado");
        const items = (est.items || []).filter((i) => i && i.home && i.away).map((i) => ({ home: i.home, away: i.away, ko: i.ko || 0 }));
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
        const H = (d.home && d.home.starters || []).map((p) => p.name), A = (d.away && d.away.starters || []).map((p) => p.name);
        if (H.length < 10 || A.length < 10) continue; // página sin once: no se interpreta como "han salido todos"
        const nuevo = { h: H, a: A };
        if (!prev || firstRun) { st.pr[key] = nuevo; dirty = true; continue; } // primera vez que lo vemos: se guarda sin avisar
        const diff = (team, now2, before) => {
          const nb = new Set(before.map(norm)), nn = new Set(now2.map(norm));
          const entra = now2.filter((x) => !nb.has(norm(x))), sale = before.filter((x) => !nn.has(norm(x)));
          if (!entra.length && !sale.length) return "";
          return "<b>" + esc(team) + "</b>: " + (entra.length ? "entra " + esc(entra.map((x) => star(squad, team, x)).join(", ")) : "") + (entra.length && sale.length ? " · " : "") + (sale.length ? "sale " + esc(sale.map((x) => star(squad, team, x)).join(", ")) : "");
        };
        const lineas = [diff(m.home, H, prev.h || []), diff(m.away, A, prev.a || [])].filter(Boolean);
        if (!lineas.length) continue;
        const upd = Math.max((d.home && d.home.updatedAt) || 0, (d.away && d.away.updatedAt) || 0);
        const text = "🔄 <b>Once probable actualizado</b>\n" + esc(m.home) + " – " + esc(m.away) + (upd ? " · act. " + hhmm(upd) : "") + "\n" + lineas.join("\n") + "\n\n" + matchUrl(m.home, m.away);
        queue.push({ text, commit: () => { st.pr[key] = nuevo; dirty = true; } });
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
    if (cambios.length) queue.push({ text: "🔄 <b>Cambios en tus jugadores</b>\n" + cambios.join("\n") + "\n\n" + WEB, commit });
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
      if (await send(env, f, st.chat, q.text)) { q.commit(); sentCount++; }
      else break; // si Telegram falla, se reintenta en la siguiente pasada
    }
  }

  if (dirty) { try { await env.PORRA.put(STATE_KEY, JSON.stringify(st)); } catch (e) {} }
  return { sent: sentCount, pending: queue.length - sentCount, quiet, firstRun };
}

// Solo para pruebas
export const _t = { norm, ownMatch, sameTeam, newsAt, KW, inLineup, statusLabel };
