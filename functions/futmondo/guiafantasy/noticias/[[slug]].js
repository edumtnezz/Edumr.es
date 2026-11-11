// /futmondo/guiafantasy/noticias/<slug>: sirve la misma web de siempre, pero con la foto, el título y el
// resumen de ESA noticia en las etiquetas de vista previa (Telegram, WhatsApp...). Si algo falla,
// se sirve la web normal sin tocar. Los datos salen de la propia noticia en FutbolFantasy.
const PFX = "https://www.futbolfantasy.com/laliga/noticias/";
// slug → página de la noticia: FutbolFantasy (tal cual), Comuniate ("cm-<id>-<slug>") o Jornada Perfecta ("jp-<slug>")
// Noticia propia (ed-<id>): el título sale de lo guardado, no de otra web.
export function ogDePropia(slug, own) {
  const m = String(slug || "").match(/^ed-([a-z0-9]{6,16})$/);
  if (!m) return null;
  const x = (own || []).find((o) => o && o.id === m[1] && o.status === "published");
  if (!x) return { missing: true };
  return { t: x.title || "", d: x.lead || "", i: x.thumb || "" };
}
const srcUrl = (slug) => {
  let m = slug.match(/^cm-(\d+)-([a-z0-9-]+)$/); if (m) return "https://www.comuniate.com/noticias/" + m[1] + "/" + m[2];
  m = slug.match(/^jp-([a-z0-9-]+)$/); if (m) return "https://www.jornadaperfecta.com/blog/" + m[1] + "/";
  return PFX + slug;
};
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brand = (t) => String(t || "").replace(/\s*[-|·–]\s*(Futbol\s?Fantasy|Comuniate|Jornada Perfecta).*$/i, "").trim();
const meta = (h, p) => {
  const a = h.match(new RegExp('<meta[^>]+(?:property|name)="' + p + '"[^>]+content="([^"]*)"', "i")) || h.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + p + '"', "i"));
  return a ? a[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'") : "";
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  let base;
  try { base = await env.ASSETS.fetch(new URL("/futmondo/guiafantasy/", url)); } catch (e) { return context.next(); }
  const slug = Array.isArray(params.slug) ? params.slug.join("/") : String(params.slug || "");
  if (!slug || !/^[a-z0-9._-]+$/i.test(slug)) return base;
  try {
    const cache = caches.default;
    const ck = new Request("https://edumr.es/__og/noticia/" + slug);
    let og = null;
    const hit = await cache.match(ck);
    if (hit) og = await hit.json();
    if (!og && /^ed-/.test(slug)) {
      let own = [];
      try { own = (await env.PORRA.get("own:news:v1", "json")) || []; } catch (e) {}
      const propia = ogDePropia(slug, own);
      if (propia && !propia.missing) og = propia;
      else return base;
    }
    if (!og) {
      const r = await fetch(srcUrl(slug), { headers: { "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
      if (!r.ok) return base;
      const h = await r.text();
      og = { t: brand(meta(h, "og:title")), d: brand(meta(h, "og:description") || meta(h, "description")), i: meta(h, "og:image") };
      if (og.t || og.i) await cache.put(ck, new Response(JSON.stringify(og), { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } }));
    }
    if (!og.t && !og.i) return base;
    // Fotos propias: el parte médico lleva su banner y las noticias sin foto, el banner de noticias
    if (/parte\s+m[eé]dico/i.test(og.t || "")) og = { ...og, i: url.origin + "/img/parte-medico.jpg?v=2" };
    else if (!og.i) og = { ...og, i: url.origin + "/img/noticia-ultima-hora.jpg?v=2" };
    // Telegram y WhatsApp necesitan la dirección completa de la imagen; la portada va en tamaño mediano
    if (og.i && og.i.charAt(0) === "/") og = { ...og, i: url.origin + og.i };
    const tags = '<meta property="og:site_name" content="Guía Fantasy · Futmondo EduMR"><meta property="og:type" content="article">' +
      '<meta property="og:url" content="' + esc(url.origin + url.pathname) + '">' +
      (og.t ? '<meta property="og:title" content="' + esc(og.t) + '"><meta name="twitter:title" content="' + esc(og.t) + '">' : "") +
      (og.d ? '<meta property="og:description" content="' + esc(og.d) + '"><meta name="twitter:description" content="' + esc(og.d) + '">' : "") +
      (og.i ? '<meta property="og:image" content="' + esc(og.i) + '"><meta name="twitter:image" content="' + esc(og.i) + '"><meta name="twitter:card" content="summary_large_image">' : "");
    let html = await base.text();
    html = html.replace(/<title>[^<]*<\/title>/, og.t ? "<title>" + esc(og.t) + "</title>" : "$&").replace(/<meta name="description"[^>]*>/, "").replace("</head>", tags + "</head>");
    const headers = new Headers(base.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.delete("content-length"); headers.delete("etag");
    return new Response(html, { status: 200, headers });
  } catch (e) {
    return base;
  }
}
