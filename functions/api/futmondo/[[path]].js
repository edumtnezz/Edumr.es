const COMPETITION = "PD";
const CACHE_TTL_MS = 60 * 1000;
const DEFAULT_JORNADA_KEY = "config";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normApodo(v) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function apodoKey(v) {
  return normApodo(v).toLowerCase();
}

function resultFromScore(score) {
  if (!score || !score.fullTime) return null;
  const h = score.fullTime.home;
  const a = score.fullTime.away;
  if (h === null || a === null || h === undefined || a === undefined) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "X";
}

function mockJornada(matchday, finished) {
  const teams = [
    [["Real Madrid", 86], ["Barcelona", 81]],
    [["Atlético de Madrid", 78], ["Sevilla", 559]],
    [["Real Sociedad", 92], ["Athletic Club", 77]],
    [["Villarreal", 94], ["Valencia", 95]],
    [["Real Betis", 90], ["Girona", 298]],
    [["Celta de Vigo", 558], ["Osasuna", 79]],
    [["Rayo Vallecano", 87], ["Getafe", 82]],
    [["Mallorca", 89], ["Alavés", 263]],
    [["Las Palmas", 275], ["Espanyol", 80]],
    [["Leganés", 745], ["Valladolid", 250]],
  ];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const base = finished ? now - 6 * day : now + day;
  const official = ["1", "X", "2", "1", "2", "X", "1", "1", "X", "2"];
  const matches = teams.map((t, i) => {
    const utcDate = new Date(base + i * (day * 0.7));
    const started = utcDate.getTime() <= now;
    const isFinished = finished && started && utcDate.getTime() < now - 2 * hour;
    let score = { fullTime: { home: null, away: null } };
    if (isFinished) {
      const r = official[i];
      if (r === "1") score = { fullTime: { home: 2, away: 0 } };
      else if (r === "2") score = { fullTime: { home: 1, away: 2 } };
      else score = { fullTime: { home: 1, away: 1 } };
    }
    const home = t[0];
    const away = t[1];
    return {
      id: 9000 + matchday * 10 + i,
      utcDate: utcDate.toISOString(),
      status: isFinished ? "FINISHED" : started ? "IN_PLAY" : "SCHEDULED",
      homeTeam: {
        name: home[0],
        shortName: home[0],
        tla: home[0].split(" ")[0].slice(0, 3).toUpperCase(),
        crest: `https://crests.football-data.org/${home[1]}.png`,
      },
      awayTeam: {
        name: away[0],
        shortName: away[0],
        tla: away[0].split(" ")[0].slice(0, 3).toUpperCase(),
        crest: `https://crests.football-data.org/${away[1]}.png`,
      },
      score,
    };
  });
  return { matchday, source: finished ? "mock-demo" : "mock", matches };
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
      name: m.homeTeam && m.homeTeam.name,
      shortName: m.homeTeam && m.homeTeam.shortName,
      tla: m.homeTeam && m.homeTeam.tla,
      crest: m.homeTeam && m.homeTeam.crest,
    },
    awayTeam: {
      name: m.awayTeam && m.awayTeam.name,
      shortName: m.awayTeam && m.awayTeam.shortName,
      tla: m.awayTeam && m.awayTeam.tla,
      crest: m.awayTeam && m.awayTeam.crest,
    },
    score: m.score || { fullTime: { home: null, away: null } },
  }));
}

function firstKickoff(matches) {
  let min = null;
  for (const m of matches) {
    const t = new Date(m.utcDate).getTime();
    if (min === null || t < min) min = t;
  }
  return min;
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

async function getJornada(env, matchday, demo) {
  const kv = env.PORRA;
  const cacheKey = `jornada:${matchday || "current"}:${demo ? "demo" : "live"}`;
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
  if (!data) data = mockJornada(matchday || 1, !!demo);
  await kv.put(cacheKey, JSON.stringify({ fetchedAt: Date.now(), data }), {
    expirationTtl: 600,
  });
  return data;
}

async function getConfig(env) {
  const raw = await env.PORRA.get(DEFAULT_JORNADA_KEY, "json");
  return raw || {};
}

async function getPredictions(env, matchday, demo) {
  if (demo) {
    const seed = {
      edu: {
        __name: "Edu",
        9010: "1", 9011: "X", 9012: "2", 9013: "1", 9014: "2",
        9015: "X", 9016: "1", 9017: "1", 9018: "X", 9019: "2",
      },
      jasmin: {
        __name: "Jasmin",
        9010: "1", 9011: "1", 9012: "2", 9013: "2", 9014: "2",
        9015: "1", 9016: "X", 9017: "1", 9018: "X", 9019: "1",
      },
      "j m": {
        __name: "J M",
        9010: "2", 9011: "X", 9012: "1", 9013: "1", 9014: "X",
        9015: "X", 9016: "1", 9017: "2", 9018: "1", 9019: "2",
      },
    };
    return seed;
  }
  const raw = await env.PORRA.get(`pred:${matchday}`, "json");
  return raw || {};
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

async function buildState(env, matchday, apodo, demo) {
  const jornada = await getJornada(env, matchday, demo);
  const matches = jornada.matches || [];
  const lock = lockTimeOf(matches);
  const locked = lock !== null && Date.now() >= lock;
  const preds = await getPredictions(env, jornada.matchday, demo);

  const results = {};
  for (const m of matches) {
    const r = resultFromScore(m.score);
    if (r) results[m.id] = r;
  }

  const standings = Object.entries(preds)
    .map(([key, picks]) => {
      let points = 0;
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
        if (pick === r) {
          points++;
          hits++;
        }
      }
      return {
        key,
        name: picks.__name || key,
        points,
        hits,
        played,
        total,
        missed: played - hits,
      };
    })
    .sort((a, b) => b.points - a.points || b.hits - a.hits || a.name.localeCompare(b.name));

  const me = apodo ? preds[apodoKey(apodo)] || null : null;

  const outMatches = matches.map((m) => ({
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
    result: results[m.id] || null,
    score:
      m.score && m.score.fullTime
        ? { home: m.score.fullTime.home, away: m.score.fullTime.away }
        : null,
  }));

  const myPicks = me
    ? matches
        .filter((m) => me[m.id])
        .map((m) => {
          const pick = me[m.id];
          const r = results[m.id] || null;
          const home = m.homeTeam && (m.homeTeam.shortName || m.homeTeam.name);
          const away = m.awayTeam && (m.awayTeam.shortName || m.awayTeam.name);
          return {
            matchId: m.id,
            pick,
            result: r,
            correct: r ? pick === r : null,
            home,
            away,
            homeCrest: m.homeTeam && m.homeTeam.crest,
            awayCrest: m.awayTeam && m.awayTeam.crest,
          };
        })
    : [];

  return {
    matchday: jornada.matchday,
    source: jornada.source,
    lockTime: lock,
    locked,
    matches: outMatches,
    myPicks,
    myName: me ? me.__name || null : null,
    standings,
    players: standings.length,
  };
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const path = (params.path || []).join("/");
  const matchday = url.searchParams.get("jornada");
  const apodo = url.searchParams.get("apodo");
  const demo = url.searchParams.get("demo") === "1";

  if (path === "state" || path === "") {
    const state = await buildState(env, matchday, apodo, demo);
    return json(state);
  }
  return json({ error: "not found" }, 404);
}

export async function onRequestPost({ request, env, params }) {
  const path = (params.path || []).join("/");
  if (path !== "prediccion") return json({ error: "not found" }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const apodo = normApodo(body.apodo);
  const picks = body.picks;
  if (!apodo || apodo.length < 2) return json({ error: "Apodo demasiado corto" }, 400);
  if (!picks || typeof picks !== "object") return json({ error: "Pronósticos inválidos" }, 400);

  const jornada = await getJornada(env, body.jornada);
  const matches = jornada.matches || [];
  const lock = lockTimeOf(matches);
  if (lock !== null && Date.now() >= lock) {
    return json({ error: "La jornada ya ha comenzado. Apuestas bloqueadas." }, 403);
  }

  const validIds = new Set(matches.map((m) => m.id));
  const clean = {};
  for (const [id, pick] of Object.entries(picks)) {
    const mid = Number(id);
    if (!validIds.has(mid)) continue;
    if (!["1", "X", "2"].includes(pick)) continue;
    clean[mid] = pick;
  }

  const key = `pred:${jornada.matchday}`;
  const all = (await env.PORRA.get(key, "json")) || {};
  const ak = apodoKey(apodo);
  all[ak] = { __name: apodo, ...clean };
  await env.PORRA.put(key, JSON.stringify(all));

  const state = await buildState(env, String(jornada.matchday), apodo);
  return json({ ok: true, state });
}