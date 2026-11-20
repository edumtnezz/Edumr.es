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
