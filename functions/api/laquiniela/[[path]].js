const COMPETITION = "PD";
const CACHE_TTL_MS = 60 * 1000;
const FORM_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 24 * 400;
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
  if (cached && Date.now() - (cached.at || 0) < MARKET_TTL_MS) return cached;
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
      fitness: (p.average && p.average.fitness) || [],
      photo: p.photo ? FACE_BASE + p.photo : "",
      logo: tm.logo ? LOGO_BASE + tm.logo : "",
    };
  });
  const out = { at: Date.now(), players };
  await env.PORRA.put(MARKET_KEY, JSON.stringify(out), { expirationTtl: 1800 });
  return out;
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
    players = players.map((p) => { const e = ffPick(p.name, map); return e ? { ...p, prob: e.prob, rivalFf: e.rival, casaFf: e.casa } : p; });
  } catch (e) {}
  const query = stripAccents(String(q || "").toLowerCase().trim());
  let list = players;
  if (query) list = players.filter((p) => stripAccents(p.name.toLowerCase()).includes(query));
  list = list.slice().sort((a, b) => b.value - a.value);
  const limit = query ? 80 : 700;
  return json({ players: list.slice(0, limit), updatedAt: cache.at || null });
}

const FF_MARKET_URL = "https://www.futbolfantasy.com/analytics/futmondo/mercado/social";
const FF_MAP_KEY = "ff:map2";

async function ffMap(env) {
  try {
    const c = await env.PORRA.get(FF_MAP_KEY, "json");
    if (c && c.map && Date.now() - (c.at || 0) < 6 * 3600 * 1000) return c.map;
  } catch (e) {}
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
    map[key] = { id: idm[1], prob: pm ? Number(pm[1]) : null, rival, casa, jornada };
  }
  if (Object.keys(map).length > 50) {
    try { await env.PORRA.put(FF_MAP_KEY, JSON.stringify({ at: Date.now(), map })); } catch (e) {}
  }
  return map;
}

function ffPick(name, map) {
  const n = normKey(String(name || "").toLowerCase());
  if (!n) return null;
  if (map[n]) return map[n];
  const keys = Object.keys(map);
  const ends = keys.filter((k) => k.endsWith(" " + n));
  if (ends.length === 1) return map[ends[0]];
  const words = n.split(" ");
  const last = words[words.length - 1];
  if (last.length >= 4) {
    const byLast = keys.filter((k) => k.split(" ").pop() === last);
    if (byLast.length === 1) return map[byLast[0]];
  }
  const cont = keys.filter((k) => k.split(" ").indexOf(n) >= 0 || k.includes(" " + n + " "));
  if (cont.length === 1) return map[cont[0]];
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
  return pts.length >= 2 ? pts : null;
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function cleanArticle(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/ on\w+='[^']*'/gi, "")
    .replace(/ style="[^"]*"/gi, "")
    .replace(/<div class="[^"]*(btn-|share|whatsapp|twitter|facebook|autor|cargo|fecha|header-author)[^"]*"[\s\S]*?<\/div>/gi, "")
    .trim();
}

function cleanBrand(s) {
  return String(s || "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<div class="block-new">[\s\S]*?(?=<p)/gi, "")
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
  try { await env.PORRA.put(key, img, { expirationTtl: 43200 }); } catch (e) {}
  return img;
}

async function getFfNoticias(env) {
  try {
    const res = await fetch("https://www.futbolfantasy.com/laliga/noticias", { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    const html = await res.text();
    const out = [];
    const EX = /(jerarqu|internacional|convoc|entrenador|t[eé]cnico|rueda de prensa|declaraci|palabras|gu[ií]a|onces?|alineaci|cr[oó]nica|amistoso|camiseta|equipaci|predicci|apuestas)/i;
    for (const part of html.split('<div class="noticia">').slice(1)) {
      const block = part.slice(0, 600);
      const date = ((block.match(/class="date">([^<]*)</) || [])[1] || "").trim();
      const link = (block.match(/<a[^>]+href="([^"]+)"/) || [])[1] || "";
      const title = ((block.match(/<a[^>]*>([^<]+)<\/a>/) || [])[1] || "").trim();
      if (link && title && !EX.test(title)) out.push({ date, link, title, thumb: "" });
      if (out.length >= 15) break;
    }
    if (env) await Promise.all(out.map(async (x) => { x.thumb = await ogThumb(env, x.link); }));
    return out;
  } catch (e) {
    return [];
  }
}

async function getNoticia(url) {
  if (!/^https:\/\/www\.futbolfantasy\.com\//.test(String(url || ""))) return { error: "no permitido" };
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
  const html = await res.text();
  const title = ((html.match(/<h1[^>]*class="[^"]*titulo[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const lead = ((html.match(/<p[^>]*class="[^"]*entradilla[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
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

async function playerFicha(env, id) {
  if (!id) return { error: "falta id" };
  const header = await futbolHeader(env);
  const r = await futbolPost("/2/player/matches", header, { playerId: id, championshipId: FUTMONDO_CHAMPIONSHIP });
  const a = r.answer || {};
  const pl = a.player || {};
  const matches = (a.matches || []).map((m) => {
    const po = (m.ps && m.ps.po) || [];
    const g = (mode) => { const z = po.find((k) => k.mode === mode); return z ? Number(z.p) || 0 : 0; };
    return {
      r: m.r || 0,
      home: (m.h && m.h.name) || "", hs: m.h ? m.h.score : null,
      away: (m.a && m.a.name) || "", as: m.a ? m.a.score : null,
      date: (m.info && m.info.date) || "",
      finished: m.st === "F",
      stats: g("stats"), picas: g("picas"), ff: g("ff"), ss: g("ss"), as: g("as"), marca: g("marca"),
    };
  }).slice(0, 60);
  const todayVal = Number(pl.value) || 0;
  let temporadas = [];
  try {
    const ls = await futbolPost("/2/player/lastseasons", header, { playerId: id, championshipId: FUTMONDO_CHAMPIONSHIP });
    const arr = Array.isArray(ls.answer) ? ls.answer : ((ls.answer && (ls.answer.seasons || ls.answer.lastseasons)) || []);
    temporadas = arr.map((x) => {
      const lg = x.league || {};
      const byMode = {};
      (x.points || []).forEach((z) => { byMode[z.mode] = z; });
      const pick = byMode.stats || byMode.press || byMode.presstats || (x.points && x.points[0]) || null;
      const t = (pick && pick.t) || {};
      const tot = Number(t.p) || 0;
      const games = t.games != null ? Number(t.games) : (Number((pick && pick.h && pick.h.games) || 0) + Number((pick && pick.a && pick.a.games) || 0));
      return {
        season: lg.season || "",
        league: lg.name || "",
        team: (x.teams && x.teams[0] && x.teams[0].name) || "",
        points: tot,
        games,
        media: games ? Math.round((tot / games) * 10) / 10 : 0,
      };
    }).filter((x) => x.season).slice(0, 8);
  } catch (e) {}
  const ptsSum = matches.reduce((s, m) => s + (Number(m.stats) || 0), 0);
  const played = matches.length;
  const order = [["Hoy", 0], ["Ayer", 1], ["2 días", 2], ["3 días", 3], ["5 días", 5], ["10 días", 10], ["14 días", 14], ["30 días", 30]];
  let serie = null, temporada = null;
  try {
    serie = await ffSeason(env, pl.name || "");
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
  const fitArr = (pl.average && pl.average.fitness) || [];
  return {
    id,
    name: pl.name || "",
    role: pl.role || "",
    role2: pl.role2 || "",
    value: todayVal,
    change: Number(pl.change) || 0,
    status: pl.status || "",
    points: ptsSum,
    average: played ? ptsSum / played : 0,
    matches5: played,
    fitness: fitArr,
    pronostico: pronosticoFor({ status: pl.status, fitness: fitArr }),
    team: (a.team && a.team.name) || pl.team || "",
    logo: pl.logo ? LOGO_BASE + pl.logo : "",
    photo: pl.photo ? FACE_BASE + pl.photo : "",
    matches,
    valores,
    temporada,
    temporadas,
  };
}

async function getNoticias(env) {
  const out = { noticias: [], locker: [] };
  out.noticias = await getFfNoticias(env);
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
  return out;
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
  return stripAccents(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && ["de", "del", "cf", "fc", "club", "sad", "sd", "ud", "rcd", "balompie"].indexOf(w) < 0).join("");
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
  p = players.find((x) => { const n = normKey(x.name); return q.length >= 4 && (n.includes(q) || q.includes(n)); });
  if (p) return p;
  const qT = q.split(" ").filter((t) => t.length >= 4);
  if (qT.length === 1) {
    const qt = qT[0];
    const cands = players.filter((pl) => normKey(pl.name).split(" ").some((nt) => nt.length >= 4 && lev(qt, nt) <= 1));
    return cands.length === 1 ? cands[0] : null;
  }
  let best = null, bestScore = 0;
  for (const pl of players) {
    const nT = normKey(pl.name).split(" ");
    let score = 0;
    for (const qt of qT) for (const nt of nT) {
      if (nt === qt) score += 3;
      else if (nt.startsWith(qt) || qt.startsWith(nt)) score += 2;
      else if (lev(qt, nt) <= 1) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = pl; }
  }
  return bestScore >= 3 ? best : null;
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

async function handleAnaliza(request, env, user) {
  if (!user) return json({ error: "Inicia sesión para analizar tu equipo." }, 401);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Datos inválidos." }, 400); }
  let team = null, leido = [];
  if (Array.isArray(body.jugadores) && body.jugadores.length) {
    const tit = [], sup = [];
    for (const j of body.jugadores) {
      const nombre = String(j.nombre || "").trim();
      if (!nombre) continue;
      const o = { nombre, pos: roleShort(j.pos) };
      if (j.tipo === "suplente") sup.push(o); else tit.push(o);
    }
    if (!tit.length && !sup.length) return json({ error: "Sin jugadores." }, 400);
    team = { titulares: tit, suplentes: sup };
    leido = [].concat(tit, sup).map((x) => x.nombre);
  } else {
    const img = String(body.img || "");
    if (!/^data:image\//.test(img) || img.length > 7000000) return json({ error: "Sube una captura de tu equipo (JPG/PNG)." }, 400);
    const visionRaw = await dsChat(env, [{
      role: "user",
      content: [
        { type: "text", text: "Esta imagen es la captura de un equipo de fútbol fantasy dibujado sobre un campo verde. Cada jugador tiene una FOTO con su NOMBRE justo debajo. Lee los nombres con mucha atención (ignora marcas de agua). Responde SOLO con un JSON: {\"titulares\":[{\"nombre\":\"...\",\"linea\":1}],\"suplentes\":[{\"nombre\":\"...\"}]}. 'linea' = fila del campo CONTANDO DE ABAJO A ARRIBA: 1 = portero (abajo del todo), 2 = defensas, 3 = centrocampistas, 4 = delanteros (arriba). Cuenta bien cuántos hay en cada fila (ej.: arriba 3 delanteros, luego 4 medios, luego 3 defensas y 1 portero = 3-4-3). Sé literal con los nombres y no inventes jugadores." },
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
    if (!team) {
      const raw2 = await dsChat(env, [{
        role: "user",
        content: [
          { type: "text", text: "Mira la imagen otra vez con calma y responde ÚNICAMENTE con el JSON pedido ({\"formacion\":\"...\",\"titulares\":[{\"nombre\":\"...\",\"pos\":\"...\"}],\"suplentes\":[...]}), sin nada de texto extra." },
          { type: "image_url", image_url: { url: img } },
        ],
      }], "deepseek-flash", true);
      team = parseTeam(raw2);
    }
    if (!team) return json({ error: "No pude leer el equipo de la captura. Prueba con una captura más nítida (sin recortar).", raw: String(visionRaw).slice(0, 300) }, 422);
    leido = [].concat(team.titulares || [], team.suplentes || []).map((x) => String(x.nombre || x.name || "").trim()).filter(Boolean);
    const LINE_POS = { 1: "POR", 2: "DEF", 3: "CEN", 4: "DEL" };
    team.titulares = (team.titulares || []).map((x) => ({ nombre: String(x.nombre || x.name || "").trim(), pos: roleShort(x.pos) || LINE_POS[Number(x.linea)] || "" })).filter((x) => x.nombre);
    team.suplentes = (team.suplentes || []).map((x) => ({ nombre: String(x.nombre || x.name || "").trim(), pos: roleShort(x.pos) || "" })).filter((x) => x.nombre);
  }

  let market = { players: [] };
  try { market = await getMarketPlayers(env); } catch (e) {}
  const findP = (n) => bestPlayer(n, market.players || []);
  let next = {};
  try { next = await nextMatches(env); } catch (e) {}
  let ffm = {};
  try { ffm = await ffMap(env); } catch (e) {}
  const matchTeam = (t) => {
    const q = teamKey(t);
    if (!q) return null;
    const keys = Object.keys(next);
    const k = keys.find((x) => teamKey(x) === q) || keys.find((x) => { const kk = teamKey(x); return kk && (kk.includes(q) || q.includes(kk)); });
    return k ? next[k] : null;
  };
  const enrich = (list) => (list || []).map((pl) => {
    const nm = String(pl.nombre || pl.name || "").trim();
    const p = findP(nm);
    const mt = p ? matchTeam(p.team) : null;
    const ffe = ffPick(nm, ffm);
    const probFf = ffe && ffe.prob != null ? ffe.prob : null;
    return {
      nombre: nm,
      pos: roleShort(pl.pos) || (p ? roleShort(p.role) : ""),
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
      rival: (ffe && ffe.rival) ? ffe.rival : (mt ? mt.rival : ""),
      casa: (ffe && ffe.casa != null) ? ffe.casa : (mt ? mt.home : null),
      fecha: mt ? mt.date : "",
    };
  });
  const titulares = enrich(team.titulares);
  const suplentes = enrich(team.suplentes);
  const cnt = (pos) => titulares.filter((p) => p.pos === pos).length;
  const formacion = (cnt("DEF") + cnt("CEN") + cnt("DEL")) ? [cnt("DEF"), cnt("CEN"), cnt("DEL")].join("-") : (team.formacion || "");
  const line = (p) => `- ${p.pos}${p.pos2 ? "/" + p.pos2 : ""} ${p.nombre} (${p.equipo || "?"}) · ${p.estado} · prob.jugar ${p.prob != null ? p.prob : "?"}%${p.probFf != null ? " (FutbolFantasy)" : ""} · ${p.puntos != null ? p.puntos + " pts" : "sin datos"} · últ5 ${(p.fitness || []).join("-")} · rival ${p.rival || "desconocido"} ${p.casa === true ? "(CASA)" : p.casa === false ? "(FUERA)" : ""}`;
  const ctx = "FORMACIÓN: " + formacion + "\nTITULARES:\n" + titulares.map(line).join("\n") + "\nBANQUILLO:\n" + suplentes.map(line).join("\n");
  const prompt = "Eres un analista experto de fútbol fantasy, especializado en las REGLAS de Futmondo Social. Te doy el equipo del usuario con cada jugador: posiciones (si tiene dos, separadas por '/'), estado, probabilidad de ser titular, puntos de la temporada, últimos 5 partidos y si su equipo juega en CASA o FUERA.\n\n" + ctx + "\n\nDa un análisis BREVE en español, AGRADABLE, con emojis y palabras en **negrita**. PROHIBIDO usar almohadillas (#), tablas o líneas de guiones. Máximo 10 líneas cortas. Incluye:\n1) TITULARES vs BANQUILLO: di claramente quién debería JUGAR de inicio y quién sentarse (la liga permite hacer cambios de banquillo). Ordena por probabilidad de jugar y forma.\n2) MULTIPOSICIÓN: para cada jugador con dos posiciones (ej. DEL/CEN), di en qué posición alinearlo para sacar MÁS puntos según Futmondo (gol/asistencia desde más atrás puntúa más; defensas suman por portería a cero). Sé concreto: 'pon a X de CEN'.\n3) 2-3 cambios concretos (a quién sentar y a quién poner), mirando estado, forma, probabilidad y si juega en casa.\n4) Si conviene cambiar de formación y a cuál.\n5) Un once ideal, cada jugador en su MEJOR posición. Sé directo.";
  const analisis = await dsChat(env, [{ role: "user", content: prompt }], "deepseek-flash");
  return json({ formacion, titulares, suplentes, analisis, leido });
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
    let hist = await env.PORRA.get("fmhist", "json");
    if (!hist || !Array.isArray(hist.days)) hist = { days: [] };
    const last = hist.days[hist.days.length - 1];
    if (last && last.d === today) return;
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

// Ventana de subasta: lunes 00:00 -> martes 22:00 (hora de Madrid)
function inPujaWindow(now) {
  const { d } = madrid(now);
  const wd = d.getUTCDay(); // 0 dom, 1 lun, 2 mar
  return wd === 1 || (wd === 2 && d.getUTCHours() < 22);
}

// Próxima apertura (siguiente lunes 00:00, hora de Madrid)
function nextWindowOpenUtc(now) {
  const { d, offset } = madrid(now);
  let days = (1 - d.getUTCDay() + 7) % 7;
  if (days === 0) days = 7;
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
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
  if (!inPujaWindow(new Date())) {
    return json({ error: "La subasta solo se puede abrir de lunes 00:00 a martes 22:00 (hora de Madrid)." }, 403);
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
const PORRA_FIX_KEY = "porra:fixtures";
const PORRA_HIST_KEY = "porra:history";
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
  const history = (await env.PORRA.get(PORRA_HIST_KEY, "json")) || [];
  return { user: user ? { name: user.name } : null, matches, history };
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
          return json({ puja: pj || null, user: user ? { name: user.name } : null, nextTuesday: nextTuesday2200Utc(new Date()), nextWindow: nextWindowOpenUtc(new Date()), inWindow: inPujaWindow(new Date()), history: hist });
        }
      } catch (e) {}
    }
    const p = await getPuja(env);
    const history = await getPujaHistory(env);
    return json({ puja: p, user: user ? { name: user.name } : null, nextTuesday: nextTuesday2200Utc(new Date()), nextWindow: nextWindowOpenUtc(new Date()), inWindow: inPujaWindow(new Date()), history });
  }
  if (path === "me") {
    return json({ user: user ? { name: user.name } : null });
  }
  if (path === "mercado") {
    return searchMercado(env, url.searchParams.get("q"));
  }
  if (path === "noticias") {
    return json(await getNoticias(env));
  }
  if (path === "noticia") {
    return json(await getNoticia(url.searchParams.get("u")));
  }
  if (path === "jugador") {
    return json(await playerFicha(env, url.searchParams.get("id")));
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
  if (path === "analiza") {
    const user = await getSessionUser(env, request);
    return handleAnaliza(request, env, user);
  }
  if (path === "puja/pujar") {
    const user = await getSessionUser(env, request);
    return placeBid(request, env, user);
  }
  if (path === "puja/reset") {
    const user = await getSessionUser(env, request);
    if (!user) return json({ error: "Inicia sesion." }, 401);
    const stub = pujaStub(env);
    if (stub) {
      try {
        const r = await stub.fetch("https://do/reset", { method: "POST" });
        return json(await r.json());
      } catch (e) {}
    }
    await env.PORRA.delete(PUJA_KEY);
    return json({ ok: true });
  }
  if (path === "porra/predecir") {
    const user = await getSessionUser(env, request);
    return savePorraPred(request, env, user);
  }
  return json({ error: "not found" }, 404);
}
