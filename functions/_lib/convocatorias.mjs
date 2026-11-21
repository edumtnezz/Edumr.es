// Convocatorias oficiales de los clubes (21/11/2026): la lista de convocados que cada club publica en SU web.
// Solo se usan hechos (quién está en la lista) y se escriben con palabras propias; nunca se copia el texto del club.
// Solo clubes cuya web deja leer a programas (robots.txt) y que publican los nombres en el propio texto.
import { emparejar, norm, clubKey } from "./estados.mjs";

// Cómo encontrar la convocatoria en la web de cada club. `enlace` saca la URL del artículo de la página de noticias.
export const CLUBES = [
  { key: "realmadrid", team: "Real Madrid", lista: "https://www.realmadrid.com/es-ES/noticias", enlace: /href="((?:https:\/\/www\.realmadrid\.com)?\/es-ES\/noticias\/futbol\/primer-equipo\/convocatorias\/[^"#?]+)"/g, base: "https://www.realmadrid.com" },
  { key: "betis", team: "Real Betis", lista: "https://www.realbetisbalompie.es/noticias/actualidad", enlace: /href="((?:https:\/\/www\.realbetisbalompie\.es)?\/noticias\/actualidad\/lista-de-convocados[^"#?]+)"/g, base: "https://www.realbetisbalompie.es" },
];

export function urlsConvocatoria(club, html) {
  const out = [];
  for (const m of String(html || "").matchAll(club.enlace)) {
    const u = m[1].startsWith("http") ? m[1] : club.base + m[1];
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

const ent = (s) => String(s).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ");
export function lineas(html) {
  const s = String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "");
  return ent(s.replace(/<[^>]+>/g, "\n")).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const meta = (html, p) => { const m = String(html || "").match(new RegExp('<meta[^>]+property="' + p + '"[^>]+content="([^"]*)"', "i")); return m ? ent(m[1]) : ""; };

const PUESTOS = { porteros: 1, defensas: 2, centrocampistas: 3, delanteros: 4 };
const FIN = /^(temas relacionados|« noticia anterior|noticia anterior|nuestros partners|compartir|comparte en)/i;

// Texto de la convocatoria → { puestos: { 1: [nombres], 2: […], 3: […], 4: […] } } (o null si no se reconoce)
export function parsearLista(html) {
  const L = lineas(html), puestos = { 1: [], 2: [], 3: [], 4: [] };
  let pos = 0, n = 0, previas = [];
  for (const l of L) {
    const h = norm(l.replace(/:$/, ""));
    if (PUESTOS[h] && /:\s*$/.test(l)) { if (!pos) previas = L.slice(Math.max(0, L.indexOf(l) - 8), L.indexOf(l)); pos = PUESTOS[h]; continue; }
    if (!pos) continue;
    if (FIN.test(l)) break;
    for (const raw of l.split(/,|\s+y\s+/)) {
      const nombre = raw.trim().replace(/\.$/, "").replace(/^y\s+/i, "").trim();
      if (nombre.length >= 3 && nombre.length <= 40 && !/:$/.test(nombre)) { puestos[pos].push(nombre); n++; }
    }
  }
  return n >= 11 ? { puestos, total: n, intro: previas.join(" ") } : null;
}

// Datos de la página: título, hora de publicación y lista. Sin lista reconocible → null.
export function leerConvocatoria(html) {
  const lista = parsearLista(html);
  if (!lista) return null;
  const t = lineas(html).find((l) => /convocad|convocatoria/i.test(l) && l.length < 140) || "";
  const pub = meta(html, "article:published_time") || ((String(html).match(/(20\d\d-\d\d-\d\d[ T]\d\d:\d\d)/) || [])[1] || "").replace(" ", "T");
  return { titulo: meta(html, "og:title") || t, resumen: (meta(html, "og:description") || "") + " " + lista.intro, publicada: pub, ...lista };
}

// ¿A qué partido de LaLiga se refiere? Siguiente partido de su equipo en la jornada, y solo si el rival sale citado en el texto del club.
export function partidoDe(jor, team, textoClub) {
  const k = clubKey(team), txt = norm(textoClub).replace(/ /g, "");
  for (const m of (jor && jor.matches) || []) {
    if (m.live && m.live.state === "final") continue;
    const casa = clubKey(m.home) === k, fuera = clubKey(m.away) === k;
    if (!casa && !fuera) continue;
    const rival = casa ? m.away : m.home;
    if (!txt.includes(clubKey(rival))) return null; // es de otra competición
    return { jornada: jor.matchday, rival, casa };
  }
  return null;
}

const ROL = { 1: "portero", 2: "defensa", 3: "centrocampista", 4: "delantero" };
// Une la lista del club con los jugadores de Futmondo del equipo. `sinEmparejar` = nombres que no se han podido identificar.
export function emparejarLista(puestos, team, fmPlayers) {
  const bw = [], pos = {};
  for (const p of [1, 2, 3, 4]) for (const nombre of puestos[p] || []) { const id = bw.length + 1; bw.push({ id, name: nombre, teamID: 1, position: p }); pos[id] = nombre; }
  const m = emparejar(bw, { 1: { name: team } }, fmPlayers, { estricto: true });
  const ids = new Set(), sinEmparejar = [];
  for (const b of bw) { const f = m.get(b.id); if (f) ids.add(String(f.id)); else sinEmparejar.push(b.name); }
  return { ids, sinEmparejar };
}

const fila = (p, grande, pie, nota) => "@ " + p.id + " | " + String(p.name).replace(/\|/g, " ") + " | " + grande + " | " + pie + " | " + (nota || "-");
const chip = (rot, val, tono, det) => "= " + rot + " | " + val + " | " + tono + " | " + (det || "-");

// Artículo propio: quién entra y quién se queda fuera. `ps` = jugadores de Futmondo; `prev` = ids de la convocatoria anterior de ese club (o null).
// `est` (opcional) = registro propio de estados { id: { e } } para decir que la baja ya se conocía.
export function articuloConvocatoria({ club, convocados, sinEmparejar, prev, partido, ps, est }) {
  const k = clubKey(club.team);
  const plantilla = (ps || []).filter((p) => clubKey(p.team) === k);
  if (!plantilla.length || !convocados.size) return null;
  const en = plantilla.filter((p) => convocados.has(String(p.id)));
  const baja = (p) => { const e = ((est || {})[p.id] || {}).e || p.est; return e === "lesionado" || e === "sancionado"; };
  const cuentan = (p) => (p.matches || 0) >= 3 || (p.value || 0) >= 2e6;
  // Un nombre de la lista que no se ha podido identificar podría ser uno de ellos: si comparten alguna palabra, no se dice que «se queda fuera»
  const raros = sinEmparejar.map((n) => norm(n).split(" ").filter((t) => t.length >= 3));
  const ambiguo = (p) => { const t = norm(p.name).split(" "); return raros.some((r) => r.some((x) => t.some((y) => y.length >= 3 && (y.includes(x) || x.includes(y))))); };
  const completa = !sinEmparejar.length;
  const fuera = plantilla.filter((p) => !convocados.has(String(p.id)) && cuentan(p) && !ambiguo(p)).sort((a, b) => b.value - a.value);
  const nuevos = prev ? en.filter((p) => !prev.has(String(p.id))).sort((a, b) => b.value - a.value) : [];
  const caen = prev ? plantilla.filter((p) => prev.has(String(p.id)) && !convocados.has(String(p.id)) && !ambiguo(p)).sort((a, b) => b.value - a.value) : [];
  const lt = (arr, n) => arr.slice(0, n);
  const chips = [chip("CONVOCADOS", String(convocados.size), "ok", partido ? "Jornada " + partido.jornada + " · " + (partido.casa ? "en casa ante " : "fuera, en ") + partido.rival : club.team)];
  if (prev) chips.push(chip("ENTRAN", String(nuevos.length), "az", "respecto a la lista anterior"), chip("SALEN", String(caen.length), "mo", "respecto a la lista anterior"));
  const secs = [
    { titulo: "Resumen", nota: "", filas: chips },
    { titulo: "Entran en la lista", nota: "No estaban en la convocatoria anterior.", filas: lt(nuevos, 6).map((p) => fila(p, "Entra", "convocado")) },
    { titulo: "Se quedan fuera", nota: "Jugadores de Futmondo del equipo que no están en la lista.", filas: lt(fuera, 8).map((p) => fila(p, baja(p) ? "Baja" : "Fuera", "no convocado", baja(p) ? "Ya estaba apuntado como baja" : "")) },
  ];
  const body = secs.filter((s) => s.filas.length).map((s) => ["## " + s.titulo, s.nota, ...s.filas].filter(Boolean).join("\n")).join("\n");
  const titulo = "Convocatoria " + (/^real sociedad/i.test(club.team) ? "de la " : "del ") + club.team + (partido ? (partido.casa ? " ante el " : " en el campo del ") + partido.rival + " (J" + partido.jornada + ")" : "");
  const protagonistas = lt(nuevos.concat(fuera), 3).map((p) => p.name);
  return { id: "artconv" + club.key, title: titulo.replace(/ante el Real Sociedad/, "ante la Real Sociedad"), lead: "Quién entra y quién se queda fuera, según la lista oficial del club.", body, players: protagonistas.length ? protagonistas : lt(en, 1).map((p) => p.name) };
}
