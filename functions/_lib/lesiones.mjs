// Lesiones de un jugador según Transfermarkt (página «verletzungen»): periodos con fecha de inicio y de vuelta.
// Se usa SOLO para explicar un «no jugó»: el partido tiene que caer dentro de un periodo real de lesión; si no, no se dice nada.

const dmy = (s) => { const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : ""; };
const limpia = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

// HTML de la página de lesiones → [{ t: tipo, d: "AAAA-MM-DD" inicio, h: "AAAA-MM-DD" vuelta | "" si sigue de baja }]
export function parseLesiones(html) {
  const s = String(html || "");
  const i = s.indexOf('class="items"');
  if (i < 0) return [];
  const out = [];
  for (const r of s.slice(i).matchAll(/<tr class="(?:odd|even)">([\s\S]*?)<\/tr>/g)) {
    const c = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => limpia(m[1]));
    if (c.length < 4) continue;
    const d = dmy(c[2]);
    if (!d) continue;
    out.push({ t: c[1], d, h: dmy(c[3]) });
  }
  return out;
}

// Pone «les» (el tipo de lesión) en cada partido NO jugado cuya fecha cae dentro de una lesión. Devuelve la lista nueva.
export function marcarLesiones(partidos, lesiones) {
  return (partidos || []).map((p) => {
    if (!p || p.cat !== "n" || !p.f || !lesiones || !lesiones.length) return p;
    const f = String(p.f).slice(0, 10);
    const l = lesiones.find((x) => x.d <= f && (!x.h || f <= x.h));
    return l ? Object.assign({}, p, { les: l.t }) : p;
  });
}

// ---- fichajes.com (misma tabla que Transfermarkt, pero contesta desde los servidores de Cloudflare) ----
const quita = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const toks = (s) => quita(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const VACIAS = new Set(["de", "la", "del", "el", "los", "las", "fc", "cf", "ud", "cd", "sd", "rcd", "ca", "club"]);

// Lista de equipos de la página: /equipo/<slug>/ (una sola pieza, sin subpáginas)
export function parseEquipos(html) {
  return [...new Set([...String(html || "").matchAll(/href="(?:https:\/\/www\.fichajes\.com)?\/equipo\/([a-z0-9-]+)\/?"/g)].map((m) => m[1]))];
}
// Plantilla: /jugador/<slug>/
export function parseJugadores(html) {
  return [...new Set([...String(html || "").matchAll(/href="(?:https:\/\/www\.fichajes\.com)?\/jugador\/([a-z0-9-]+)\/?"/g)].map((m) => m[1]))];
}
// Equipo de fichajes.com que corresponde a nuestro club: deben estar TODAS las palabras del club (sin «de», «fc»…) en el slug, y solo uno
export function slugEquipo(club, slugs) {
  const t = toks(club).filter((x) => !VACIAS.has(x));
  if (!t.length) return "";
  const ok = (slugs || []).filter((s) => { const st = new Set(toks(s)); return t.every((x) => st.has(x)); });
  if (ok.length === 1) return ok[0];
  // varios (p. ej. «Real Madrid» y otro que lo contenga): el de menos palabras sobrantes, si gana claramente
  ok.sort((a, b) => toks(a).length - toks(b).length);
  return ok.length > 1 && toks(ok[0]).length < toks(ok[1]).length ? ok[0] : "";
}
// Jugador de la plantilla cuyo slug contiene todas las palabras de su nombre; si hay dos o más, no se adivina
export function slugJugador(nombre, slugs) {
  const t = toks(nombre).filter((x) => !VACIAS.has(x));
  if (!t.length) return "";
  const ok = (slugs || []).filter((s) => { const st = new Set(toks(s)); return t.every((x) => st.has(x)); });
  return ok.length === 1 ? ok[0] : "";
}
// Tabla «Histórico de lesiones» de fichajes.com: Temporada | Tipo | Inicio | Final | Días | Partidos
export function parseLesionesFichajes(html) {
  const s = String(html || "");
  const i = s.indexOf("Histórico de lesiones");
  if (i < 0) return [];
  const out = [];
  for (const r of s.slice(i).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => limpia(m[1]));
    if (c.length < 4) continue;
    const d = dmy(c[2]);
    if (!d) continue;
    out.push({ t: c[1], d, h: dmy(c[3]) });
  }
  return out;
}
