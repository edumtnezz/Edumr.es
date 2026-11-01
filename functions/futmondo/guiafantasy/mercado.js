// /futmondo/guiafantasy/mercado: la web de siempre. Si el enlace trae ?foto=<foto de Futmondo>, se usa
// como miniatura en la vista previa (Telegram, WhatsApp...). Solo se aceptan fotos de Futmondo.
const OK = /^https:\/\/static0\d\.mondocore\.com\/futmondo\/img\/faces\/[\w./-]+$/;
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let base;
  try { base = await env.ASSETS.fetch(new URL("/futmondo/guiafantasy/", url)); } catch (e) { return context.next(); }
  const foto = url.searchParams.get("foto") || "";
  if (!OK.test(foto)) return base;
  try {
    const tags = '<meta property="og:site_name" content="Guía Fantasy · Futmondo EduMR"><meta property="og:title" content="Mercado actualizado">' +
      '<meta property="og:description" content="Las mayores subidas y bajadas de valor de Futmondo.">' +
      '<meta property="og:image" content="' + esc(foto) + '"><meta name="twitter:card" content="summary"><meta name="twitter:image" content="' + esc(foto) + '">';
    const html = (await base.text()).replace("</head>", tags + "</head>");
    const headers = new Headers(base.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.delete("content-length"); headers.delete("etag");
    return new Response(html, { status: 200, headers });
  } catch (e) {
    return base;
  }
}
