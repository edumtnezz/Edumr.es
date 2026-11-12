// Prueba de API-Football (api-sports.io): ¿da las bajas de LaLiga de esta temporada con nuestra clave?
// Solo guarda un resumen en KV para poder mirarlo desde /api/laquiniela/apifootball-prueba. Nunca guarda la clave
// ni los datos de la cuenta. Gasta 2 peticiones por pasada (el plan gratis da 100 al día) y se repite cada 6 h.
const K = "apif:prueba:v1";
const BASE = "https://v3.football.api-sports.io";

export function resumenBajas(resp) {
  const arr = Array.isArray(resp) ? resp : [];
  const fechas = arr.map((x) => (x && x.fixture && x.fixture.date) || "").filter(Boolean).sort();
  const porTipo = {};
  for (const x of arr) { const t = String((x && x.player && x.player.type) || "?"); porTipo[t] = (porTipo[t] || 0) + 1; }
  // Las más recientes primero: es lo que sirve para comparar con Futmondo
  const orden = arr.slice().sort((a, b) => String((b.fixture || {}).date || "").localeCompare(String((a.fixture || {}).date || "")));
  return {
    n: arr.length, porTipo, primeraFecha: fechas[0] || null, ultimaFecha: fechas[fechas.length - 1] || null,
    muestra: orden.slice(0, 60).map((x) => ({ jugador: (x.player || {}).name || null, equipo: (x.team || {}).name || null, tipo: (x.player || {}).type || null, motivo: (x.player || {}).reason || null, partido: (x.fixture || {}).date || null })),
  };
}

export async function probarApiFootball(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  let prev = null;
  try { prev = await env.PORRA.get(K, "json"); } catch (e) {}
  const key = String(env.API_FOOTBALL_KEY || "").trim();
  if (!key) {
    if (prev && prev.sinClave && now - prev.at < 600000) return { skipped: "sin clave" };
    await env.PORRA.put(K, JSON.stringify({ at: now, sinClave: true }));
    return { sinClave: true };
  }
  if (prev && !prev.sinClave && now - prev.at < 6 * 3600000) return { skipped: "reciente" };
  const out = { at: now, sinClave: false };
  const get = async (p) => {
    try {
      const r = await f(BASE + p, { headers: { "x-apisports-key": key } });
      const j = await r.json().catch(() => null);
      return { http: r.status, errors: j && j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length) ? j.errors : null, results: j ? j.results : null, response: j ? j.response : null };
    } catch (e) { return { http: 0, errors: String(e && e.message || e).slice(0, 160), response: null }; }
  };
  // /status no cuenta para el cupo diario
  const st = await get("/status");
  const s = st.response || {};
  out.cuenta = { http: st.http, errors: st.errors, plan: (s.subscription || {}).plan || null, activo: (s.subscription || {}).active ?? null, usadasHoy: (s.requests || {}).current ?? null, limiteDia: (s.requests || {}).limit_day ?? null };
  const lg = await get("/leagues?id=140&current=true");
  const temp = (((lg.response || [])[0] || {}).seasons || []).find((x) => x && x.current) || null;
  out.liga = { http: lg.http, errors: lg.errors, temporada: temp ? temp.year : null, cubreBajas: temp && temp.coverage ? temp.coverage.injuries ?? null : null };
  if (temp && temp.year) {
    const inj = await get("/injuries?league=140&season=" + temp.year);
    out.bajas = Object.assign({ http: inj.http, errors: inj.errors }, resumenBajas(inj.response));
  }
  await env.PORRA.put(K, JSON.stringify(out));
  return out;
}
