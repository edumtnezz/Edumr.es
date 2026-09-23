const COMPETITION = "PD";
const CACHE_TTL_MS = 60 * 1000;
const FORM_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 24 * 60;
const COOKIE_NAME = "porra_session";
const PBKDF2_ITER = 100000;
const MAX_LOGIN_FAILS = 3;
const PREMIOS = [1200000, 1000000, 800000, 600000, 400000, 200000];

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
  return (data.matches || []).map((m) => ({
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
  }));
}

async function fetchFootballData(env, matchday) {
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
    const allFinished = matches.every((m) => m.status === "FINISHED");
    if (allFinished) {
      for (let next = md + 1; next <= md + 3; next++) {
        try {
          const nm = await fetchMatchday(headers, next);
          if (nm.length) {
            md = next;
            matches = nm;
            break;
          }
        } catch (e) {
          break;
        }
      }
    }
  }
  return { matchday: md, source: "football-data", matches };
}

async function getJornada(env, matchday) {
  const kv = env.PORRA;
  const cacheKey = `jornada:${matchday || "current"}`;
  const raw = await kv.get(cacheKey, "json");
  if (raw && raw.fetchedAt && Date.now() - raw.fetchedAt < CACHE_TTL_MS) {
    return raw.data;
  }
  let data = null;
  try {
    data = await fetchFootballData(env, matchday);
  } catch (e) {
    data = null;
  }
  if (!data) data = mockJornada(matchday || 1);
  await kv.put(cacheKey, JSON.stringify({ fetchedAt: Date.now(), data }), {
    expirationTtl: 600,
  });
  return data;
}

async function getFormMap(env) {
  const cacheKey = "form:PD";
  const cached = await env.PORRA.get(cacheKey, "json");
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < FORM_TTL_MS) {
    return cached.data;
  }
  let data = {};
  const token = env.FOOTBALL_API_KEY;
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
        for (const [id, arr] of Object.entries(acc)) {
          arr.sort((a, b) => b.d - a.d);
          data[id] = arr.slice(0, 5).map((x) => ({ r: x.r, home: x.home }));
        }
      }
    } catch (e) {
      data = {};
    }
  }
  await env.PORRA.put(cacheKey, JSON.stringify({ fetchedAt: Date.now(), data }), {
    expirationTtl: 3600,
  });
  return data;
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
    s.prize = PREMIOS[i] || 0;
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

  const outMatches = matches.map((m) => {
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
    prizes: PREMIOS,
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

const FUTMONDO_BASE = "https://api.futmondo.com";
const FUTMONDO_CHAMPIONSHIP = "6a5f4b833633f9d0e371f838";
const FUTMONDO_USERTEAM = "6ab314563a9cf632cef6291c";
const FACE_BASE = "https://static01.mondocore.com/futmondo/img/faces/64/";
const LOGO_BASE = "https://static02.mondocore.com/futmondo/img/teams/64/";
const MARKET_KEY = "fm:market";
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

async function getMarketPlayers(env) {
  const cached = await env.PORRA.get(MARKET_KEY, "json");
  if (cached && Date.now() - (cached.at || 0) < MARKET_TTL_MS) return cached.players;
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
      name: String(p.name || ""),
      role: String(p.role || ""),
      value: Number(p.value) || 0,
      team: tm.name || String(p.team || ""),
      status: String(p.status || ""),
      points: Number(p.points) || 0,
      photo: p.photo ? FACE_BASE + p.photo : "",
      logo: tm.logo ? LOGO_BASE + tm.logo : "",
    };
  });
  await env.PORRA.put(MARKET_KEY, JSON.stringify({ at: Date.now(), players }), { expirationTtl: 1800 });
  return players;
}

async function searchMercado(env, q) {
  let players;
  try {
    players = await getMarketPlayers(env);
  } catch (e) {
    return json({ error: "No se pudo consultar Futmondo." }, 502);
  }
  const query = stripAccents(String(q || "").toLowerCase().trim());
  let list = players;
  if (query) list = players.filter((p) => stripAccents(p.name.toLowerCase()).includes(query));
  list = list.slice().sort((a, b) => b.value - a.value);
  return json({ players: list.slice(0, 20) });
}

function pujaStep(base) {
  return Number(base) >= 10000000 ? 1000000 : 100000;
}

function nextTuesday2200Utc(now) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = wall - now.getTime();
  const d = new Date(wall);
  let days = (2 - d.getUTCDay() + 7) % 7;
  const past = d.getUTCHours() > 22 || (d.getUTCHours() === 22 && (d.getUTCMinutes() > 0 || d.getUTCSeconds() > 0));
  if (days === 0 && past) days = 7;
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(22, 0, 0, 0);
  return d.getTime() - offset;
}

async function getPuja(env) {
  let p = await env.PORRA.get(PUJA_KEY, "json");
  if (!p) return null;
  const now = Date.now();
  if (p.status === "open" && now >= p.closesAt) {
    const top = (p.bids || []).slice().sort((a, b) => b.amount - a.amount)[0] || null;
    p.status = "closed";
    p.winner = top ? { user: top.user, amount: top.amount } : null;
    await env.PORRA.put(PUJA_KEY, JSON.stringify(p));
  }
  return p;
}

async function createPuja(request, env, user) {
  if (!user) return json({ error: "Inicia sesion." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Datos invalidos" }, 400); }
  const player = String(body.player || "").trim().slice(0, 40);
  const base = Math.floor(Number(body.base));
  const photoRaw = String(body.photo || "").trim().slice(0, 600);
  const photo = /^https?:\/\/.+/i.test(photoRaw) ? photoRaw : "";
  if (!player) return json({ error: "Escribe el nombre del jugador." }, 400);
  if (!Number.isFinite(base) || base < 1000000) return json({ error: "El valor debe ser al menos 1.000.000." }, 400);
  const existing = await env.PORRA.get(PUJA_KEY, "json");
  if (existing && existing.status === "open") {
    return json({ error: "Ya hay una puja abierta. Espera a que termine." }, 409);
  }
  const now = Date.now();
  const p = {
    id: String(now),
    creator: user.name,
    creatorKey: user.key,
    player,
    base,
    photo,
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
  const p = await getPuja(env);
  if (!p) return json({ error: "No hay ninguna puja abierta." }, 404);
  if (p.status !== "open") return json({ error: "La puja ya ha terminado." }, 403);
  const now = Date.now();
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
    return json({ error: `La puja mínima es ${min.toLocaleString("es-ES")} €.` }, 400);
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
const PORRA_FIX_KEY = "porra:fixtures";
const PORRA_FIX_TTL = 30 * 60 * 1000;
const PRIZE_EXACT = 1000000;
const PRIZE_SIGN = 500000;

function porraSign(h, a) {
  return h > a ? 1 : h < a ? 2 : 0;
}

async function fetchTeamFixture(env, teamId) {
  const token = env.FOOTBALL_API_KEY;
  if (!token) return null;
  const now = Date.now();
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
  const url = `https://api.football-data.org/v4/teams/${teamId}/matches?dateFrom=${fmt(now - 3 * 86400000)}&dateTo=${fmt(now + 60 * 86400000)}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) return null;
  const j = await res.json();
  const list = (j.matches || []).filter((m) => m.utcDate);
  const cutoff = now - 48 * 3600000;
  const sorted = list.filter((m) => new Date(m.utcDate).getTime() >= cutoff).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const m = sorted[0] || list.sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))[0];
  if (!m) return null;
  const ft = (m.score && m.score.fullTime) || {};
  const hasResult = m.status === "FINISHED" && ft.home != null && ft.away != null;
  return {
    matchId: m.id,
    home: (m.homeTeam && m.homeTeam.name) || "",
    away: (m.awayTeam && m.awayTeam.name) || "",
    homeCrest: (m.homeTeam && m.homeTeam.crest) || "",
    awayCrest: (m.awayTeam && m.awayTeam.crest) || "",
    utcDate: m.utcDate,
    competition: (m.competition && m.competition.name) || "",
    status: m.status,
    result: hasResult ? { home: ft.home, away: ft.away } : null,
  };
}

async function getPorraFixtures(env) {
  const cached = await env.PORRA.get(PORRA_FIX_KEY, "json");
  if (cached && cached.updatedAt && Date.now() - cached.updatedAt < PORRA_FIX_TTL) return cached.items;
  const [rm, barca] = await Promise.all([fetchTeamFixture(env, TEAM_RM), fetchTeamFixture(env, TEAM_BARCA)]);
  const items = { rm, barca };
  if (rm || barca) {
    await env.PORRA.put(PORRA_FIX_KEY, JSON.stringify({ updatedAt: Date.now(), items }), { expirationTtl: 3600 });
    return items;
  }
  return (cached && cached.items) || items;
}

async function getPorraState(env, user) {
  const items = await getPorraFixtures(env);
  const now = Date.now();
  const defs = [
    { key: "rm", label: "Real Madrid", fix: items.rm },
    { key: "barca", label: "Barcelona", fix: items.barca },
  ];
  const matches = [];
  for (const d of defs) {
    const f = d.fix;
    if (!f) continue;
    const preds = (await env.PORRA.get(`porra:pred:${f.matchId}`, "json")) || {};
    const entries = Object.values(preds)
      .map((v) => {
        let prize = null;
        let tipo = "";
        if (f.result) {
          if (v.home === f.result.home && v.away === f.result.away) {
            prize = PRIZE_EXACT;
            tipo = "exacto";
          } else if (porraSign(v.home, v.away) === porraSign(f.result.home, f.result.away)) {
            prize = PRIZE_SIGN;
            tipo = "signo";
          } else prize = 0;
        }
        return { name: v.name, home: v.home, away: v.away, prize, tipo };
      })
      .sort((a, b) => (b.prize || 0) - (a.prize || 0) || String(a.name).localeCompare(String(b.name)));
    const started = now >= new Date(f.utcDate).getTime() || !["SCHEDULED", "TIMED"].includes(f.status);
    const my = user ? preds[user.key] : null;
    matches.push({
      key: d.key,
      label: d.label,
      matchId: f.matchId,
      home: f.home,
      away: f.away,
      homeCrest: f.homeCrest,
      awayCrest: f.awayCrest,
      utcDate: f.utcDate,
      competition: f.competition,
      status: f.status,
      result: f.result,
      started,
      entries,
      my: my ? { home: my.home, away: my.away } : null,
    });
  }
  return { user: user ? { name: user.name } : null, matches };
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
  const f = [items.rm, items.barca].find((x) => x && x.matchId === matchId);
  if (!f) return json({ error: "Partido no valido." }, 400);
  const started = Date.now() >= new Date(f.utcDate).getTime() || !["SCHEDULED", "TIMED"].includes(f.status);
  if (started) return json({ error: "El partido ya ha empezado." }, 403);
  const key = `porra:pred:${matchId}`;
  const preds = (await env.PORRA.get(key, "json")) || {};
  preds[user.key] = { name: user.name, home, away, updatedAt: new Date().toISOString() };
  await env.PORRA.put(key, JSON.stringify(preds), { expirationTtl: 60 * 24 * 3600 });
  return json({ ok: true, state: await getPorraState(env, user) });
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

export async function onRequestGet({ request, env, params }) {
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
    return json(await getPorraState(env, user));
  }
  if (path === "puja") {
    const p = await getPuja(env);
    return json({ puja: p, user: user ? { name: user.name } : null, nextTuesday: nextTuesday2200Utc(new Date()) });
  }
  if (path === "me") {
    return json({ user: user ? { name: user.name } : null });
  }
  if (path === "mercado") {
    return searchMercado(env, url.searchParams.get("q"));
  }
  return json({ error: "not found" }, 404);
}

export async function onRequestPost({ request, env, params }) {
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
  if (path === "puja/pujar") {
    const user = await getSessionUser(env, request);
    return placeBid(request, env, user);
  }
  if (path === "porra/predecir") {
    const user = await getSessionUser(env, request);
    return savePorraPred(request, env, user);
  }
  return json({ error: "not found" }, 404);
}
