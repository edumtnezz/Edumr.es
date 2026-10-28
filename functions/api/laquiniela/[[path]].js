const COMPETITION = "PD";
const CACHE_TTL_MS = 60 * 1000;
const FORM_TTL_MS = 10 * 60 * 1000;
// Cuánto dura la sesión sin tener que volver a poner el nombre/código: 3
// años (antes 400 días). Controla a la vez la cookie del navegador
// (Max-Age) y cuánto vive la sesión guardada en el servidor (KV), así que
// hay que subir los dos a la vez o uno caducaría antes que el otro.
const SESSION_TTL = 60 * 60 * 24 * 1095;
const COOKIE_NAME = "porra_session";
const PBKDF2_ITER = 100000;
const MAX_LOGIN_FAILS = 3;
const PRIZE_PER_HIT = 150000;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function enc(s) {
  return new TextEncoder().encode(s);
}

function toHex(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function randomHex(nBytes) {
  const a = new Uint8Array(nBytes);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Hex(pin, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", enc(pin), { name: "PBKDF2" }, false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    key,
    256
  );
  return toHex(bits);
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function normName(v) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function stripAccents(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function nameKey(v) {
  return stripAccents(normName(v)).toLowerCase();
}

function validName(v) {
  const n = normName(v);
  return n.length >= 2 && /^[\p{L}\p{N} ._-]+$/u.test(n);
}

function validPin(v) {
  const p = String(v || "").trim();
  return /^\d{4}$/.test(p) || /^\d{6}$/.test(p);
}

function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  for (const part of c.split(";")) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    if (trimmed.slice(0, idx) === name) return decodeURIComponent(trimmed.slice(idx + 1));
  }
  return null;
}

function sessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const OPEN_STATUSES = ["SCHEDULED", "TIMED"];

function isOpenMatch(m, nowMs) {
  return OPEN_STATUSES.includes(m.status) && new Date(m.utcDate).getTime() > nowMs;
}

function resultFromScore(m) {
  if (!m || m.status !== "FINISHED") return null;
  const score = m.score;
  if (!score || !score.fullTime) return null;
  const h = score.fullTime.home;
  const a = score.fullTime.away;
  if (h === null || a === null || h === undefined || a === undefined) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "X";
}

/* ---------- Cuentas y sesiones ---------- */

async function getUser(env, key) {
  return env.PORRA.get(`user:${key}`, "json");
}

async function getSessionUser(env, request) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const sess = await env.PORRA.get(`sess:${token}`, "json");
  if (!sess || !sess.key) return null;
  const user = await getUser(env, sess.key);
  if (!user) return null;
  return { key: sess.key, name: user.name };
}

async function createSession(env, key) {
  const token = randomHex(32);
  await env.PORRA.put(`sess:${token}`, JSON.stringify({ key, created: Date.now() }), {
    expirationTtl: SESSION_TTL,
  });
  return token;
}

async function migrateLegacy(env, userKey, name) {
  const list = await env.PORRA.list({ prefix: "pred:" });
  for (const k of list.keys) {
    const parts = k.name.split(":");
    if (parts.length !== 2) continue;
    const jornada = parts[1];
    const all = await env.PORRA.get(k.name, "json");
    if (!all) continue;
    let changed = false;
    for (const [ak, val] of Object.entries(all)) {
      const nm = val && val.__name ? val.__name : ak;
      if (nameKey(nm) === userKey) {
        const picks = {};
        for (const [mid, p] of Object.entries(val)) {
          if (mid !== "__name" && ["1", "X", "2"].includes(p)) picks[mid] = p;
        }
        await savePrediction(env, jornada, userKey, {
          name: normName(nm),
          picks,
          updatedAt: new Date().toISOString(),
        });
        delete all[ak];
        changed = true;
      }
    }
    if (changed) await env.PORRA.put(k.name, JSON.stringify(all));
  }
}

/* ---------- Jornada / partidos ---------- */

function mockJornada(matchday) {
  const teams = [
    [["Real Madrid", 86], ["Barcelona", 81]],
    [["Atletico de Madrid", 78], ["Sevilla", 559]],
    [["Real Sociedad", 92], ["Athletic Club", 77]],
    [["Villarreal", 94], ["Valencia", 95]],
    [["Real Betis", 90], ["Girona", 298]],
    [["Celta de Vigo", 558], ["Osasuna", 79]],
    [["Rayo Vallecano", 87], ["Getafe", 82]],
    [["Mallorca", 89], ["Alaves", 263]],
    [["Las Palmas", 275], ["Espanyol", 80]],
    [["Leganes", 745], ["Valladolid", 250]],
  ];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const base = now + day;
  const matches = teams.map((t, i) => {
    const utcDate = new Date(base + i * (day * 0.7));
    const home = t[0];
    const away = t[1];
    return {
      id: 9000 + matchday * 10 + i,
      utcDate: utcDate.toISOString(),
      status: "SCHEDULED",
      homeTeam: {
        id: home[1],
        name: home[0],
        shortName: home[0],
        tla: home[0].split(" ")[0].slice(0, 3).toUpperCase(),
        crest: `https://crests.football-data.org/${home[1]}.png`,
      },
      awayTeam: {
        id: away[1],
        name: away[0],
        shortName: away[0],
        tla: away[0].split(" ")[0].slice(0, 3).toUpperCase(),
        crest: `https://crests.football-data.org/${away[1]}.png`,
      },
      score: { fullTime: { home: null, away: null } },
    };
  });
  return { matchday, source: "mock", matches };
}

async function fetchMatchday(headers, md) {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${COMPETITION}/matches?matchday=${md}`,
    { headers }
  );
  if (!res.ok) throw new Error("matches " + res.status);
  const data = await res.json();
  return patchStaleWithFotMob((data.matches || []).map((m) => ({
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    homeTeam: {
      id: m.homeTeam && m.homeTeam.id,
      name: m.homeTeam && m.homeTeam.name,
      shortName: m.homeTeam && m.homeTeam.shortName,
      tla: m.homeTeam && m.homeTeam.tla,
      crest: m.homeTeam && m.homeTeam.crest,
    },
    awayTeam: {
      id: m.awayTeam && m.awayTeam.id,
      name: m.awayTeam && m.awayTeam.name,
      shortName: m.awayTeam && m.awayTeam.shortName,
      tla: m.awayTeam && m.awayTeam.tla,
      crest: m.awayTeam && m.awayTeam.crest,
    },
    score: m.score || { fullTime: { home: null, away: null } },
  })));
}

// football-data a veces tarda días en pasar un partido a FINISHED (visto con el Deportivo–Levante) y entonces
// la quiniela lo deja "Por jugar" sin resultado. Si un partido lleva >3 h empezado y sigue sin cerrar, se
// consulta FotMob (fuente real) y SOLO si dice que terminó, con marcador, se corrige estado y resultado.
async function patchStaleWithFotMob(matches) {
  try {
    const now = Date.now();
    const stale = matches.filter((m) => !["FINISHED", "POSTPONED", "SUSPENDED", "CANCELLED", "AWARDED"].includes(m.status) && now - new Date(m.utcDate).getTime() > 3 * 3600 * 1000);
    if (!stale.length) return matches;
    const STOP = new Set(["de", "la", "el", "club", "fc", "cf", "ud", "cd", "rcd", "sd", "rc", "ca", "real"]);
    const toks = (n) => String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w && !STOP.has(w));
    const ov = (a, b) => { const tb = new Set(b); return a.filter((w) => tb.has(w)).length; };
    const days = {};
    for (const m of stale) {
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(m.utcDate)).replace(/-/g, "");
      if (!days[ymd]) {
        try {
          const r = await fetch("https://www.fotmob.com/api/data/matches?date=" + ymd + "&timezone=Europe%2FMadrid&ccode3=ESP", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
          const j = await r.json();
          days[ymd] = [].concat(...((j.leagues || []).map((lg) => lg.matches || [])));
        } catch (e) { days[ymd] = []; }
      }
      const th = toks((m.homeTeam.name || "") + " " + (m.homeTeam.shortName || "")), ta = toks((m.awayTeam.name || "") + " " + (m.awayTeam.shortName || ""));
      let best = null, bs = 0;
      for (const x of days[ymd]) {
        const sh = ov(th, toks((x.home || {}).longName || (x.home || {}).name)), sa = ov(ta, toks((x.away || {}).longName || (x.away || {}).name));
        if (sh > 0 && sa > 0 && sh + sa > bs) { bs = sh + sa; best = x; }
      }
      const st = best && best.status;
      const mm = st && st.finished && !st.cancelled ? String(st.scoreStr || "").match(/^(\d+)\s*-\s*(\d+)$/) : null;
      if (mm) {
        const h = Number(mm[1]), a = Number(mm[2]);
        m.status = "FINISHED";
        m.score = { winner: h > a ? "HOME_TEAM" : h < a ? "AWAY_TEAM" : "DRAW", fullTime: { home: h, away: a } };
      }
    }
  } catch (e) {}
  return matches;
}

// Fin del día (23:59:59.999) en hora de Madrid del instante ms, con horario de verano/invierno correcto
function madridDayEnd(ms) {
  const fmt = (o) => new Intl.DateTimeFormat("en-CA", Object.assign({ timeZone: "Europe/Madrid" }, o));
  const ymd = fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const off = (fmt({ timeZoneName: "longOffset" }).formatToParts(new Date(ms)).find((x) => x.type === "timeZoneName") || {}).value || "GMT+02:00";
  const m = off.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  const sign = m ? m[1] : "+", hh = m ? String(m[2]).padStart(2, "0") : "02", mm = m && m[3] ? m[3] : "00";
  const t = Date.parse(ymd + "T23:59:59.999" + sign + hh + ":" + mm);
  return isNaN(t) ? ms + 24 * 3600 * 1000 : t;
}
const isMatchDone = (m) => m.status === "FINISHED" || m.status === "POSTPONED" || m.status === "SUSPENDED" || m.status === "CANCELLED" || m.status === "AWARDED";
async function fetchFootballData(env, matchday, hold) {
  const token = env.FOOTBALL_API_KEY;
  if (!token) return null;
  const headers = { "X-Auth-Token": token };
  let md = matchday ? Number(matchday) : null;
  if (!md) {
    const compRes = await fetch(
      `https://api.football-data.org/v4/competitions/${COMPETITION}`,
      { headers }
    );
    if (!compRes.ok) throw new Error("comp " + compRes.status);
    const comp = await compRes.json();
    md = comp.currentSeason && comp.currentSeason.currentMatchday;
  }
  if (!md) return null;
  let matches = await fetchMatchday(headers, md);
  if (!matchday && matches.length) {
    // "Terminada" = todos los partidos jugados, aplazados o suspendidos: un partido suspendido
    // (Rayo–Athletic) no debe dejar la jornada atascada para siempre.
    const lastEndOf = (ms) => {
      const last = Math.max.apply(null, ms.filter((m) => m.status === "FINISHED").map((m) => Date.parse(m.utcDate) || 0).concat([0]));
      return last ? madridDayEnd(last + 2 * 3600 * 1000) : 0;
    };
    let held = false;
    if (matches.every(isMatchDone)) {
      // Con hold (franja de jornada de Inicio) se sigue enseñando hasta las 23:59 (Madrid) del día
      // en que acabó su último partido; después, la siguiente. Sin hold (juegos), pasa enseguida.
      if (hold && Date.now() < lastEndOf(matches)) held = true;
      if (!held) {
        let nextFailed = false, moved = false;
        for (let next = md + 1; next <= md + 3; next++) {
          try {
            const nm = await fetchMatchday(headers, next);
            if (nm.length) { md = next; matches = nm; moved = true; break; }
          } catch (e) { nextFailed = true; break; }
        }
        // Si no se pudo consultar la siguiente (límite de football-data) NO se da por buena la jornada
        // terminada: se lanza el error y getJornadaRaw sirve la última copia buena (la jornada nueva).
        if (!moved && nextFailed) throw new Error("siguiente jornada no disponible");
      }
    } else if (hold && md > 1 && matches.every((m) => m.status === "SCHEDULED" || m.status === "TIMED")) {
      // football-data ya avanzó a la siguiente: la recién terminada se mantiene hasta las 23:59 del día
      try {
        const pm = await fetchMatchday(headers, md - 1);
        if (pm.length && pm.every(isMatchDone) && Date.now() < lastEndOf(pm)) { md = md - 1; matches = pm; }
      } catch (e) {}
    }
  }
  // football-data abrevia el Racing como "Santander" y en la web se enseña
  // siempre "Racing de Santander" (pedido por Edu). Se cambia el shortName,
  // del que salen todos los nombres que se pintan; el emparejamiento con
  // otras fuentes sigue funcionando porque wkey() aliasa santander→racing.
  matches.forEach((m) => {
    if (m.homeTeam && m.homeTeam.shortName === "Santander") m.homeTeam.shortName = "Racing de Santander";
    if (m.awayTeam && m.awayTeam.shortName === "Santander") m.awayTeam.shortName = "Racing de Santander";
    if (m.homeTeam && (m.homeTeam.tla === "SAN" || m.homeTeam.shortName === "Racing de Santander")) m.homeTeam.tla = "RAC";
    if (m.awayTeam && (m.awayTeam.tla === "SAN" || m.awayTeam.shortName === "Racing de Santander")) m.awayTeam.tla = "RAC";
  });
  return { matchday: md, source: "football-data", matches };
}

// Escudos desactualizados de football-data → versión actual (Futmondo, 128 px)
const CREST_FIX = { 263: "https://static02.mondocore.com/futmondo/img/teams/128/deportivo-alaves.png", 84: "https://static02.mondocore.com/futmondo/img/teams/128/malaga.png" };
function fixCrests(data) {
  try {
    ((data && data.matches) || []).forEach((m) => {
      [m.homeTeam, m.awayTeam].forEach((t) => { if (t && CREST_FIX[t.id]) t.crest = CREST_FIX[t.id]; });
    });
  } catch (e) {}
  return data;
}
async function getJornada(env, matchday, hold) {
  // Si football-data no responde y no hay copia buena: jornada vacía (nunca partidos inventados)
  const jr = (await getJornadaRaw(env, matchday, hold)) || { matchday: Number(matchday) || 0, source: "none", matches: [] };
  // Un estado que no es de football-data (p. ej. una fecha) hacía que el partido no contara como pendiente
  (jr.matches || []).forEach((m) => { if (m && !/^[A-Z_]+$/.test(String(m.status || ""))) m.status = "TIMED"; });
  return fixCrests(jr);
}
async function getJornadaRaw(env, matchday, hold) {
  const kv = env.PORRA;
  const cacheKey = `jornada:${matchday || (hold ? "currenthold" : "current")}`;
  let raw = null;
  try { raw = (await edgeGet(cacheKey)) || null; } catch (e) {}
  if (!raw) { try { raw = await kv.get(cacheKey, "json"); } catch (e) {} }
  // Una jornada con todos los partidos terminados ya no cambia: se guarda horas. Si no, 1 minuto.
  const okRaw = raw && raw.data && raw.data.source === "football-data" ? raw : null;
  if (okRaw && okRaw.fetchedAt && Date.now() - okRaw.fetchedAt < (okRaw.final ? 6 * 3600 * 1000 : (okRaw.ttlMs || CACHE_TTL_MS))) {
    return okRaw.data;
  }
  let data = null;
  try {
    data = await fetchFootballData(env, matchday, hold);
  } catch (e) {
    data = null;
  }
  if (!data || !data.matches || !data.matches.length) {
    // football-data falla o limita (10 peticiones/min): se sirve lo último bueno que hubiera.
    // NUNCA datos inventados (antes caía a una jornada falsa Real Madrid–Barcelona).
    if (!matchday && okRaw && okRaw.data.matches && okRaw.data.matches.length && okRaw.data.matches.every(isMatchDone)) {
      // la copia es una jornada ya terminada: mejor la siguiente si ya la teníamos guardada
      try {
        const nx = await kv.get(`jornada:${Number(okRaw.data.matchday) + 1}`, "json");
        if (nx && nx.data && nx.data.source === "football-data" && nx.data.matches && nx.data.matches.length) return nx.data;
      } catch (e) {}
    }
    return okRaw ? okRaw.data : null;
  }
  const final = !!matchday && data.matches.every((m) => m.status === "FINISHED");
  // Jornada futura (todos los partidos por jugar): cambia poco, 3 h. Así navegar por las jornadas no agota el
  // límite de football-data (10/min) y no salen "Sin jornada". La copia vieja se conserva 7 días por si falla.
  const allFuture = !!matchday && data.matches.every((m) => m.status === "SCHEDULED" || m.status === "TIMED");
  const rec = { fetchedAt: Date.now(), final, ttlMs: allFuture ? 3 * 3600 * 1000 : 0, data, kvAt: Date.now() };
  // La copia "de por vida" en KV (por si football-data falla) solo se reescribe si hay cambios o pasó más de 1 hora:
  // la caché del edge sirve las lecturas de cada minuto sin gastar escrituras diarias.
  let same = false;
  try { same = !!(okRaw && okRaw.data && JSON.stringify(okRaw.data.matches) === JSON.stringify(data.matches) && Date.now() - (okRaw.kvAt || okRaw.fetchedAt || 0) < 3600 * 1000); } catch (e) {}
  if (same) rec.kvAt = okRaw.kvAt || okRaw.fetchedAt;
  await edgePut(cacheKey, rec, final ? 21600 : (allFuture ? 10800 : 120));
  if (!same) { try { await kv.put(cacheKey, JSON.stringify(rec), { expirationTtl: 7 * 24 * 3600 }); } catch (e) {} }
  return data;
}

async function getFormMap(env) {
  const cacheKey = "form:PD";
  const cached = await env.PORRA.get(cacheKey, "json");
  const hasGood = cached && cached.data && Object.keys(cached.data).length > 0;
  // Datos buenos recientes: se sirven. Si el último intento falló hace poco (football-data
  // limita las peticiones), se sirve lo último bueno y no se reintenta hasta pasados 5 minutos.
  if (hasGood && cached.fetchedAt && Date.now() - cached.fetchedAt < FORM_TTL_MS) return cached.data;
  if (cached && cached.failedAt && Date.now() - cached.failedAt < 300000) return hasGood ? cached.data : {};
  const token = env.FOOTBALL_API_KEY;
  let data = null;
  if (token) {
    try {
      const res = await fetch(
        `https://api.football-data.org/v4/competitions/${COMPETITION}/matches?status=FINISHED`,
        { headers: { "X-Auth-Token": token } }
      );
      if (res.ok) {
        const j = await res.json();
        const acc = {};
        for (const m of j.matches || []) {
          const d = new Date(m.utcDate).getTime();
          const w = m.score && m.score.winner;
          const hid = m.homeTeam && m.homeTeam.id;
          const aid = m.awayTeam && m.awayTeam.id;
          if (hid) {
            (acc[hid] = acc[hid] || []).push({
              d,
              r: w === "HOME_TEAM" ? "V" : w === "AWAY_TEAM" ? "D" : "E",
              home: true,
            });
          }
          if (aid) {
            (acc[aid] = acc[aid] || []).push({
              d,
              r: w === "AWAY_TEAM" ? "V" : w === "HOME_TEAM" ? "D" : "E",
              home: false,
            });
          }
        }
        const out = {};
        for (const [id, arr] of Object.entries(acc)) {
          arr.sort((x, y) => y.d - x.d);
          out[id] = arr.slice(0, 5).map((x) => ({ r: x.r, home: x.home }));
        }
        if (Object.keys(out).length) data = out;
      }
    } catch (e) {
      data = null;
    }
  }
  if (data) {
    await env.PORRA.put(cacheKey, JSON.stringify({ fetchedAt: Date.now(), data }), { expirationTtl: 7 * 86400 });
    return data;
  }
  // Fallo: NO se guarda un "vacío" como si fuera bueno; se conserva lo último bueno y se anota el fallo.
  try {
    await env.PORRA.put(cacheKey, JSON.stringify({ fetchedAt: cached && cached.fetchedAt, data: hasGood ? cached.data : null, failedAt: Date.now() }), { expirationTtl: 7 * 86400 });
  } catch (e) {}
  return hasGood ? cached.data : {};
}

function lockTimeOf(matches) {
  let min = null;
  for (const m of matches) {
    if (m.status === "FINISHED") continue;
    const t = new Date(m.utcDate).getTime();
    if (min === null || t < min) min = t;
  }
  if (min === null) {
    for (const m of matches) {
      const t = new Date(m.utcDate).getTime();
      if (min === null || t > min) min = t;
    }
  }
  return min;
}

async function getPredictions(env, jornada) {
  const prefix = `pred:${jornada}:`;
  const aggKey = `all:${jornada}`;
  const agg = (await env.PORRA.get(aggKey, "json")) || {};
  const out = {};
  for (const [k, v] of Object.entries(agg)) out[k] = v;

  const list = await env.PORRA.list({ prefix });
  const missing = list.keys.filter((k) => !out[k.name.slice(prefix.length)]);
  if (missing.length) {
    await Promise.all(
      missing.map(async (k) => {
        const v = await env.PORRA.get(k.name, "json");
        if (v) out[k.name.slice(prefix.length)] = v;
      })
    );
    await env.PORRA.put(aggKey, JSON.stringify(out));
  }
  return out;
}

async function savePrediction(env, jornada, key, entry) {
  await env.PORRA.put(`pred:${jornada}:${key}`, JSON.stringify(entry));
  const aggKey = `all:${jornada}`;
  const agg = (await env.PORRA.get(aggKey, "json")) || {};
  agg[key] = entry;
  await env.PORRA.put(aggKey, JSON.stringify(agg));
}

async function buildState(env, matchday, user) {
  const jornada = await getJornada(env, matchday);
  const matches = jornada.matches || [];
  const lock = lockTimeOf(matches);
  const locked = lock !== null && Date.now() >= lock;
  const [preds, form] = await Promise.all([getPredictions(env, jornada.matchday), getFormMap(env)]);

  const results = {};
  for (const m of matches) {
    const r = resultFromScore(m);
    if (r) results[m.id] = r;
  }

  const standings = Object.entries(preds)
    .map(([key, entry]) => {
      const picks = entry.picks || {};
      let hits = 0;
      let played = 0;
      let total = 0;
      for (const m of matches) {
        const pick = picks[m.id];
        if (!pick) continue;
        total++;
        const r = results[m.id];
        if (!r) continue;
        played++;
        if (pick === r) hits++;
      }
      return {
        key,
        name: entry.name || key,
        hits,
        played,
        total,
        missed: Math.max(0, played - hits),
      };
    })
    .sort((a, b) => b.hits - a.hits || b.played - a.played || a.name.localeCompare(b.name));

  standings.forEach((s, i) => {
    s.rank = i + 1;
    s.prize = s.hits * PRIZE_PER_HIT;
  });

  const revealAll = true;
  const participants = Object.entries(preds)
    .map(([key, entry]) => ({
      key,
      name: entry.name || key,
      picks: revealAll ? entry.picks || {} : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const myEntry = user ? preds[user.key] : null;

  const outMatches = matches.slice().sort((x, y) => new Date(x.utcDate) - new Date(y.utcDate)).map((m) => {
    const hid = m.homeTeam && m.homeTeam.id;
    const aid = m.awayTeam && m.awayTeam.id;
    return {
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      home: m.homeTeam && (m.homeTeam.shortName || m.homeTeam.name),
      away: m.awayTeam && (m.awayTeam.shortName || m.awayTeam.name),
      homeFull: m.homeTeam && m.homeTeam.name,
      awayFull: m.awayTeam && m.awayTeam.name,
      homeCrest: m.homeTeam && m.homeTeam.crest,
      awayCrest: m.awayTeam && m.awayTeam.crest,
      homeTla: m.homeTeam && m.homeTeam.tla,
      awayTla: m.awayTeam && m.awayTeam.tla,
      homeForm: (hid && form[hid]) || [],
      awayForm: (aid && form[aid]) || [],
      started: !isOpenMatch(m, Date.now()),
      result: results[m.id] || null,
      score:
        m.score && m.score.fullTime
          ? { home: m.score.fullTime.home, away: m.score.fullTime.away }
          : null,
    };
  });

  const myPicks = myEntry && myEntry.picks ? myEntry.picks : {};

  let first = null;
  for (const m of matches) {
    if (!first) {
      first = m;
      continue;
    }
    const curT = new Date(first.utcDate).getTime();
    const mT = new Date(m.utcDate).getTime();
    const curFin = first.status === "FINISHED";
    const mFin = m.status === "FINISHED";
    if (curFin && !mFin) first = m;
    else if (curFin === mFin && mT < curT) first = m;
  }

  const nowMs = Date.now();
  const openMatches = matches.filter((m) => isOpenMatch(m, nowMs));
  const openCount = openMatches.length;
  let next = null;
  for (const m of openMatches) {
    if (!next || new Date(m.utcDate) < new Date(next.utcDate)) next = m;
  }

  return {
    matchday: jornada.matchday,
    source: jornada.source,
    lockTime: lock,
    locked,
    openCount,
    nextMatch: next
      ? {
          home: next.homeTeam && (next.homeTeam.shortName || next.homeTeam.name),
          away: next.awayTeam && (next.awayTeam.shortName || next.awayTeam.name),
          utcDate: next.utcDate,
        }
      : null,
    firstMatch: first
      ? {
          home: first.homeTeam && (first.homeTeam.shortName || first.homeTeam.name),
          away: first.awayTeam && (first.awayTeam.shortName || first.awayTeam.name),
          utcDate: first.utcDate,
        }
      : null,
    matches: outMatches,
    myPicks,
    myName: user ? user.name : null,
    hasPrediction: !!(myEntry && myEntry.picks && Object.keys(myEntry.picks).length),
    standings,
    participants,
    revealAll,
    prizePerHit: PRIZE_PER_HIT,
    players: standings.length,
  };
}

async function buildGlobal(env) {
  const cur = (await getJornada(env, null)).matchday || 1;
  const maxJ = Math.min(cur, 38);
  const players = {};
  const jornadas = [];
  for (let j = 1; j <= maxJ; j++) {
    const preds = await getPredictions(env, j);
    const keys = Object.keys(preds);
    if (!keys.length) continue;
    const jornada = await getJornada(env, j);
    const results = {};
    for (const m of jornada.matches || []) {
      const r = resultFromScore(m);
      if (r) results[m.id] = r;
    }
    jornadas.push(j);
    for (const key of keys) {
      const entry = preds[key];
      const picks = entry.picks || {};
      let hits = 0;
      let played = 0;
      for (const m of jornada.matches || []) {
        const p = picks[m.id];
        if (!p || !results[m.id]) continue;
        played++;
        if (p === results[m.id]) hits++;
      }
      if (!players[key]) {
        players[key] = { key, name: entry.name || key, total: 0, played: 0, byJornada: {}, jornadas: 0 };
      }
      players[key].total += hits;
      players[key].played += played;
      players[key].byJornada[j] = hits;
      players[key].jornadas++;
    }
  }
  const standings = Object.values(players).sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name)
  );
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });
  return { current: cur, jornadas, standings };
}

/* ---------- Handlers ---------- */

const PUJA_KEY = "puja:current";
const PUJA_HIST_KEY = "puja:history";

async function getPujaHistory(env) {
  const h = await env.PORRA.get(PUJA_HIST_KEY, "json");
  return Array.isArray(h) ? h : [];
}

async function archivePuja(env, p) {
  if (!p || p.archived) return;
  const hist = await getPujaHistory(env);
  hist.unshift({
    id: p.id,
    player: p.player,
    photo: p.photo || "",
    value: p.value || 0,
    creator: p.creator || "",
    winner: p.winner ? p.winner.user : null,
    amount: p.winner ? p.winner.amount : 0,
    bids: (p.bids || []).map((b) => ({ user: b.user, amount: b.amount })),
    closedAt: p.closesAt || null,
  });
  await env.PORRA.put(PUJA_HIST_KEY, JSON.stringify(hist.slice(0, 100)));
  p.archived = true;
  await env.PORRA.put(PUJA_KEY, JSON.stringify(p));
}

const FUTMONDO_BASE = "https://api.futmondo.com";
const FUTMONDO_CHAMPIONSHIP = "6a5f4b833633f9d0e371f838";
const FUTMONDO_USERTEAM = "6ab314563a9cf632cef6291c";
const FACE_BASE = "https://static01.mondocore.com/futmondo/img/faces/64/";
const LOGO_BASE = "https://static02.mondocore.com/futmondo/img/teams/64/";
const MARKET_KEY = "fm:market:v4";
const SEASON_KEY = "fm:season:v1";
const MARKET_TTL_MS = 10 * 60 * 1000;
let fmToken = null;

async function futbolPost(path, header, query) {
  const res = await fetch(FUTMONDO_BASE + path, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: "https://app.futmondo.com",
      referer: "https://app.futmondo.com/",
    },
    body: JSON.stringify({ header, query, answer: {} }),
  });
  if (!res.ok) throw new Error("futmondo " + res.status);
  return res.json();
}

async function futbolHeader(env) {
  if (fmToken && Date.now() - fmToken.at < 50 * 60 * 1000) {
    return { token: fmToken.token, userid: fmToken.userid };
  }
  const login = await futbolPost(
    "/5/login/with_mail",
    { token: "null", userid: "" },
    { mail: env.FUTMONDO_EMAIL, pwd: env.FUTMONDO_PASSWORD }
  );
  const m = (login.answer && login.answer.mobile) || {};
  if (!m.token) throw new Error("login fallido");
  fmToken = { token: m.token, userid: m.userid, at: Date.now() };
  return { token: m.token, userid: m.userid };
}

async function getMarketPlayers(env, force) {
  const cached = await env.PORRA.get(MARKET_KEY, "json");
  if (!force && cached && Date.now() - (cached.at || 0) < MARKET_TTL_MS) return cached;
  const header = await futbolHeader(env);
  const [plRes, tmRes] = await Promise.all([
    futbolPost("/5/league/championshipplayers", header, { championshipId: FUTMONDO_CHAMPIONSHIP }),
    futbolPost("/1/league/championshipteams", header, { championshipId: FUTMONDO_CHAMPIONSHIP }),
  ]);
  const teamMap = {};
  for (const t of tmRes.answer || []) {
    if (t && t.id) teamMap[t.id] = { name: t.name || "", logo: t.logo || "" };
  }
  const arr = (plRes.answer && plRes.answer.players) || (Array.isArray(plRes.answer) ? plRes.answer : []);
  const players = arr.map((p) => {
    const tm = teamMap[p.teamId] || {};
    return {
      id: String(p.id || ""),
      name: String(p.name || ""),
      role: String(p.role || ""),
      role2: String(p.role2 || ""),
      value: Number(p.value) || 0,
      change: Number(p.change) || 0,
      team: tm.name || String(p.team || ""),
      status: String(p.status || ""),
      points: Number(p.points) || 0,
      matches: Number((p.average && p.average.matches) || 0) || 0,
      avg: Number((p.average && p.average.average) || 0) || 0,
      age: Number(p.age) || Number(p.edad) || 0,
      fitness: (p.average && p.average.fitness) || [],
      computer: p.computer === true,
      photo: p.photo ? FACE_BASE + p.photo : "",
      logo: tm.logo ? LOGO_BASE + tm.logo : "",
    };
  }).filter((p) => p.name && p.team);
  const out = { at: Date.now(), players };
  await env.PORRA.put(MARKET_KEY, JSON.stringify(out), { expirationTtl: 1800 });
  return out;
}

const TEAMS_KEY = "fm:teams:v1";
async function getTeams(env) {
  try {
    const cached = await env.PORRA.get(TEAMS_KEY, "json");
    if (cached && cached.at && Date.now() - cached.at < 6 * 3600 * 1000) return cached.teams || [];
  } catch (e) {}
  const header = await futbolHeader(env);
  const tmRes = await futbolPost("/1/league/championshipteams", header, { championshipId: FUTMONDO_CHAMPIONSHIP });
  const teams = (tmRes.answer || []).map((t) => {
    let name = String(t.name || "");
    if (/^racing( de santander| santander)?$/i.test(name)) name = "Racing de Santander";
    return {
      id: String(t.id || ""),
      name,
      logo: t.logo ? LOGO_BASE + t.logo : "",
    };
  }).filter((t) => t.name);
  try { await env.PORRA.put(TEAMS_KEY, JSON.stringify({ at: Date.now(), teams }), { expirationTtl: 6 * 3600 }); } catch (e) {}
  return teams;
}

async function getRachas(env) {
  let cache;
  try { cache = await getMarketPlayers(env); } catch (e) { return { players: [], updatedAt: null }; }
  let players = cache.players || [];
  try {
    const map = await ffMap(env);
    players = players.map((p) => { const e = ffPick(p.name, map); return e ? { ...p, prob: e.prob, rivalFf: e.rival, casaFf: e.casa, chg1: e.d1, chg7: e.d7, chg14: e.d14, chg30: e.d30 } : p; });
  } catch (e) {}
  const rachas = [];
  for (const p of players) {
    const f = (p.fitness || []).map((x) => Number(x) || 0);
    if (f.length < 3) continue;
    let streak = 0;
    for (let i = f.length - 1; i >= 0; i--) { if (f[i] > 0) streak++; else break; }
    if (streak < 3) continue;
    const fit = f.slice(-5);
    rachas.push({
      id: p.id, name: p.name, role: p.role, role2: p.role2, team: p.team, logo: p.logo, photo: p.photo,
      value: p.value, change: p.change, points: p.points, matches: p.matches, avg: p.avg,
      status: p.status, prob: p.prob, rivalFf: p.rivalFf, casaFf: p.casaFf,
      chg1: p.chg1, chg7: p.chg7, chg14: p.chg14, chg30: p.chg30,
      streak, fit,
    });
  }
  rachas.sort((a, b) => b.streak - a.streak || (b.points || 0) - (a.points || 0));
  const jornada = players.reduce((m, p) => Math.max(m, Number(p.matches) || 0), 0);
  return { updatedAt: cache.at || null, jornada, players: rachas.slice(0, 60) };
}

function expOfB(p) {
  const f = p.fitness || [];
  const played = f.filter((x) => Number(x) !== 0).length;
  const avg = f.length ? f.reduce((a, b) => a + (Number(b) || 0), 0) / f.length : 0;
  const prob = p.prob != null ? p.prob : (String(p.status || "").indexOf("injured") === 0 ? 0 : p.status === "doubt" ? 50 : 60);
  const casa = p.casaFf === true ? 1.08 : p.casaFf === false ? 0.94 : 1;
  const fit = played >= 3 ? 1 : played === 2 ? 0.85 : 0.6;
  return avg * (prob / 100) * casa * fit;
}

function isAdmin(env, user) {
  if (!user || !user.name) return false;
  const list = String(env.ADMIN_NAMES || "eduardo,edumr,edu").split(",").map((s) => stripAccents(s.trim().toLowerCase())).filter(Boolean);
  const n = stripAccents(String(user.name).toLowerCase());
  // Coincidencia EXACTA. Antes era "n.indexOf(x) >= 0" (si el nombre
  // CONTIENE la palabra admin), lo que daba admin a cualquiera cuyo nombre
  // incluyera, p.ej., "edu" (Edurne, Eduarda...). Con exacta, solo quien se
  // llame tal cual una de las entradas de ADMIN_NAMES es admin.
  return list.includes(n);
}

// Avisos para Edu (admin) sobre cosas que convendría revisar: cuentas
// nuevas (para detectar si alguien se registra con el nombre de un amigo
// antes de que ese amigo entre, "ocupándolo") y fallos de scraping en las
// webs de terceros de las que sacamos datos (Comuniate, futbolfantasy.com
// aparte de las 20 fichas de equipo que ya vigila checkFFHealth). No se
// hacen peticiones nuevas para esto: se aprovechan las que YA se hacen por
// el cron de cada 15 min, para no darle más tráfico a esas webs.
const NEWACC_KEY = "acct:new:v1";
async function logNewAccount(env, name) {
  try {
    const list = (await env.PORRA.get(NEWACC_KEY, "json")) || [];
    list.unshift({ name, at: Date.now() });
    await env.PORRA.put(NEWACC_KEY, JSON.stringify(list.slice(0, 30)));
  } catch (e) {}
}
const SCRAPE_ISSUES_KEY = "scrape:issues:v1";
async function flagScrape(env, source, detail) {
  try {
    const list = (await env.PORRA.get(SCRAPE_ISSUES_KEY, "json")) || [];
    const now = Date.now();
    const recent = list.find((x) => x.source === source);
    // No repetir el mismo aviso constantemente mientras el fallo persiste:
    // se actualiza la hora pero no se duplica la entrada.
    if (recent) { recent.at = now; recent.detail = detail; }
    else list.unshift({ source, detail, at: now });
    await env.PORRA.put(SCRAPE_ISSUES_KEY, JSON.stringify(list.slice(0, 20)));
  } catch (e) {}
}
async function clearScrape(env, source) {
  try {
    const list = (await env.PORRA.get(SCRAPE_ISSUES_KEY, "json")) || [];
    const next = list.filter((x) => x.source !== source);
    if (next.length !== list.length) await env.PORRA.put(SCRAPE_ISSUES_KEY, JSON.stringify(next));
  } catch (e) {}
}
async function getAvatars(env) {
  try { const c = await env.PORRA.get("fm:avatars:v1", "json"); if (c && c.map && Date.now() - (c.at || 0) < 6 * 3600 * 1000) return c.map; } catch (e) {}
  const map = {};
  try {
    const header = await futbolHeader(env);
    const l = await futbolPost("/2/locker/news", header, { championshipId: FUTMONDO_CHAMPIONSHIP });
    for (const x of (l.answer && l.answer.news) || []) {
      if (x.u && x.u.n && x.u.p) map[stripAccents(String(x.u.n).toLowerCase())] = x.u.p;
    }
  } catch (e) {}
  try { if (Object.keys(map).length) await env.PORRA.put("fm:avatars:v1", JSON.stringify({ at: Date.now(), map })); } catch (e) {}
  return map;
}

async function getClausulas(env) {
  try { const c = await env.PORRA.get("clausulas:v15", "json"); if (c && c.data && Date.now() - (c.at || 0) < 30 * 60 * 1000) return c.data; } catch (e) {}
  let cache;
  try { cache = await getMarketPlayers(env); } catch (e) { return { players: [], updatedAt: null }; }
  let players = cache.players || [];
  try {
    const map = await ffMap(env);
    players = players.map((p) => { const e = ffPick(p.name, map); return e ? { ...p, prob: e.prob, rivalFf: e.rival, casaFf: e.casa, chg1: e.d1, chg7: e.d7, chg14: e.d14, chg30: e.d30 } : p; });
  } catch (e) {}
  let myTeam = "Eduardo Martínez";
  try { const mt = await env.PORRA.get("fm:myteam"); if (mt) myTeam = mt; } catch (e) {}
  const own = players.filter((p) => p.computer === false);
  own.sort((a, b) => expOfB(b) - expOfB(a));
  const top = own;
  const header = await futbolHeader(env);
  let avatars = {};
  try { avatars = await getAvatars(env); } catch (e) {}
  const out = [];
  let okC = 0, ownC = 0, errC = 0;
  const diag = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fetchSum = async (id) => {
    for (let a = 0; a < 2; a++) {
      try { return await futbolPost("/1/player/summary", header, { playerId: id, championshipId: FUTMONDO_CHAMPIONSHIP }); }
      catch (e) { await sleep(150); }
    }
    return null;
  };
  const chunks = [];
  for (let i = 0; i < top.length; i += 8) chunks.push(top.slice(i, i + 8));
  for (const ch of chunks) {
    const results = await Promise.all(ch.map((p) => fetchSum(p.id).then((s) => ({ p, s })).catch(() => ({ p, s: null }))));
    for (const r of results) {
      const p = r.p, s = r.s;
      if (!s) { errC++; if (diag.length < 20) diag.push(p.name + ":ERR"); continue; }
      okC++;
      const ans = s.answer || {};
      const ch = ans.championship || {};
      const cl = ch.clause || {};
      const ownerObj = ch.owner || null;
      const owner = (ownerObj && ownerObj.name) || "";
      const ownerComputer = !!(ownerObj && ownerObj.computer);
      if (diag.length < 20) diag.push(p.name + ":" + (owner ? "OWN[" + owner + "]" : "free") + " cl=" + (cl.price ? 1 : 0));
      if (cl.price && owner && !ownerComputer) {
        ownC++;
        const mine = !!(myTeam && stripAccents(owner.toLowerCase()) === stripAccents(myTeam.toLowerCase()));
        out.push({
          id: p.id, name: p.name, role: p.role, role2: p.role2, team: p.team, logo: p.logo, photo: p.photo,
          value: p.value, points: p.points, avg: p.avg, matches: p.matches, fitness: p.fitness, prob: p.prob, status: p.status,
          clause: Number(cl.price) || 0, unlock: cl.date || "", owner, mine,
          ownerPhoto: avatars[stripAccents(owner.toLowerCase())] || "",
          exp: Math.round(expOfB(p) * 10) / 10,
          chg1: p.chg1, chg7: p.chg7, chg14: p.chg14, chg30: p.chg30,
        });
      }
    }
  }
  out.sort((a, b) => b.exp - a.exp || b.clause - a.clause);
  const jornada = players.reduce((m, p) => Math.max(m, Number(p.matches) || 0), 0);

  try {
    const today = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    let hist = (await env.PORRA.get("claushist", "json")) || { days: [] };
    if (!Array.isArray(hist.days)) hist = { days: [] };
    const cMap = {}, oMap = {};
    for (const p of out) { cMap[p.name] = p.clause; oMap[p.name] = p.owner || ""; }
    const last = hist.days[hist.days.length - 1];
    if (!last || last.d !== today) hist.days.push({ d: today, c: cMap, o: oMap });
    else { last.c = cMap; last.o = oMap; }
    while (hist.days.length > 90) hist.days.shift();
    try { await env.PORRA.put("claushist", JSON.stringify(hist)); } catch (e) {}
    const first = (hist.days[0] && hist.days[0].c) || {};
    const pd = hist.days.length > 1 ? hist.days[hist.days.length - 2] : null;
    const prevC = (pd && pd.c) || {};
    const prevO = (pd && pd.o) || {};
    for (const p of out) {
      if (first[p.name] != null) { p.clChg = p.clause - Number(first[p.name]); p.clSince = hist.days[0].d; }
      if (prevC[p.name] != null) p.clPrev = p.clause - Number(prevC[p.name]);
      if (prevO[p.name] && prevO[p.name] !== (p.owner || "")) p.clNewOwner = true;
      // Última subida de la cláusula que hemos visto en los datos guardados (día y cuánto subió).
      for (let i = hist.days.length - 1; i >= 1; i--) {
        const a = hist.days[i].c && hist.days[i].c[p.name], b0 = hist.days[i - 1].c && hist.days[i - 1].c[p.name];
        if (a != null && b0 != null && Number(a) > Number(b0)) { p.clUp = { d: hist.days[i].d, amt: Number(a) - Number(b0) }; break; }
      }
    }
  } catch (e) {}

  const data = { updatedAt: Date.now(), me: myTeam, jornada, players: out.slice(0, 40) };
  try { await env.PORRA.put("clausulas:v15", JSON.stringify({ at: Date.now(), data }), { expirationTtl: 1800 }); } catch (e) {}
  return data;
}

function fmtEur(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

async function searchMercado(env, q) {
  let cache;
  try {
    cache = await getMarketPlayers(env);
  } catch (e) {
    return json({ error: "No se pudo consultar Futmondo." }, 502);
  }
  let players = cache.players || [];
  try { await snapshotMarket(env, players); } catch (e) {}
  try {
    const map = await ffMap(env);
    players = players.map((p) => { const e = ffPick(p.name, map); return e ? { ...p, prob: e.prob, rivalFf: e.rival, casaFf: e.casa, jornadaFf: e.jornada, tend: e.tend, chg1: e.d1, chg7: e.d7, chg14: e.d14, chg30: e.d30 } : p; });
  } catch (e) {}
  let season = {};
  try { season = await getSeasonMap(env, false); } catch (e) {}
  const seasonOn = Object.keys(season).length > 30;
  try {
    // El histórico (fmhist) pesa varios MB: solo se lee si no hay mapa de temporada (parsearlo en cada petición agotaba la CPU del plan gratis).
    let first = {};
    if (!seasonOn) {
      const hist = await env.PORRA.get("fmhist", "json");
      const days = (hist && hist.days) || [];
      first = days.length ? (days[0].v || {}) : {};
    }
    players = players.map((p) => {
      const val = Number(p.value) || 0;
      if (seasonOn) { const sv = season[p.name]; return { ...p, chgAll: sv != null ? val - Number(sv) : null }; }
      return { ...p, chgAll: first[p.name] != null ? val - Number(first[p.name]) : null };
    });
  } catch (e) {}
  const query = stripAccents(String(q || "").toLowerCase().trim());
  let list = players;
  if (query) list = players.filter((p) => stripAccents(p.name.toLowerCase()).includes(query));
  list = list.slice().sort((a, b) => b.value - a.value);
  const limit = query ? 80 : 700;
  return json({ players: list.slice(0, limit), updatedAt: cache.at || null, seasonOk: seasonOn });
}

const FF_MARKET_URL = "https://www.futbolfantasy.com/analytics/futmondo/mercado/social";
const FF_MAP_KEY = "ff:map5";

async function ffMap(env) {
  let cached = null;
  try {
    cached = await env.PORRA.get(FF_MAP_KEY, "json");
    if (cached && cached.map && Date.now() - (cached.at || 0) < 6 * 3600 * 1000) return cached.map;
  } catch (e) {}
  // Si la petición o el parseo fallan, en vez de devolver {} (que deja a
  // TODA la web sin prob/rival/casa-fuera de golpe) se reutiliza el último
  // mapa guardado aunque esté caducado, y se avisa a Edu (admin) de que esta
  // fuente ha dejado de funcionar — igual que pasó sin darse cuenta con el
  // slug del Deportivo.
  try {
    const res = await fetch(FF_MARKET_URL, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    const html = await res.text();
    const map = {};
    const rows = html.split('class="elemento_jugador');
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const idm = r.match(/data-id="(\d+)"/);
      const nm = r.match(/data-nombre="([^"]+)"/);
      if (!idm || !nm) continue;
      const key = normKey(nm[1].toLowerCase());
      if (!key || map[key]) continue;
      const pm = r.match(/class="prob-[^"]*"[^>]*>\s*(\d+)%/);
      const tb = r.match(/class="rival-probability[^"]*"[^>]*title="([^"]*)"/);
      let rival = "", casa = null, jornada = "";
      if (tb && /rival/i.test(tb[1])) {
        const t = tb[1];
        const rr = t.match(/rival:\s*([^()]+)/i);
        if (rr) rival = rr[1].trim();
        if (/\(Casa\)/i.test(t)) casa = true; else if (/\(Fuera\)/i.test(t)) casa = false;
        const jm = t.match(/jornada\s*(\d+)/i);
        if (jm) jornada = jm[1];
      }
      const dif = (n) => { const m = r.match(new RegExp('data-diferencia' + n + '="(-?\\d+)"')); return m ? Number(m[1]) : null; };
      const tnd = r.match(/data-tendencia="(-?\d+)"/);
      const ageM = r.match(/data-edad="(\d+)"/);
      map[key] = { id: idm[1], prob: pm ? Number(pm[1]) : null, rival, casa, jornada, tend: tnd ? Number(tnd[1]) : null, d1: dif(1), d2: dif(2), d3: dif(3), d7: dif(7), d14: dif(14), d30: dif(30), age: ageM ? Number(ageM[1]) : 0 };
    }
    if (Object.keys(map).length > 50) {
      try { await env.PORRA.put(FF_MAP_KEY, JSON.stringify({ at: Date.now(), map })); } catch (e) {}
      await clearScrape(env, "ff-mercado");
      return map;
    }
    await flagScrape(env, "ff-mercado", "La página de mercado de futbolfantasy.com solo dio " + Object.keys(map).length + " jugadores (se esperan >50). Puede haber cambiado el HTML de la página.");
    return (cached && cached.map) || map;
  } catch (e) {
    await flagScrape(env, "ff-mercado", "No se pudo cargar la página de mercado de futbolfantasy.com.");
    return (cached && cached.map) || {};
  }
}

const FF_IDX = new WeakMap();
function ffPick(name, map) {
  const n = normKey(String(name || "").toLowerCase());
  if (!n) return null;
  if (map[n]) return map[n];
  let keys = FF_IDX.get(map);
  if (!keys) { keys = Object.keys(map); FF_IDX.set(map, keys); }
  const words = n.split(" ");
  const last = words[words.length - 1];
  const hint = words.length > 1 && words[0].length === 1 ? words[0] : "";
  const uniq = (arr) => {
    if (arr.length > 1 && hint) {
      const f = arr.filter((k) => k[0] === hint);
      if (f.length === 1) return f;
    }
    return arr;
  };
  const ends = keys.filter((k) => k.endsWith(" " + n));
  if (ends.length === 1) return map[ends[0]];
  if (last.length >= 4) {
    const byLast = uniq(keys.filter((k) => k.split(" ").pop() === last));
    if (byLast.length === 1) return map[byLast[0]];
  }
  // Apodos tipo "Dela" (Adrián de la Fuente): una sola palabra que es "de"+"la" pegado.
  if (words.length === 1 && n.length >= 4) {
    const apodo = keys.filter((k) => k.includes(" " + n.slice(0, 2) + " " + n.slice(2) + " "));
    if (apodo.length === 1) return map[apodo[0]];
  }
  const cont = keys.filter((k) => k.split(" ").indexOf(n) >= 0 || k.includes(" " + n + " "));
  if (cont.length === 1) return map[cont[0]];
  const toks = words.filter((t) => t.length >= 3);
  if (toks.length) {
    const cands = uniq(keys.filter((k) => { const kt = k.split(" "); return toks.every((t) => kt.some((x) => x === t || x.startsWith(t) || t.startsWith(x))); }));
    if (cands.length === 1) return map[cands[0]];
  }
  if (last.length >= 4) {
    const byLast2 = uniq(keys.filter((k) => k.split(" ").some((x) => x === last || x.startsWith(last))));
    if (byLast2.length === 1) return map[byLast2[0]];
  }
  return null;
}

async function ffSeason(env, name) {
  const map = await ffMap(env);
  const e = ffPick(name, map);
  if (!e || !e.id) return null;
  const res = await fetch("https://www.futbolfantasy.com/analytics/futmondo/mercado/detalle/" + e.id + "/social", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
  const html = await res.text();
  const pts = [];
  const re = /player_chartjs\.push\(\{date:\s*"([^"]+)",\s*value:\s*(\d+)\}\)/g;
  let m;
  while ((m = re.exec(html))) pts.push({ d: m[1], v: Number(m[2]) });
  pts.reverse();
  while (pts.length && Number(pts[0].v) <= 0) pts.shift();
  for (let i = 1; i < pts.length; i++) {
    if (pts[i - 1].v > 0 && pts[i].v < pts[i - 1].v * 0.7) { pts.splice(0, i); break; }
  }
  return pts.length >= 2 ? pts : null;
}

async function getSeasonMap(env, allowBuild, reset) {
  let c = null;
  try { c = await env.PORRA.get(SEASON_KEY, "json"); } catch (e) {}
  if (!c || typeof c !== "object") c = {};
  if (!c.map) c.map = {};
  if (reset && allowBuild) { c.idx = 0; c.doneAt = 0; c.map = {}; }
  if (c.doneAt && Date.now() - c.doneAt < 24 * 3600 * 1000) return c.map;
  if (!allowBuild) return c.map;
  try {
    const players = (await getMarketPlayers(env)).players || [];
    const ffm = await ffMap(env);
    const fetchOne = async (name) => {
      const e = ffPick(name, ffm);
      if (!e || !e.id) return;
      try {
        const res = await fetch("https://www.futbolfantasy.com/analytics/futmondo/mercado/detalle/" + e.id + "/social", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
        const html = await res.text();
        const re = /player_chartjs\.push\(\{date:\s*"([^"]+)",\s*value:\s*(\d+)\}\)/g;
        const vals = [];
        let m;
        while ((m = re.exec(html))) vals.push(Number(m[2]));
        if (vals.length < 1) return;
        vals.reverse();
        let k = 0;
        while (k < vals.length && vals[k] <= 0) k++;
        for (let i = k + 1; i < vals.length; i++) {
          if (vals[i - 1] > 0 && vals[i] < vals[i - 1] * 0.7) { k = i; break; }
        }
        if (vals[k] > 0) c.map[name] = vals[k];
      } catch (e) {}
    };
    const names = players.map((p) => p.name).filter(Boolean);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const BATCH = 30;
    const start = Number(c.idx) || 0;
    const slice = names.slice(start, start + BATCH);
    for (let i = 0; i < slice.length; i += 6) {
      await Promise.all(slice.slice(i, i + 6).map(fetchOne));
      await sleep(180);
    }
    c.idx = start + BATCH;
    if (c.idx >= names.length) { c.idx = 0; c.doneAt = Date.now(); }
    c.at = Date.now();
    try { await env.PORRA.put(SEASON_KEY, JSON.stringify(c)); } catch (e) {}
  } catch (e) {}
  return c.map;
}

async function tmProfile(env, name, club) {
  const k = "tm:date:" + normKey(String(name || "").toLowerCase());
  try { const c = await env.PORRA.get(k, "json"); if (c) return c; } catch (e) {}
  const out = { date: "", club: "", url: "" };
  try {
    const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "accept-language": "es-ES,es" };
    const s = await (await fetch("https://www.transfermarkt.es/schnellsuche/ergebnis/schnellsuche?query=" + encodeURIComponent(name), { headers: UA })).text();
    const links = [...new Set([...s.matchAll(/href="(\/[^"]+\/profil\/spieler\/\d+)"/g)].map((m) => m[1]))].slice(0, 4);
    const nk = normKey(String(name || "").toLowerCase());
    for (const lk of links) {
      try {
        const p = await (await fetch("https://www.transfermarkt.es" + lk.replace("/profil/", "/transfers/"), { headers: UA })).text();
        const h1m = p.match(/data-header__headline-wrapper[^>]*>([\s\S]*?)<\/h1>/);
        const nm = h1m ? h1m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/^#?\d*\s*/, "").trim() : "";
        const clm = p.match(/data-header__club[^>]*>([\s\S]{0,140}?)<\/span>/);
        const cl = clm ? clm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
        const fd = p.match(/Fichado:[\s\S]{0,90}?data-header__content[^>]*>([^<]+)</);
        const date = fd ? fd[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
        if (!date) continue;
        const nmk = normKey(nm.toLowerCase());
        const nameOk = nmk && (nmk === nk || nk.indexOf(nmk) >= 0 || nmk.indexOf(nk) >= 0);
        const teamOk = !club || teamScore(cl, club) >= 2;
        if (nameOk && teamOk) { out.date = date; out.club = cl; out.url = "https://www.transfermarkt.es" + lk; break; }
      } catch (e) {}
    }
  } catch (e) {}
  try { if (out.date) await env.PORRA.put(k, JSON.stringify(out), { expirationTtl: 30 * 24 * 3600 }); } catch (e) {}
  return out;
}

// Entidades HTML (&#039; &amp; &aacute; ...) que llegan tal cual en textos
// scrapeados (títulos, extractos) y que, al meterlos como texto plano (no
// como HTML) en la web, se veían literalmente como "&#039;" en vez de un
// apóstrofe.
const HTML_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", deg: "°",
  euro: "€", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "'", rsquo: "'", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
};
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return ""; } })
    .replace(/&([a-zA-Z]+);/g, (full, name) => (name in HTML_ENTITIES ? HTML_ENTITIES[name] : full));
}

function stripHtml(s) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Quita <div ...>...</div> contando aperturas/cierres de verdad, para los
// casos en los que dentro puede haber cualquier cosa (incluida otra "p" o
// un "div" anidado) y un regex perezoso hasta la siguiente etiqueta se
// come de más, se come de menos, o directamente no encuentra nada que
// recortar (p. ej. si no hay ningún <p> después, como pasaba con las
// fichas de jugador "block-new": al no encontrar un <p> futuro al que
// pararse, el regex antiguo no recortaba nada en absoluto).
function stripBalancedDiv(html, openTagRe) {
  const re = new RegExp(openTagRe.source, "gi");
  let out = "";
  let cursor = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m.index < cursor) continue;
    out += html.slice(cursor, m.index);
    const tagRe = /<div\b[^>]*>|<\/div\s*>/gi;
    tagRe.lastIndex = re.lastIndex;
    let depth = 1, end = html.length, tm;
    while ((tm = tagRe.exec(html))) {
      if (tm[0][1] === "/") { depth--; if (depth === 0) { end = tagRe.lastIndex; break; } }
      else depth++;
    }
    cursor = end;
    re.lastIndex = end;
  }
  out += html.slice(cursor);
  return out;
}

function cleanArticle(s) {
  let out = String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/ on\w+='[^']*'/gi, "")
    .replace(/ style="[^"]*"/gi, "")
    .replace(/<div class="[^"]*(btn-|share|whatsapp|twitter|facebook|autor|cargo|fecha|header-author)[^"]*"[\s\S]*?<\/div>/gi, "");
  // Fichas de "jugadores mencionados" (foto, posición, escudo, bandera,
  // edad y enlace a "Perfil") que la propia futbolfantasy mete en medio
  // del cuerpo: no son parte de la noticia, se quitan enteras.
  out = stripBalancedDiv(out, /<div class="block-new">/i);
  return out.trim();
}

function cleanBrand(s) {
  return String(s || "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<[^>]*frpg[^>]*>/gi, "")
    .replace(/<div class="d-flex my-4">[\s\S]*?<\/div>\s*<\/div>/gi, "")
    .replace(/<span[^>]*class="[^"]*(autor|cargo|fecha)[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<img[^>]*(rounded-circle|header-author|avatar)[^>]*>/gi, "")
    .replace(/(?<![.\w])f[uú]tbolfantasy(\.com)?/gi, "")
    .replace(/(?<![.\w])footballfantasy(\.com)?/gi, "")
    .replace(/<span[^>]*class="[^"]*brand[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "");
}

async function ogThumb(env, url) {
  const key = "thumb:" + url;
  try {
    const cached = await env.PORRA.get(key);
    if (cached !== null && cached !== undefined) return cached;
  } catch (e) {}
  let img = "";
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    const h = await res.text();
    const m = h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || h.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i) || h.match(/<img[^>]+src="([^"]*fotos_noticias[^"]+)"/i);
    img = m ? m[1] : "";
  } catch (e) {}
  try { await env.PORRA.put(key, img, { expirationTtl: 21600 }); } catch (e) {}
  return img;
}

// Vídeos, directos y promos de creadores (Twitch/YouTube, "XI ideal ... por X", "RADAR FANTASY"): no se muestran.
const FF_PROMO = /(^\s*v[ií]deo\s*:|twitch|youtube|multistream|radar fantasy|extinguid|\bdel fantasy\b|fantasy\s*✨|playstation|\bj\d+\b.*,\s*por\s|jornada\s*\d+.*,\s*por\s)/i;
// Guías y artículos de firma ("..., por Carrasco") y los de LaLiga Fantasy oficial no encajan con la web
const FF_BYLINE = /,\s*por\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ.'’-]+(\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ.'’-]+){0,2}\s*$/;
function isFfPromo(t) { t = String(t || ""); return FF_PROMO.test(t) || FF_BYLINE.test(t) || /laliga\s*fantasy/i.test(t); }
async function getFfNoticias(env) {
  try {
    const res = await fetch("https://www.futbolfantasy.com/laliga/home", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    const html = await res.text();
    const out = [];
    const seen = {};
    const EX = FF_PROMO;
    const EX_OLD = /(jerarqu|internacional|convoc|entrenador|t[eé]cnico|rueda de prensa|declaraci|palabras|gu[ií]a|onces?|alineaci|cr[oó]nica|amistoso|camiseta|equipaci|predicci|apuestas)/i;
    const re = /<a[^>]+href="(https:\/\/www\.futbolfantasy\.com\/laliga\/noticias\/[^"]+)"[^>]*class="[^"]*\bnoticia\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
      const link = m[1];
      if (seen[link]) continue;
      const inner = m[2].slice(0, 1600);
      const title = stripHtml((inner.match(/<h2[^>]*class="[^"]*titular[^"]*"[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || (inner.match(/alt="([^"]+)"/) || [])[1] || "");
      const thumb = (inner.match(/data-src="([^"]*fotos_noticias[^"]+)"/) || inner.match(/<img[^>]+src="([^"]*fotos_noticias[^"]+)"/) || [])[1] || "";
      const day = ((inner.match(/class="day">([^<]+)</) || [])[1] || "").trim();
      const time = ((inner.match(/class="time">([^<]+)</) || [])[1] || "").trim();
      if (!link || !title || isFfPromo(title) || EX_OLD.test(title)) continue;
      seen[link] = 1;
      out.push({ date: day, time, link, title, thumb });
      if (out.length >= 24) break;
    }
    if (env) await Promise.all(out.map(async (x) => { if (!x.thumb) x.thumb = await ogThumb(env, x.link); }));
    return out;
  } catch (e) {
    return [];
  }
}

async function getNoticia(url) {
  if (!/^https:\/\/www\.futbolfantasy\.com\//.test(String(url || ""))) return { error: "no permitido" };
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
  const html = await res.text();
  const title = stripHtml((html.match(/<h1[^>]*class="[^"]*titulo[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const lead = stripHtml((html.match(/<p[^>]*class="[^"]*entradilla[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "");
  if (/\[?extinguid/i.test(title)) return { extinguida: true, title: title.replace(/\s*\[?extinguido\]?/i, "").trim() };
  let body = "";
  const ci = html.search(/class="cuerpo"/i);
  if (ci >= 0) {
    const start = html.indexOf(">", ci) + 1;
    let seg = html.slice(start, start + 22000);
    const m = seg.search(/(<div class="noticia (prev|next)|class="relacionad|class="mas-noticias|class="relative-noticias|comments-container|btn-ver-comentarios|uc-open-bar|uc-icon-wrap|class="taboola|taboola-|class="descripcion|<h4 class="mb-0"|<footer|class="clearfix")/i);
    if (m > 0) seg = seg.slice(0, m);
    body = cleanArticle(seg);
  }
  if (!body || body.replace(/<[^>]+>/g, "").trim().length < 40) {
    const dIdx = html.search(/class="noticia-detail"/i);
    const scope = dIdx >= 0 ? html.slice(dIdx, dIdx + 40000) : html;
    const parts = [];
    const img = scope.match(/<img[^>]+src="([^"]*fotos_noticias[^"]+)"/i);
    if (img) parts.push('<p><img src="' + img[1] + '" /></p>');
    const reP = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = reP.exec(scope))) {
      const inner = m[1];
      const txt = inner.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
      if (txt.length > 60) parts.push("<p>" + inner + "</p>");
      if (parts.length > 40) break;
    }
    if (parts.length) body = cleanArticle(parts.join(""));
  }
  return { title: cleanBrand(title), lead: cleanBrand(lead), html: cleanBrand(body) };
}

async function getScoreMap(env) {
  const key = "scores:PD";
  try {
    const c = await env.PORRA.get(key, "json");
    if (c && c.at && Date.now() - c.at < 30 * 60 * 1000) return c.map;
  } catch (e) {}
  const map = {};
  const token = env.FOOTBALL_API_KEY;
  if (token) {
    try {
      const res = await fetch(`https://api.football-data.org/v4/competitions/${COMPETITION}/matches?status=FINISHED`, { headers: { "X-Auth-Token": token } });
      if (res.ok) {
        const j = await res.json();
        for (const m of j.matches || []) {
          const s = (m.score && m.score.fullTime) || {};
          if (s.home == null || s.away == null) continue;
          const hn = (m.homeTeam && m.homeTeam.name) || "";
          const an = (m.awayTeam && m.awayTeam.name) || "";
          map[teamKey(hn) + "|" + teamKey(an)] = { hs: s.home, as: s.away };
        }
      }
    } catch (e) {}
  }
  try { await env.PORRA.put(key, JSON.stringify({ at: Date.now(), map })); } catch (e) {}
  return map;
}

// Puntos de MI liga (Futmondo Social configurable: AS 50% + Marca 50% + SofaScore 50% + estadísticas básicas),
// calculados con los datos reales del partido. Sirve para jornadas fuera de los 5 últimos partidos que
// Futmondo publica ("fitness"). Contrastado 20/10/2026 con 89 jugadores / 443 partidos: coincide con
// fitness en el ~95 % (el resto, sobre todo J5-J6, difiere en 1-2 puntos). Si falta algún medio o la
// posición, devuelve null (nunca se inventa).
function leagueMatchPoints(po, d, role) {
  if (!d || !role) return null;
  const get = (mode) => { const z = (po || []).find((k) => k.mode === mode); return z && z.p != null ? Number(z.p) : null; };
  const as = get("as"), mc = get("marca"), ss = get("ss");
  if (as == null || mc == null || ss == null) return null;
  const n = (k) => Number(d[k]) || 0;
  const mins = n("mins_played");
  const r = String(role).toLowerCase();
  const gk = r === "portero" || r === "defensa";
  const gp = { portero: 8, defensa: 6, centrocampista: 4, delantero: 3 }[r];
  if (!gp) return null;
  let b = 0;
  if (mins >= 60) b += 1;
  // Penalti marcado = 2 puntos (contrastado con fitness); el resto de goles, según la posición.
  const pg = Math.min(n("att_pen_goal"), n("goals"));
  b += n("goal_assist") + (n("goals") - pg) * gp + pg * 2 + 3 * n("penalty_save");
  if (gk) { if ((d.cleansheet || n("goals_conceded") === 0) && mins >= 45) b += 1; b -= Math.floor(n("goals_conceded") / 2); }
  // Roja: -5 (contrastado: 16 de 18 casos; los 2 restantes parecen rojas anuladas/corregidas en Futmondo)
  b -= n("own_goals") + 2 * n("att_pen_miss") + 5 * n("red_card");
  return Math.round((as + mc + ss) / 2 + b);
}

async function playerFicha(env, id, fast, raw) {
  if (!id) return { error: "falta id" };
  const header = await futbolHeader(env);
  const r = await futbolPost("/2/player/matches", header, { playerId: id, championshipId: FUTMONDO_CHAMPIONSHIP });
  const a = r.answer || {};
  const pl = a.player || {};
  // Todo lo que no depende de lo demás se pide A LA VEZ (antes iba uno detrás de otro y la ficha tardaba muchísimo).
  // Las partes opcionales y lentas (futbolfantasy, transfermarkt) tienen tope de 3,5 s: si tardan, la ficha sale sin ellas.
  const tmo = (p, ms, fb) => Promise.race([Promise.resolve(p).catch(() => fb), new Promise((res) => setTimeout(() => res(fb), ms))]);
  const pMk = getMarketPlayers(env).catch(() => null);
  const pScore = getScoreMap(env).catch(() => ({}));
  const pLs = futbolPost("/2/player/lastseasons", header, { playerId: id, championshipId: FUTMONDO_CHAMPIONSHIP }).catch(() => null);
  const pTeams = getTeams(env).catch(() => null);
  // fast=1: ficha sin las partes lentas externas (futbolfantasy / transfermarkt); el cliente pide después la completa.
  const pSerie = fast ? Promise.resolve(null) : tmo(ffSeason(env, pl.name || ""), 4500, null);
  const pTm = fast ? Promise.resolve(null) : tmo(tmProfile(env, pl.name || "", (a.team && a.team.name) || pl.team || ""), 6000, null);
  let mp = null;
  let lJornada = 0;
  try {
    const mk = await pMk;
    const k = String(id);
    mp = (mk.players || []).find((x) => x.id === k) || (mk.players || []).find((x) => x.name && stripAccents(x.name) === stripAccents(pl.name || ""));
    lJornada = (mk.players || []).reduce((m, x) => Math.max(m, Number(x.matches) || 0), 0);
  } catch (e) {}
  const smap = (await pScore) || {};
  const matches = (a.matches || []).map((m) => {
    const po = (m.ps && m.ps.po) || [];
    const g = (mode) => { const z = po.find((k) => k.mode === mode); return z ? Number(z.p) || 0 : 0; };
    const dta = (m.ps && m.ps.data) || {};
    const hn = (m.h && m.h.name) || "", an = (m.a && m.a.name) || "";
    const sc = smap[teamKey(hn) + "|" + teamKey(an)];
    return {
      r: m.r || 0,
      home: hn, hs: m.h ? m.h.score : null,
      away: an, as: m.a ? m.a.score : null,
      score: sc ? sc.hs + "-" + sc.as : "",
      date: (m.info && m.info.date) || "",
      finished: m.st === "F",
      mins: Number(dta.mins_played) || 0,
      sub: dta.substituted === "True" || dta.substituted === true,
      yellow: Number(dta.yellow_card) || 0,
      red: Number(dta.red_card) || 0,
      stats: g("stats"), picas: g("picas"), ff: g("ff"), ss: g("ss"), as: g("as"), marca: g("marca"),
      hsc: m.h ? m.h.score : null, asc: m.a ? m.a.score : null,
      lg: leagueMatchPoints(po, dta, (mp && mp.role) || ""),
      ...(raw ? { dta, po } : {}),
    };
  }).slice(0, 60);
  const todayVal = Number(pl.value) || 0;
  let temporadas = [];
  try {
    const ls = await pLs;
    const arr = Array.isArray(ls.answer) ? ls.answer : ((ls.answer && (ls.answer.seasons || ls.answer.lastseasons)) || []);
    temporadas = arr.map((x) => {
      const lg = x.league || {};
      const byMode = {};
      (x.points || []).forEach((z) => { byMode[z.mode] = z; });
      const pick = byMode.stats || byMode.press || byMode.presstats || (x.points && x.points[0]) || null;
      const t = (pick && pick.t) || {};
      const tot = Number(t.p) || 0;
      const games = t.games != null ? Number(t.games) : (Number((pick && pick.h && pick.h.games) || 0) + Number((pick && pick.a && pick.a.games) || 0));
      const t0 = (x.teams && x.teams[0]) || {};
      return {
        season: lg.season || "",
        league: lg.name || "",
        team: t0.name || "",
        logo: t0.logo ? (String(t0.logo).indexOf("http") === 0 ? t0.logo : LOGO_BASE + t0.logo) : "",
        points: tot,
        games,
        media: games ? Math.round((tot / games) * 10) / 10 : 0,
      };
    }).filter((x) => x.season).slice(0, 8);
  } catch (e) {}
  try {
    const tms = (await pTeams) || [];
    const findLogo = (nm) => { const k = teamKey(nm); if (!k) return ""; let loose = ""; for (const t of tms) { const tk = teamKey(t.name); if (!tk) continue; if (tk === k) return t.logo || ""; if (tk.indexOf(k) >= 0 || k.indexOf(tk) >= 0) loose = loose || (t.logo || ""); } return loose; };
    temporadas.forEach((x) => { if (!x.logo && x.team) x.logo = findLogo(x.team); });
  } catch (e) {}
  const ptsSum = matches.reduce((s, m) => s + (Number(m.stats) || 0), 0);
  const played = matches.length;
  const order = [["Hoy", 0], ["Ayer", 1], ["2 días", 2], ["3 días", 3], ["5 días", 5], ["10 días", 10], ["14 días", 14], ["30 días", 30]];
  let serie = null, temporada = null;
  try {
    serie = await pSerie;
    if (serie && serie.length >= 2) {
      const first = serie[0], last = serie[serie.length - 1];
      temporada = {
        desde: first.d, hasta: last.d, v0: first.v, v1: last.v,
        diff: last.v - first.v,
        pct: first.v > 0 ? ((last.v - first.v) / first.v) * 100 : 0,
        n: serie.length,
        serie,
      };
    }
  } catch (e) {}
  let valores = [];
  if (serie && serie.length >= 2) {
    valores = order.map((o) => {
      const idx = serie.length - 1 - o[1];
      const v = o[1] === 0 ? (todayVal || serie[serie.length - 1].v) : (idx >= 0 ? serie[idx].v : null);
      return { label: o[0], days: o[1], v, diff: (o[1] === 0 || v == null) ? null : todayVal - v };
    });
  } else {
    try {
      const h = await env.PORRA.get("fmhist", "json");
      const byDate = {};
      if (h && Array.isArray(h.days)) h.days.forEach((x) => { if (x.v && x.v[pl.name] != null) byDate[x.d] = x.v[pl.name]; });
      valores = order.map((o) => {
        const v = o[1] === 0 ? todayVal : (byDate[dstrMadrid(o[1])] != null ? byDate[dstrMadrid(o[1])] : null);
        return { label: o[0], days: o[1], v, diff: (o[1] === 0 || v == null) ? null : todayVal - v };
      });
    } catch (e) {}
  }
  const fitArr = (mp && mp.fitness && mp.fitness.length) ? mp.fitness : ((pl.average && pl.average.fitness) || []);
  const cats = matches.map((m) => {
    const mn = m.mins || 0;
    const cat = mn <= 0 ? "none" : m.sub ? "banquillo" : (mn >= 85 ? "completo" : "sustituido");
    return { r: m.r, mins: mn, cat };
  });
  const parPlayed = cats.filter((c) => c.mins > 0).length;
  const starts = cats.filter((c) => c.cat === "completo" || c.cat === "sustituido").length;
  const bench = cats.filter((c) => c.cat === "banquillo").length;
  const totalMin = matches.reduce((s, m) => s + (m.mins || 0), 0);
  const maxMin = (Number(lJornada) || 0) * 90;
  const participacion = {
    jornada: Number(lJornada) || 0, played: parPlayed, starts, bench,
    totalMin, maxMin, pctMin: maxMin ? Math.round((totalMin / maxMin) * 100) : 0,
    avgMin: parPlayed ? Math.round((totalMin / parPlayed) * 10) / 10 : 0,
    pctStart: parPlayed ? Math.round((starts / parPlayed) * 100) : 0,
    reds: matches.reduce((s, m) => s + (m.red ? 1 : 0), 0),
    byJornada: cats,
  };
  let fichaje = null;
  try { fichaje = await pTm; } catch (e) {}
  // Edad: Futmondo la trae en el jugador; si no, se calcula de la fecha de
  // nacimiento (cualquiera de los nombres que usa la API).
  let age = Number(pl.age) || Number(pl.edad) || Number(mp && mp.age) || 0;
  if (!age) {
    const bd = pl.birthdate || pl.birth || pl.born || pl.nacimiento || "";
    if (bd) { const b = new Date(bd); if (!isNaN(b.getTime())) age = Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000)); }
  }
  // Último recurso: la edad que publica futbolfantasy.com en la ficha de
  // cada equipo (data-edad), que ya se guarda al traer los onces de FF.
  if (!age) {
    try {
      const teamName = (a.team && a.team.name) || pl.team || "";
      if (teamName) {
        const t = await getFFTeam(env, teamName);
        const pool = [].concat(t.starters || [], t.bench || []);
        const q = normKey(String(pl.name || "").toLowerCase());
        const last = q.split(" ").pop();
        const hit = pool.find((x) => normKey(String(x.full || x.name || "").toLowerCase()) === q)
          || pool.find((x) => last.length >= 4 && normKey(String(x.full || x.name || "").toLowerCase()).split(" ").pop() === last);
        if (hit && hit.edad) age = hit.edad;
      }
    } catch (err) {}
  }
  return {
    id,
    name: pl.name || "",
    age,
    role: pl.role || "",
    role2: pl.role2 || "",
    value: todayVal,
    change: Number(pl.change) || 0,
    status: pl.status || "",
    points: (mp && mp.points) || (pl.average && Number(pl.average.total)) || ptsSum,
    average: (mp && mp.avg) || (pl.average && Number(pl.average.average)) || (played ? ptsSum / played : 0),
    matches5: (mp && mp.matches) || (pl.average && Number(pl.average.matches)) || played,
    fitness: fitArr,
    jornada: lJornada,
    pronostico: pronosticoFor({ status: pl.status, fitness: fitArr }),
    team: (a.team && a.team.name) || pl.team || "",
    logo: pl.logo ? LOGO_BASE + pl.logo : "",
    photo: pl.photo ? FACE_BASE + pl.photo : "",
    matches,
    valores,
    temporada,
    temporadas,
    fichaje,
    participacion,
  };
}

async function getNoticias(env) {
  let stale = null;
  try {
    const c = await env.PORRA.get("ff:news:v2", "json");
    stale = c && c.data && (c.data.noticias || []).length ? c : null;
    if (c && c.at && Date.now() - c.at < 15 * 60 * 1000) { c.data.noticias = (c.data.noticias || []).filter((x) => !(x && x.title && isFfPromo(x.title))); c.data.updatedAt = c.at; return c.data; }
  } catch (e) {}
  const out = { noticias: [], locker: [] };
  const fresh = await getFfNoticias(env);
  // La home de futbolfantasy solo enseña las noticias más recientes: si nos
  // quedáramos solo con eso, las de días anteriores desaparecerían en cuanto
  // dejan de salir ahí. Las acumulamos en un archivo aparte para no perderlas.
  let archive = [];
  try { archive = (await env.PORRA.get("ff:news:archive", "json")) || []; } catch (e) {}
  // Las frescas van primero (son las más nuevas, en el mismo orden en que
  // salen en la home); detrás, las del archivo que ya no salen ahí pero no
  // queremos perder, en el orden en que las teníamos.
  const seenLinks = {};
  const merged = [];
  fresh.concat(archive).forEach((x) => {
    if (!x || !x.link || seenLinks[x.link]) return;
    seenLinks[x.link] = 1;
    // Los títulos ya archivados antes de decodificar entidades (&#039; etc.)
    // se corrigen también aquí, de paso (decodeEntities no hace nada sobre
    // texto que ya está limpio).
    if (x.title) x.title = decodeEntities(x.title);
    if (x.title && isFfPromo(x.title)) return;
    merged.push(x);
  });
  const trimmed = merged.slice(0, 80);
  try { await env.PORRA.put("ff:news:archive", JSON.stringify(trimmed), { expirationTtl: 20 * 24 * 3600 }); } catch (e) {}
  // FutbolFantasy marca con "[EXTINGUIDO]" (solo dentro de la noticia) las que ya no valen: se comprueba y se ocultan
  let keep = trimmed;
  try {
    let ext = (await env.PORRA.get("ff:ext:v1", "json")) || {};
    const now = Date.now();
    const todo = trimmed.slice(0, 40).filter((x) => !ext[x.link] || now - ext[x.link].at > 3 * 3600 * 1000).slice(0, 6);
    await Promise.all(todo.map(async (x) => {
      try {
        const html = await (await fetch(x.link, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } })).text();
        const t = stripHtml((html.match(/<h1[^>]*class="[^"]*titulo[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
        if (t) ext[x.link] = { x: /extinguid/i.test(t) ? 1 : 0, at: now };
      } catch (e) {}
    }));
    const links = new Set(trimmed.map((x) => x.link));
    Object.keys(ext).forEach((k) => { if (!links.has(k)) delete ext[k]; });
    await env.PORRA.put("ff:ext:v1", JSON.stringify(ext), { expirationTtl: 20 * 24 * 3600 });
    keep = trimmed.filter((x) => !(ext[x.link] && ext[x.link].x));
  } catch (e) {}
  out.noticias = keep;
  // Si la fuente ha fallado y no hay nada, se devuelven las últimas noticias buenas (mejor viejas que ninguna)
  if (!out.noticias.length && stale) { stale.data.updatedAt = stale.at; return stale.data; }
  try {
    const header = await futbolHeader(env);
    const l = await futbolPost("/2/locker/news", header, { championshipId: FUTMONDO_CHAMPIONSHIP });
    const arr = (l.answer && l.answer.news) || [];
    out.locker = arr.slice(0, 25).map((x) => ({
      n: (x.u && x.u.n) || "",
      p: (x.u && x.u.p) || "",
      txt: stripHtml(x.txt || ""),
      date: x.created || "",
    }));
  } catch (e) {}
  out.updatedAt = Date.now();
  try { await env.PORRA.put("ff:news:v2", JSON.stringify({ at: Date.now(), data: out }), { expirationTtl: 6 * 3600 }); } catch (e) {}
  return out;
}

// Fecha/hora de una noticia de FutbolFantasy ("11/10" + "21:30") pasada a
// milisegundos, para poder ordenar la cinta de "Última hora" junto con las
// alineaciones confirmadas. España va en UTC+2 hasta finales de octubre; el
// margen de una hora que pueda quedar en invierno no cambia el orden real.
function ffWhenAt(date, time) {
  const dm = String(date || "").match(/(\d{1,2})\/(\d{1,2})/);
  if (!dm) return 0;
  const tm = String(time || "").match(/(\d{1,2}):(\d{2})/);
  const y = new Date().getUTCFullYear();
  const iso = y + "-" + String(Number(dm[2])).padStart(2, "0") + "-" + String(Number(dm[1])).padStart(2, "0") +
    "T" + String(tm ? Number(tm[1]) : 0).padStart(2, "0") + ":" + String(tm ? Number(tm[2]) : 0).padStart(2, "0") + ":00+02:00";
  const t = Date.parse(iso);
  return isNaN(t) ? 0 : t;
}

async function getUltimaHora(env) {
  try {
    const c = await env.PORRA.get("ff:ultima:v2", "json");
    if (c && c.updatedAt && Date.now() - c.updatedAt < 10 * 60 * 1000) return c;
  } catch (e) {}
  let list = [];
  try { list = await getFfNoticias(env); } catch (e) {}
  const items = (list || []).slice(0, 12).map((x) => ({ title: x.title, link: x.link, thumb: x.thumb, date: x.date, time: x.time }));
  const data = { updatedAt: Date.now(), items };
  try { await env.PORRA.put("ff:ultima:v2", JSON.stringify(data), { expirationTtl: 1800 }); } catch (e) {}
  return data;
}

/* ---------- Mercado de fichajes (FutbolFantasy) ---------- */
const FICHAJES_URL = "https://www.futbolfantasy.com/laliga/mercado-fichajes/verano-2026";
const FICHAJES_KEY = "fm:fichajes:v3";

function ffCard(c) {
  const raw = (re) => { const m = c.match(re); return m ? stripHtml(m[1]) : ""; };
  const title = raw(/mercado-card-titular[^>]*>([^<]*)/);
  if (!title) return null;
  const time = (c.match(/mercado-card-hora[^>]*>[\s\S]*?(\d{1,2}:\d{2})/) || [])[1] || "";
  const badge = raw(/class="te-lbl">([\s\S]*?)<\/span>/);
  const clubs = [...c.matchAll(/mercado-equipo-nombre">([\s\S]*?)<\/span>/g)].map((m) => stripHtml(m[1]));
  const extract = raw(/mercado-card-extracto[^>]*>([\s\S]*?)<\/p>/);
  const link = (c.match(/class="mercado-card-noticia[^"]*"[^>]*href="([^"]+)"/) || [])[1] || (c.match(/href="([^"]+)"[^>]*class="mercado-card-noticia/) || [])[1] || "";
  const photo = (c.match(/mercado-card-foto[\s\S]*?data-src="([^"]+)"/) || c.match(/mercado-card-foto[\s\S]*?src="([^"]+)"/) || [])[1] || "";
  const thumb = (c.match(/mercado-card-noticia-thumb[^>]*background-image:\s*url\(['"]?([^'")]+)/) || [])[1] || "";
  const club = c.match(/mercado-equipo-link[\s\S]*?<img[^>]*src="([^"]+)"/);
  const clubCrest = club ? club[1].replace(/^\/\//, "https://") : "";
  return { time, title, badge, clubs, extract, link, photo, thumb, clubCrest };
}

function parseFichajes(html) {
  const groups = [];
  const parts = html.split(/<h2[^>]*title-container[^>]*>\s*<span>([\s\S]*?)<\/span><\/h2>/);
  for (let i = 1; i < parts.length; i += 2) {
    const date = stripHtml(parts[i]).replace(/[^\dA-Za-záéíóúÁÉÍÓÚüÜ\/ ]/g, "").replace(/\s+/g, " ").trim();
    const chunk = parts[i + 1] || "";
    const items = chunk.split('<div class="mercado-card">').slice(1).map(ffCard).filter(Boolean);
    if (items.length) groups.push({ date, items });
  }
  return groups;
}

async function getFichajes(env) {
  try { const c = await env.PORRA.get(FICHAJES_KEY, "json"); if (c && c.data && Date.now() - (c.at || 0) < 2 * 3600 * 1000) return c.data; } catch (e) {}
  let data = { updatedAt: Date.now(), groups: [] };
  try {
    const html = await (await fetch(FICHAJES_URL, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } })).text();
    data = { updatedAt: Date.now(), groups: parseFichajes(html) };
  } catch (e) {}
  try { if (data.groups.length) await env.PORRA.put(FICHAJES_KEY, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 3 * 3600 }); } catch (e) {}
  return data;
}


/* ---------- Últimas actualizaciones (futbolfantasy.com/laliga/ultimos-cambios) ---------- */
const CAMBIOS_URL = "https://www.futbolfantasy.com/laliga/ultimos-cambios";
// Regla de Edu: solo cuenta Futmondo. Fuera Liga Fantasy Oficial, Mister,
// Comunio, Biwenger, Fantasy Marca, estrellas, picas y puntos asignados.
function cambioExcluido(txt) {
  const t = stripAccents(String(txt || "").toLowerCase());
  if (/asignad/.test(t)) return true;
  if (/biwenger|mister|fantasy marca|comunio|liga fantasy|laliga fantasy|estrellas|picas/.test(t)) return true;
  if (/valores? de mercado/.test(t) && !/futmondo/.test(t)) return true;
  return false;
}
function cambioCat(icon) {
  const f = String(icon || "").toLowerCase();
  if (/alineacionc/.test(f)) return "once-ok";
  if (/alineacion2|alineacion/.test(f)) return "once";
  if (/tocados/.test(f)) return "tocado";
  if (/lesionados/.test(f)) return "lesion";
  if (/dudas/.test(f)) return "duda";
  if (/sancionad/.test(f)) return "sancion";
  if (/icono_big_ok/.test(f)) return "recuperado";
  if (/list/.test(f)) return "convocatoria";
  if (!f) return "mercado";
  return "otro";
}
function parseCambios(html) {
  const days = [];
  let cur = null;
  const re = /<h2[^>]*changelog-day[^>]*>([\s\S]*?)<\/h2>|<div class="event-row[^"]*"[^>]*>([\s\S]*?)(?=<div class="event-row|<h2[^>]*changelog-day|<\/section|$)/g;
  const txt = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const fixUrl = (u) => { u = String(u || ""); return u.startsWith("//") ? "https:" + u : u; };
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) { cur = { day: txt(m[1]), items: [] }; days.push(cur); continue; }
    const b = m[2] || "";
    if (!cur) { cur = { day: "", items: [] }; days.push(cur); }
    const tm = b.match(/class="event-time"[^>]*>([\s\S]*?)<\/(?:time|span)>/);
    const time = txt(tm && tm[1]);
    // Formato actual: <a class="event-link" href> ... <span class="event-title">; formato antiguo: event-content > a
    let a = b.match(/class="event-link"[^>]*href="([^"]+)"[\s\S]*?class="event-title"[^>]*>([\s\S]*?)<\/span>/) || b.match(/<a[^>]*class="event-link"[^>]*>[\s\S]*?class="event-title"[^>]*>([\s\S]*?)<\/span>/);
    if (a && a.length === 2) { const hh = b.match(/<a[^>]*href="([^"]+)"[^>]*class="event-link"/); a = [a[0], hh ? hh[1] : "", a[1]]; }
    if (!a) a = b.match(/class="event-content"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const title = txt(a[2]);
    const href = a[1];
    if (cambioExcluido(title)) continue;
    const imgs = [...b.split(/class="event-content"|class="event-title"/)[0].matchAll(/<img[^>]*src="([^"]+)"/g)].map((x) => fixUrl(x[1]));
    const iconM = b.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*event-icon|<img[^>]*class="[^"]*event-icon[^"]*"[^>]*src="([^"]+)"/);
    const icon = iconM ? (iconM[1] || iconM[2]) : "";
    const photo = imgs.find((u) => u !== fixUrl(icon)) || "";
    const players = [];
    if (/cambio-jugador/.test(b)) {
      for (const pm of b.split(/<li class="cambio-jugador"/).slice(1)) {
        const nombre = txt((pm.match(/cambio-nombre[^>]*>([\s\S]*?)<\/strong>/) || [])[1]);
        const foto = fixUrl((pm.match(/<img[^>]*cambio-foto[^>]*src="([^"]+)"/) || [])[1]);
        // Texto completo de cada estado (p. ej. "0% Suplente" o "Titular 70%"); sin depender de la estructura interior
        const blk = (re) => { const x = pm.match(re); return x ? txt(x[1]) : ""; };
        const fromT = blk(/cambio-estado--antes[^>]*>([\s\S]*?)(?=<svg|cambio-estado--despues|<\/li>)/);
        const toT = blk(/cambio-estado--despues[^>]*>([\s\S]*?)(?=<\/li>|$)/);
        if (nombre) players.push({ name: nombre, photo: foto, from: fromT, to: toT });
      }
    }
    cur.items.push({ time, cat: cambioCat(icon), title, href, photo, players });
  }
  return days.filter((d) => d.items.length);
}
async function getCambios(env) {
  const KEY = "cambios:v2";
  try { const c = await edgeGet(KEY); if (c && c.data && Date.now() - (c.at || 0) < 3 * 60 * 1000) return c.data; } catch (e) {}
  let data = null, why = "";
  try {
    const rs = await fetch(CAMBIOS_URL, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    const html = await rs.text();
    const days = parseCambios(html);
    if (days.length) data = { updatedAt: Date.now(), days };
    else why = "http " + rs.status + ", " + html.length + " bytes, sin dias leidos" + (/just a moment|captcha|challenge/i.test(html) ? ", pagina de verificacion" : "") + (html.indexOf("Actualizada posible") >= 0 ? ", el texto esta pero no el formato esperado" : ""); if (!days.length) { const ix = html.indexOf("event-row"); why += " | event-row en pos " + ix + (ix >= 0 ? ": " + html.slice(Math.max(0, ix - 150), ix + 500).replace(/\s+/g, " ") : "") + " | changelog-day: " + html.indexOf("changelog-day"); }
  } catch (e) { why = "error de red: " + String(e).slice(0, 80); }
  if (!data) {
    try { const c = await edgeGet(KEY); if (c && c.data && (c.data.days || []).length) return c.data; } catch (e) {}
    // Respaldo duradero (otro centro de datos o caché caducada): último resultado bueno guardado
    try { const k = await env.PORRA.get("cambios:last", "json"); if (k && k.days && k.days.length) return k; } catch (e) {}
    return { updatedAt: Date.now(), days: [], failed: true, why };
  }
  await edgePut(KEY, { at: Date.now(), data }, 86400);
  // Copia duradera como mucho cada 30 min (pocas escrituras en KV)
  try {
    const last = await edgeGet("cambios:kvat");
    if (!last || Date.now() - (last.at || 0) > 30 * 60 * 1000) {
      await env.PORRA.put("cambios:last", JSON.stringify(data), { expirationTtl: 3 * 86400 });
      await edgePut("cambios:kvat", { at: Date.now() }, 7200);
    }
  } catch (e) {}
  return data;
}

/* ---------- Alineaciones probables (Comuniate) ---------- */
function cmHeaders(extra) {
  return Object.assign({ "user-agent": "Mozilla/5.0 (compatible; edumr)", "x-requested-with": "XMLHttpRequest" }, extra || {});
}
function parseOnceLines(r) {
  const out = {};
  const parts = r.split(/<div id="(delanteros|medios|centrocampistas|defensas|portero|entrenador)"/);
  for (let i = 1; i < parts.length; i += 2) {
    const seg = parts[i + 1] || "";
    const blocks = seg.split(/class="[^"]*\bjugador\b[^"]*"/).slice(1);
    const players = [];
    for (const b of blocks) {
      const nm = (b.match(/nombre_jugador">\s*([^<]+?)\s*</) || [])[1] || "";
      const ph = (b.match(/caras3\/(\d+)\.png/) || [])[1] || "";
      const pid = (b.match(/ver_observaciones\('(\d+)'\)/) || [])[1] || ph;
      if (nm) players.push({ name: stripHtml(nm), photo: ph ? "https://www.comuniate.com/caras3/" + ph + ".png" : "", pid });
    }
    if (players.length) out[parts[i] === "centrocampistas" ? "medios" : parts[i]] = players;
  }
  return out;
}
async function cmPct(id) {
  if (!id) return null;
  try {
    const r = await (await fetch("https://www.comuniate.com/ajax/observaciones_jugador.php", { method: "POST", headers: cmHeaders({ "content-type": "application/x-www-form-urlencoded" }), body: "id_jugador=" + encodeURIComponent(id) })).text();
    const m = r.match(/player-start-meter__value">(\d{1,3})%/);
    if (m) return Number(m[1]);
    if (/player-start-card is-success/.test(r)) return 100;
    return null;
  } catch (e) { return null; }
}

// Caché en el edge (Cache API): no gasta el límite diario de escrituras de KV
async function edgeGet(key) {
  try { const r = await caches.default.match(new Request("https://edumr.es/__c/" + encodeURIComponent(key))); return r ? await r.json() : null; } catch (e) { return null; }
}
async function edgePut(key, val, ttl) {
  try { await caches.default.put(new Request("https://edumr.es/__c/" + encodeURIComponent(key)), new Response(JSON.stringify(val), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + (ttl || 600) } })); } catch (e) {}
}
async function getFFTeam(env, name) {
  // El slug de la URL de futbolfantasy.com no siempre coincide con el
  // nombre que usa Futmondo para el equipo: p.ej. "RC Deportivo" (o
  // "Deportivo de La Coruña") hay que convertirlo en solo "deportivo". Se
  // quitan las mismas palabras de relleno que ya se usaban para emparejar
  // equipos en otros sitios de la web (teamKey) MÁS "rc" (antes solo se
  // quitaba "rcd", y con "RC Deportivo" sin esa palabra el slug quedaba mal
  // y la página de ese equipo no cargaba NINGÚN jugador: por eso a TODOS
  // los jugadores del Deportivo —Amatucci, Giménez, Mario Soriano...— les
  // fallaban a la vez tanto la foto como el nombre corto).
  const FF_FILLER = ["de", "del", "la", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie"];
  const slugFrom = (s) => stripAccents(String(s || "")).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && FF_FILLER.indexOf(w) < 0).join("-");
  let slug = slugFrom(name);
  // Lista comprobada contra el índice real de equipos de futbolfantasy.com
  // (son estos 20 slugs: alaves, athletic, atletico, barcelona, betis,
  // celta, deportivo, elche, espanyol, getafe, levante, malaga, osasuna,
  // racing, rayo-vallecano, real-madrid, real-sociedad, sevilla, valencia,
  // villarreal). Las entradas de abajo cubren los nombres largos que usa
  // Futmondo para equipos cuyo slug real es más corto.
  const SLUG_FIX = {
    "atleti": "atletico", "atletico-madrid": "atletico",
    "barca": "barcelona",
    "santander": "racing", "racing-santander": "racing", "racing-de-santander": "racing",
    "real-betis": "betis",
    "deportivo-coruna": "deportivo", "deportivo-de-coruna": "deportivo", "coruna": "deportivo", "rcdeportivo": "deportivo",
    "espanyol-barcelona": "espanyol",
  };
  if (SLUG_FIX[slug]) slug = SLUG_FIX[slug];
  const key = "ffteam:v9:" + slug;
  try { const c = (await edgeGet(key)) || (await env.PORRA.get(key, "json")); if (c && c.data && Date.now() - (c.at || 0) < 30 * 60 * 1000) { if (!c.data.fetchedAt) c.data.fetchedAt = c.at; return c.data; } } catch (e) {}
  const data = { starters: [], bench: [], fetchedAt: Date.now() };
  try {
    const h = await (await fetch("https://www.futbolfantasy.com/laliga/equipos/" + slug, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } })).text();
    const iTit = h.indexOf("jugadores-titulares-");
    const iSup = h.indexOf("jugadores-suplentes-");
    const hTit = iTit >= 0 ? h.slice(iTit, iSup > iTit ? iSup : h.length) : "";
    const hSup = iSup >= 0 ? h.slice(iSup, h.indexOf("</section>", iSup) > iSup ? h.indexOf("</section>", iSup) : h.length) : "";
    const parse = (s) => s.split('class="jugador_').slice(1).map((it) => {
      const nm = (it.match(/class="truncate-name mx-auto">([^<]+)</) || [])[1];
      if (!nm) return null;
      const fi = it.indexOf("jugadores/ficha");
      let full = nm;
      if (fi >= 0) { const s0 = it.lastIndexOf("<img", fi); if (s0 >= 0) { const am = it.slice(s0, fi).match(/alt="([^"]+)"/); if (am) full = am[1]; } }
      const photo = (it.match(/data-src="([^"]*jugadores\/ficha[^"]*)"/) || [])[1] || "";
      const pos = (it.match(/data-posicion="([^"]+)"/) || [])[1] || "";
      const prob = (it.match(/data-probabilidad="(\d+)%"/) || [])[1];
      const x = (it.match(/data-onceFF-x="([\d.]+)%"/) || [])[1];
      const y = (it.match(/data-onceFF-y="([\d.]+)%"/) || [])[1];
      const nat = (it.match(/data-nacionalidad="([^"]+)"/) || [])[1] || "";
      const edad = Number((it.match(/data-edad="(\d+)"/) || [])[1]) || 0;
      const inj = Number((it.match(/data-lesion="(\d+)"/) || [])[1] || 0) === 1;
      const san = Number((it.match(/data-sancionado="(\d+)"/) || [])[1] || 0) === 1;
      const fullName = stripHtml(full);
      const last = (fullName || stripHtml(nm)).split(/\s+/).pop();
      return { name: stripHtml(nm), full: fullName, last, photo, pos, prob: prob != null ? Number(prob) : null, x: x ? parseFloat(x) : null, y: y ? parseFloat(y) : null, nat, edad, inj, san };
    }).filter(Boolean);
    data.starters = parse(hTit);
    data.bench = parse(hSup);
    // FutbolFantasy guarda las versiones del once probable con su fecha ("12/10 20:06", "13/10 17:06"...):
    // la última es cuándo se actualizó DE VERDAD el once de este equipo.
    try {
      let upd = 0;
      for (const fm of h.matchAll(/data-fecha="(\d{1,2}\/\d{1,2}) (\d{1,2}:\d{2})"[^>]{0,80}renderLineup/g)) { const t = ffWhenAt(fm[1], fm[2]); if (t > upd) upd = t; }
      if (upd) data.updatedAt = upd;
    } catch (e) {}
    const S = data.starters;
    const def = S.filter((p) => /defensa/i.test(p.pos)).length;
    const mid = S.filter((p) => /mediocampista|centrocampista|medio/i.test(p.pos)).length;
    const fwd = S.filter((p) => /delantero/i.test(p.pos)).length;
    data.formation = (def || mid || fwd) ? (def + "-" + mid + "-" + fwd) : "";
  } catch (e) {}
  if (data.starters.length) { await edgePut(key, { at: Date.now(), data }, 1800); try { await env.PORRA.put(key, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 6 * 3600 }); } catch (e) {} }
  return data;
}

// Vigilante de futbolfantasy.com: comprueba que las páginas de equipo de
// las que sacamos fotos (Alineaciones probables, Analiza tu equipo) siguen
// cargando jugadores. Si un equipo cambia de nombre/sube de categoría (como
// pasó con el Deportivo) y su slug deja de coincidir, esa página se queda a
// 0 jugadores SIN dar ningún error — así que si no la comprobamos a propósito,
// nadie se entera hasta que un jugador concreto "falla". Solo lo ve Edu
// (admin) como aviso en la propia web; no hay acceso al bot de Telegram
// desde aquí.
const FF_TEAMS = ["alaves", "athletic", "atletico", "barcelona", "betis", "celta", "deportivo", "elche", "espanyol", "getafe", "levante", "malaga", "osasuna", "racing", "rayo-vallecano", "real-madrid", "real-sociedad", "sevilla", "valencia", "villarreal"];
async function checkFFHealth(env, force) {
  const key = "ff:health:v2";
  if (!force) {
    try { const c = await env.PORRA.get(key, "json"); if (c && Date.now() - (c.at || 0) < 20 * 3600 * 1000) return c; } catch (e) {}
  }
  // De 4 en 4 (20 a la vez saturan el servidor y daban falsas alarmas) y los que fallan se reintentan una vez
  const okTeam = async (slug) => {
    try {
      const d = await getFFTeam(env, slug);
      return !!(d && ((d.starters && d.starters.length) || (d.bench && d.bench.length))); // sin once ni banquillo = página rota (tras jugar, FF vacía el once pero no el banquillo)
    } catch (e) { return false; }
  };
  let broken = [];
  for (let i = 0; i < FF_TEAMS.length; i += 4) {
    const grp = FF_TEAMS.slice(i, i + 4);
    const res = await Promise.all(grp.map(okTeam));
    grp.forEach((slug, k) => { if (!res[k]) broken.push(slug); });
  }
  if (broken.length) {
    const again = [];
    for (const slug of broken) { if (!(await okTeam(slug))) again.push(slug); }
    broken = again;
  }
  const result = { at: Date.now(), total: FF_TEAMS.length, broken };
  try { await env.PORRA.put(key, JSON.stringify(result)); } catch (e) {}
  return result;
}

async function getOnce(env, home, away, jornada) {
  const j = Number(jornada) || 0;
  const key = "once:v12:" + j + ":" + normKey(String(home).toLowerCase()) + "-" + normKey(String(away).toLowerCase());
  try { const c = await env.PORRA.get(key, "json"); if (c && c.at && Date.now() - c.at < 30 * 60 * 1000) return c.data; } catch (e) {}
  let stadium = "", kickoff = "", referee = "";
  try {
    const body = "id_jornada=" + encodeURIComponent(j) + "&modo_alineaciones=jornada_actual";
    const mh = await (await fetch("https://www.comuniate.com/ajax/partidos_jornada.php", { method: "POST", headers: cmHeaders({ "content-type": "application/x-www-form-urlencoded" }), body })).text();
    const links = [...mh.matchAll(/href="(\/partido\/[^"]+)"/g)].map((m) => m[1]);
    const sHome = (normKey(String(home).toLowerCase()).split(" ")[0]) || "";
    const sAway = (normKey(String(away).toLowerCase()).split(" ")[0]) || "";
    let href = "";
    for (const l of links) { const slug = stripAccents(l.split("/").pop().toLowerCase()); if (sHome && sAway && slug.indexOf(sHome) >= 0 && slug.indexOf(sAway) >= 0) { href = l; break; } }
    if (!href) for (const l of links) { const slug = stripAccents(l.split("/").pop().toLowerCase()); if ((sHome && slug.indexOf(sHome) >= 0) || (sAway && slug.indexOf(sAway) >= 0)) { href = l; break; } }
    if (href) {
      const ph = await (await fetch("https://www.comuniate.com" + href, { headers: cmHeaders() })).text();
      stadium = (ph.match(/"location":\{"@type":"Place","name":"([^"]+)"/) || [])[1] || "";
      kickoff = (ph.match(/"startDate":"([^"]+)"/) || [])[1] || "";
      referee = (ph.match(/cronista\.png[^>]*>[\s\S]*?<span>([^<]+)<\/span>/) || [])[1] || "";
    }
    await clearScrape(env, "comuniate");
  } catch (e) {
    await flagScrape(env, "comuniate", "No se pudo consultar comuniate.com para el estadio/hora/árbitro del partido.");
  }
  let data = null;
  try {
    const [hT, aT] = await Promise.all([getFFTeam(env, home), getFFTeam(env, away)]);
    data = { home: { name: home, starters: hT.starters, bench: hT.bench, formation: hT.formation }, away: { name: away, starters: aT.starters, bench: aT.bench, formation: aT.formation }, stadium, kickoff, referee };
  } catch (e) {}
  if (data) { try { await env.PORRA.put(key, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 1800 }); } catch (e) {} }
  return data || { home: { name: home, starters: [], bench: [] }, away: { name: away, starters: [], bench: [] }, stadium, kickoff, referee };
}

/* ---------- Alineaciones CONFIRMADAS (copia tal cual de Comuniate) ----------
   A diferencia de "Alineaciones probables" (getOnce, arriba), que mezcla datos
   de futbolfantasy.com con un % calculado, esto es un volcado literal del
   once YA CONFIRMADO que publica comuniate.com en la ficha de cada partido
   (solo nombre, foto y posición en el campo — nada de porcentajes ni
   banquillo, porque esa página no los trae). Edu pidió explícitamente que
   fuera "tal cual" como sale ahí, sin tocar nada. */
async function getComuniateMatches(env, jornada) {
  const key = "cm:matches:v2:" + jornada;
  try { const c = await env.PORRA.get(key, "json"); if (c && Date.now() - (c.at || 0) < 30 * 60 * 1000) return c.list; } catch (e) {}
  let list = [];
  try {
    const body = "id_jornada=" + encodeURIComponent(jornada) + "&modo_alineaciones=jornada_actual";
    const mh = await (await fetch("https://www.comuniate.com/ajax/partidos_jornada.php", { method: "POST", headers: cmHeaders({ "content-type": "application/x-www-form-urlencoded" }), body })).text();
    // El título de cada enlace trae los nombres completos de los dos
    // equipos (p.ej. title="Alineaciones probables Málaga  y Espanyol
    // Jornada 8"), que son los que de verdad hacen falta para emparejar
    // con los nombres cortos que usa Futmondo (p.ej. "Real Betis",
    // "Atleti", "Barça"): la propia URL (href) va en slugs tipo
    // "betis-osasuna" y comparar solo por la primera palabra del nombre
    // fallaba con casi todos los equipos de nombre compuesto.
    const re = /<a href="(\/partido\/[^"]+)" title="Alineaciones \S+ (.+?)\s+y\s+(.+?)\s+Jornada \d+"/g;
    let m;
    while ((m = re.exec(mh))) list.push({ href: m[1], home: stripHtml(m[2]).trim(), away: stripHtml(m[3]).trim() });
  } catch (e) {}
  try { if (list.length) await env.PORRA.put(key, JSON.stringify({ at: Date.now(), list }), { expirationTtl: 1800 }); } catch (e) {}
  return list;
}
function findComuniateMatch(list, home, away) {
  let best = null, bs = 0;
  for (const it of list) {
    const s = teamScore(it.home, home) + teamScore(it.away, away);
    if (s > bs) { bs = s; best = it; }
  }
  return bs >= 4 ? best : null;
}
// Comuniate pinta el campo de un partido confirmado como UN solo bloque: el
// once local (portero→defensas→medios→delanteros) seguido, sin separación
// especial en el HTML, del once visitante en orden inverso (delanteros→
// portero) porque visualmente queda reflejado en el otro lado del campo.
// Cada bloque de posición cierra siempre con el mismo comentario
// "<!-- fin XXX-->", así que separarlos así es fiable pase lo que pase con
// la alineación (formación, número de jugadores, etc). Si no salen los 8
// bloques (4 del equipo local + 4 del visitante) es que uno de los dos
// onces todavía no está confirmado del todo, y entonces no se muestra nada
// de ese partido en esta sección (solo onces 100% confirmados, tal y como
// pidió Edu).
function parseConfirmedPitch(html) {
  const re = /<div id="(portero|defensas|medios|delanteros)"[^>]*>([\s\S]*?)<!--\s*fin\s+\w+\s*-->/g;
  const blocks = [...html.matchAll(re)];
  if (blocks.length < 8) return null;
  const parsePlayers = (seg) => {
    const chunks = seg.split('class="jugador jugador_campo').slice(1);
    const players = [];
    for (const c of chunks) {
      const nm = (c.match(/nombre_jugador">\s*([^<]+?)\s*</) || [])[1] || "";
      const ph = (c.match(/caras3\/(\d+)\.png/) || [])[1] || "";
      const pid = (c.match(/ver_observaciones\('(\d+)'\)/) || [])[1] || ph;
      if (nm) players.push({ name: stripHtml(nm), photo: ph ? "https://www.comuniate.com/caras3/" + ph + ".png" : "", pid });
    }
    return players;
  };
  const side = (arr) => {
    const out = { portero: [], defensas: [], medios: [], delanteros: [] };
    for (const b of arr) out[b[1]] = parsePlayers(b[2]);
    return out;
  };
  const home = side(blocks.slice(0, 4));
  const away = side(blocks.slice(4, 8));
  const fmt = (o) => o.defensas.length + "-" + o.medios.length + "-" + o.delanteros.length;
  home.formation = fmt(home);
  away.formation = fmt(away);
  return { home, away };
}
async function getAlineacionesConfirmadas(env, matchdayParam) {
  const cacheKey = "cm:confirmadas:v3:" + (matchdayParam || "current");
  try { const c = await env.PORRA.get(cacheKey, "json"); if (c && Date.now() - (c.at || 0) < 10 * 60 * 1000) return c.data; } catch (e) {}
  let jd = null;
  try { jd = await getJornada(env, matchdayParam || null); } catch (e) {}
  const out = { matchday: (jd && jd.matchday) || 0, updatedAt: Date.now(), matches: [] };
  if (jd && jd.matches && jd.matches.length) {
    const links = await getComuniateMatches(env, out.matchday || matchdayParam || "");
  const wdF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short" });
    const dtF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
    const tF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false });
    const results = await Promise.all(jd.matches.map(async (m) => {
      const home = (m.homeTeam && (m.homeTeam.shortName || m.homeTeam.name)) || "";
      const away = (m.awayTeam && (m.awayTeam.shortName || m.awayTeam.name)) || "";
      if (!home || !away) return null;
      const found = findComuniateMatch(links, home, away);
      if (!found) return null;
      let html = "";
      try { html = await (await fetch("https://www.comuniate.com" + found.href, { headers: cmHeaders() })).text(); } catch (e) { return null; }
      const pitch = parseConfirmedPitch(html);
      if (!pitch) return null;
      const stadium = (html.match(/"location":\{"@type":"Place","name":"([^"]+)"/) || [])[1] || "";
      const referee = (html.match(/cronista\.png[^>]*>[\s\S]*?<span>([^<]+)<\/span>/) || [])[1] || "";
      const d = new Date(m.utcDate);
      let day = "", date = "", time = "";
      if (!isNaN(d.getTime())) {
        let w = wdF.format(d).replace(".", "");
        day = w.charAt(0).toUpperCase() + w.slice(1);
        date = dtF.format(d);
        time = tF.format(d);
      }
      return {
        home: { name: home, crest: (m.homeTeam && m.homeTeam.crest) || "", formation: pitch.home.formation, portero: pitch.home.portero, defensas: pitch.home.defensas, medios: pitch.home.medios, delanteros: pitch.home.delanteros },
        away: { name: away, crest: (m.awayTeam && m.awayTeam.crest) || "", formation: pitch.away.formation, portero: pitch.away.portero, defensas: pitch.away.defensas, medios: pitch.away.medios, delanteros: pitch.away.delanteros },
        day, date, time, stadium, referee,
      };
    }));
    out.matches = results.filter(Boolean);
    // Lista persistente de partidos ya confirmados (la sigue usando la ficha de la
    // jornada aunque la caché de arriba se vacíe por un fallo puntual de Comuniate).
    if (out.matches.length && out.matchday) {
      try {
        const sk = "cm:confset:v1:" + out.matchday;
        const prev = (await env.PORRA.get(sk, "json")) || [];
        const add = out.matches.map((x) => [x.home.name, x.away.name]);
        const merged = prev.slice();
        add.forEach((p) => { if (!merged.some((q) => q[0] === p[0] && q[1] === p[1])) merged.push(p); });
        if (merged.length !== prev.length) await env.PORRA.put(sk, JSON.stringify(merged), { expirationTtl: 7 * 24 * 3600 });
      } catch (e) {}
    }
    // Hora en que se detectó por primera vez cada alineación confirmada.
    // Se guarda fuera de la caché (que dura 10 min) para poder fechar los
    // avisos de la cinta de "Última hora" de la portada: una vez fijada,
    // no se vuelve a pisar.
    await Promise.all(out.matches.map(async (mm) => {
      const ck = "cm:confat:v1:" + (out.matchday || 0) + ":" + normKey(String((mm.home && mm.home.name) || "").toLowerCase()) + "-" + normKey(String((mm.away && mm.away.name) || "").toLowerCase());
      try {
        let at = await env.PORRA.get(ck);
        if (!at) { at = String(Date.now()); await env.PORRA.put(ck, at, { expirationTtl: 14 * 24 * 3600 }); }
        mm.confirmedAt = Number(at) || Date.now();
      } catch (e) { mm.confirmedAt = Date.now(); }
    }));
  }
  try { await env.PORRA.put(cacheKey, JSON.stringify({ at: Date.now(), data: out }), { expirationTtl: 600 }); } catch (e) {}
  return out;
}

function cmParseGoals(seg) {
  // El último gol de cada columna puede venir sin su </div> de cierre dentro
  // del trozo capturado (el corte de la columna se come ese cierre), así que
  // además de <div>...</div> se acepta un <div> final abierto hasta el final.
  const out = [];
  const re = /<div>\s*([\s\S]*?)(?:<\/div>|$)/g;
  let m;
  while ((m = re.exec(seg))) {
    const txt = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (txt) out.push({ text: txt });
    if (re.lastIndex >= seg.length) break;
  }
  return out;
}
function cmParseMatch(h) {
  const sc = [...h.matchAll(/score-num[^>]*>\s*(\d+)\s*</g)].map((m) => Number(m[1]));
  const state = ((h.match(/estado-bottom[^>]*>\s*([^<]*?)\s*</) || [])[1] || "").trim();
  const stadium = ((h.match(/🏟️\s*([^<]+)</) || [])[1] || "").trim();
  const referee = ((h.match(/arbitro_silbato\.svg"[^>]*>\s*<span>([^<]+)</) || [])[1] || "").trim();
  const cronista = ((h.match(/cronista\.png"[^>]*>\s*<span>([^<]+)</) || [])[1] || "").trim();
  const sofa = (h.match(/id_sofascore=(\d+)/) || [])[1] || "";
  const gl = (h.match(/goleadores-col local">([\s\S]*?)(?:goleadores-icon|goleadores-col visit)/) || [])[1] || "";
  const gv = (h.match(/goleadores-col visit">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/) || [])[1] || "";
  return {
    score: sc.length >= 1 ? sc[0] : null, scoreAway: sc.length >= 2 ? sc[1] : null,
    state, stadium, referee, cronista, sofa,
    goalsHome: cmParseGoals(gl), goalsAway: cmParseGoals(gv),
  };
}
function cmParsePoints(h) {
  const tables = h.split(/<table/i).slice(1);
  const parse = (t) => {
    const out = [];
    const rows = (t || "").split('class="playerRow"').slice(1);
    for (const r of rows) {
      const seg = r.slice(0, 1500);
      const pos = ((seg.match(/playerPosBig[^>]*>\s*([A-Z]{2})/) || [])[1] || "");
      const name = ((seg.match(/playerName[^>]*>\s*([^<]+?)\s*</) || [])[1] || "").trim();
      const pts = (seg.match(/playerPoints[^>]*>\s*(-?\d+)\s*</) || [])[1];
      const hl = [...seg.matchAll(/<span class="hl ([^"]*)">\s*<i class="fa ([a-z-]+)/g)].map((m) => ({ cls: m[1], ico: m[2] }));
      const hlMin = (seg.match(/hlMin">(\d+)'/) || [])[1] || "";
      if (name) out.push({ pos, name, pts: pts != null ? Number(pts) : null, hl, min: hlMin });
    }
    return out;
  };
  return { home: parse(tables[0]), away: parse(tables[1]) };
}
async function getPartidoFF(env, home, away, jornada) {
  const j = Number(jornada) || 0;
  const key = "partido:v4:" + j + ":" + normKey(String(home || "").toLowerCase()) + "-" + normKey(String(away || "").toLowerCase());
  try { const c = await env.PORRA.get(key, "json"); if (c && c.data && Date.now() - (c.at || 0) < 10 * 60 * 1000) return c.data; } catch (e) {}
  let data = null;
  try {
    let cmHref = "";
    try {
      const body = "id_jornada=" + encodeURIComponent(j) + "&modo_alineaciones=jornada_actual";
      const mh = await (await fetch("https://www.comuniate.com/ajax/partidos_jornada.php", { method: "POST", headers: cmHeaders({ "content-type": "application/x-www-form-urlencoded" }), body })).text();
      const links = [...mh.matchAll(/href="(\/partido\/[^"]+)"/g)].map((m) => m[1]);
      const wH = wkey(home), wA = wkey(away);
      let best = 0;
      for (const l of links) { const slug = stripAccents(l.split("/").pop().toLowerCase()); let s = 0; wH.forEach((w) => { if (slug.indexOf(w) >= 0) s++; }); wA.forEach((w) => { if (slug.indexOf(w) >= 0) s++; }); if (wH.some((w) => slug.indexOf(w) >= 0) && wA.some((w) => slug.indexOf(w) >= 0) && s > best) { best = s; cmHref = l; } }
    } catch (e) {}
    if (cmHref) {
      const mh = await (await fetch("https://www.comuniate.com" + cmHref, { headers: cmHeaders() })).text();
      const base = cmParseMatch(mh);
      let hp = [], ap = [];
      if (base.sofa) {
        try {
          const aj = await (await fetch("https://www.comuniate.com/ajax/partidos/carga_puntos_futmondo.php?modo=PRENSA", { method: "POST", headers: cmHeaders({ "content-type": "application/x-www-form-urlencoded" }), body: "id_sofascore=" + base.sofa + "&temporada=26" })).text();
          const pts = cmParsePoints(aj);
          hp = pts.home; ap = pts.away;
        } catch (e) {}
      }
      data = { home, away, ...base, homePlayers: hp, awayPlayers: ap, url: "https://www.comuniate.com" + cmHref };
    }
  } catch (e) {}
  if (data) { try { await env.PORRA.put(key, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 600 }); } catch (e) {} }
  return data || { error: "No se encontró el partido." };
}

/* ---------- Franja de jornada (escudos, día/hora y TV) ---------- */
// Apodos que no comparten ni una palabra con el nombre "normal" del equipo
// (p.ej. "Barça" → "barca", que no es ni empieza igual que "barcelona"), así
// que sin esto teamScore() les daba 0 y no emparejaban con fuentes que usan
// el nombre completo (como Comuniate).
const TEAM_ALIASES = { barca: "barcelona", atleti: "atletico", santander: "racing" };
function wkey(s) {
  return stripAccents(String(s || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w && ["de", "del", "la", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie", "c", "f"].indexOf(w) < 0)
    .map((w) => TEAM_ALIASES[w] || w);
}
function teamScore(a, b) {
  const A = wkey(a), B = wkey(b);
  if (!A.length || !B.length) return 0;
  for (const t of A) for (const u of B) {
    if (t === u) return 3;
    if (t.length >= 4 && u.length >= 4 && (t.startsWith(u) || u.startsWith(t))) return 2;
  }
  const la = A[A.length - 1], lb = B[B.length - 1];
  if (la && la.length >= 4 && la === lb) return 2;
  return 0;
}
function ffTvFind(map, home, away) {
  let best = null, bs = 0;
  for (const k of Object.keys(map)) {
    const p = k.split("|");
    const s = teamScore(p[0], home) + teamScore(p[1], away);
    if (s > bs) { bs = s; best = map[k]; }
  }
  return bs >= 4 ? best : null;
}
async function ffTvMap(env) {
  try {
    const c = await env.PORRA.get("ff:tv:v9", "json");
    if (c && c.list && Date.now() - (c.at || 0) < 30 * 60 * 1000) return c;
  } catch (e) {}
  const byName = {}, list = [];
  try {
    const res = await fetch("https://www.futbolfantasy.com/laliga/calendario", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    const html = await res.text();
    const parts = html.split('class="partido');
    for (let i = 1; i < parts.length; i++) {
      const r = parts[i].slice(0, 1800);
      const tt = r.match(/data-tooltip="([^"]*)"/);
      if (!tt) continue;
      let home = "", away = "";
      const um = tt[1].match(/^(.*?)\s+-\s+(.*)$/);
      if (um) { home = um[1]; away = um[2]; }
      else { const fm = tt[1].match(/^(.*?)\s+\d+\s*-\s*\d+\s+(.*)$/); if (fm) { home = fm[1]; away = fm[2]; } }
      home = home.replace(/&amp;/g, "&").trim();
      away = away.replace(/&amp;/g, "&").trim();
      if (!home || !away) continue;
      const BAD = /comunio|sofascore|futmondo|prensa|fantasy|biwenger|mister|jornada|anal[ií]tica|^stats$|previa|picaroja|estrella/i;
      const tv = [];
      const imgs = r.match(/<img[^>]*class="canal[^"]*"[^>]*>/g) || [];
      for (const tag of imgs) {
        const a = (tag.match(/alt="([^"]*)"/) || [])[1] || "";
        let d = (tag.match(/data-src="([^"]*)"/) || [])[1] || "";
        if (a && !BAD.test(a) && d) {
          if (d.indexOf("//") === 0) d = "https:" + d;
          // El logo de Movistar que trae futbolfantasy.com en su propio <img>
          // es un icono antiguo/distinto al que usamos en el resto de la
          // web (p.ej. en los partidos que solo sale aquí y no en
          // futbolenlatv.es, que es de donde viene el logo bueno). Para que
          // el mismo canal se vea SIEMPRE igual, se fuerza aquí también al
          // mismo archivo que usa fltvMap().
          if (/dazn/i.test(a)) d = "/img/dazn.svg?v=3";
          else if (/movistar|^m\+/i.test(a)) d = "/img/movistar.png?v=2";
          tv.push({ name: a, logo: d });
        }
      }
      if (!tv.length) continue;
      const fecha = (r.match(/class="fecha">([\s\S]*?)<\/div>/) || [])[1] || "";
      const clean = fecha.replace(/<br\s*\/?>/gi, " ").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const dv = clean.match(/(\d{1,2}\/\d{1,2})/);
      const tm = clean.match(/(\d{1,2}:\d{2})/);
      const entry = { home, away, date: dv ? dv[1] : "", time: tm ? tm[1].padStart(5, "0") : "", tv };
      list.push(entry);
      const key = stripAccents(home.toLowerCase()) + "|" + stripAccents(away.toLowerCase());
      if (!byName[key]) byName[key] = entry;
    }
  } catch (e) {}
  const out = { at: Date.now(), byName, list };
  if (list.length > 10) { try { await env.PORRA.put("ff:tv:v9", JSON.stringify(out), { expirationTtl: 3600 }); } catch (e) {} }
  return out;
}
async function fltvMap(env) {
  try {
    const c = await env.PORRA.get("fltv:v4", "json");
    if (c && c.list && Date.now() - (c.at || 0) < 30 * 60 * 1000) return c;
  } catch (e) {}
  const list = [], byName = {};
  const MOV = "/img/movistar.png?v=2";
  try {
    const res = await fetch("https://www.futbolenlatv.es/competicion/la-liga", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    const html = await res.text();
    const rows = html.split("<tr");
    const dtF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
    const tF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false });
    let curDate = "";
    for (const raw of rows) {
      if (raw.indexOf("cabeceraTabla") >= 0) { const m = raw.match(/(\d{2}\/\d{2}\/\d{4})/); if (m) curDate = m[1]; continue; }
      if (raw.indexOf('class="local"') < 0) continue;
      const localCell = (raw.match(/class="local"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || "";
      const visitCell = (raw.match(/class="visitante"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || "";
      const nameOf = (cell) => { const s = cell.match(/<span[^>]*title="([^"]+)"/); if (s) return s[1]; const im = cell.match(/<img[^>]*title="([^"]+)"/); return im ? im[1] : ""; };
      const home = nameOf(localCell), away = nameOf(visitCell);
      if (!home || !away) continue;
      const canc = (raw.match(/class="canales"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || "";
      const chans = [...canc.matchAll(/<li[^>]*title="([^"]+)"/g)].map((m) => m[1]);
      if (!chans.length) continue;
      let date = curDate.slice(0, 5), time = "";
      const sm = raw.match(/itemprop="startDate" content="([^"]+)"/);
      if (sm) { const s = sm[1]; const d = new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z"); if (!isNaN(d.getTime())) { date = dtF.format(d); time = tF.format(d); } }
      if (!time) { const hm = raw.match(/class="hora[^"]*">\s*([0-9]{1,2}:[0-9]{2})/); if (hm) time = hm[1].padStart(5, "0"); }
      let tv = [];
      for (const ch of chans) { if (/dazn/i.test(ch)) { tv = [{ name: "DAZN", logo: "/img/dazn.svg?v=3" }]; break; } }
      if (!tv.length) for (const ch of chans) { if (/m\+|movistar/i.test(ch)) { tv = [{ name: "Movistar LaLiga", logo: MOV }]; break; } }
      if (!tv.length) tv = [{ name: chans[0].replace(/\s*\([^)]*\)\s*$/, "").trim(), logo: "" }];
      if (!date || !time) continue;
      const entry = { home, away, date, time, tv };
      list.push(entry);
      const key = stripAccents(home.toLowerCase()) + "|" + stripAccents(away.toLowerCase());
      if (!byName[key]) byName[key] = entry;
    }
  } catch (e) {}
  const out = { at: Date.now(), list, byName };
  if (list.length > 10) { try { await env.PORRA.put("fltv:v4", JSON.stringify(out), { expirationTtl: 3600 }); } catch (e) {} }
  return out;
}

/* ---------- Extras de Comuniate para la franja de jornada: canal de TV,
   si el once ya está confirmado, y el marcador/estado en vivo ----------
   futbolenlatv.es y futbolfantasy.com (arriba) solo enseñan partidos de
   HOY en adelante: en cuanto un partido ya se ha jugado (aunque sea el
   mismo día, unas horas antes) desaparece de su listado y la franja se
   queda diciendo "Canal por confirmar" aunque el canal llevara anunciado
   toda la semana (le pasó con Barcelona-Getafe y Real Madrid-Villarreal).
   Comuniate, en cambio, enseña el canal en la ficha de cada partido pase
   lo que pase (jugado o no), así que se usa como fuente principal y las
   otras dos quedan de apoyo para cuando Comuniate aún no lo sepa. */
function cmTvIcon(src, alt) {
  const a = String(alt || "").toLowerCase();
  if (/dazn/.test(a)) return { name: "DAZN", logo: "/img/dazn.svg?v=3" };
  if (/movistar|^m\+/.test(a)) return { name: "Movistar LaLiga", logo: "/img/movistar.png?v=2" };
  if (!src) return null;
  const abs = src.indexOf("http") === 0 ? src : "https://www.comuniate.com" + src;
  return { name: alt ? alt.toUpperCase() : "TV", logo: abs };
}
async function getComuniateExtras(env, jornada) {
  const cacheKey = "cm:extras:v2:" + jornada;
  try { const c = await env.PORRA.get(cacheKey, "json"); if (c && Date.now() - (c.at || 0) < 10 * 60 * 1000) return c.data; } catch (e) {}
  let data = [];
  try {
    const links = await getComuniateMatches(env, jornada);
    data = await Promise.all(links.map(async (l) => {
      try {
        const html = await (await fetch("https://www.comuniate.com" + l.href, { headers: cmHeaders() })).text();
        // Comuniate no es consistente con las comillas del <img> (a veces
        // comillas simples, a veces dobles), así que primero se acota el
        // trocito del div "tv-compact" (hasta su propio cierre) y luego se
        // sacan src/alt sueltos, sin asumir ni el orden ni el tipo de comilla.
        const divM = html.match(/class="tv-compact">([\s\S]*?)<\/div>/);
        let tv = null;
        if (divM) {
          const srcM = divM[1].match(/src=['"]([^'"]+)['"]/);
          const altM = divM[1].match(/alt=['"]([^'"]*)['"]/);
          if (srcM) tv = cmTvIcon(srcM[1], altM ? altM[1] : "");
        }
        const confirmed = !!parseConfirmedPitch(html);
        return { home: l.home, away: l.away, tv, confirmed };
      } catch (e) { return { home: l.home, away: l.away, tv: null, confirmed: false }; }
    }));
  } catch (e) {}
  try { if (data.length) await env.PORRA.put(cacheKey, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 600 }); } catch (e) {}
  return data;
}
// La franja de "resultados en directo" (marcador, minuto, FINAL/DIRECTO/
// PREVIA) que Comuniate pinta arriba de CADA ficha de partido enseña, en
// realidad, TODOS los partidos de la jornada a la vez (es un carrusel), así
// que basta con pedir UNA sola ficha para sacar el estado de los demás.
function parseComuniateSwiper(html) {
  const out = [];
  const parts = html.split('class="partido-link"');
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i].slice(0, 1600);
    const imgs = [...seg.matchAll(/team-logo__img"\s+src="([^"]+)"\s+alt="([^"]*)"/g)];
    if (imgs.length < 2) continue;
    const scoreM = seg.match(/partido-score">\s*([^<]*)</);
    const clsM = seg.match(/class="(badge-esquina[^"]*)"/);
    const badgeM = seg.match(/badge-esquina[^>]*>\s*([^<]*?)\s*</);
    const subM = seg.match(/partido-sub">\s*([^<]*)</);
    out.push({
      home: stripHtml(imgs[0][2]).trim(), away: stripHtml(imgs[1][2]).trim(),
      score: scoreM ? scoreM[1].trim() : "",
      statusCls: clsM ? clsM[1] : "",
      statusText: badgeM ? stripHtml(badgeM[1]).trim() : "",
      sub: subM ? stripHtml(subM[1]).trim() : "",
    });
  }
  return out;
}
async function getComuniateStrip(env, jornada) {
  const cacheKey = "cm:strip:v1:" + jornada;
  // Caché corta: es en vivo (marcador y minuto van cambiando).
  try { const c = await env.PORRA.get(cacheKey, "json"); if (c && Date.now() - (c.at || 0) < 3 * 60 * 1000) return c.data; } catch (e) {}
  let data = [];
  try {
    const links = await getComuniateMatches(env, jornada);
    if (links.length) {
      const html = await (await fetch("https://www.comuniate.com" + links[0].href, { headers: cmHeaders() })).text();
      data = parseComuniateSwiper(html);
    }
  } catch (e) {}
  try { if (data.length) await env.PORRA.put(cacheKey, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 180 }); } catch (e) {}
  return data;
}
// Minuto REAL de los partidos en juego: el widget de jornada de Comuniate pinta
// <span class='live-dot'></span><span class='danger'>29' </span> bajo el marcador.
async function getComuniateLiveMinutes(env, jornada) {
  const key = "cm:livemin:v1:" + jornada;
  try { const c = await env.PORRA.get(key, "json"); if (c && Date.now() - (c.at || 0) < 40 * 1000) return c.data; } catch (e) {}
  const data = [];
  try {
    const body = "id_jornada=" + encodeURIComponent(jornada) + "&modo_alineaciones=jornada_actual";
    const mh = await (await fetch("https://www.comuniate.com/ajax/partidos_jornada.php", { method: "POST", headers: cmHeaders({ "content-type": "application/x-www-form-urlencoded" }), body })).text();
    const parts = mh.split('<a href="/partido/');
    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i].slice(0, 2600);
      const mm = seg.match(/live-dot'?"?><\/span>\s*<span[^>]*>([^<]*)</);
      if (!mm) continue;
      const alts = [...seg.matchAll(/alt=['"]([^'"]+)['"]/g)].map((x) => stripHtml(x[1]).trim());
      if (alts.length < 2) continue;
      data.push({ home: alts[0], away: alts[1], text: stripHtml(mm[1]).trim() });
    }
  } catch (e) { return []; }
  try { await env.PORRA.put(key, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 60 }); } catch (e) {}
  return data;
}
function cmLiveState(cls) {
  if (/label-success/.test(cls)) return "final";
  if (/label-info/.test(cls)) return "live";
  if (/label-danger/.test(cls)) return "suspended";
  return "previa";
}
// Etiqueta "1ª parte · Min. 23" a partir del texto REAL que da Comuniate (nunca se calcula con el reloj).
function liveMinuteLabel(texts) {
  const t = (texts || []).filter(Boolean).join(" ").trim();
  if (!t) return "";
  if (/descanso|half/i.test(t)) return "Descanso";
  const mm = t.match(/(\d{1,3})\s*(?:\+\s*(\d{1,2}))?\s*['’′]?/);
  const half = /1\s*[ªa]|primera/i.test(t) ? 1 : /2\s*[ªa]|segunda/i.test(t) ? 2 : 0;
  if (!mm && !half) return "";
  const base = mm ? Number(mm[1]) : 0;
  const h = half || (base > 45 ? 2 : 1);
  const minTxt = mm ? " · Min. " + mm[1] + (mm[2] ? "+" + mm[2] : "") : "";
  return h + "ª parte" + minTxt;
}
// Marcador/estado en directo desde football-data (ya viene dentro de la
// jornada, es el mismo equipo que el resto de datos, y se actualiza al
// minuto). Se usa como fuente principal y Comuniate queda de respaldo, así
// los partidos que están jugando ahora mismo (p.ej. Málaga o Racing) sí
// muestran su marcador en cuanto football-data lo publica.
function flLive(m) {
  if (!m) return null;
  const st = String(m.status || "");
  const sc = m.score || {};
  const ft = sc.fullTime || {};
  const ht = sc.halfTime || {};
  const j = (a, b) => (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") ? "" : (a + " - " + b);
  if (st === "FINISHED" || st === "AWARDED") {
    const s = j(ft.home, ft.away);
    return s ? { state: "final", label: "FINALIZADO", minute: "", score: s } : null;
  }
  if (st === "IN_PLAY" || st === "PAUSED") {
    const s = j(ft.home, ft.away) || j(ht.home, ht.away);
    const lbl = st === "PAUSED" ? "Descanso" : "EN JUEGO";
    return { state: "live", label: lbl, minute: lbl, score: s || "0 - 0" };
  }
  if (st === "SUSPENDED" || st === "POSTPONED" || st === "CANCELLED") {
    return { state: "suspended", label: "SUSPENDIDO", minute: "", score: "" };
  }
  return null;
}

// ¿Qué partidos de la jornada tienen ya alineación probable publicada (futbolfantasy)? La página de
// equipo de FF siempre enseña el once del PRÓXIMO partido, así que solo vale para la jornada en curso
// (o la siguiente si la actual ya acabó).
async function getProbableFlags(env, jornada) {
  const dj = await getJornada(env, null);
  const jd = jornada && Number(jornada) !== Number(dj.matchday) ? await getJornada(env, jornada) : dj;
  const jn = Number(jd.matchday) || 0, dn = Number(dj.matchday) || 0;
  const ok = jn && (jn === dn || (jn === dn + 1 && (dj.matches || []).length && (dj.matches || []).every(isMatchDone)));
  if (!ok) {
    try { const prev = (await edgeGet("probflags:" + (jornada || dn))) || (await env.PORRA.get("probflags:" + (jornada || dn), "json")); if (prev && prev.items && Date.now() - (prev.at || 0) < 6 * 3600 * 1000) return { matchday: Number(jornada || dn) || jn, items: prev.items }; } catch (e) {}
    return { matchday: jn, items: [] };
  }
  const nm = (t) => (t && (t.shortName || t.name)) || "";
  const open = (jd.matches || []).filter((m) => m.status === "SCHEDULED" || m.status === "TIMED");
  let prevItems = [];
  try { const pv = (await edgeGet("probflags:" + jn)) || (await env.PORRA.get("probflags:" + jn, "json")); if (pv && pv.items) prevItems = pv.items; } catch (e) {}
  const knownK = new Set(prevItems.map((i) => i.home + "|" + i.away));
  // Cada lectura procesa como mucho 8 equipos (20 páginas de golpe superan el límite de recursos); los que ya se conocen
  // se refrescan en las siguientes y lo ya visto se conserva.
  const ordered = open.slice().sort((a, b) => (knownK.has(nm(a.homeTeam) + "|" + nm(a.awayTeam)) ? 1 : 0) - (knownK.has(nm(b.homeTeam) + "|" + nm(b.awayTeam)) ? 1 : 0));
  const names = [...new Set(ordered.reduce((a, m) => a.concat([nm(m.homeTeam), nm(m.awayTeam)]), []).filter(Boolean))].slice(0, 8);
  const has = {}, at = {};
  await Promise.all(names.map(async (n) => { try { const t = await getFFTeam(env, n); has[n] = ((t && t.starters) || []).length >= 10; at[n] = (t && (t.updatedAt || t.fetchedAt)) || 0; } catch (e) { has[n] = false; } }));
  const items = open.filter((m) => has[nm(m.homeTeam)] && has[nm(m.awayTeam)]);
  // Cada equipo actualiza su once por su cuenta en futbolfantasy: la hora es PARTIDO a PARTIDO y es la de la
  // última actualización real (la más reciente de sus dos equipos), no la de cuando la leímos nosotros.
  let out = items.map((m) => ({ home: nm(m.homeTeam), away: nm(m.awayTeam), at: Math.max(at[nm(m.homeTeam)] || 0, at[nm(m.awayTeam)] || 0) }));
  // Leer 20 páginas a la vez a veces falla a medias (límite de recursos): lo que ya se había visto bien se conserva,
  // siempre que el partido siga sin empezar.
  const pkey = "probflags:" + jn;
  let perr = "";
  try {
    const prev = { items: prevItems, at: Date.now() };
    if (prev && prev.items && Date.now() - (prev.at || 0) < 12 * 3600 * 1000) {
      const openKeys = new Set(open.map((m) => nm(m.homeTeam) + "|" + nm(m.awayTeam)));
      const have = new Set(out.map((i) => i.home + "|" + i.away));
      prev.items.forEach((i) => { const k = i.home + "|" + i.away; if (!have.has(k) && openKeys.has(k)) out.push(i); });
    }
    if (out.length) { await edgePut(pkey, { at: Date.now(), items: out }, 43200); try { await env.PORRA.put(pkey, JSON.stringify({ at: Date.now(), items: out }), { expirationTtl: 86400 }); } catch (e) {} }
    else if (prev && prev.items && prev.items.length && open.length) out = prev.items.filter((i) => open.some((m) => nm(m.homeTeam) === i.home && nm(m.awayTeam) === i.away));
  } catch (e) { perr = String(e && e.message || e).slice(0, 120); }
  return { matchday: jn, items: out };
}

async function getJornadaStrip(env, matchday) {
  let jd = null;
  try { jd = await getJornada(env, matchday || null, true); } catch (e) {}
  if (!jd || !jd.matches) return { matchday: 0, matches: [] };
  // Partidos aplazados de jornadas anteriores: entran como un partido más (con la etiqueta "Aplazado") solo cuando ya
  // tienen fecha y está cerca (≤ 3 días), se está jugando o acaba de terminar. Sin fecha, no se enseñan.
  {
    try {
      const ap = await getAplazados(env);
      const ts = (jd.matches || []).map((m) => Date.parse(m.utcDate)).filter((t) => t > 0);
      const lo = ts.length ? Math.min.apply(null, ts) - 4 * 24 * 3600 * 1000 : 0, hi = ts.length ? Math.max.apply(null, ts) + 24 * 3600 * 1000 : 0;
      const extra = ((ap && ap.items) || []).filter((x) => {
        if (x.undated || x.tbc || !lo) return false;
        if (Number(x.matchday) === Number(jd.matchday)) return false;
        const t = Date.parse(x.utcDate) || 0;
        return t >= lo && t <= hi;
      }).map((x) => ({
        id: "ap" + x.matchday + x.home, utcDate: x.utcDate, status: x.status, _aplaz: x.matchday,
        homeTeam: { shortName: x.home, name: x.home, crest: x.homeCrest }, awayTeam: { shortName: x.away, name: x.away, crest: x.awayCrest },
        score: { fullTime: { home: x.score ? Number(String(x.score).split("-")[0]) : null, away: x.score ? Number(String(x.score).split("-")[1]) : null } },
      }));
      if (extra.length) {
        jd = Object.assign({}, jd, { matches: (jd.matches || []).concat(extra).sort((a, b) => (Date.parse(a.utcDate) || 0) - (Date.parse(b.utcDate) || 0)) });
      }
    } catch (e) {}
  }
  let fl = { byName: {}, list: [] }, ffc = { byName: {}, list: [] };
  try { fl = await fltvMap(env); } catch (e) {}
  try { ffc = await ffTvMap(env); } catch (e) {}
  const list = (fl.list || []).concat(ffc.list || []);
  const jnum = jd.matchday || matchday || "";
  let cmExtras = [], cmStrip = [], cmMin = [];
  try { cmExtras = await getComuniateExtras(env, jnum); } catch (e) {}
  try { cmStrip = await getComuniateStrip(env, jnum); } catch (e) {}
  try { cmMin = await getComuniateLiveMinutes(env, jnum); } catch (e) {}
  let cambiosCache = null;
  // Solo si hay un aplazado en la rejilla (leer y analizar el feed completo es costoso)
  // El resultado se recuerda 2 min por partido para no repetir el análisis en cada visita
  const apHit = (jd.matches || []).some((m) => m && m._aplaz) ? await edgeGet("apx:v1:" + (jd.matches || []).filter((m) => m && m._aplaz).map((m) => m.id).join(",")) : null;
  if (apHit && Date.now() - (apHit.at || 0) < 120000) cambiosCache = apHit.c;
  else if ((jd.matches || []).some((m) => m && m._aplaz)) {
    try {
      const full = await getCambios(env);
      cambiosCache = { days: (full.days || []).slice(0, 2).map((d) => ({ day: d.day, items: d.items.filter((it) => it.cat === "once" || it.cat === "once-ok").map((it) => ({ cat: it.cat, title: it.title, time: it.time })) })) };
      await edgePut("apx:v1:" + (jd.matches || []).filter((m) => m && m._aplaz).map((m) => m.id).join(","), { at: Date.now(), c: cambiosCache }, 300);
    } catch (e) {}
  }
  const dayF = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", day: "numeric" });
  const wdF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short" });
  const dtF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
  const tF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false });
  const used = new Array(list.length).fill(false);
  const prep = (jd.matches || []).map((m) => {
    const d = new Date(m.utcDate);
    const home = (m.homeTeam && (m.homeTeam.shortName || m.homeTeam.name)) || "";
    const away = (m.awayTeam && (m.awayTeam.shortName || m.awayTeam.name)) || "";
    let day = "", date = "", time = "";
    if (!isNaN(d.getTime())) {
      let w = wdF.format(d).replace(".", "");
      day = w.charAt(0).toUpperCase() + w.slice(1);
      date = dtF.format(d);
      time = tF.format(d);
    }
    let bi = -1, bs = 0;
    for (let i = 0; i < list.length; i++) {
      const s = teamScore(list[i].home, home) + teamScore(list[i].away, away);
      if (s > bs) { bs = s; bi = i; }
    }
    const tbc = !isNaN(d.getTime()) && d.getUTCHours() === 0 && d.getUTCMinutes() === 0; // 00:00 UTC = hora aún sin fijar en football-data
    return { home, away, homeCrest: (m.homeTeam && m.homeTeam.crest) || "", awayCrest: (m.awayTeam && m.awayTeam.crest) || "", day, date, time, tbc, dt: date + "|" + time, bi, bs, m };
  });
  prep.forEach((p) => { if (p.bs >= 4 && p.bi >= 0) used[p.bi] = true; });

  // Canal "memoria": una vez visto un canal para un partido de esta jornada
  // se guarda aparte (con caducidad larga), porque las fuentes en vivo de
  // más arriba dejan de listar un partido en cuanto se juega, y si no, se
  // perdía el canal ya confirmado en cuanto expiraba su caché de 30 min.
  const accumKey = "jtv:accum:" + (jnum || "x");
  let accum = {};
  try { accum = (await env.PORRA.get(accumKey, "json")) || {}; } catch (e) {}
  let accumChanged = false;

  // Alineaciones confirmadas ya detectadas (misma fuente que el aviso de la portada);
  // evita que la ficha vaya por detrás por la caché de 10 min de los extras.
  let cfList = [];
  try { cfList = ((await getAlineacionesConfirmadas(env, jnum || null)) || {}).matches || []; } catch (e) {}
  try {
    const st = (await env.PORRA.get("cm:confset:v1:" + jnum, "json")) || [];
    st.forEach((p) => cfList.push({ home: { name: p[0] }, away: { name: p[1] } }));
  } catch (e) {}
  // FotMob: lo más fresco para partidos que están jugándose ahora (la lista de Comuniate/football-data va con retraso)
  let fmList = [];
  try {
    const now0 = Date.now(), dset = new Set();
    prep.forEach((p) => { const ko = new Date(p.m && p.m.utcDate).getTime(); if (ko && ko <= now0 + 120000 && now0 - ko < 4 * 3600 * 1000) { const pp = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ko)).forEach((x) => { pp[x.type] = x.value; }); dset.add(pp.year + pp.month + pp.day); } });
    for (const dd of [...dset].slice(0, 2)) {
      const lj = await (await fetch("https://www.fotmob.com/api/data/matches?date=" + dd + "&timezone=Europe%2FMadrid&ccode3=ESP", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } })).json();
      (lj.leagues || []).forEach((lg) => (lg.matches || []).forEach((m) => { if (m && m.status && m.home && m.away) fmList.push(m); }));
    }
  } catch (e) {}
  const matches = prep.map((p) => {
    const key = wkey(p.home).join(" ") + "|" + wkey(p.away).join(" ") + "|" + wkey(p.away).join(" ");
    let tv = [];
    // 1) Canal: primero Comuniate, que lo enseña siempre (jugado o no).
    const cmE = cmExtras.find((e) => teamScore(e.home, p.home) + teamScore(e.away, p.away) >= 4);
    if (cmE && cmE.tv) tv = [cmE.tv];
    // 2) si no, las fuentes de antes (futbolenlatv.es / futbolfantasy.com).
    if (!tv.length) {
      if (p.bs >= 4 && p.bi >= 0) tv = list[p.bi].tv;
      else {
        const i = list.findIndex((e, idx) => !used[idx] && e.date && (e.date + "|" + e.time) === p.dt);
        if (i >= 0) { tv = list[i].tv; used[i] = true; }
      }
    }
    // 3) memoria: si ahora se sabe, se guarda; si no se sabe ahora mismo
    // pero se supo antes, se usa lo último conocido en vez de "por confirmar".
    if (tv.length) {
      if (JSON.stringify(accum[key]) !== JSON.stringify(tv)) { accum[key] = tv; accumChanged = true; }
    } else if (accum[key] && accum[key].length) {
      tv = accum[key];
    }

    // Marcador y estado: primero football-data (en directo de verdad);
    // si aún no lo tiene, se usa Comuniate como respaldo.
    let live = flLive(p.m);
    const cmM = cmStrip.find((e) => teamScore(e.home, p.home) + teamScore(e.away, p.away) >= 4);
    if (!live && cmM && (cmM.score || cmM.statusCls)) {
      const state = cmLiveState(cmM.statusCls);
      if (cmM.score && (state === "final" || state === "live")) {
        live = { state, label: cmM.statusText || "", minute: state === "live" ? (liveMinuteLabel([(cmMin.find((e) => teamScore(e.home, p.home) + teamScore(e.away, p.away) >= 4) || {}).text, cmM.sub]) || "EN JUEGO") : "", score: cmM.score };
      }
    }
    // football-data a veces se queda con el partido "en juego" mucho después de acabar:
    // si Comuniate ya lo da por finalizado, manda Comuniate; y si han pasado más de 3 h
    // del saque inicial, un "en juego" no es creíble.
    if (live && live.state === "live") {
      const cmState = cmM ? cmLiveState(cmM.statusCls) : "";
      if (cmState !== "final" && live.label !== "Descanso") {
        const lm = cmMin.find((e) => teamScore(e.home, p.home) + teamScore(e.away, p.away) >= 4);
        const lab = lm ? liveMinuteLabel([lm.text]) : "";
        if (lab) live.minute = lab;
      }
      if (cmState === "final" && cmM.score) live = { state: "final", label: "FINALIZADO", minute: "", score: cmM.score };
      else {
        const ko = new Date(p.m && p.m.utcDate).getTime();
        if (ko && Date.now() - ko > 3 * 3600 * 1000) live = null;
      }
    }
    try {
      const fmM = fmList.find((x) => teamScore(x.home.longName || x.home.name, p.home) + teamScore(x.away.longName || x.away.name, p.away) >= 4);
      const fs = fmM && fmM.status;
      if (fs && fs.started && /^\d+\s*-\s*\d+$/.test(String(fs.scoreStr || "").trim())) {
        const sc = String(fs.scoreStr).replace(/\s*-\s*/, " - ");
        if (fs.finished) { if (!live || live.state !== "final") live = { state: "final", label: "FINALIZADO", minute: "", score: sc }; else live.score = sc; }
        else if (!(live && live.state === "final")) {
          const htRe = /^(HT|half|desc)/i; const ht = !!((fs.reason && (htRe.test(String(fs.reason.short || "")) || htRe.test(String(fs.reason.long || "")))) || (fs.liveTime && (htRe.test(String(fs.liveTime.short || "")) || htRe.test(String(fs.liveTime.long || "")))));
          const mn = String((fs.liveTime && (fs.liveTime.short || fs.liveTime.long)) || "").replace(/\s+/g, "");
          live = { state: "live", label: ht ? "Descanso" : "EN JUEGO", minute: ht ? "Descanso" : (mn && /\d/.test(mn) ? mn : "EN JUEGO"), score: sc };
        }
      }
    } catch (e) {}
    const confirmed = !!(cmE && cmE.confirmed) || cfList.some((c) => teamScore(c.home.name, p.home) + teamScore(c.away.name, p.away) >= 4);

    // Partido aplazado: su once no está en las listas de la jornada actual, así que se lee del feed de últimas actualizaciones
    // (solo de hoy o el día anterior al partido, para no arrastrar onces de otros partidos del mismo equipo).
    let apConf = false, apProb = "";
    if (p.m && p.m._aplaz && cambiosCache) {
      const ko = new Date(p.m.utcDate);
      const kd = Number(dayF.format(ko)), kd0 = Number(dayF.format(new Date(ko.getTime() - 24 * 3600 * 1000)));
      const sn = (x) => stripAccents(String(x || "").toLowerCase()).replace(/\b(cf|fc|ud|rcd|rc|sad|sd|club|de|la|el)\b/g, "").replace(/\s+/g, " ").trim();
      const hh = sn(p.home), aa = sn(p.away);
      for (const d of cambiosCache.days || []) {
        const dn = Number((String(d.day).match(/(\d{1,2})\s*$/) || [])[1]);
        if (dn !== kd && dn !== kd0) continue;
        for (const it of d.items) {
          if (it.cat !== "once-ok" && it.cat !== "once") continue;
          const t = sn(it.title);
          if (!((hh && t.includes(hh)) || (aa && t.includes(aa)))) continue;
          if (it.cat === "once-ok") apConf = true;
          else if (!apProb) apProb = it.time || "1";
        }
      }
    }
    return { home: p.home, away: p.away, homeCrest: p.homeCrest, awayCrest: p.awayCrest, day: p.day, date: p.date, time: p.tbc ? "" : p.time, tbc: !!p.tbc, tv, live, confirmed: confirmed || apConf, probable: apProb, aplazado: (p.m && p.m._aplaz) || 0 };
  });
  if (accumChanged) { try { await env.PORRA.put(accumKey, JSON.stringify(accum), { expirationTtl: 10 * 24 * 3600 }); } catch (e) {} }
  return { matchday: jd.matchday || 0, matches };
}

// Foto del estadio de cada club para la cabecera de su página: foto ancha del campo (Wikimedia Commons),
// elegida a mano de entre las de cada estadio. La URL real de la imagen se pide a Commons y se guarda 30 días.
const ESTADIOS = {
  dep: ["Estadio Riazor 2.jpg", "Riazor"], ala: ["Mendizorrotza.jpg", "Mendizorroza"], osa: ["Inside Estadio Reyno de Navarra.JPG", "El Sadar"],
  cel: ["Vigo-Estadio de Balaídos (6788320478).jpg", "Balaídos"], get: ["Panorámica Coliseum Alfonso Perez.jpg", "Coliseum"],
  fcb: ["Interactive 360º Panorama - Barcelona Camp Nou.jpg", "Camp Nou"], rso: ["Anoeta estadioa 03, Donostia, Gipuzkoa, Euskal Herria.jpg", "Anoeta"],
  val: ["Mestallapanoramic4.jpg", "Mestalla"], sev: ["Seville Ramón Sánchez Pizjuán Stadium 4.jpg", "Sánchez-Pizjuán"], mal: ["Estadio La Rosaleda.jpg", "La Rosaleda"],
  bet: ["Estadio Benito Villamarín 9.jpg", "Benito Villamarín"], ray: ["Estadio de Vallecas.jpg", "Vallecas"],
  rac: ["Fotografía Eduardo Bermúdez para los Campos de Sport de El Sardinero.jpg", "El Sardinero"], ath: ["Panorama im San Mamés Stadion.jpg", "San Mamés"],
  elc: ["Panorámica España - Croacia.jpg", "Martínez Valero"], esp: ["Estadicornellaelprat 3.jpg", "RCDE Stadium"],
  rma: ["Santiago Bernabéu Stadium view Sideview 4, Madrid in 2019.jpg", "Santiago Bernabéu"], lev: ["Het stadion van Levante, vanaf de noordtribune.JPG", "Ciutat de València"],
  atm: ["Wanda Metropolitano inside.jpg", "Metropolitano"], vil: ["Villarreal CF - UD Almería (2012-13).JPG", "La Cerámica"],
};
async function getEstadios(env) {
  const key = "estadios:v2";
  const c = await env.PORRA.get(key, "json");
  if (c && c.at && Date.now() - c.at < 30 * 24 * 3600 * 1000 && c.data && Object.keys(c.data).length >= 15) return c.data;
  const out = {};
  try {
    const entries = Object.entries(ESTADIOS);
    const r = await fetch("https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=1280&format=json&titles=" + encodeURIComponent(entries.map((e) => "File:" + e[1][0]).join("|")), { headers: { "user-agent": "edumr.es (estadios)" } });
    const j = await r.json();
    const pages = Object.values((j.query && j.query.pages) || {});
    const norm = {}; ((j.query && j.query.normalized) || []).forEach((x) => { norm[x.from] = x.to; });
    entries.forEach(([code, [file, name]]) => {
      const t = "File:" + file;
      const pg = pages.find((x) => x.title === (norm[t] || t));
      const ii = pg && pg.imageinfo && pg.imageinfo[0];
      if (ii && (ii.thumburl || ii.url)) out[code] = { name, img: ii.thumburl || ii.url };
    });
  } catch (e) {}
  if (Object.keys(out).length < 12) return (c && c.data) || out;
  await env.PORRA.put(key, JSON.stringify({ at: Date.now(), data: out }), { expirationTtl: 45 * 24 * 3600 });
  return out;
}

// Partidos aplazados: de una jornada ANTERIOR a la actual que aún no se han jugado o se juegan/han jugado hace poco
// (p. ej. Levante–Athletic de la J6). Todo sale de football-data; nada se inventa.
async function getAplazados(env) {
  const kv = env.PORRA, key = "aplaz:v4";
  const c = (await edgeGet(key)) || (await kv.get(key, "json"));
  if (c && c.at && Date.now() - c.at < 5 * 60 * 1000) return c.data;
  let data = null;
  try {
    const token = env.FOOTBALL_API_KEY;
    if (!token) throw new Error("sin token");
    const res = await fetch(`https://api.football-data.org/v4/competitions/${COMPETITION}/matches`, { headers: { "X-Auth-Token": token } });
    if (!res.ok) throw new Error("matches " + res.status);
    const all = (await res.json()).matches || [];
    let cur = 0;
    try { cur = Number((await getJornada(env, null)).matchday) || 0; } catch (e) {}
    // fecha "normal" de cada jornada = mediana de sus partidos
    const byMd = {};
    all.forEach((m) => { (byMd[m.matchday] = byMd[m.matchday] || []).push(Date.parse(m.utcDate) || 0); });
    const med = {};
    Object.keys(byMd).forEach((k) => { const a = byMd[k].sort((x, y) => x - y); med[k] = a[Math.floor(a.length / 2)]; });
    const now = Date.now(), DAY = 24 * 3600 * 1000;
    const wdF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short" });
    const dtF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
    const tF = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false });
    const items = [];
    all.forEach((m) => {
      if (!cur || m.matchday >= cur) return;
      const t = Date.parse(m.utcDate) || 0;
      const open = ["POSTPONED", "SUSPENDED", "CANCELLED", "SCHEDULED", "TIMED", "IN_PLAY", "PAUSED"].indexOf(m.status) >= 0;
      const movedAndRecent = m.status === "FINISHED" && t >= now - 40 * 3600 * 1000 && t > (med[m.matchday] || 0) + 2 * DAY;
      if (!open && !movedAndRecent) return;
      const d = new Date(t);
      const w = wdF.format(d).replace(".", "");
      const tbc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
      const ft = (m.score && m.score.fullTime) || {};
      const nm = (x) => (x && (x.shortName || x.name)) || "";
      items.push({
        matchday: m.matchday, status: m.status, utcDate: m.utcDate,
        home: nm(m.homeTeam) === "Santander" ? "Racing de Santander" : nm(m.homeTeam), away: nm(m.awayTeam) === "Santander" ? "Racing de Santander" : nm(m.awayTeam),
        homeCrest: (m.homeTeam && m.homeTeam.crest) || "", awayCrest: (m.awayTeam && m.awayTeam.crest) || "",
        day: w.charAt(0).toUpperCase() + w.slice(1), date: dtF.format(d), time: tbc ? "" : tF.format(d), tbc,
        score: ["IN_PLAY", "PAUSED", "FINISHED"].indexOf(m.status) >= 0 && ft.home != null && ft.away != null ? ft.home + " - " + ft.away : "",
        // fecha de juego aún no fijada: football-data deja la original en un partido aplazado
        undated: m.status === "POSTPONED" || m.status === "SUSPENDED" || m.status === "CANCELLED",
      });
    });
    items.sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate));
    data = { current: cur, items };
  } catch (e) {
    return c && c.data ? c.data : { current: 0, items: [], error: String(e) };
  }
  // Solo se guarda "de por vida" si cambió algo o pasó 1 hora; el resto del tiempo basta la caché del edge (5 min)
  const recA = JSON.stringify({ at: Date.now(), data });
  await edgePut(key, { at: Date.now(), data }, 300);
  let sameA = false;
  try { sameA = !!(c && c.data && JSON.stringify(c.data) === JSON.stringify(data) && Date.now() - (c.kvAt || c.at || 0) < 3600 * 1000); } catch (e) {}
  if (!sameA) { try { await kv.put(key, JSON.stringify({ at: Date.now(), kvAt: Date.now(), data }), { expirationTtl: 3 * 24 * 3600 }); } catch (e) {} }
  return data;
}

function pujaStep(base) {
  return Number(base) >= 10000000 ? 500000 : 100000;
}

function roleShort(r) {
  const s = String(r || "").toLowerCase();
  return s === "portero" ? "POR" : s === "defensa" ? "DEF" : s === "centrocampista" ? "CEN" : s === "delantero" ? "DEL" : "";
}
function statusLabelEs(s) {
  const x = String(s || "");
  if (!x) return "OK";
  if (x === "redcard") return "SANCIÓN";
  if (x.indexOf("injured") === 0) return "LESIÓN";
  if (x === "doubt") return "DUDA";
  return "OK";
}
function probTitular(p) {
  if (!p) return null;
  if (p.status === "redcard") return 0;
  if (String(p.status || "").indexOf("injured") === 0) return 5;
  if (p.status === "doubt") return 50;
  const f = p.fitness || [];
  const played = f.filter((x) => Number(x) !== 0).length;
  const avg = f.length ? f.reduce((s, x) => s + (Number(x) || 0), 0) / f.length : 0;
  let base = 55 + (avg - 3) * 6;
  if (played <= 1) base -= 25;
  return Math.max(15, Math.min(95, Math.round(base)));
}

function pronosticoFor(p) {
  if (!p) return "";
  if (p.status === "redcard") return "Sancionado 🟥";
  if (String(p.status || "").indexOf("injured") === 0) return "Lesionado ❌";
  if (p.status === "doubt") return "Duda 🟠";
  const fit = p.fitness || [];
  const avg = fit.length ? fit.reduce((a, b) => a + (Number(b) || 0), 0) / fit.length : 0;
  if (avg >= 5) return "Titular probable 🔥";
  if (avg >= 3) return "Probable ✅";
  return "Suplente 🤔";
}

function normKey(s) { return stripAccents(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function teamKey(s) {
  // "rc" (p.ej. "RC Deportivo") se añade a la lista de relleno junto con
  // "rcd" (Espanyol): sin ella, "RC Deportivo" no empareja con el nombre
  // que usa la fuente del calendario y ese equipo se queda sin la fecha de
  // su próximo partido aunque sí tenga rival/casa-fuera (ver getFFTeam,
  // mismo tipo de fallo con el mismo equipo).
  return stripAccents(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && ["de", "del", "la", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie"].indexOf(w) < 0).join("");
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = [];
  for (let i = 0; i <= m; i++) { d.push(new Array(n + 1).fill(0)); d[i][0] = i; }
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function bestPlayer(query, players) {
  const q = normKey(query);
  if (!q || !players || !players.length) return null;
  let p = players.find((x) => normKey(x.name) === q);
  if (p) return p;
  p = players.find((x) => { const n = normKey(x.name); return q.length >= 6 && n.includes(q); });
  if (p) return p;
  const qT = q.split(" ").filter((t) => t.length >= 4);
  if (qT.length === 1) {
    const qt = qT[0];
    let cands = players.filter((pl) => normKey(pl.name).split(" ").some((nt) => nt.length >= 4 && lev(qt, nt) <= 1));
    if (cands.length !== 1) {
      const pref = players.filter((pl) => normKey(pl.name).split(" ").some((nt) => nt.length >= 4 && (nt.startsWith(qt) || qt.startsWith(nt))));
      if (pref.length === 1) cands = pref;
    }
    return cands.length === 1 ? cands[0] : null;
  }
  let best = null, bestScore = 0, ties = 0;
  for (const pl of players) {
    const nT = normKey(pl.name).split(" ");
    let score = 0;
    for (const qt of qT) for (const nt of nT) {
      if (nt === qt) score += 3;
      else if (nt.length >= 4 && (nt.startsWith(qt) || qt.startsWith(nt))) score += 2;
      else if (lev(qt, nt) <= 1) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = pl; ties = 1; }
    else if (score === bestScore && score > 0) ties++;
  }
  return bestScore >= 3 && ties === 1 ? best : null;
}

async function nextMatches(env) {
  const token = env.FOOTBALL_API_KEY;
  const res = await fetch(`https://api.football-data.org/v4/competitions/${COMPETITION}/matches`, { headers: { "X-Auth-Token": token } });
  const d = await res.json();
  const now = Date.now();
  const map = {};
  const rows = (d.matches || []).filter((m) => new Date(m.utcDate).getTime() >= now).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  for (const m of rows) {
    const h = m.homeTeam && m.homeTeam.name;
    const a = m.awayTeam && m.awayTeam.name;
    if (h && !map[h]) map[h] = { home: true, rival: a || "", date: m.utcDate };
    if (a && !map[a]) map[a] = { home: false, rival: h || "", date: m.utcDate };
  }
  return map;
}

async function dsChat(env, messages, model, think) {
  const key = await env.PORRA.get("cfg:deepseek");
  if (!key) return "";
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify({ model: model || "deepseek-flash", messages, thinking: { type: think ? "enabled" : "disabled" } }),
  });
  const d = await res.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
}

function matchFFPlayer(nombre, roster, minScore) {
  const nk = normKey(String(nombre || "").toLowerCase());
  if (!nk || !roster || !roster.length) return null;
  const words = nk.split(" ").filter(Boolean);
  const last = words[words.length - 1];
  const hint = words.length > 1 && words[0].length === 1 ? words[0] : "";
  let best = null, bestScore = 0;
  roster.forEach((r) => {
    // Comparamos contra el nombre CORTO mostrado en la ficha (r.name,
    // p.ej. "Vinícius") Y el nombre completo (r.full). Antes solo se
    // miraba r.full y se puntuaba por la ÚLTIMA palabra (el apellido);
    // eso fallaba con jugadores que se conocen por un solo nombre
    // (Vinícius, Amatucci…) porque su "apellido" real en el nombre
    // completo no es la palabra con la que juega el usuario, así que
    // nunca llegaban al umbral y se quedaban con la foto antigua.
    const candidates = [normKey(String(r.name || "").toLowerCase()), normKey(String(r.full || "").toLowerCase())].filter(Boolean);
    let s = 0;
    candidates.forEach((rk) => {
      if (!rk) return;
      const rw = rk.split(" ").filter(Boolean);
      const rlast = rw[rw.length - 1];
      let sc = 0;
      if (rk === nk) sc = 100;
      else {
        if (rlast && rlast === last) sc += 50;
        if (hint && rw[0] && rw[0][0] === hint) sc += 10;
        if (rk.indexOf(nk) >= 0 || nk.indexOf(rk) >= 0) sc += 30;
        if (words.some((w) => w.length >= 4 && rw.indexOf(w) >= 0)) sc += 30;
      }
      if (sc > s) s = sc;
    });
    if (s > bestScore) { bestScore = s; best = r; }
  });
  return bestScore >= (minScore || 50) ? best : null;
}

// Forma en lenguaje claro: los 5 últimos partidos (el más reciente al final); un 0 en la serie = no jugó / no puntuó.
function formaTxt(p) {
  const f = (p.fitness || []).map(Number);
  if (!f.length) return "sin datos de sus últimos partidos";
  const played = f.filter((x) => x !== 0);
  const avg = played.length ? (played.reduce((a, b) => a + b, 0) / played.length).toFixed(1) : null;
  const ser = f.map((x) => (x === 0 ? "sin jugar" : String(x))).join(", ");
  const last = f[f.length - 1];
  return `puntos en sus últimos ${f.length} partidos, del más antiguo al más reciente: ${ser}; jugó ${played.length} de ${f.length}; último partido: ${last === 0 ? "no jugó" : last}; media de los que jugó: ${avg != null ? avg.replace(".", ",") : "sin datos"}`;
}

// Clasificación y goles a favor/en contra (local y visitante) calculados con los resultados REALES
// terminados de football-data. Sirve para estimar la dificultad del rival (es una estimación nuestra).
async function getTableStats(env) {
  const ck = "tablestats:v2";
  try { const c = await env.PORRA.get(ck, "json"); if (c && c.at && Date.now() - c.at < 30 * 60000 && c.teams) return c.teams; } catch (e) {}
  try {
    const res = await fetch(`https://api.football-data.org/v4/competitions/${COMPETITION}/matches?status=FINISHED`, { headers: { "X-Auth-Token": env.FOOTBALL_API_KEY } });
    const d = await res.json();
    const T = {};
    const get = (n) => (T[n] = T[n] || { name: n, w: 0, d: 0, l: 0, pj: 0, pts: 0, gf: 0, ga: 0, hpj: 0, hgf: 0, hga: 0, apj: 0, agf: 0, aga: 0 });
    (d.matches || []).forEach((m) => {
      const ft = m.score && m.score.fullTime;
      if (!ft || ft.home == null || ft.away == null || !m.homeTeam || !m.awayTeam) return;
      const h = get(m.homeTeam.name), a = get(m.awayTeam.name);
      h.pj++; a.pj++; h.gf += ft.home; h.ga += ft.away; a.gf += ft.away; a.ga += ft.home;
      h.hpj++; h.hgf += ft.home; h.hga += ft.away; a.apj++; a.agf += ft.away; a.aga += ft.home;
      if (ft.home > ft.away) { h.pts += 3; h.w++; a.l++; } else if (ft.home < ft.away) { a.pts += 3; a.w++; h.l++; } else { h.pts++; a.pts++; h.d++; a.d++; }
    });
    const arr = Object.values(T).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga));
    arr.forEach((t, i) => { t.pos = i + 1; });
    if (!arr.length) { try { const c = await env.PORRA.get(ck, "json"); if (c && c.teams) return c.teams; } catch (e2) {} return null; }
    try { await env.PORRA.put(ck, JSON.stringify({ at: Date.now(), teams: arr }), { expirationTtl: 7 * 24 * 3600 }); } catch (e) {}
    return arr;
  } catch (e) {
    try { const c = await env.PORRA.get(ck, "json"); if (c && c.teams) return c.teams; } catch (e2) {}
    return null;
  }
}

// Busca un equipo en la tabla comparando las palabras de su nombre ("RC Deportivo La Coruña" = "Deportivo A Coruña")
function tableFind(teams, name) {
  const STOP = ["de", "del", "la", "a", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "rc", "balompie", "ca"];
  const tok = (x) => stripAccents(String(x || "").toLowerCase()).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && STOP.indexOf(w) < 0);
  const a = tok(name);
  if (!a.length) return null;
  let best = null, bs = 0;
  (teams || []).forEach((t) => {
    const b = tok(t.name);
    const inter = a.filter((w) => b.indexOf(w) >= 0).length;
    if (!inter) return;
    const sc = inter / (a.length + b.length - inter);
    if (sc > bs) { bs = sc; best = t; }
  });
  return bs >= 0.5 ? best : null;
}

// Clasificación de LaLiga de FotMob (la misma de la página de cada partido); si falla, la calculada con resultados reales
async function getLeagueTable(env) {
  let teams = null;
  const ck = "fmtable:v1";
  try { const c = await env.PORRA.get(ck, "json"); if (c && c.at && Date.now() - c.at < 20 * 60000 && c.teams && c.teams.length) teams = c.teams; } catch (e) {}
  if (!teams) {
    try {
      const tr = await fetch("https://www.fotmob.com/api/data/tltable?leagueId=87", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
      const tj = await tr.json();
      const all = tj[0].data.table.all || [];
      const t2 = all.map((x) => ({ pos: x.idx, id: x.id, name: x.shortName || x.name, pj: x.played, w: x.wins, d: x.draws, l: x.losses, gf: String(x.scoresStr || ""), dg: x.goalConDiff, pts: x.pts, q: x.qualColor || "" }));
      if (t2.length) { teams = t2; try { await env.PORRA.put(ck, JSON.stringify({ at: Date.now(), teams })); } catch (e) {} }
    } catch (e) {}
  }
  if (!teams) { try { const c = await env.PORRA.get(ck, "json"); if (c && c.teams) teams = c.teams; } catch (e) {} }
  if (!teams) {
    const ts = await getTableStats(env);
    teams = (ts || []).map((t) => ({ pos: t.pos, id: null, name: t.name, pj: t.pj, w: t.w, d: t.d, l: t.l, gf: t.gf + "-" + t.ga, dg: t.gf - t.ga, pts: t.pts, q: "" }));
  }
  return teams;
}

// Dificultad estimada del rival para un jugador. Atacantes (CEN/DEL): cuánto encaja el rival;
// defensas/portero: cuánto marca el rival. Se usa el campo en el que jugará el rival (casa/fuera).
function rivalDifficulty(teams, rivalName, pos, playerAtHome) {
  if (!teams || !rivalName) return "";
  const rk = teamKey(rivalName);
  let r = teams.find((t) => teamKey(t.name) === rk) || teams.find((t) => { const k = teamKey(t.name); return k && rk && (k.includes(rk) || rk.includes(k)); });
  if (!r) return "";
  const attack = pos === "CEN" || pos === "DEL";
  const rivalHome = playerAtHome === false; // si el jugador juega fuera, el rival juega en casa
  const venue = playerAtHome == null ? "all" : (rivalHome ? "h" : "a");
  const stat = (t) => {
    const pj = venue === "h" ? t.hpj : venue === "a" ? t.apj : t.pj;
    const gf = venue === "h" ? t.hgf : venue === "a" ? t.agf : t.gf;
    const ga = venue === "h" ? t.hga : venue === "a" ? t.aga : t.ga;
    return { pj, v: pj ? (attack ? ga : gf) / pj : null };
  };
  const mine = stat(r);
  if (mine.v == null) return "";
  const all = teams.map((t) => stat(t).v).filter((x) => x != null);
  // attack: más goles encajados = más fácil → rank 1 = más fácil; defensa/portero: menos goles marcados = más fácil
  const easier = all.filter((x) => (attack ? x > mine.v : x < mine.v)).length + 1;
  const label = easier <= 7 ? "FÁCIL" : easier <= 13 ? "MEDIA" : "DIFÍCIL";
  const f = (x) => x.toFixed(1).replace(".", ",");
  const where = venue === "h" ? "en casa" : venue === "a" ? "fuera" : "en total";
  return `rival ${r.name} (${r.pos}º, ${r.pts} pts): ${attack ? "encaja" : "marca"} ${f(mine.v)} goles/partido ${where} (${mine.pj} PJ${mine.pj < 3 ? ", muestra muy corta" : ""}) → ${label} para ${attack ? "atacantes" : "defensas y porteros"} [estimación, puesto ${easier}/${all.length} en facilidad]`;
}

// Lanzadores de penaltis LaLiga 2026/27 — fuente: Jornada Perfecta, "Guía Fantasy: Los lanzadores de LaLiga 2026/27", actualizada el 06/08/2026 (puede haber cambiado).
const PENALTY_TAKERS = {
  "alaves": ["Boyé", "Toni Martínez"], "athletic": ["Sancet", "Nico Williams"], "atletico": ["Grimaldo", "Julián Álvarez"],
  "barcelona": ["Raphinha", "Yamal"], "betis": ["Cucho", "Isco"], "celta": ["Borja Iglesias", "Marcos Alonso"],
  "deportivo": ["Yeremay", "Luismi Cruz"], "elche": ["Fer Niño", "Cepeda"], "espanyol": ["Roberto Fernández", "Marcos Fernández"],
  "getafe": ["Ünal", "Satriano"], "levante": ["Dela", "Etta Eyong"], "malaga": ["Chupe", "Adrián Niño"],
  "osasuna": ["Budimir", "Aimar"], "racing": ["Sergio Canales", "Andrés Martín"], "rayo": ["Isi", "De Frutos"],
  "real madrid": ["Mbappé", "Vinícius"], "real sociedad": ["Oyarzabal", "Soler"], "sevilla": ["Guridi", "Peque", "Stassin"],
  "valencia": ["Pepelu", "Danjuma"], "villarreal": ["Gerard Moreno", "Pape Gueye"],
};
function penaltyRole(playerName, teamName) {
  const tk = normKey(String(teamName || "").toLowerCase());
  const key = Object.keys(PENALTY_TAKERS).find((k) => tk.indexOf(k) >= 0);
  if (!key) return "";
  const pn = normKey(String(playerName || "").toLowerCase());
  const list = PENALTY_TAKERS[key];
  for (let i = 0; i < list.length; i++) {
    const tn = normKey(list[i].toLowerCase());
    const last = tn.split(" ").pop();
    if (pn === tn || (last.length >= 4 && pn.split(" ").indexOf(last) >= 0 && (tn.indexOf(" ") < 0 || pn.split(" ").indexOf(tn.split(" ")[0]) >= 0))) return i === 0 ? "principal" : "suplente";
  }
  return "";
}

async function handleAnaliza(request, env, user) {
  if (!user) return json({ error: "Inicia sesión para analizar tu equipo." }, 401);
  // Cada llamada puede hacer hasta 2 peticiones a la IA (vision), así que se
  // limita a 1 análisis cada 20s por persona para evitar que alguien lo
  // dispare en bucle y dispare el coste de la API. Se guarda la hora del
  // último intento (no un TTL de KV, que tiene un mínimo de 60s) y se
  // compara, igual que el cooldown de 5s al pujar.
  const COOLDOWN_MS = 20000;
  const cdKey = `cd:analiza:${user.key}`;
  try {
    const last = Number(await env.PORRA.get(cdKey)) || 0;
    const wait = COOLDOWN_MS - (Date.now() - last);
    if (wait > 0) {
      return json({ error: "Espera " + Math.ceil(wait / 1000) + "s antes de analizar de nuevo." }, 429);
    }
    await env.PORRA.put(cdKey, String(Date.now()), { expirationTtl: 60 });
  } catch (e) {}
  // Tope de análisis por día: la cooldown de arriba solo espacia las
  // llamadas, pero no impide que alguien la machaque todo el día y dispare
  // el coste de la IA (cada análisis hace hasta 2 llamadas de visión + 1 de
  // texto). 15/día es de sobra para revisar el equipo varias veces por
  // jornada (titulares, cambios de última hora, repasar tras una lesión…)
  // sin dejar la puerta abierta a un abuso.
  const DAY_LIMIT = 15;
  const dayKey = `cd:analiza:day:${user.key}:${dstrMadrid(0)}`;
  try {
    const used = Number(await env.PORRA.get(dayKey)) || 0;
    if (used >= DAY_LIMIT) {
      return json({ error: `Has llegado al límite de ${DAY_LIMIT} análisis de hoy. Vuelve a probar mañana.` }, 429);
    }
    await env.PORRA.put(dayKey, String(used + 1), { expirationTtl: 86400 });
  } catch (e) {}
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Datos inválidos." }, 400); }
  let team = null, leido = [], capActualRaw = "";
  let market = { players: [] };
  try { market = await getMarketPlayers(env); } catch (e) {}
  const nameList = (market.players || []).map((p) => p.name).filter(Boolean);
  const nameHint = nameList.length ? ("\n\nLista de nombres EXACTOS de los jugadores de la liga. IMPORTANTE: para CADA nombre que leas, elige de esta lista el MÁS PARECIDO y escribe el de la lista TAL CUAL (aunque lo leído no exista, coge el de la lista que más se le parezca; nunca inventes uno que no esté en la lista): " + nameList.join(", ") + ".") : "";
  if (Array.isArray(body.jugadores) && body.jugadores.length) {
    const tit = [], sup = [];
    // j.pos llega aquí como código corto (POR/DEF/CEN/DEL) cuando viene de
    // "Reanalizar" (ya pasó antes por enrich()), o como palabra larga si
    // viniera de otro sitio: aceptamos ambos en vez de asumir solo uno.
    const normPos = (v) => { const s = String(v || "").toUpperCase(); return ["POR", "DEF", "CEN", "DEL"].includes(s) ? s : roleShort(v); };
    for (const j of body.jugadores) {
      const nombre = String(j.nombre || "").trim();
      if (!nombre) continue;
      const o = { nombre, pos: normPos(j.pos) };
      if (j.tipo === "suplente") sup.push(o); else tit.push(o);
    }
    if (!tit.length && !sup.length) return json({ error: "Sin jugadores." }, 400);
    team = { titulares: tit, suplentes: sup };
    leido = [].concat(tit, sup).map((x) => x.nombre);
  } else {
    const img = String(body.img || "");
    if (!/^data:image\//.test(img) || img.length > 7000000) return json({ error: "Sube una captura de tu equipo (JPG/PNG)." }, 400);
    const VP = "Esta imagen es una captura de una ALINEACIÓN de fútbol fantasy (Futmondo). ARRIBA hay barras (jornada, media, logo) y publicidad: IGNÓRALAS. El CAMPO VERDE tiene los jugadores en FILAS:\n" +
      "- La fila MÁS ABAJO (junto a la portería) tiene 1 jugador: el PORTERO.\n" +
      "- Encima hay líneas de jugadores (defensas, centrocampistas, delanteros), normalmente de 3 a 5 por fila.\n" +
      "- Debajo de la foto de cada jugador está su NOMBRE (a veces abreviado, p. ej. 'R.Fernán', 'L. Yamal').\n" +
      "- Debajo del campo hay una zona 'Suplentes' (el banquillo).\n" +
      "Lee TODOS los nombres del campo (deben ser 11 titulares) y del banquillo.\n" +
      "Responde SOLO con JSON válido: {\"formacion\":\"3-4-3\",\"capitan\":\"nombre o vacío\",\"titulares\":[{\"nombre\":\"...\",\"linea\":1}],\"suplentes\":[{\"nombre\":\"...\"}]}.\n" +
      "'capitan': el CAPITÁN actual es el titular que lleva al lado de su foto una insignia/cuadradito con la letra \"C\" (negro o azul). Pon su nombre tal cual se lee; si ninguno la lleva, déjalo vacío. No elijas capitán por tu cuenta.\n" +
      "'linea': 1 = portero (fila de abajo), 2 = defensas, 3 = centrocampistas, 4 = delanteros (fila de arriba).\n" +
      "Cuenta los jugadores por fila para la formación (DEF-CEN-DEL). Copia los nombres TAL CUAL se lean. No inventes, no traduzcas, no repitas.";
    let visionRaw = await dsChat(env, [{
      role: "user",
      content: [
        { type: "text", text: VP + nameHint },
        { type: "image_url", image_url: { url: img } },
      ],
    }], "deepseek-flash", true);
    if (!visionRaw) return json({ error: "IA no configurada." }, 500);
    const parseTeam = (raw) => {
      try {
        const m = String(raw).match(/\{[\s\S]*\}/);
        if (m) { const o = JSON.parse(m[0]); if (o && (o.titulares || o.suplentes)) return o; }
      } catch (e) {}
      return null;
    };
    team = parseTeam(visionRaw);
    const nTit = (t) => (t && (t.titulares || []).length) || 0;
    if (!team || nTit(team) !== 11) {
      const hint = team ? ("En el primer intento leíste " + nTit(team) + " titulares. ") : "";
      const raw2 = await dsChat(env, [{
        role: "user",
        content: [
          { type: "text", text: hint + "Mira la imagen otra vez con MUCHO detalle. En el campo hay EXACTAMENTE 11 jugadores (1 portero abajo + varias líneas). Fíjate en los nombres pequeños bajo cada foto. Ignora barras superiores, publicidad y el banquillo. Responde ÚNICAMENTE con el JSON: {\"formacion\":\"...\",\"titulares\":[{\"nombre\":\"...\",\"linea\":1}],\"suplentes\":[{\"nombre\":\"...\"}]}, sin texto extra." + nameHint },
          { type: "image_url", image_url: { url: img } },
        ],
      }], "deepseek-flash", true);
      const t2 = parseTeam(raw2);
      if (t2 && nTit(t2) >= nTit(team)) team = t2;
    }
    if (!team) return json({ error: "No pude leer el equipo de la captura. Prueba con una captura más nítida (sin recortar).", raw: String(visionRaw).slice(0, 300) }, 422);
    if (nTit(team) !== 11 && nTit(team) < 7) return json({ error: "Solo pude leer " + nTit(team) + " jugadores del campo. Prueba con una captura más nítida y completa (con las 3-4 líneas).", leido: (team.titulares || []).map((x) => x.nombre) }, 422);
    leido = [].concat(team.titulares || [], team.suplentes || []).map((x) => String(x.nombre || x.name || "").trim()).filter(Boolean);
    capActualRaw = String(team.capitan || "").trim();
    const LINE_POS = { 1: "POR", 2: "DEF", 3: "CEN", 4: "DEL" };
    team.titulares = (team.titulares || []).map((x) => ({ nombre: String(x.nombre || x.name || "").trim(), pos: roleShort(x.pos) || LINE_POS[Number(x.linea)] || "" })).filter((x) => x.nombre);
    team.suplentes = (team.suplentes || []).map((x) => ({ nombre: String(x.nombre || x.name || "").trim(), pos: roleShort(x.pos) || "" })).filter((x) => x.nombre);
  }

  const findP = (n) => bestPlayer(n, market.players || []);
  let next = {};
  try { next = await nextMatches(env); } catch (e) {}
  let ffm = {};
  try { ffm = await ffMap(env); } catch (e) {}
  const matchTeam = (t) => {
    const q = teamKey(t);
    if (!q) return null;
    const keys = Object.keys(next);
    let k = keys.find((x) => teamKey(x) === q) || keys.find((x) => { const kk = teamKey(x); return kk && (kk.includes(q) || q.includes(kk)); });
    if (!k) {
      // Última red: si el nombre del equipo no coincide ni exacto ni por
      // subcadena (p. ej. abreviaturas distintas entre Futmondo y la fuente
      // del calendario), probamos por similitud de texto. Sin esto, algún
      // equipo se quedaba sin fecha/hora de su próximo partido aunque sí
      // tuviera rival y casa/fuera (esos datos vienen de otra fuente).
      let best = null, bestScore = 0;
      keys.forEach((x) => {
        const kk = teamKey(x);
        if (!kk) return;
        const score = 1 - lev(q, kk) / Math.max(q.length, kk.length);
        if (score > bestScore) { bestScore = score; best = x; }
      });
      if (best && bestScore >= 0.6) k = best;
    }
    return k ? next[k] : null;
  };
  // pl.pos ya viene normalizado a código corto (POR/DEF/CEN/DEL) desde la
  // fila detectada en la imagen o desde el formulario manual (ver arriba),
  // así que NO hay que volver a pasarlo por roleShort (que espera la
  // palabra larga en español y con un código corto siempre devuelve "").
  // Antes se hacía roleShort(pl.pos) aquí, que daba "" siempre y acababa
  // usando la posición NATURAL del jugador en el mercado — por eso un
  // multiposición colocado en el campo como centrocampista (ej. Vinícius)
  // se mostraba como delantero, ignorando dónde lo había puesto el usuario.
  const VALID_POS = ["POR", "DEF", "CEN", "DEL"];
  const enrich = (list) => (list || []).map((pl) => {
    const nm = String(pl.nombre || pl.name || "").trim();
    const p = findP(nm);
    const mt = p ? matchTeam(p.team) : null;
    const ffe = ffPick(nm, ffm);
    const probFf = ffe && ffe.prob != null ? ffe.prob : null;
    return {
      nombre: nm,
      id: p ? p.id : "",
      pos: (VALID_POS.includes(pl.pos) ? pl.pos : "") || (p ? roleShort(p.role) : ""),
      pos2: p ? roleShort(p.role2) : "",
      equipo: p ? p.team : "",
      estado: p ? statusLabelEs(p.status) : "?",
      pronostico: p ? pronosticoFor(p) : "",
      prob: probFf != null ? probFf : (p ? probTitular(p) : null),
      probFf,
      puntos: p ? p.points : null,
      valor: p ? p.value : null,
      fitness: p ? (p.fitness || []) : [],
      photo: p ? p.photo : "",
      logo: p ? (p.logo || "") : "",
      // Rival, casa/fuera y fecha del MISMO partido (el calendario): mezclar el rival de
      // FutbolFantasy con la fecha del calendario daba rival de una jornada y hora de otra.
      rival: mt ? mt.rival : ((ffe && ffe.rival) ? ffe.rival : ""),
      casa: mt ? mt.home : ((ffe && ffe.casa != null) ? ffe.casa : null),
      fecha: mt ? mt.date : "",
    };
  });
  const titulares = enrich(team.titulares);
  const suplentes = enrich(team.suplentes);
  [].concat(titulares, suplentes).forEach((p) => { p.penal = penaltyRole(p.nombre, p.equipo); });
  let tableTeams = null;
  try { tableTeams = await getTableStats(env); } catch (e) {}
  [].concat(titulares, suplentes).forEach((p) => { p.dificultad = rivalDifficulty(tableTeams, p.rival, p.pos, p.casa); });
  let leagueT = null;
  try { leagueT = await getLeagueTable(env); } catch (e) {}
  [].concat(titulares, suplentes).forEach((p) => {
    if (!leagueT || !leagueT.length || !p.rival) return;
    const r = tableFind(leagueT, p.rival);
    if (r) { p.rivalPos = r.pos; p.rivalPts = r.pts; p.rivalPj = r.pj; p.rivalN = leagueT.length; }
  });

  // Las fotos del mercado de Futmondo son una cara de carné pequeña; para que
  // el campo de "Analiza tu equipo" se vea igual que "Alineaciones probables"
  // (recorte de cuerpo entero de futbolfantasy.com) buscamos la foto de cada
  // jugador en el roster de su equipo (misma fuente y caché que Alineaciones).
  try {
    const equipos = [...new Set([].concat(titulares, suplentes).map((p) => p.equipo).filter(Boolean))];
    const rosterByTeam = {};
    await Promise.all(equipos.map(async (t) => {
      try { const d = await getFFTeam(env, t); rosterByTeam[t] = [].concat(d.starters || [], d.bench || []); } catch (e) { rosterByTeam[t] = []; }
    }));
    // El nombre corto que se muestra bajo la foto en el campo se calcula
    // SIEMPRE a partir de "nombre" (el que ha leído la IA o ha escrito el
    // usuario), nunca del "last" que trae el scraping de futbolfantasy.com:
    // ese "last" es la ÚLTIMA PALABRA DEL NOMBRE LEGAL COMPLETO, que para
    // jugadores conocidos por un solo nombre da un resultado confuso (p.ej.
    // a Vinícius, cuyo nombre legal termina en "Júnior", se le etiquetaba
    // como "JUNIOR" en vez de "VINÍCIUS", aunque la foto sí fuera la suya).
    const shortName = (nm) => { const w = String(nm || "").trim().split(/\s+/).filter(Boolean); return w.length > 1 ? w[w.length - 1] : (w[0] || ""); };
    const allRoster = Object.values(rosterByTeam).flat();
    [].concat(titulares, suplentes).forEach((p) => {
      let m = matchFFPlayer(p.nombre, rosterByTeam[p.equipo] || []);
      // Red de seguridad: si no aparece en el roster de SU equipo (según
      // Futmondo), puede que futbolfantasy.com lo tenga adscrito a otro
      // equipo (cesión/traspaso reciente que una fuente refleja y la otra
      // no). Probamos en el resto de equipos ya descargados, pero exigiendo
      // una coincidencia casi exacta (90) para no acabar poniendo la foto
      // de otro jugador distinto con nombre parecido en otro equipo.
      if (!m) m = matchFFPlayer(p.nombre, allRoster, 90);
      if (m && m.photo) p.photo = m.photo;
      // Misma fuente que "Alineaciones probables" (FutbolFantasy, por equipo):
      // así el % y los sancionados/lesionados coinciden con esa pestaña.
      if (m) { if (m.prob != null) { p.prob = m.prob; p.probFf = m.prob; } p.san = !!m.san; p.inj = !!m.inj; }
      p.last = shortName(p.nombre);
    });
  } catch (e) {}
  try {
    const fh = await futbolHeader(env);
    const allp = [].concat(titulares, suplentes);
    await Promise.all(allp.map(async (t) => {
      const pp = findP(t.nombre);
      if (!pp || !pp.id) return;
      try {
        const s = await futbolPost("/1/player/summary", fh, { playerId: pp.id, championshipId: FUTMONDO_CHAMPIONSHIP });
        const cl = s.answer && s.answer.championship && s.answer.championship.clause;
        if (cl && cl.price) { t.clause = Number(cl.price) || 0; t.clauseDate = cl.date || ""; }
      } catch (e) {}
    }));
  } catch (e) {}
  const cnt = (pos) => titulares.filter((p) => p.pos === pos).length;
  const formacion = (cnt("DEF") + cnt("CEN") + cnt("DEL")) ? [cnt("DEF"), cnt("CEN"), cnt("DEL")].join("-") : (team.formacion || "");
  // Antes se le pedía a la IA que "detectara" ella misma quién tenía doble
  // posición, y en la práctica se le olvidaban jugadores (p.ej. avisaba de
  // Lemar pero no de Vinícius o Amatucci, que también tenían pos2). Para no
  // depender de que la IA se acuerde de mirar a los 15-18 jugadores, aquí
  // calculamos la lista EXACTA de multiposición con datos reales y se le
  // pasa cerrada: "estos N y solo estos N".
  const multiList = [].concat(titulares, suplentes).filter((p) => p.pos2 && p.pos2 !== p.pos);
  const multiHint = multiList.length
    ? "Tiene doble posición EXACTAMENTE esta lista de " + multiList.length + " jugador(es), ni uno más ni uno menos: " + multiList.map((p) => p.nombre + " (" + p.pos + "/" + p.pos2 + ")").join(", ") + ". Escribe una línea por CADA UNO de ellos explicando en cuál de sus DOS posiciones conviene más alinearlo para sacarle más puntos (por su rol en el campo, su forma y su rival), NUNCA uses como motivo la probabilidad de ser titular ni si va a jugar o no (eso ya se decide aparte, aquí solo importa EN QUÉ POSICIÓN rinde mejor si juega). Formato \"Nombre: en X porque...\"."
    : "Ninguno de tus jugadores tiene doble posición esta jornada.";
  const kick = (v) => { if (!v) return "?"; try { return new Date(v).toLocaleString("es-ES", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }); } catch (e) { return "?"; } };
  const line = (p) => `- ${p.pos}${p.pos2 ? "/" + p.pos2 : ""} ${p.nombre} (${p.equipo || "?"}) · ${p.estado} · prob.jugar ${p.prob != null ? p.prob : "?"}%${p.probFf != null ? " (FutbolFantasy)" : ""} · ${p.puntos != null ? p.puntos + " pts esta temporada" : "sin datos de puntos"} · ${formaTxt(p)} · rival ${p.rival || "desconocido"} ${p.casa === true ? "(CASA)" : p.casa === false ? "(FUERA)" : ""} · juega ${kick(p.fecha)}${p.penal ? " · lanza penaltis (" + p.penal + ")" : ""} · dificultad ${p.dificultad || "sin dato"}`;
  const ctx = "FORMACIÓN: " + formacion + "\nTITULARES:\n" + titulares.map(line).join("\n") + "\nBANQUILLO:\n" + suplentes.map(line).join("\n");
  // Nota: el "plan de cambios por horario" y la lista de recambio de cada
  // titular YA se calculan aparte con datos reales (fechas de partido y
  // banquillo), así que aquí NO se le pide a la IA que invente cambios o
  // avisos de horario (antes lo hacía y a veces se contradecía con la
  // regla real, p.ej. recomendando meter de inicio a alguien que juega el
  // último día, dejando sin margen de reacción). Solo se le pide el once
  // ideal (con el número real de líneas, no uno fijo) y multiposición.
  const LIGA_CONTEXTO = "CONTEXTO REAL DE LA LIGA (ajustes de la liga del usuario, \"Con Permisoo\"): Futmondo Social, puntuación CONFIGURABLE: Diario AS 50%, Marca 50%, SofaScore 50%, Tiempo de juego 0%, estadísticas básicas. Capitán permitido (doble puntos), multiposición, estrategias extra, entrenador manual, se puede cambiar un jugador ya puntuado. Primas: 70.000€ por punto, 1.000.000€ por jugador en el equipo ideal, 2.000.000€ por MVP de la jornada.\n" +
    "CÓMO PUNTÚA (fuente: ayuda oficial de Futmondo, modo Configurable; comprobado con 4 jugadores reales de esa liga). Los puntos de cada medio se multiplican por su % y se suman: con 50%, cada medio aporta la MITAD de los puntos de su tabla. AS y Marca: 4 picas/estrellas = 14 pts, 3 = 10, 2 = 6, 1 = 2, guion = -2, sin calificar = 0. SofaScore (nota 0-10): 10 = 15 pts, 9,7-9,9 = 14, ... 6 = 0, 5,6-5,9 = -1, 5-5,5 = -2, 3,1-4,9 = -3, 0-3 = -4 (no se conocen las notas intermedias: no las inventes). ESTADÍSTICAS BÁSICAS: jugar 60 min o más +1; asistencia +1; gol de penalti +2; gol: portero +8, defensa +6, centrocampista +4, delantero +3 (por eso un delantero multiposición que juegue de centrocampista gana +1 por gol); portería a cero (45+ min) +1 SOLO portero y defensa; por cada 2 goles encajados -1 SOLO portero y defensa; gol en propia puerta -1; penalti fallado -2; doble amarilla -3; roja directa -5; parar un penalti (portero) +3. La amarilla simple no resta puntos en esa tabla.\n" +
    "QUÉ RESTA EN SOFASCORE (guías de Jornada Perfecta y Comuniate; orientativo, no son cifras de tu liga): tarjetas, pérdidas de balón, duelos y regates perdidos, faltas cometidas, ocasiones claras falladas, errores que provocan gol o disparo, penaltis cometidos o fallados, goles en propia, expulsiones (restan más cuanto antes); en portero y defensa los goles encajados (si el equipo encaja 3 o más el portero puede salir muy bajo); en centrocampistas las pérdidas y pases fallidos. Suma: goles, asistencias, pases clave, ocasiones creadas, tiros a puerta, duelos ganados, regates, y en defensa despejes, entradas e intercepciones.";
  const REGLAS_IA = "REGLAS ESTRICTAS: usa SOLO los datos de arriba. NO inventes cifras, estadísticas de SofaScore ni penaltis. La \"dificultad\" del rival que acompaña a cada jugador es una ESTIMACIÓN calculada con la clasificación y los goles reales (dilo así y menciona la muestra corta si la hay); lo que no se te ha dado, así que si hace falta algo así di \"sin dato\". Puedes razonar con lo que sí tienes (forma = puntos de sus últimos partidos, probabilidad de jugar, casa/fuera, estado, hora del partido) y con el contexto de la liga, pero explícalo con esos datos concretos.";
  const prompt = "Eres un analista experto de fútbol fantasy (Futmondo Social). Analiza la PRÓXIMA jornada del equipo del usuario. Cada jugador trae posición(es), estado, probabilidad de ser titular, sus puntos en los últimos partidos, si juega en CASA/FUERA, rival, dificultad estimada, penaltis y la FECHA/HORA de su partido.\n\n" + LIGA_CONTEXTO + "\n\n" + ctx + "\n\n" + REGLAS_IA + " Escribe SIEMPRE en español claro, sin abreviaturas ni jerga (nada de \"últ5\" ni \"pts esp\"): habla de \"sus últimos 5 partidos\", \"no jugó\", \"media\". Un 0 en la serie significa que no jugó. IMPORTANTE: toda cifra va con su unidad y su significado, NUNCA una cifra suelta: escribe \"hizo 11 puntos en su último partido\", \"media de 9,3 puntos por partido en los que jugó\", \"tiene un 70% de probabilidad de jugar\", \"vale 4 puntos por gol como centrocampista\"; jamás \"Espart: 11\" ni \"9 en su último partido\" ni \"vale 4\". Si un jugador puntúa bien pero es irregular (se pierde partidos), dilo siempre: es información importante. NO decidas quién entra o sale del once ni digas \"ponlo en el banquillo\": eso lo calcula la web aparte; tú solo describes la situación de cada jugador con datos. Si el jugador juega pronto en la jornada y le conviene a quien vigila los cambios, dilo.\n\nResponde en español, BREVE, con emojis y **negrita** (prohibido #, tablas o listas con guiones). Usa EXACTAMENTE este título, en su propia línea, sin nada más en esa línea:\n**CLAVES DE LA JORNADA**\n(UNA sola sección, ULTRA CORTA: 2 o 3 líneas como MÁXIMO, una por jugador, solo los jugadores MÁS interesantes de ESTA jornada (los que más pueden cambiar tu once o tus puntos: una duda importante, una baja o 0% de un titular clave, el que mejor o peor está, o un doble posición que importe). No rellenes con jugadores de poco interés. Formato EXACTO de cada línea: Nombre: 2 o 3 datos muy cortos separados por comas (máximo 14 palabras en total, sin repetir lo que ya se sabe de él), por ejemplo \"tiene un 60% de probabilidad de jugar, media de 9,3 puntos y juega el sábado ante el Elche 🏠\". El día sale de la FECHA/HORA que trae el jugador (\"juega el sábado\"); para casa o fuera usa SOLO el emoji 🏠 o ✈️. Si el jugador tiene doble posición, añade al final y en pocas palabras en cuál conviene alinearlo (\"mejor de centrocampista\"); esa lista de doble posición es: " + multiHint + " Solo cuenta la posición por su rol, su forma y su rival, NUNCA por la probabilidad de ser titular, y con la tabla real de puntos (el gol vale más como centrocampista (4) o defensa (6) que como delantero (3); la portería a cero solo cuenta en defensa y portero). No repitas ideas ni escribas más de una frase por jugador.)";
  const analisis = await dsChat(env, [{ role: "user", content: prompt }], "deepseek-flash");
  // Guarda la recomendación de capitán de ESTA jornada (misma fórmula que
  // usa el frontend para pintar "Capitán recomendado") para poder comparar
  // luego, cuando la jornada haya terminado, cuántos puntos hizo de verdad.
  // No bloquea la respuesta si falla.
  let capInfo = {};
  try {
    const jornadaPred = (market.players || []).reduce((m, p) => Math.max(m, Number(p.matches) || 0), 0) + 1;
    // Misma fórmula que el frontend (capScoreOf en mercado.js): nunca un
    // defensa ni el portero de capitán, prima el pico de forma reciente
    // ("racha") sobre la media y el nivel de puntos de la temporada (techo
    // de puntos), no solo "de media va bien".
    const capScore = (p) => {
      if (String(p.estado || "").toUpperCase().indexOf("LESI") >= 0) return 5;
      const f = p.fitness || [];
      const avg = f.length ? f.reduce((a, b) => a + (Number(b) || 0), 0) / f.length : 0;
      const max = f.length ? Math.max(...f.map((x) => Number(x) || 0)) : 0;
      const racha = avg * 0.5 + max * 0.5;
      const prob = p.prob != null ? p.prob : 60;
      let s = racha * 8.5 + (prob - 50) * 0.4;
      if (p.casa === true) s += 3; else if (p.casa === false) s -= 1.5;
      if (p.pos2) s += 2;
      if (p.puntos != null) s += Math.min(12, p.puntos / 40);
      return Math.max(5, Math.min(99, Math.round(s)));
    };
    // Igual que en el frontend: primero solo candidatos con titularidad
    // prácticamente asegurada (>=85%), y solo si no queda ninguno se mira
    // al resto de CEN/DEL (un capitán que no juega no dobla nada).
    const SAFE_PROB = 85;
    const isSafe = (p) => p.prob != null && p.prob >= SAFE_PROB && String(p.estado || "").toUpperCase().indexOf("LESI") < 0;
    let capList = titulares.filter((p) => (p.pos === "CEN" || p.pos === "DEL") && p.id && isSafe(p)).slice().sort((a, b) => capScore(b) - capScore(a));
    if (!capList.length) capList = titulares.filter((p) => (p.pos === "CEN" || p.pos === "DEL") && p.id).slice().sort((a, b) => capScore(b) - capScore(a));
    if (!capList.length) capList = titulares.filter((p) => p.pos !== "POR" && p.id).slice().sort((a, b) => capScore(b) - capScore(a));
    if (capList.length) {
      const alts = capList.slice(0, 4).map((p) => ({ id: p.id, nombre: p.nombre, pos: p.pos, photo: p.photo }));
      const ent = await saveCapitanPrediction(env, user, jornadaPred, alts);
      capInfo = { capJornada: jornadaPred, capChosen: (ent && ent.chosen) || "" };
    }
  } catch (e) {}
  return json({ formacion, titulares, suplentes, analisis, leido, capActual: capActualRaw, ...capInfo });
}

async function saveCapitanPrediction(env, user, jornada, alts) {
  if (!user || !user.key || !jornada || !alts || !alts.length) return;
  const key = "cap:hist:" + user.key;
  let hist = [];
  try { hist = (await env.PORRA.get(key, "json")) || []; } catch (e) {}
  if (!Array.isArray(hist)) hist = [];
  const idx = hist.findIndex((h) => h.jornada === jornada);
  // Si ya habías analizado esta misma jornada antes (p.ej. tras un cambio
  // de última hora), se sustituye la predicción por la más reciente en vez
  // de guardar las dos — lo que cuenta es a quién le dijimos que pusiera
  // de capitán la ÚLTIMA vez.
  const entry = { jornada, at: Date.now(), alts, resolved: false, results: null };
  // Si ya habías elegido capitán esta jornada y sigue entre las opciones, se respeta tu elección.
  if (idx >= 0 && hist[idx].chosen && alts.some((a) => String(a.id) === String(hist[idx].chosen))) entry.chosen = hist[idx].chosen;
  if (idx >= 0) hist[idx] = entry; else hist.push(entry);
  hist.sort((a, b) => b.jornada - a.jornada);
  hist = hist.slice(0, 25);
  try { await env.PORRA.put(key, JSON.stringify(hist)); } catch (e) {}
  return entry;
}

async function getPlayerJornadaPoints(env, playerId, jornada) {
  if (!playerId) return null;
  // Caché por jugador+jornada: los puntos de un partido terminado ya no
  // cambian (se guardan 30 días); mientras el partido no ha acabado se
  // guardan solo 2 minutos para no machacar la API de Futmondo desde la
  // página de cada partido.
  const ck = "pjp:v5:" + playerId + ":" + (Number(jornada) || 0);
  try {
    const c = await env.PORRA.get(ck, "json");
    if (c && (c.finished || Date.now() - (c.at || 0) < 120000)) return { finished: !!c.finished, points: c.finished ? c.points : null };
  } catch (e) {}
  try {
    const header = await futbolHeader(env);
    const r = await futbolPost("/2/player/matches", header, { playerId, championshipId: FUTMONDO_CHAMPIONSHIP });
    const matches = (r.answer && r.answer.matches) || [];
    const idx = matches.findIndex((x) => Number(x.r) === Number(jornada));
    if (idx < 0) return null;
    const m = matches[idx];
    const out = { finished: m.st === "F", points: null };
    if (out.finished) {
      // Puntos de MI liga Futmondo Social: son los mismos que enseña la
      // ficha (array "fitness" del jugador en el mercado, con el último
      // valor = partido más reciente). Los modos de /2/player/matches
      // (stats, picas...) NO son la puntuación de la liga: p.ej. Lamine
      // J8 tenía stats=9 y en la liga 10.
      let pts = null;
      // Salvaguarda: los datos del mercado pueden ir con retraso respecto al
      // estado "terminado". Solo se dan por buenos si el mercado se refrescó
      // cuando el partido ya podía haber acabado (inicio + 105 min); si va
      // por detrás, se fuerza UN refresco (como mucho cada 30 s) y, si aun
      // así no sirve, se devuelve "aún no" (el cliente sigue preguntando)
      // en vez de un valor viejo que además se guardaría 30 días.
      let mkFresh = false;
      try {
        let mk = await getMarketPlayers(env);
        const ko = Date.parse((m.info && m.info.date) || ""); const minAt = ko > 0 ? ko + 105 * 60000 : 0;
        const okMk = (q) => !!(q && q.at && q.at >= minAt);
        if (!okMk(mk) && Date.now() >= minAt) {
          if (!(globalThis.__mkForceAt && Date.now() - globalThis.__mkForceAt < 30000)) { globalThis.__mkForceAt = Date.now(); globalThis.__mkForceP = getMarketPlayers(env, true).catch(() => null); }
          if (globalThis.__mkForceP) { const m2 = await globalThis.__mkForceP; if (m2 && m2.at) mk = m2; }
        }
        const mp = (mk.players || []).find((x) => String(x.id) === String(playerId));
        const fit = (mp && mp.fitness) || [];
        // Cuántos partidos del equipo tiene ya publicados Futmondo (máximo de "matches" entre
        // sus jugadores) frente a cuántos han terminado hasta esta jornada: solo si ya están
        // publicados es válido el último valor de fitness. Antes se fiaba de la hora del
        // refresco del mercado y daba por buenos valores de la jornada anterior (se guardaban 30 días).
        const pub = (mk.players || []).reduce((mx, x) => (mp && x.team === mp.team ? Math.max(mx, Number(x.matches) || 0) : mx), 0);
        // Fitness va en orden CRONOLÓGICO (fecha de juego), no por número de jornada: hay jornadas aplazadas
        // (p. ej. J6 se jugó el 3/9, antes que J5 el 13/9). Se cuentan los partidos terminados hasta la fecha de este.
        const myT = Date.parse((m.info && m.info.date) || "") || 0;
        const nFinJ = myT ? matches.filter((x) => x.st === "F" && (Date.parse((x.info && x.info.date) || "") || 0) <= myT).length : matches.filter((x) => x.st === "F" && Number(x.r) <= Number(jornada)).length;
        mkFresh = !!mp && pub >= nFinJ && nFinJ > 0;
        if (mkFresh) {
          const k = fit.length - 1 - (pub - nFinJ);
          if (k >= 0 && k < fit.length && fit[k] != null) pts = Math.round(Number(fit[k]) || 0);
        }
      } catch (e) {}
      if (!mkFresh) {
        // pendiente: se guarda solo 30 s para volver a mirar pronto
        try { await env.PORRA.put(ck, JSON.stringify({ at: Date.now() - 90000, finished: false, points: null }), { expirationTtl: 60 }); } catch (e) {}
        return { finished: false, points: null };
      }
      if (pts == null) {
        const po = (m.ps && m.ps.po) || [];
        const z = po.find((k) => k.mode === "stats");
        pts = z ? Number(z.p) || 0 : 0;
      }
      out.points = pts;
    }
    try {
      await env.PORRA.put(ck, JSON.stringify({ at: Date.now(), finished: out.finished, points: out.points }), {
        expirationTtl: out.finished ? 30 * 24 * 3600 : 120,
      });
    } catch (e) {}
    return out;
  } catch (e) { return null; }
}

// Histórico de "a quién recomendamos de capitán": se resuelve bajo demanda
// (cuando Edu abre la pestaña) comprobando, para cada jornada todavía sin
// resolver, si YA ha terminado el partido de las 3 opciones que se le
// mostraron. En cuanto las 3 han acabado, se guarda el resultado en KV para
// no volver a pedirlo nunca más (los puntos de una jornada pasada no
// cambian).
async function getCapitanHistorial(env, user) {
  if (!user || !user.key) return [];
  const key = "cap:hist:" + user.key;
  let hist = [];
  try { hist = (await env.PORRA.get(key, "json")) || []; } catch (e) {}
  if (!Array.isArray(hist)) return [];
  let changed = false;
  for (const h of hist) {
    if (h.resolved) continue;
    try {
      const results = await Promise.all((h.alts || []).map(async (a) => {
        const r = await getPlayerJornadaPoints(env, a.id, h.jornada);
        return { ...a, points: r ? r.points : null, finished: !!(r && r.finished) };
      }));
      h.results = results;
      if (results.length && results.every((r) => r.finished)) { h.resolved = true; changed = true; }
    } catch (e) {}
  }
  if (changed) { try { await env.PORRA.put(key, JSON.stringify(hist)); } catch (e) {} }
  return hist;
}

function dstrMadrid(off) {
  const { d } = madrid(new Date());
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - off);
  const p = (n) => String(n).padStart(2, "0");
  return x.getUTCFullYear() + "-" + p(x.getUTCMonth() + 1) + "-" + p(x.getUTCDate());
}

async function snapshotMarket(env, players) {
  try {
    const today = dstrMadrid(0);
    // Marcador diario pequeño: así no se descarga ni parsea el histórico entero en cada petición.
    try { if ((await env.PORRA.get("fmhist:day", "text")) === today) return; } catch (e) {}
    let hist = await env.PORRA.get("fmhist", "json");
    if (!hist || !Array.isArray(hist.days)) hist = { days: [] };
    const last = hist.days[hist.days.length - 1];
    if (last && last.d === today) { try { await env.PORRA.put("fmhist:day", today, { expirationTtl: 86400 }); } catch (e) {} return; }
    const v = {}, p = {}, fi = {};
    (players || []).forEach((pl) => {
      if (!pl.name) return;
      v[pl.name] = pl.value;
      p[pl.name] = pl.points;
      const f = pl.fitness || [];
      fi[pl.name] = f.length ? Math.round((f.reduce((a, b) => a + (Number(b) || 0), 0) / f.length) * 10) / 10 : 0;
    });
    hist.days.push({ d: today, v, p, fi });
    if (hist.days.length > 140) hist.days = hist.days.slice(-140);
    await env.PORRA.put("fmhist", JSON.stringify(hist));
    try { await env.PORRA.put("fmhist:day", today, { expirationTtl: 86400 }); } catch (e) {}
  } catch (e) {}
}

function madrid(now) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  return { d: new Date(wall), offset };
}

function nextTuesday2200Utc(now) {
  const { d, offset } = madrid(now);
  let days = (2 - d.getUTCDay() + 7) % 7;
  const past = d.getUTCHours() > 22 || (d.getUTCHours() === 22 && (d.getUTCMinutes() > 0 || d.getUTCSeconds() > 0));
  if (days === 0 && past) days = 7;
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(22, 0, 0, 0);
  return d.getTime() - offset;
}

// Ventana de subasta: lunes 23:59 -> martes 22:00 (hora de Madrid)
function inPujaWindow(now) {
  const { d } = madrid(now);
  const wd = d.getUTCDay(); // 0 dom, 1 lun, 2 mar
  if (wd === 1) return d.getUTCHours() === 23 && d.getUTCMinutes() >= 59; // lunes desde 23:59
  if (wd === 2) return d.getUTCHours() < 22;
  return false;
}

// Próxima apertura (siguiente lunes 23:59, hora de Madrid)
function nextWindowOpenUtc(now) {
  const { d, offset } = madrid(now);
  let days = (1 - d.getUTCDay() + 7) % 7;
  const past = d.getUTCHours() > 23 || (d.getUTCHours() === 23 && d.getUTCMinutes() >= 59);
  if (days === 0 && past) days = 7;
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(23, 59, 0, 0);
  return d.getTime() - offset;
}

function pujaStub(env) {
  if (!env.PUJA || typeof env.PUJA.idFromName !== "function") return null;
  return env.PUJA.get(env.PUJA.idFromName("main"));
}

async function getPuja(env) {
  let p = await env.PORRA.get(PUJA_KEY, "json");
  if (!p) return null;
  const now = Date.now();
  if (p.status === "open" && now >= p.closesAt) {
    const top = (p.bids || []).slice().sort((a, b) => b.amount - a.amount)[0] || null;
    p.status = "closed";
    p.winner = top ? { user: top.user, amount: top.amount } : null;
    await archivePuja(env, p);
  }
  return p;
}

async function createPuja(request, env, user) {
  if (!user) return json({ error: "Inicia sesion." }, 401);
  // El admin puede abrir una puja fuera del horario habitual (lunes 23:59 a
  // martes 22:00); para el resto de usuarios se mantiene la ventana normal.
  if (!inPujaWindow(new Date()) && !isAdmin(env, user)) {
    return json({ error: "La subasta solo se puede abrir de lunes 23:59 a martes 22:00 (hora de Madrid)." }, 403);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Datos invalidos" }, 400); }
  const player = String(body.player || "").trim().slice(0, 40);
  const base = Math.floor(Number(body.base));
  const photoRaw = String(body.photo || "").trim().slice(0, 600);
  let photo = /^https?:\/\/.+/i.test(photoRaw) ? photoRaw : "";
  let team = String(body.team || "").trim().slice(0, 60);
  const logoRaw = String(body.logo || "").trim().slice(0, 600);
  let logo = /^https?:\/\/.+/i.test(logoRaw) ? logoRaw : "";
  let change = Math.floor(Number(body.change) || 0);
  let pstatus = String(body.pstatus || "").trim().slice(0, 20);
  let role = String(body.role || "").trim().slice(0, 20);
  let role2 = String(body.role2 || "").trim().slice(0, 20);
  if (!player) return json({ error: "Escribe el nombre del jugador." }, 400);
  if (!Number.isFinite(base) || base < 1000000) return json({ error: "El valor debe ser al menos 1.000.000." }, 400);
  let playerValue = 0;
  try {
    const cache = await getMarketPlayers(env);
    const list = cache.players || [];
    const q = stripAccents(player.toLowerCase());
    const found =
      list.find((x) => stripAccents(x.name.toLowerCase()) === q) ||
      list.find((x) => stripAccents(x.name.toLowerCase()).includes(q));
    if (found) {
      playerValue = found.value;
      team = found.team || team;
      logo = found.logo || logo;
      change = Number(found.change) || change;
      pstatus = found.status || pstatus;
      role = found.role || role;
      role2 = found.role2 || role2;
      if (!photo) photo = found.photo || "";
      if (base < found.value) {
        return json({ error: `El precio no puede ser menor que el valor del jugador (${fmtEur(found.value)} €).` }, 400);
      }
    }
  } catch (e) {}
  const closesAt = nextTuesday2200Utc(new Date());
  const stubC = pujaStub(env);
  if (stubC) {
    try {
      const r = await stubC.fetch("https://do/crear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: { name: user.name, key: user.key }, player, base, value: playerValue, photo, team, logo, change, pstatus, role, role2, closesAt }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d.error || "Error" }, r.status);
      return json({ ok: true, puja: d.puja });
    } catch (e) {}
  }
  const existing = await env.PORRA.get(PUJA_KEY, "json");
  if (existing && existing.status === "open") {
    return json({ error: "Ya hay una puja abierta. Espera a que termine." }, 409);
  }
  if (existing && existing.status === "closed") {
    await archivePuja(env, existing);
  }
  const now = Date.now();
  const p = {
    id: String(now),
    creator: user.name,
    creatorKey: user.key,
    player,
    base,
    value: playerValue,
    photo,
    team: team || "",
    logo: logo || "",
    change: change || 0,
    pstatus: pstatus || "",
    role: role || "",
    role2: role2 || "",
    createdAt: new Date(now).toISOString(),
    closesAt: nextTuesday2200Utc(new Date(now)),
    extended: false,
    status: "open",
    bids: [],
    winner: null,
  };
  await env.PORRA.put(PUJA_KEY, JSON.stringify(p));
  return json({ ok: true, puja: await getPuja(env) });
}

async function placeBid(request, env, user) {
  if (!user) return json({ error: "Inicia sesion para pujar." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Datos invalidos" }, 400); }
  const stubB = pujaStub(env);
  if (stubB) {
    try {
      const r = await stubB.fetch("https://do/pujar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: { name: user.name, key: user.key }, amount: body.amount }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d.error || "Error" }, r.status);
      return json({ ok: true, puja: d.puja });
    } catch (e) {}
  }
  const p = await getPuja(env);
  if (!p) return json({ error: "No hay ninguna puja abierta." }, 404);
  if (p.status !== "open") return json({ error: "La puja ya ha terminado." }, 403);
  const now = Date.now();
  const prevBid = (p.bids || []).find((b) => b.user === user.name);
  if (prevBid && prevBid.at && now - new Date(prevBid.at).getTime() < 5000) {
    return json({ error: "Espera unos segundos antes de volver a pujar." }, 429);
  }
  const amount = Math.floor(Number(body.amount));
  const step = pujaStep(p.base);
  const highest = (p.bids || []).reduce((m, b) => Math.max(m, b.amount), 0);
  const minFirst = Math.ceil(p.base / step) * step;
  const min = highest ? highest + step : minFirst;
  if (!Number.isFinite(amount)) return json({ error: "Cantidad invalida." }, 400);
  if (amount % step !== 0) {
    return json({ error: `La puja debe ir de ${step.toLocaleString("es-ES")} en ${step.toLocaleString("es-ES")}.` }, 400);
  }
  if (amount < min) {
    return json({ error: `Alguien ha pujado antes que tú. Mínimo ahora: ${min.toLocaleString("es-ES")} €.` }, 400);
  }
  const bids = (p.bids || []).filter((b) => b.user !== user.name);
  bids.push({ user: user.name, userKey: user.key, amount, at: new Date(now).toISOString() });
  p.bids = bids;
  if (now >= p.closesAt - 5 * 60 * 1000) {
    p.closesAt = now + 5 * 60 * 1000;
    p.extended = true;
  }
  await env.PORRA.put(PUJA_KEY, JSON.stringify(p));
  return json({ ok: true, puja: await getPuja(env) });
}

/* ---------- La Porra automatica (Real Madrid y Barcelona) ---------- */

const TEAM_RM = 86;
const TEAM_BARCA = 81;
const PORRA_FIX_KEY = "porra:fixtures:v3";
const PORRA_HIST_KEY = "porra:history";
const PORRA_FIX_TTL = 30 * 60 * 1000;
const PRIZE_EXACT = 1000000;
const PRIZE_SIGN = 500000;

function porraSign(h, a) {
  return h > a ? 1 : h < a ? 2 : 0;
}

// Instante (ms UTC) del lunes 23:59:59 (hora de Madrid) de la semana del partido: hasta entonces se deja
// el partido (y su resultado) en la Porra; a partir de ahí se habilita el siguiente.
function porraShowUntil(utcDate) {
  const tz = "Europe/Madrid";
  const t = new Date(utcDate).getTime();
  const parts = (ms) => {
    const o = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(new Date(ms)).forEach((x) => { o[x.type] = x.value; });
    return o;
  };
  const pp = parts(t);
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[pp.weekday];
  const add = (1 - wd + 7) % 7;
  let guess = Date.UTC(Number(pp.year), Number(pp.month) - 1, Number(pp.day) + add, 23, 59, 59);
  for (let i = 0; i < 2; i++) {
    const q = parts(guess);
    const asUtc = Date.UTC(Number(q.year), Number(q.month) - 1, Number(q.day), Number(q.hour), Number(q.minute), Number(q.second));
    guess -= asUtc - Date.UTC(Number(pp.year), Number(pp.month) - 1, Number(pp.day) + add, 23, 59, 59);
  }
  return guess;
}

// Solo LaLiga (PD). Devuelve todos los partidos de liga del equipo en la ventana, ya normalizados.
async function fetchTeamFixtures(env, teamId) {
  const token = env.FOOTBALL_API_KEY;
  if (!token) return null;
  const now = Date.now();
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
  const nd = new Date(now);
  const seasonStart = (nd.getUTCMonth() >= 6 ? nd.getUTCFullYear() : nd.getUTCFullYear() - 1) + "-08-01";
  const url = `https://api.football-data.org/v4/teams/${teamId}/matches?competitions=PD&dateFrom=${seasonStart}&dateTo=${fmt(now + 60 * 86400000)}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) return null;
  const j = await res.json();
  return (j.matches || [])
    .filter((m) => m.utcDate && (!m.competition || !m.competition.code || m.competition.code === "PD") && !["POSTPONED", "SUSPENDED", "CANCELLED"].includes(m.status))
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
    .map((m) => {
      const ft = (m.score && m.score.fullTime) || {};
      const hasResult = m.status === "FINISHED" && ft.home != null && ft.away != null;
      return {
        matchId: m.id,
        matchday: m.matchday || null,
        home: (m.homeTeam && m.homeTeam.name) || "",
        away: (m.awayTeam && m.awayTeam.name) || "",
        homeCrest: (m.homeTeam && m.homeTeam.crest) || "",
        awayCrest: (m.awayTeam && m.awayTeam.crest) || "",
        utcDate: m.utcDate,
        competition: (m.competition && m.competition.name) || "LaLiga",
        status: m.status,
        result: hasResult ? { home: ft.home, away: ft.away } : null,
      };
    });
}

// El partido que toca: el primero de liga cuyo "mostrar hasta" (lunes 23:59) aún no ha pasado.
function pickPorraMatch(list, now) {
  if (!list || !list.length) return null;
  return list.find((f) => porraShowUntil(f.utcDate) > now) || null;
}

async function getPorraFixtures(env) {
  const now = Date.now();
  let cached = null;
  try { cached = await env.PORRA.get(PORRA_FIX_KEY, "json"); } catch (e) {}
  let lists = cached && cached.lists;
  if (!(cached && cached.updatedAt && now - cached.updatedAt < PORRA_FIX_TTL && lists)) {
    const [rm, barca] = await Promise.all([fetchTeamFixtures(env, TEAM_RM).catch(() => null), fetchTeamFixtures(env, TEAM_BARCA).catch(() => null)]);
    if (rm || barca) {
      lists = { rm: rm || (lists && lists.rm) || [], barca: barca || (lists && lists.barca) || [] };
      try { await env.PORRA.put(PORRA_FIX_KEY, JSON.stringify({ updatedAt: now, lists }), { expirationTtl: 7 * 24 * 3600 }); } catch (e) {}
    }
  }
  lists = lists || { rm: [], barca: [] };
  // Partidos de liga ya terminados y fuera de plazo (pasado el lunes 23:59): van al historial.
  const past = [].concat(lists.rm || [], lists.barca || []).filter((f) => f.result && porraShowUntil(f.utcDate) <= now);
  return { rm: pickPorraMatch(lists.rm, now), barca: pickPorraMatch(lists.barca, now), past, lists };
}

function porraBuildEntries(preds, f) {
  return Object.values(preds || {})
    .map((v) => {
      let prize = null;
      let tipo = "";
      if (f.result) {
        if (v.home === f.result.home && v.away === f.result.away) { prize = PRIZE_EXACT; tipo = "exacto"; }
        else if (porraSign(v.home, v.away) === porraSign(f.result.home, f.result.away)) { prize = PRIZE_SIGN; tipo = "signo"; }
        else prize = 0;
      }
      return { name: v.name, home: v.home, away: v.away, prize, tipo };
    })
    .sort((a, b) => (b.prize || 0) - (a.prize || 0) || String(a.name).localeCompare(String(b.name)));
}

// Pasa al historial los partidos terminados que ya salieron de la Porra (una sola vez por partido).
async function archivePorra(env, past) {
  let hist = (await env.PORRA.get(PORRA_HIST_KEY, "json")) || [];
  if (!Array.isArray(hist)) hist = [];
  const has = (f) => hist.some((h) => (h.matchId && h.matchId === f.matchId) || (h.home === f.home && h.away === f.away && h.utcDate && f.utcDate && String(h.utcDate).slice(0, 10) === String(f.utcDate).slice(0, 10)));
  let changed = false;
  for (const f of past || []) {
    if (has(f)) continue;
    const preds = (await env.PORRA.get(`porra:pred:${f.matchId}`, "json")) || {};
    const entries = porraBuildEntries(preds, f);
    if (!entries.length) continue;
    hist.push({ matchId: f.matchId, matchday: f.matchday || null, home: f.home, away: f.away, utcDate: f.utcDate, competition: f.competition, result: f.result, entries });
    changed = true;
  }
  if (changed) {
    hist.sort((a, b) => new Date(b.utcDate || 0) - new Date(a.utcDate || 0));
    try { await env.PORRA.put(PORRA_HIST_KEY, JSON.stringify(hist)); } catch (e) {}
  }
  return hist;
}

async function getPorraState(env, user, jornadaReq) {
  const items = await getPorraFixtures(env);
  const now = Date.now();
  const lists = items.lists || { rm: [], barca: [] };
  const mds = [items.rm, items.barca].filter(Boolean).map((f) => f.matchday).filter(Boolean);
  const currentJornada = mds.length ? Math.min(...mds) : null;
  const allMd = [].concat(lists.rm || [], lists.barca || []).map((f) => f.matchday).filter(Boolean);
  const minJornada = allMd.length ? Math.min(...allMd) : null;
  const maxJornada = allMd.length ? Math.max(...allMd) : null;
  let jornada = Number(jornadaReq) || currentJornada;
  if (jornada && minJornada) jornada = Math.max(minJornada, Math.min(maxJornada, jornada));
  const pickJ = (list, fallback) => (jornada ? (list || []).find((f) => f.matchday === jornada) || null : fallback);
  const defs = [
    { key: "rm", label: "Real Madrid", fix: pickJ(lists.rm, items.rm) },
    { key: "barca", label: "Barcelona", fix: pickJ(lists.barca, items.barca) },
  ];
  const matches = [];
  const seenFix = new Set();
  for (const d of defs) {
    const f = d.fix;
    if (!f) continue;
    // Madrid-Barça (o Barça-Madrid) sale en las dos listas: se muestra una sola vez.
    const fk = f.matchId || (f.home + "|" + f.away + "|" + String(f.utcDate).slice(0, 10));
    if (seenFix.has(fk)) continue;
    seenFix.add(fk);
    const preds = (await env.PORRA.get(`porra:pred:${f.matchId}`, "json")) || {};
    const entries = porraBuildEntries(preds, f);
    const started = now >= new Date(f.utcDate).getTime() || !["SCHEDULED", "TIMED"].includes(f.status);
    const my = user ? preds[user.key] : null;
    matches.push({
      key: d.key,
      label: d.label,
      matchId: f.matchId,
      matchday: f.matchday || null,
      home: f.home,
      away: f.away,
      homeCrest: f.homeCrest,
      awayCrest: f.awayCrest,
      utcDate: f.utcDate,
      competition: f.competition,
      status: f.status,
      result: f.result,
      started,
      locked: !!(currentJornada && f.matchday && f.matchday > currentJornada),
      entries,
      my: my ? { home: my.home, away: my.away } : null,
    });
  }
  matches.sort((x, y) => new Date(x.utcDate) - new Date(y.utcDate));
  let history = [];
  try { history = await archivePorra(env, items.past); } catch (e) { history = (await env.PORRA.get(PORRA_HIST_KEY, "json")) || []; }
  history = (Array.isArray(history) ? history : []).slice().sort((a, b) => new Date(b.utcDate || 0) - new Date(a.utcDate || 0));
  const mdOf = {};
  [].concat(lists.rm || [], lists.barca || []).forEach((f) => { if (f.matchId && f.matchday) mdOf[f.matchId] = f.matchday; });
  const crOf = {};
  [].concat(lists.rm || [], lists.barca || []).forEach((f) => { if (f.matchId) crOf[f.matchId] = f; });
  history = (history || []).map((h) => ({ ...h, matchday: h.matchday || mdOf[h.matchId] || null, homeCrest: h.homeCrest || (crOf[h.matchId] || {}).homeCrest || "", awayCrest: h.awayCrest || (crOf[h.matchId] || {}).awayCrest || "" }))
    .sort((a, b) => (b.matchday || 0) - (a.matchday || 0) || new Date(b.utcDate || 0) - new Date(a.utcDate || 0));
  return { user: user ? { name: user.name } : null, matches, history, jornada, currentJornada, minJornada, maxJornada };
}

async function savePorraPred(request, env, user) {
  if (!user) return json({ error: "Inicia sesion para pronosticar." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Datos invalidos" }, 400);
  }
  const matchId = Number(body.matchId);
  const home = Math.floor(Number(body.home));
  const away = Math.floor(Number(body.away));
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0 || home > 30 || away > 30) {
    return json({ error: "Marcador invalido." }, 400);
  }
  const items = await getPorraFixtures(env);
  const f = [].concat((items.lists && items.lists.rm) || [], (items.lists && items.lists.barca) || []).find((x) => x && x.matchId === matchId);
  if (!f) return json({ error: "Partido no valido." }, 400);
  const curMds = [items.rm, items.barca].filter(Boolean).map((x) => x.matchday).filter(Boolean);
  const curJ = curMds.length ? Math.min(...curMds) : null;
  if (curJ && f.matchday && f.matchday > curJ) return json({ error: "Esa jornada aún está bloqueada: solo se puede pronosticar la jornada actual." }, 403);
  const started = Date.now() >= new Date(f.utcDate).getTime() || !["SCHEDULED", "TIMED"].includes(f.status);
  if (started) return json({ error: "El partido ya ha empezado." }, 403);
  const key = `porra:pred:${matchId}`;
  const preds = (await env.PORRA.get(key, "json")) || {};
  preds[user.key] = { name: user.name, home, away, updatedAt: new Date().toISOString() };
  await env.PORRA.put(key, JSON.stringify(preds), { expirationTtl: 60 * 24 * 3600 });
  return json({ ok: true, state: await getPorraState(env, user, body.jornada) });
}

async function getPartido(env) {
  const raw = await env.PORRA.get("partido", "json");
  const p =
    raw || {
      home: "Atletico de Madrid",
      away: "Real Madrid",
      matchId: 564688,
      utcDate: null,
      result: null,
      entries: [],
    };
  const token = env.FOOTBALL_API_KEY;
  if (token && p.matchId && !p.result) {
    const last = p.lastChecked || 0;
    if (Date.now() - last > 5 * 60 * 1000) {
      try {
        const res = await fetch(`https://api.football-data.org/v4/matches/${p.matchId}`, {
          headers: { "X-Auth-Token": token },
        });
        if (res.ok) {
          const m = await res.json();
          if (
            m.status === "FINISHED" &&
            m.score &&
            m.score.fullTime &&
            m.score.fullTime.home != null &&
            m.score.fullTime.away != null
          ) {
            p.result = { home: m.score.fullTime.home, away: m.score.fullTime.away };
          }
        }
      } catch (e) {}
      p.lastChecked = Date.now();
      await env.PORRA.put("partido", JSON.stringify(p));
    }
  }
  return p;
}
async function handleRegistro(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Datos invalidos" }, 400);
  }
  const name = normName(body.nombre);
  const pin = String(body.pin || "").trim();
  if (!validName(name)) {
    return json({ error: "El nombre debe tener 2-24 caracteres (letras, numeros, espacios)." }, 400);
  }
  if (!validPin(pin)) {
    return json({ error: "El codigo debe tener 4 o 6 numeros." }, 400);
  }
  const key = nameKey(name);
  const existing = await getUser(env, key);
  if (existing) {
    return json({ error: "Ese nombre ya esta registrado. Elige otro o entra con tu codigo." }, 409);
  }
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(pin, salt, PBKDF2_ITER);
  await env.PORRA.put(
    `user:${key}`,
    JSON.stringify({ name, salt, hash, iter: PBKDF2_ITER, createdAt: new Date().toISOString() })
  );
  await migrateLegacy(env, key, name);
  await logNewAccount(env, name);
  const token = await createSession(env, key);
  const state = await buildState(env, null, { key, name });
  return json({ ok: true, user: { name }, state }, 200, {
    "Set-Cookie": sessionCookie(token, SESSION_TTL),
  });
}

async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Datos invalidos" }, 400);
  }
  const name = normName(body.nombre);
  const pin = String(body.pin || "").trim();
  if (!validName(name) || !validPin(pin)) {
    return json({ error: "Nombre o codigo incorrectos." }, 400);
  }
  const key = nameKey(name);
  const existing = await getUser(env, key);
  if (!existing) {
    const salt = randomHex(16);
    const hash = await pbkdf2Hex(pin, salt, PBKDF2_ITER);
    await env.PORRA.put(
      `user:${key}`,
      JSON.stringify({ name, salt, hash, iter: PBKDF2_ITER, createdAt: new Date().toISOString() })
    );
    await migrateLegacy(env, key, name);
    await logNewAccount(env, name);
    const token = await createSession(env, key);
    const state = await buildState(env, null, { key, name });
    return json({ ok: true, user: { name }, state, created: true }, 200, {
      "Set-Cookie": sessionCookie(token, SESSION_TTL),
    });
  }
  const failKey = `fail:${key}`;
  const fails = (await env.PORRA.get(failKey, "json")) || { n: 0 };
  if (fails.n >= MAX_LOGIN_FAILS) {
    return json({ error: "Demasiados intentos fallidos. Espera 15 minutos." }, 429);
  }
  const user = existing;
  const hash = user ? await pbkdf2Hex(pin, user.salt, user.iter || PBKDF2_ITER) : null;
  if (!user || !safeEqual(hash, user.hash)) {
    await env.PORRA.put(failKey, JSON.stringify({ n: fails.n + 1 }), { expirationTtl: 900 });
    return json({ error: "Nombre o codigo incorrectos." }, 401);
  }
  await env.PORRA.delete(failKey);
  await migrateLegacy(env, key, user.name);
  const token = await createSession(env, key);
  const state = await buildState(env, null, { key, name: user.name });
  return json({ ok: true, user: { name: user.name }, state }, 200, {
    "Set-Cookie": sessionCookie(token, SESSION_TTL),
  });
}

function handleLogout() {
  return json({ ok: true }, 200, {
    "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  });
}

async function handlePrediccion(request, env, user) {
  if (!user) return json({ error: "Inicia sesion para guardar." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Datos invalidos" }, 400);
  }
  const picks = body.picks;
  if (!picks || typeof picks !== "object") return json({ error: "Pronosticos invalidos" }, 400);

  const jornada = await getJornada(env, body.jornada);
  const matches = jornada.matches || [];
  const nowMs = Date.now();
  const openMatches = matches.filter((m) => isOpenMatch(m, nowMs));
  if (!openMatches.length) {
    return json({ error: "La jornada ya ha comenzado. No se puede modificar." }, 403);
  }

  const openIds = new Set(openMatches.map((m) => String(m.id)));
  const clean = {};
  for (const [id, pick] of Object.entries(picks)) {
    if (!openIds.has(String(id))) continue;
    if (!["1", "X", "2"].includes(pick)) continue;
    clean[id] = pick;
  }

  const missing = openMatches.filter((m) => !clean[m.id]);
  if (missing.length) {
    return json(
      {
        error: `Te falta elegir ${missing.length} partido(s) por jugar.`,
        missing: missing.map((m) => m.id),
      },
      400
    );
  }

  const preds = await getPredictions(env, jornada.matchday);
  const existing = (preds[user.key] && preds[user.key].picks) || {};
  const merged = { ...existing };
  for (const [id, pick] of Object.entries(clean)) merged[id] = pick;

  await savePrediction(env, jornada.matchday, user.key, {
    name: user.name,
    picks: merged,
    updatedAt: new Date().toISOString(),
  });

  const state = await buildState(env, String(jornada.matchday), user);
  return json({ ok: true, state });
}

// ---- Cachés fuera de KV ----------------------------------------------------
// KV gratis solo admite 1.000 escrituras/día. Todo lo que se guarda con caducidad
// corta (<= 6 h) es una caché: se guarda en la Cache API de Cloudflare (sin límite
// ni coste) y solo lo duradero (sin caducidad o de días) va a KV.
const CACHE_MAX_TTL = 6 * 3600;
function withCacheKV(env) {
  try {
    if (!env || !env.PORRA || env.PORRA.__shim || typeof caches === "undefined" || !caches.default) return env;
    const kv = env.PORRA, c = caches.default;
    const rq = (k) => new Request("https://kvcache.edumr.internal/" + encodeURIComponent(k));
    const shim = {
      __shim: true,
      async get(key, opts) {
        const type = typeof opts === "string" ? opts : (opts && opts.type) || "text";
        try {
          const m = await c.match(rq(key));
          if (m) return type === "json" ? await m.json() : type === "arrayBuffer" ? await m.arrayBuffer() : await m.text();
        } catch (e) {}
        return kv.get(key, opts);
      },
      async put(key, value, opts) {
        const ttl = opts && opts.expirationTtl;
        if (ttl && ttl <= CACHE_MAX_TTL) {
          try {
            await c.put(rq(key), new Response(value, { headers: { "Cache-Control": "public, max-age=" + Math.max(30, ttl) } }));
            return;
          } catch (e) {}
        }
        return kv.put(key, value, opts);
      },
      async delete(key) { try { await c.delete(rq(key)); } catch (e) {} return kv.delete(key); },
      list: (o) => kv.list(o),
      getWithMetadata: (k, o) => kv.getWithMetadata(k, o),
    };
    return Object.assign({}, env, { PORRA: shim });
  } catch (e) { return env; }
}

// ---- Histórico de puntos de la liga por jornada --------------------------------
// Futmondo solo da los puntos de liga de los 5 últimos partidos de cada jugador (array "fitness"). Para que
// con el tiempo se vea TODA la temporada, cada vez que un equipo termina un partido se guardan esos puntos
// por jugador y jornada. Solo se guarda cuando hay partidos nuevos (pocas escrituras) y solo si la alineación
// ventana-jornada se puede comprobar (si no cuadra con lo ya guardado, ese equipo se salta).
const PTH_KEY = "pth:v1", PTH_META = "pth:meta:v1";
async function recordPointsHistory(env) {
  const out = { teams: 0, written: 0, skipped: [] };
  let cur = 0;
  try { cur = Number((await getJornada(env, null)).matchday) || 0; } catch (e) {}
  if (!cur) return out;
  const fin = {}; // teamKey -> [{n, t}]
  for (let n = Math.max(1, cur - 6); n <= Math.min(38, cur + 1); n++) {
    let jd = null;
    try { jd = await getJornada(env, n); } catch (e) {}
    ((jd && jd.matches) || []).forEach((m) => {
      if (m.status !== "FINISHED" && m.status !== "AWARDED") return;
      const t = Date.parse(m.utcDate) || 0;
      [m.homeTeam, m.awayTeam].forEach((tm) => {
        const k = teamKey((tm && (tm.shortName || tm.name)) || "");
        if (!k) return;
        (fin[k] = fin[k] || []).push({ n, t });
      });
    });
  }
  Object.keys(fin).forEach((k) => fin[k].sort((a, b) => a.t - b.t));
  let meta = {};
  try { meta = (await env.PORRA.get(PTH_META, "json")) || {}; } catch (e) {}
  const pending = Object.keys(fin).filter((k) => {
    const last = fin[k][fin[k].length - 1];
    return meta[k] !== last.n;
  });
  if (!pending.length) return out;
  const mk = await getMarketPlayers(env);
  const players = (mk && mk.players) || [];
  let hist = {};
  try { hist = (await env.PORRA.get(PTH_KEY, "json")) || {}; } catch (e) {}
  let changed = false;
  for (const k of pending) {
    const list = fin[k];
    const last = list[list.length - 1];
    // Futmondo tarda en repartir los puntos: hasta 3 h después del final no se da por bueno el dato
    if (!(mk.at && mk.at >= last.t + (105 * 60 + 3 * 3600) * 1000)) { out.skipped.push(k + ":espera"); continue; }
    const roster = players.filter((p) => { const pk = teamKey(p.team || ""); return pk && (pk === k || pk.indexOf(k) >= 0 || k.indexOf(pk) >= 0); });
    let cmp = 0, bad = 0;
    const plan = [];
    roster.forEach((p) => {
      const f = (p.fitness || []).map((x) => Number(x) || 0);
      if (!f.length || f.length > list.length) return;
      const h = hist[p.id] || {};
      f.forEach((v, i) => {
        const n = list[list.length - f.length + i].n;
        if (h[n] !== undefined) { cmp++; if (h[n] !== v) bad++; }
        plan.push([p.id, n, v]);
      });
    });
    if (!plan.length) { out.skipped.push(k + ":sin-datos"); continue; }
    if (cmp >= 8 && bad / cmp > 0.25) { out.skipped.push(k + ":no-cuadra"); continue; }
    plan.forEach(([id, n, v]) => { (hist[id] = hist[id] || {})[n] = v; });
    meta[k] = last.n; out.teams++; out.written += plan.length; changed = true;
  }
  if (changed) {
    await env.PORRA.put(PTH_KEY, JSON.stringify(hist));
    await env.PORRA.put(PTH_META, JSON.stringify(meta));
  }
  return out;
}

// Caché de respuestas públicas (Cache API: sin coste ni límite). Evita recalcular en cada visita
// y mantiene la CPU por petición por debajo del límite del plan gratis de Cloudflare.
const EDGE_TTL = { "ultimos-cambios": 180, aplazados: 300, estadios: 3600, "historial-puntos": 120, mercado: 45, rachas: 60, equipos: 1800, portada: 60, jornada: 30, jugador: 300, once: 300, "alineaciones-confirmadas": 180, "alineaciones-estado": 300, noticias: 300, ultimahora: 120, clausulas: 300, fichajes: 300, temporada: 600, detallepartido: 90, directo: 10 };
export async function onRequestGet(ctx) {
  const path = (ctx.params.path || []).join("/");
  const ttl = EDGE_TTL[path];
  const url = new URL(ctx.request.url);
  if (!ttl || typeof caches === "undefined" || !caches.default || url.searchParams.has("reset") || url.searchParams.has("run") || url.searchParams.has("raw")) return handleGet(ctx);
  const key = new Request("https://edgecache.edumr.internal/v1" + url.pathname + url.search);
  try {
    const hit = await caches.default.match(key);
    if (hit) return new Response(hit.body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-edge": "hit" } });
  } catch (e) {}
  // Última respuesta buena (se guarda 2 días): si la fuente falla o llega vacía, se sirve esa en vez de una pantalla vacía.
  const staleKey = new Request("https://edgecache.edumr.internal/v1-stale" + url.pathname + url.search);
  const serveStale = async () => {
    try {
      const st = await caches.default.match(staleKey);
      if (st) return new Response(st.body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-edge": "stale" } });
    } catch (e) {}
    return null;
  };
  let res;
  try { res = await handleGet(ctx); } catch (e) { return (await serveStale()) || new Response(JSON.stringify({ error: "temporal" }), { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
  if (res.status === 200) {
    try {
      const txt = await res.clone().text();
      const good = txt.indexOf('"error"') < 0 && txt.length > 20 && !/"(matches|players|teams|items|days)":\[\]/.test(txt) && !/"matchday":0[,}]/.test(txt);
      if (good) {
        // La jornada solo necesita refrescarse cada 30 s si hay un partido en juego; si no, cada 90 s (menos CPU)
        const ttlNow = path === "jornada" && txt.indexOf('"state":"live"') < 0 ? 90 : ttl;
        const put = caches.default.put(key, new Response(txt, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + ttlNow } }));
        const put2 = caches.default.put(staleKey, new Response(txt, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=172800" } }));
        if (ctx.waitUntil) { ctx.waitUntil(put.catch(() => {})); ctx.waitUntil(put2.catch(() => {})); } else { await put.catch(() => {}); await put2.catch(() => {}); }
      } else {
        const st = await serveStale(); if (st) return st;
      }
    } catch (e) {}
  } else if (res.status >= 500) {
    const st = await serveStale(); if (st) return st;
  }
  return res;
}

async function handleGet({ request, env: env0, params }) {
  const env = withCacheKV(env0);
  const path = (params.path || []).join("/");
  const url = new URL(request.url);
  const user = await getSessionUser(env, request);

  if (path === "estado" || path === "") {
    const reqJornada = url.searchParams.get("jornada");
    const state = await buildState(env, reqJornada, user);
    return json(state);
  }
  if (path === "global") {
    const g = await buildGlobal(env);
    return json(g);
  }
  if (path === "partido") {
    const p = await getPartido(env);
    return json(p);
  }
  if (path === "porra") {
    return json(await getPorraState(env, user, url.searchParams.get("jornada")));
  }
  if (path === "puja") {
    const stub = pujaStub(env);
    if (stub) {
      try {
        const r = await stub.fetch("https://do/state");
        const d = await r.json();
        if (r.ok && d && d.puja !== undefined) {
          let mk = null;
          try { mk = await getMarketPlayers(env); } catch (e) {}
          const mlist = (mk && mk.players) || [];
          const findM = (name) => {
            const q = stripAccents(String(name || "").toLowerCase()).trim();
            if (!q) return null;
            return mlist.find((x) => stripAccents(x.name.toLowerCase()) === q) || mlist.find((x) => stripAccents(x.name.toLowerCase()).includes(q));
          };
          const fill = (o) => {
            if (!o) return o;
            const f = findM(o.player);
            if (!f) return o;
            return {
              ...o,
              team: o.team || f.team, logo: o.logo || f.logo, change: o.change || f.change,
              pstatus: o.pstatus || f.status, role: o.role || f.role, role2: o.role2 || f.role2,
              value: o.value || f.value, photo: o.photo || f.photo,
            };
          };
          const pj = fill(d.puja);
          const hist = (d.history || []).map(fill);
          return json({ puja: pj || null, user: user ? { name: user.name } : null, admin: isAdmin(env, user), nextTuesday: nextTuesday2200Utc(new Date()), nextWindow: nextWindowOpenUtc(new Date()), inWindow: inPujaWindow(new Date()), history: hist });
        }
      } catch (e) {}
    }
    const p = await getPuja(env);
    const history = await getPujaHistory(env);
    return json({ puja: p, user: user ? { name: user.name } : null, admin: isAdmin(env, user), nextTuesday: nextTuesday2200Utc(new Date()), nextWindow: nextWindowOpenUtc(new Date()), inWindow: inPujaWindow(new Date()), history });
  }
  if (path === "me") {
    return json({ user: user ? { name: user.name } : null, admin: isAdmin(env, user) });
  }
  if (path === "mercado") {
    return searchMercado(env, url.searchParams.get("q"));
  }
  if (path === "temporada") {
    try { const map = await getSeasonMap(env, true, url.searchParams.has("reset")); return json({ n: Object.keys(map).length, map }); } catch (e) { return json({ n: 0, map: {}, error: String(e) }); }
  }
  if (path === "fichajes") {
    try { return json(await getFichajes(env)); } catch (e) { return json({ groups: [], error: String(e) }); }
  }
  if (path === "once") {
    try { return json(await getOnce(env, url.searchParams.get("home") || "", url.searchParams.get("away") || "", url.searchParams.get("jornada") || "")); } catch (e) { return json({ error: String(e) }); }
  }
  if (path === "detallepartido") {
    try { return json(await getPartidoFF(env, url.searchParams.get("home") || "", url.searchParams.get("away") || "", url.searchParams.get("jornada") || "")); } catch (e) { return json({ error: String(e) }); }
  }
  if (path === "alineaciones-confirmadas") {
    try { return json(await getAlineacionesConfirmadas(env, url.searchParams.get("jornada") || null)); } catch (e) { return json({ matchday: 0, matches: [], error: String(e) }); }
  }
  // Cambios de un partido (quién sale y quién entra), sacados de la crónica
  // minuto a minuto de la página del partido. Cada frase se lee con varios
  // patrones; lo que no encaje se ignora (el cliente lo cruza por eliminación).
  if (path === "directo") {
    // Directo de un partido: crónica de Comuniate + eventos y estadísticas de FotMob. Sin KV: caché de borde de 30 s.
    const hh = url.searchParams.get("home") || "", aa = url.searchParams.get("away") || "", jj = url.searchParams.get("jornada") || "";
    const dd = /^\d{8}$/.test(url.searchParams.get("date") || "") ? url.searchParams.get("date") : "";
    const out = { entries: [], fm: null };
    const UA = { "user-agent": "Mozilla/5.0 (compatible; edumr)" };
    const cron = (async () => {
      try {
        const d = await getPartidoFF(env, hh, aa, jj);
        if (!(d && d.url)) return;
        const html = await (await fetch(d.url, { headers: cmHeaders() })).text();
        const texts = [...new Set([...html.matchAll(/"articleBody":"([^"]*)"/g)].map((m) => m[1]))];
        for (const raw of texts) {
          const mm = raw.match(/^(\d+)(?:\+(\d+))?'\s*[—-]\s*(.*)$/);
          if (!mm) continue;
          out.entries.push({ min: Number(mm[1]), x: Number(mm[2]) || 0, t: mm[3].replace(/\s+/g, " ").trim() });
        }
        out.entries.sort((a, b) => (a.min + a.x / 100) - (b.min + b.x / 100));
      } catch (e) {}
    })();
    const fot = (async () => {
      try {
        if (!dd) return;
        const STOP = new Set(["de", "la", "el", "club", "fc", "cf", "ud", "cd", "rcd", "sd", "rc", "real", "deportivo_"]);
        const ALIAS = { atleti: "atletico madrid", barca: "barcelona", athletic: "athletic club" };
        const toks = (n) => { let k = String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); if (ALIAS[k]) k = ALIAS[k]; return k.split(" ").filter((w) => w && !STOP.has(w)); };
        const same = (ours, theirs) => { const a = toks(ours), b = toks(theirs); if (!a.length || !b.length) return false; return a.some((w) => b.indexOf(w) >= 0); };
        const lr = await fetch("https://www.fotmob.com/api/data/matches?date=" + dd + "&timezone=Europe%2FMadrid&ccode3=ESP", { headers: UA });
        const lj = await lr.json();
        let hit = null;
        for (const lg of (lj.leagues || [])) {
          for (const m of (lg.matches || [])) {
            if (same(hh, m.home && (m.home.longName || m.home.name)) && same(aa, m.away && (m.away.longName || m.away.name))) { hit = m; break; }
          }
          if (hit) break;
        }
        if (!hit) return;
        const dr = await fetch("https://www.fotmob.com/api/data/matchDetails?matchId=" + hit.id, { headers: UA });
        const j = await dr.json();
        const st = (j.header && j.header.status) || {};
        const content = j.content || {};
        const evs = ((content.matchFacts || {}).events || {}).events || [];
        const events = [];
        evs.forEach((e) => {
          const base = { t: Number(e.time) || 0, x: Number(e.overloadTime) || 0, h: !!e.isHome };
          if (e.type === "Goal") events.push(Object.assign(base, { k: "goal", name: e.nameStr || (e.player && e.player.name) || "", own: !!e.ownGoal, pen: /pen/i.test(String(e.goalDescription || "") + String(e.goalDescriptionKey || "")), assist: e.assistStr || "", sc: e.newScore ? e.newScore.join(" - ") : "" }));
          else if (e.type === "Card") events.push(Object.assign(base, { k: "card", card: e.card || "", name: e.nameStr || (e.player && e.player.name) || "" }));
          else if (e.type === "Substitution" && e.swap && e.swap.length === 2) events.push(Object.assign(base, { k: "sub", inn: e.swap[0].name || "", out: e.swap[1].name || "" }));
          else if (e.type === "VAR") events.push(Object.assign(base, { k: "var", name: e.nameStr || (e.player && e.player.name) || "", txt: (((e.VAR || {}).decision || {}).value || []).join(" · ") }));
          else if (e.type === "Half") events.push(Object.assign(base, { k: "half", txt: e.halfStrShort || "" }));
        });
        const LBL = [["BallPossesion", "Posesión", "%", "Ataque"], ["expected_goals", "Goles esperados (xG)", "", "Ataque"], ["total_shots", "Tiros totales", "", "Ataque"], ["ShotsOnTarget", "Tiros a puerta", "", "Ataque"], ["big_chance", "Ocasiones claras", "", "Ataque"], ["corners", "Córners", "", "Ataque"], ["touches_opp_box", "Toques en el área rival", "", "Ataque"], ["accurate_passes", "Pases precisos", "", "Juego"], ["keeper_saves", "Paradas", "", "Defensa"], ["fouls", "Faltas", "", "Disciplina"], ["yellow_cards", "Amarillas", "", "Disciplina"], ["red_cards", "Rojas", "", "Disciplina"], ["Offsides", "Fueras de juego", "", "Disciplina"]];
        const groups = ((((content.stats || {}).Periods || {}).All || {}).stats) || [];
        const byKey = {};
        groups.forEach((g) => (g.stats || []).forEach((x) => { if (x && x.stats && x.stats.length === 2 && x.stats[0] != null && !byKey[x.key]) byKey[x.key] = x.stats; }));
        const stats = [];
        LBL.forEach((l) => { const v = byKey[l[0]]; if (v) stats.push({ k: l[0], l: l[1], h: v[0], a: v[1], u: l[2] || "", g: l[3] || "" }); });
        const mf = content.matchFacts || {};
        const pm = mf.playerOfTheMatch || null;
        let mvp = null;
        if (pm) { const nm = typeof pm.name === "string" ? pm.name : (pm.name && (pm.name.fullName || ((pm.name.firstName || "") + " " + (pm.name.lastName || "")).trim())) || ""; const rt = pm.rating && typeof pm.rating === "object" ? (pm.rating.num || pm.rating.value) : pm.rating; mvp = { id: pm.id, n: nm, team: pm.teamName || "", r: rt ? Number(rt) : null, raw: Object.keys(pm).join(",") }; }
        const hlr = mf.highlights || null;
        const hl = hlr && hlr.url ? { url: hlr.url, img: hlr.image || "", src: hlr.source || "" } : null;
        const lu = content.lineup || {};
        const mkSide = (t) => {
          if (!t || !t.starters) return null;
          const pl = (x) => { const pf = x.performance || {}; return { id: x.id, n: x.name, no: x.shirtNumber, r: pf.rating || null, ev: (pf.events || []).map((e) => e.type), so: ((pf.substitutionEvents || []).find((e) => e.type === "subOut") || {}).time || 0, si: ((pf.substitutionEvents || []).find((e) => e.type === "subIn") || {}).time || 0, c: !!x.isCaptain, x: x.verticalLayout ? x.verticalLayout.x : null, y: x.verticalLayout ? x.verticalLayout.y : null }; };
          return { name: t.name, f: t.formation || "", r: t.rating || null, st: t.starters.map(pl), sb: (t.subs || []).map(pl), co: t.coach && t.coach.name || "" };
        };
        const lineup = { h: mkSide(lu.homeTeam), a: mkSide(lu.awayTeam) };
        let table = null;
        try {
          const tr = await fetch("https://www.fotmob.com/api/data/tltable?leagueId=87", { headers: UA });
          const tj = await tr.json();
          const all = tj[0].data.table.all || [];
          table = all.map((x) => ({ i: x.idx, id: x.id, n: x.shortName || x.name, p: x.played, w: x.wins, d: x.draws, l: x.losses, gf: String(x.scoresStr || ""), dg: x.goalConDiff, pt: x.pts, q: x.qualColor || "" }));
        } catch (e) {}
        const mfx = (content.matchFacts) || {};
        const po = mfx.playerOfTheMatch;
        const potm = po && po.name ? { id: po.id, n: po.name.fullName || ((po.name.firstName || "") + " " + (po.name.lastName || "")).trim(), team: po.teamName || "", r: po.rating && po.rating.num ? po.rating.num : "", home: !!po.isHomeTeam } : null;
        const hl0 = mfx.highlights;
        const hlx = hl0 && /^https:\/\//.test(hl0.url || "") ? { url: hl0.url, image: /^https:\/\//.test(hl0.image || "") ? hl0.image : "" } : null;
        const ib = mfx.infoBox || {};
        const st0 = ib.Stadium || {}, rf = ib.Referee || {}, tr0 = ib.Tournament || {};
        const rstat = {}; (rf.stats || []).forEach((x) => { if (x.valueType === "perMatch") rstat[x.type] = { v: x.value, avg: x.average, fill: x.fillPercentage, afill: x.averagePercentage }; });
        const wx = content.weather || null;
        const info = {
          date: (ib["Match Date"] || {}).utcTime || "", round: tr0.round || tr0.roundName || "", league: tr0.leagueName || "",
          stadium: st0.name ? { n: st0.name, city: st0.city || "", country: st0.country || "", cap: st0.capacity || 0, surface: st0.surface || "", lat: st0.lat || null, lng: st0.long || null } : null,
          att: (() => { const a = ib.Attendance; const n = typeof a === "number" ? a : a && (a.attendance || a.value) || 0; return Number(n) || 0; })(),
          ref: rf.text ? { n: rf.text, country: rf.country || "", img: rf.imgUrl || "", stats: rstat } : null,
          wx: wx && wx.temperature != null ? { t: wx.temperature, d: wx.defaultTitle || "", c: wx.iconCode } : null,
        };
        const fr = (arr) => (arr || []).map((x) => ({ r: x.resultString || "", sc: x.score || "", logo: x.imageUrl || "", hn: (x.home || {}).name || "", an: (x.away || {}).name || "", ourHome: !!(x.home || {}).isOurTeam, d: (x.date || {}).utcTime || "" }));
        const tf = mfx.teamForm || [];
        const form = [fr(tf[0]), fr(tf[1])];
        const h2o = content.h2h || null;
        const h2h = h2o && h2o.matches ? { sum: h2o.summary || [], m: h2o.matches.slice(0, 10).map((x) => ({ d: (x.time || {}).utcTime || "", lg: (x.league || {}).name || "", hn: (x.home || {}).name || "", an: (x.away || {}).name || "", sc: (x.status || {}).finished ? (x.status.scoreStr || "") : "", hid: (x.home || {}).id, aid: (x.away || {}).id })) } : null;
        const teams = (j.header && j.header.teams) || [];
        const nextOf = async (tid) => {
          try {
            const r = await fetch("https://www.fotmob.com/api/data/teams?id=" + tid + "&ccode3=ESP", { headers: UA });
            const tj = await r.json();
            const nm = tj && tj.overview && tj.overview.nextMatch;
            if (!nm) return null;
            return { d: (nm.status || {}).utcTime || "", hn: (nm.home || {}).name || "", an: (nm.away || {}).name || "", hid: (nm.home || {}).id, aid: (nm.away || {}).id, lg: ((tj.overview.nextMatch.tournament || {}).name) || "" };
          } catch (e) { return null; }
        };
        const nexts = await Promise.all([teams[0] ? nextOf(teams[0].id) : null, teams[1] ? nextOf(teams[1].id) : null]);
        out.fm = { info, form, h2h, next: nexts, potm, hl: hlx, lineup, table, hid: teams[0] && teams[0].id, aid: teams[1] && teams[1].id, id: hit.id, started: !!st.started, finished: !!st.finished, halfs: st.halfs || null, lt: st.liveTime || null, score: [teams[0] && teams[0].score, teams[1] && teams[1].score], events, stats, src: "FotMob" };
      } catch (e) {}
    })();
    await Promise.all([cron, fot]);
    return json(out);
  }
  if (path === "cambios") {
    const hh = url.searchParams.get("home") || "", aa = url.searchParams.get("away") || "", jj = url.searchParams.get("jornada") || "";
    const ck = (url.searchParams.get("raw") ? "x" : "") + "cambios:v5:" + jj + ":" + normKey(hh.toLowerCase()) + "-" + normKey(aa.toLowerCase());
    try { const c = await env.PORRA.get(ck, "json"); if (c && Date.now() - (c.at || 0) < 10 * 60 * 1000) return json(c.data); } catch (e) {}
    const out = { subs: [] };
    try {
      const d = await getPartidoFF(env, hh, aa, jj);
      if (d && d.url) {
        const html = await (await fetch(d.url, { headers: cmHeaders() })).text();
        const texts = [...new Set([...html.matchAll(/"articleBody":"([^"]*)"/g)].map((m) => m[1]))];
        const clean = (t) => String(t || "").replace(/\([^)]*\)/g, "").replace(/^(?:del campo|del terreno de juego)\s+/i, "").replace(/\s+abandona el terreno de juego(?: y)?$/i, "").replace(/\s+y$/i, "").replace(/[.¡!]+\s*$/g, "").replace(/\s+/g, " ").trim();
        if (url.searchParams.get("raw")) out.raw = texts.filter((x) => /^\d+/.test(x));
        const goalLines = [];
        for (const raw of texts) {
          const mm = raw.match(/^(\d+)(?:\+(\d+))?'\s*[—-]\s*(.*)$/);
          if (!mm) continue;
          const min = Number(mm[1]), x = Number(mm[2]) || 0, t = mm[3];
          if (/¡\s*gol\b|golazo/i.test(t) && !/anulad|malogr|ocasi[oó]n|fuera de juego/i.test(t)) goalLines.push({ min, x, t });
          let rj = t.match(/tarjeta roja a ([^(!.]+?)\s*\(/i) || t.match(/expulsa(?:do)? a ([^(!.]+?)\s*\(/i);
          if (!rj && /expulsi[oó]n|expulsad|doble amarilla|segunda amarilla|tarjeta roja/i.test(t) && !/le muestra tarjeta amarilla|tarjeta amarilla a/i.test(t)) rj = t.match(/^([^.()!¡]+?)\s*\(/);
          if (rj) { (out.reds = out.reds || []).push({ min, x, name: rj[1].trim() }); continue; }
          if (!/entr|sustitu|cambio|sale\b/i.test(t)) continue;
          let a = null, b = null, m2;
          if ((m2 = t.match(/sale (.+?) y entra (.+?)(?:\s*\(|\.|$)/i))) { b = m2[1]; a = m2[2]; }
          else if ((m2 = t.match(/(?:^|\. |, que |\s)(?:es|ha sido) sustituido por (.+?)(?:\s*\(|\.|$)/i)) && (m2[0])) {
            const pre = t.slice(0, m2.index).replace(/^.*?(?:para|\. )\s*/i, "");
            b = pre; a = m2[1];
          }
          else if ((m2 = t.match(/(.+?) sale del terreno de juego,? y (.+?) entra en su lugar/i))) { b = m2[1].replace(/^.*\. /, ""); a = m2[2]; }
          else if ((m2 = t.match(/dar entrada a (.+?) por (.+?)(?:\s*\(|\.|$)/i))) { a = m2[1]; b = m2[2]; }
          else if ((m2 = t.match(/sustituir a (.+?) por (.+?)(?:\s*\(|\.|$)/i))) { b = m2[1]; a = m2[2]; }
          else if ((m2 = t.match(/(.+?) (?:ha )?entra(?:do)?(?: en el (?:terreno de juego|campo))? (?:en sustituci[oó]n de|en lugar de|por|como sustituto de) (.+?)(?:\s*\(|\.|$)/i))) { a = m2[1].replace(/^.*\. /, ""); b = m2[2]; }
          else if ((m2 = t.match(/entra (.+?) en sustituci[oó]n de (.+?)(?:\s*\(|\.|$)/i))) { a = m2[1]; b = m2[2]; }
          if (a && b) out.subs.push({ min, x, in: clean(a), out: clean(b) });
        }
        // Minuto exacto de cada gol (con descuento) cruzando la crónica con la lista de goleadores
        try {
          const nrm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const hk = nrm(hh).split(/\s+/)[0], ak = nrm(aa).split(/\s+/)[0];
          const sideOf = (t) => { const m3 = [...t.matchAll(/\(([^)]+)\)/g)].map((q) => nrm(q[1])); for (const q of m3) { if (hk.length >= 3 && q.indexOf(hk) >= 0) return "home"; if (ak.length >= 3 && q.indexOf(ak) >= 0) return "away"; } return ""; };
          const bySide = { home: [], away: [] };
          goalLines.forEach((g) => { const sd = sideOf(g.t); if (sd) bySide[sd].push(g); });
          const gm = { home: [], away: [] }; let okAll = true;
          [["home", d.goalsHome], ["away", d.goalsAway]].forEach(([sd, gl]) => {
            gl = gl || []; const lines = bySide[sd].slice();
            if (gl.length !== lines.length) { okAll = false; return; }
            const used = new Array(lines.length).fill(false), res = new Array(gl.length).fill(null);
            gl.forEach((g, i) => {
              const name = nrm(String(g.text || "").replace(/\([^)]*\)/g, " ")); const toks = name.split(/[^a-z]+/).filter((w) => w.length >= 4);
              const k = lines.findIndex((l, li) => !used[li] && toks.some((w) => nrm(l.t).indexOf(w) >= 0));
              if (k >= 0) { used[k] = true; res[i] = lines[k]; }
            });
            gl.forEach((g, i) => { if (!res[i]) { const k = used.indexOf(false); if (k >= 0) { used[k] = true; res[i] = lines[k]; } } });
            gm[sd] = res.map((l) => l ? { m: l.min, x: l.x } : null);
          });
          if (url.searchParams.get("raw")) out.dbg = { gl: goalLines.map((g) => g.min + "+" + g.x + " " + sideOf(g.t)), gh: (d.goalsHome || []).length, ga: (d.goalsAway || []).length, hk, ak };
          if (okAll) {
            const all2 = []; ["home", "away"].forEach((sd) => gm[sd].forEach((q) => { if (q) all2.push({ sd, q }); }));
            all2.sort((a, b) => (a.q.m + a.q.x / 100) - (b.q.m + b.q.x / 100));
            let h = 0, a2 = 0; all2.forEach((e) => { if (e.sd === "home") h++; else a2++; e.q.sc = h + " - " + a2; });
            out.gm = gm;
          }
        } catch (e) {}
      }
    } catch (e) { out.err = String(e).slice(0, 120); }
    try { if (out.subs.length || out.reds || out.gm) await env.PORRA.put(ck, JSON.stringify({ at: Date.now(), data: out }), { expirationTtl: 3600 }); } catch (e) {}
    return json(out);
  }
  if (path === "equipos") {
    try { return json({ teams: await getTeams(env) }); } catch (e) { return json({ teams: [] }); }
  }
  if (path === "ultimahora") {
    return json(await getUltimaHora(env));
  }
  // Cinta de "Última hora" de la portada (Inicio de Guía Fantasy): mezcla
  // las noticias más recientes con las alineaciones confirmadas detectadas
  // (una entrada por equipo), todo ordenado de más nuevo a más viejo.
  if (path === "portada") {
    try {
      const j = url.searchParams.get("jornada") || "";
      const now = Date.now();
      const [uh, cf] = await Promise.all([
        getUltimaHora(env).catch(() => ({ items: [] })),
        getAlineacionesConfirmadas(env, j || null).catch(() => ({ matches: [] })),
      ]);
      const items = [];
      ((uh && uh.items) || []).forEach((x) => {
        if (!x || !x.title) return;
        items.push({ kind: "news", title: x.title, link: x.link || "", thumb: x.thumb || "", date: x.date || "", time: x.time || "", at: ffWhenAt(x.date, x.time) });
      });
      ((cf && cf.matches) || []).forEach((mm) => {
        const at = mm.confirmedAt || cf.updatedAt || now;
        [["home", "away"], ["away", "home"]].forEach((pair) => {
          const t = mm[pair[0]] || {}, r = mm[pair[1]] || {};
          if (!t.name || !r.name) return;
          items.push({
            kind: "match",
            title: t.name + " confirma su alineación ante " + r.name,
            home: (mm.home && mm.home.name) || "",
            away: (mm.away && mm.away.name) || "",
            crest: t.crest || "",
            date: mm.date || "",
            time: mm.time || "",
            at,
          });
        });
      });
      items.sort((a, b) => (b.at || 0) - (a.at || 0));
      return json({ updatedAt: now, jornada: (cf && cf.matchday) || 0, items: items.slice(0, 20) });
    } catch (e) { return json({ updatedAt: Date.now(), items: [], error: String(e) }); }
  }
  if (path === "tabla") {
    return json({ teams: (await getLeagueTable(env)) || [] });
  }
  if (path === "rachas") {
    try { return json(await getRachas(env)); } catch (e) { return json({ players: [] }); }
  }
  if (path === "alineaciones-estado") {
    try { return json(await getProbableFlags(env, url.searchParams.get("jornada") || null)); } catch (e) {
      try { const jq = url.searchParams.get("jornada"); const prev = jq ? await env.PORRA.get("probflags:" + Number(jq), "json") : null; if (prev && prev.items) return json({ matchday: Number(jq), items: prev.items }); } catch (e2) {}
      return json({ matchday: 0, items: [] });
    }
  }
  if (path === "jornada") {
    try { return json(await getJornadaStrip(env, url.searchParams.get("jornada"))); } catch (e) { return json({ matchday: 0, matches: [] }); }
  }
  if (path === "ultimos-cambios") {
    try { return json(await getCambios(env)); } catch (e) { return json({ days: [] }); }
  }
  if (path === "estadios") {
    try { return json(await getEstadios(env)); } catch (e) { return json({}); }
  }
  if (path === "aplazados") {
    try { return json(await getAplazados(env)); } catch (e) { return json({ current: 0, items: [] }); }
  }
  if (path === "clausulas") {
    try { return json(await getClausulas(env)); } catch (e) { return json({ players: [], error: String(e) }); }
  }
  if (path === "clausula-info") {
    // Cuándo se libera la cláusula de unos jugadores concretos (los de Analiza), aunque no estén en el top 40 de Clausulazo
    const ids = String(url.searchParams.get("ids") || "").split(",").map((x) => x.trim()).filter((x) => /^[a-z0-9]{6,40}$/i.test(x)).slice(0, 16);
    const names = String(url.searchParams.get("names") || "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 16);
    const targets = ids.map((id) => ({ id, key: "id:" + id }));
    if (names.length) {
      let market = [];
      try { market = (await getMarketPlayers(env)).players || []; } catch (e) {}
      names.forEach((n) => {
        const nk = stripAccents(n.toLowerCase());
        const same = market.filter((p) => stripAccents(String(p.name || "").toLowerCase()) === nk);
        const last = nk.split(" ").pop();
        const part = same.length ? same : market.filter((p) => { const k = stripAccents(String(p.name || "").toLowerCase()); return k.includes(nk) || nk.includes(k) || (last.length > 3 && k.split(" ").pop() === last); });
        if (part.length === 1) targets.push({ id: part[0].id, key: "n:" + nk });
      });
    }
    let header = null;
    try { header = await futbolHeader(env); } catch (e) {}
    const info = header ? await Promise.all(targets.map(async (t) => {
      try {
        const sm = await futbolPost("/1/player/summary", header, { playerId: t.id, championshipId: FUTMONDO_CHAMPIONSHIP });
        const cl = ((sm.answer || {}).championship || {}).clause || {};
        return { key: t.key, price: Number(cl.price) || 0, unlock: cl.date || "" };
      } catch (e) { return null; }
    })) : [];
    return json({ info: info.filter(Boolean) });
  }
  if (path === "ff-health") {
    // El cron diario llama con ?run=1 para forzar una comprobación fresca
    // de las 20 páginas; la web (solo si eres admin) llama sin ?run para
    // leer el último resultado guardado, sin disparar 20 peticiones cada
    // vez que alguien abre la Guía Fantasy.
    try {
      const health = await checkFFHealth(env, url.searchParams.has("run"));
      // issues/newAccounts solo se añaden para el admin: son datos sobre
      // otros usuarios (nombres) o sobre fallos internos, no algo que deba
      // ver cualquiera que llame a este endpoint directamente.
      if (isAdmin(env, user)) {
        try { health.issues = (await env.PORRA.get(SCRAPE_ISSUES_KEY, "json")) || []; } catch (e) { health.issues = []; }
        try {
          const accs = (await env.PORRA.get(NEWACC_KEY, "json")) || [];
          health.newAccounts = accs.filter((x) => Date.now() - (x.at || 0) < 3 * 24 * 3600 * 1000);
        } catch (e) { health.newAccounts = []; }
      }
      return json(health);
    } catch (e) { return json({ at: 0, total: 0, broken: [], error: String(e) }); }
  }
  if (path === "analiza-refresco") {
    // Probabilidades/sanciones/lesiones al día (misma fuente que Alineaciones
    // probables) para los jugadores ya analizados. n = "nombre~equipo|nombre~equipo".
    const pairs = String(url.searchParams.get("n") || "").split("|").map((x) => x.split("~")).filter((x) => x[0]).slice(0, 30);
    const teams = [...new Set(pairs.map((x) => x[1]).filter(Boolean))].slice(0, 14);
    const rosters = {};
    await Promise.all(teams.map(async (t) => { try { const d = await getFFTeam(env, t); rosters[t] = [].concat(d.starters || [], d.bench || []); } catch (e) { rosters[t] = []; } }));
    const items = {};
    pairs.forEach(([nm, tm]) => { const m = matchFFPlayer(nm, rosters[tm] || []); if (m) items[nm] = { prob: m.prob, san: !!m.san, inj: !!m.inj }; });
    return json({ items, at: Date.now() });
  }
  if (path === "analiza-estado") {
    if (!user) return json({ status: "none" });
    let j = null;
    try { j = await env.PORRA.get("anjob:" + user.key, "json"); } catch (e) {}
    if (!j) return json({ status: "none" });
    if (j.status === "running" && Date.now() - (j.at || 0) > 120000) return json({ id: j.id, status: "error", at: j.at, error: "El análisis se cortó. Vuelve a enviarlo." });
    return json(j);
  }
  if (path === "capitan-historial") {
    if (!user) return json({ error: "Inicia sesión para ver tu histórico." }, 401);
    try { return json({ historial: await getCapitanHistorial(env, user) }); } catch (e) { return json({ historial: [], error: String(e) }); }
  }
  if (path === "noticias") {
    return json(await getNoticias(env));
  }
  if (path === "noticia") {
    return json(await getNoticia(url.searchParams.get("u")));
  }
  if (path === "jugador") {
    return json(await playerFicha(env, url.searchParams.get("id"), url.searchParams.get("fast") === "1", url.searchParams.get("raw") === "1"));
  }
  // Puntos de MI liga Futmondo (modo stats) para los jugadores de un partido
  // y una jornada. La página de partido manda los ids resueltos y recibe
  // { "<id>": { p: puntos|null, f: terminado } } para pintar el campo.
  if (path === "historial-puntos") {
    if (url.searchParams.has("run")) {
      try { return json({ ok: true, result: await recordPointsHistory(env) }); } catch (e) { return json({ ok: false, error: String(e).slice(0, 200) }); }
    }
    try {
      const ids = String(url.searchParams.get("ids") || "").split(",").map((x) => x.trim()).filter((x) => /^[a-z0-9]{6,40}$/i.test(x)).slice(0, 40);
      const hist = (await env.PORRA.get(PTH_KEY, "json")) || {};
      const pts = {};
      ids.forEach((id) => { if (hist[id]) pts[id] = hist[id]; });
      return json({ pts });
    } catch (e) { return json({ pts: {} }); }
  }
  if (path === "puntos") {
    try {
      const j = Number(url.searchParams.get("jornada")) || 0;
      const ids = String(url.searchParams.get("ids") || "")
        .split(",").map((x) => x.trim()).filter((x) => /^[a-z0-9]{6,40}$/i.test(x))
        .filter((x, i, a) => a.indexOf(x) === i).slice(0, 12);
      const out = {};
      await Promise.all(ids.map(async (id) => {
        const r = await getPlayerJornadaPoints(env, id, j);
        out[id] = r ? { p: r.points, f: !!r.finished } : null;
      }));
      return json({ jornada: j, points: out });
    } catch (e) { return json({ error: String(e) }); }
  }
  return json({ error: "not found" }, 404);
}

export async function onRequestPost({ request, env: env0, params, waitUntil }) {
  const env = withCacheKV(env0);
  const path = (params.path || []).join("/");
  if (path === "registro") return handleRegistro(request, env);
  if (path === "login") return handleLogin(request, env);
  if (path === "logout") return handleLogout();
  if (path === "prediccion") {
    const user = await getSessionUser(env, request);
    return handlePrediccion(request, env, user);
  }
  if (path === "puja/crear") {
    const user = await getSessionUser(env, request);
    return createPuja(request, env, user);
  }
  if (path === "analiza") {
    const user = await getSessionUser(env, request);
    // Modo segundo plano (?bg=1): responde al instante y sigue analizando en
    // el servidor aunque el usuario cierre la app; el resultado queda
    // guardado y se recoge con GET analiza-estado. TTL > 6 h para ir a KV real.
    if (user && new URL(request.url).searchParams.get("bg") === "1" && typeof waitUntil === "function") {
      const text = await request.text();
      const jobKey = "anjob:" + user.key;
      const id = Date.now().toString(36);
      try {
        const prev = await env.PORRA.get(jobKey, "json");
        if (prev && prev.status === "running" && Date.now() - (prev.at || 0) < 90000) return json({ error: "Ya hay un análisis en marcha, espera a que acabe.", job: prev.id }, 429);
      } catch (e) {}
      try { await env.PORRA.put(jobKey, JSON.stringify({ id, status: "running", at: Date.now() }), { expirationTtl: 8 * 3600 }); } catch (e) {}
      // Se ejecuta DENTRO de la petición (sin límite mientras el móvil siga conectado) y,
      // si el móvil se desconecta, waitUntil deja terminar el trabajo y guardarlo.
      const job = (async () => {
        let rec;
        try {
          const rq = new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: text });
          const res = await handleAnaliza(rq, env, user);
          const d = await res.json();
          rec = res.ok ? { id, status: "done", at: Date.now(), data: d } : { id, status: "error", at: Date.now(), error: d.error || "No se pudo analizar." };
        } catch (e) { rec = { id, status: "error", at: Date.now(), error: "No se pudo analizar." }; }
        try { await env.PORRA.put(jobKey, JSON.stringify(rec), { expirationTtl: 8 * 3600 }); } catch (e) {}
        return rec;
      })();
      waitUntil(job);
      const rec = await job;
      if (rec.status === "done") return json({ job: id, status: "done", data: rec.data });
      return json({ job: id, status: "error", error: rec.error }, 422);
    }
    return handleAnaliza(request, env, user);
  }
  if (path === "capitan-elegir") {
    const user = await getSessionUser(env, request);
    if (!user) return json({ error: "Inicia sesión." }, 401);
    let b; try { b = await request.json(); } catch (e) { return json({ error: "Datos inválidos." }, 400); }
    const key = "cap:hist:" + user.key;
    let hist = []; try { hist = (await env.PORRA.get(key, "json")) || []; } catch (e) {}
    const h = Array.isArray(hist) ? hist.find((x) => Number(x.jornada) === Number(b.jornada)) : null;
    if (!h || !(h.alts || []).some((a) => String(a.id) === String(b.id))) return json({ error: "Opción no válida." }, 400);
    h.chosen = String(b.id);
    h.resolved = false; h.results = null; // se recalcula con la nueva elección
    try { await env.PORRA.put(key, JSON.stringify(hist)); } catch (e) { return json({ error: "No se pudo guardar." }, 500); }
    return json({ ok: true });
  }
  if (path === "puja/pujar") {
    const user = await getSessionUser(env, request);
    return placeBid(request, env, user);
  }
  if (path === "puja/reset") {
    const user = await getSessionUser(env, request);
    if (!isAdmin(env, user)) return json({ error: "No autorizado." }, 403);
    const stub = pujaStub(env);
    if (stub) {
      try { await stub.fetch("https://do/reset", { method: "POST" }); } catch (e) {}
    }
    await env.PORRA.delete(PUJA_KEY);
    return json({ ok: true, puja: null });
  }
  if (path === "puja/edit") {
    const user = await getSessionUser(env, request);
    if (!isAdmin(env, user)) return json({ error: "No autorizado." }, 403);
    let body; try { body = await request.json(); } catch { return json({ error: "Datos invalidos" }, 400); }
    const player = String(body.player || "").trim().slice(0, 40);
    const baseN = Math.floor(Number(body.base));
    if (!player) return json({ error: "Escribe el jugador." }, 400);
    let value = 0, team = "", logo = "", photo = "", change = 0, pstatus = "", role = "", role2 = "";
    try {
      const cache = await getMarketPlayers(env);
      const q = stripAccents(player.toLowerCase());
      const found = (cache.players || []).find((x) => stripAccents(x.name.toLowerCase()) === q) || (cache.players || []).find((x) => stripAccents(x.name.toLowerCase()).includes(q));
      if (found) { value = found.value; team = found.team || ""; logo = found.logo || ""; photo = found.photo || ""; change = Number(found.change) || 0; pstatus = found.status || ""; role = found.role || ""; role2 = found.role2 || ""; }
    } catch (e) {}
    if (Number.isFinite(baseN) && value && baseN < value) return json({ error: `El precio no puede ser menor que el valor (${fmtEur(value)} €).` }, 400);
    const payload = { player, base: Number.isFinite(baseN) ? baseN : 0, value, team, logo, photo, change, pstatus, role, role2 };
    const stubE = pujaStub(env);
    if (stubE) {
      try {
        const r = await stubE.fetch("https://do/editar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const d = await r.json();
        if (!r.ok) return json({ error: d.error || "Error" }, r.status);
        return json({ ok: true, puja: d.puja });
      } catch (e) {}
    }
    const p = await env.PORRA.get(PUJA_KEY, "json");
    if (!p) return json({ error: "No hay subasta abierta." }, 404);
    p.player = player;
    if (payload.base) p.base = payload.base;
    if (value) { p.value = value; p.team = team; p.logo = logo; p.photo = photo; p.change = change; p.pstatus = pstatus; p.role = role; p.role2 = role2; }
    await env.PORRA.put(PUJA_KEY, JSON.stringify(p));
    return json({ ok: true, puja: await getPuja(env) });
  }
  if (path === "porra/predecir") {
    const user = await getSessionUser(env, request);
    return savePorraPred(request, env, user);
  }
  return json({ error: "not found" }, 404);
}
