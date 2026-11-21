// Convocatorias oficiales (21/11/2026): mira la web de cada club que deja leer y que publica los nombres,
// y cuando sale una lista nueva escribe un artículo propio (quién entra, quién se queda fuera). KV `conv:v1`.
import { CLUBES, urlsConvocatoria, leerConvocatoria, partidoDe, emparejarLista, articuloConvocatoria } from "../../functions/_lib/convocatorias.mjs";

const OWN_KEY = "own:news:v2", K = "conv:v1";
const UA = { "user-agent": "Mozilla/5.0 (compatible; edumr.es; contacto en la web)" };
const ESPERA = 5 * 60000; // como mucho una pasada cada 5 minutos: son páginas de los clubes, no de nosotros

export async function vigilarConvocatorias(env, f = fetch, now = Date.now()) {
  if (!env || !env.PORRA) return { skipped: "sin kv" };
  const st = (await env.PORRA.get(K, "json")) || { done: {}, club: {}, at: 0 };
  if (now - (st.at || 0) < ESPERA) return { skipped: "no toca" };
  st.at = now;
  const get = (p) => f("https://edumr.es/api/laquiniela/" + p, { headers: { "user-agent": "edumr-cron" } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [mk, jor] = await Promise.all([get("mercado"), get("jornada")]);
  const ps = mk && Array.isArray(mk.players) ? mk.players : [];
  if (ps.length < 300 || !jor || !Array.isArray(jor.matches)) { await env.PORRA.put(K, JSON.stringify(st)); return { error: "sin mercado o jornada" }; }
  let own = null, nuevas = 0;
  for (const club of CLUBES) {
    try {
      const rl = await f(club.lista, { headers: UA });
      if (!rl.ok) continue;
      // Solo se mira la más reciente (la primera de la lista); si ya está hecha no se vuelve a leer
      const url = urlsConvocatoria(club, await rl.text())[0];
      if (!url || st.done[url]) continue;
      const ra = await f(url, { headers: UA });
      if (!ra.ok) continue;
      const c = leerConvocatoria(await ra.text());
      if (!c) { st.done[url] = now; continue; } // sin lista de nombres: no es una convocatoria
      // Solo si es de LaLiga: el rival citado por el club tiene que ser el de nuestro próximo partido
      const partido = partidoDe(jor, club.team, c.titulo + " " + c.resumen + " " + url.replace(/-/g, " "));
      if (!partido) { st.done[url] = now; continue; }
      const { ids, sinEmparejar } = emparejarLista(c.puestos, club.team, ps);
      const prevIds = st.club[club.key] && st.club[club.key].jornada !== partido.jornada ? new Set(st.club[club.key].ids) : null;
      const a = articuloConvocatoria({ club, convocados: ids, sinEmparejar, prev: prevIds, partido, ps });
      st.done[url] = now;
      if (!a) continue;
      own = own || ((await env.PORRA.get(OWN_KEY, "json")) || []);
      own = own.filter((x) => x.id !== a.id);
      const pub = c.publicada && !isNaN(Date.parse(c.publicada)) ? Math.min(now, Date.parse(c.publicada)) : now;
      own.unshift({ id: a.id, title: a.title, lead: a.lead, body: a.body, status: "published", createdAt: now, publishedAt: pub, thumb: "", club: club.team, players: a.players, tipo: "articulo", auto: "articulo", art: "artconv", f: 1, fp: (a.body.match(/^@ (\S+) \|/m) || [])[1] || "" });
      st.club[club.key] = { jornada: partido.jornada, ids: [...ids], at: now, url };
      nuevas++;
    } catch (e) { console.error("convocatoria", club.key, String(e && e.message || e).slice(0, 120)); }
  }
  if (own) { own.sort((x, y) => (y.publishedAt || 0) - (x.publishedAt || 0)); await env.PORRA.put(OWN_KEY, JSON.stringify(own.slice(0, 300))); }
  const ks = Object.keys(st.done);
  if (ks.length > 200) for (const k of ks.sort((a, b) => st.done[a] - st.done[b]).slice(0, ks.length - 150)) delete st.done[k];
  await env.PORRA.put(K, JSON.stringify(st));
  return { nuevas };
}
