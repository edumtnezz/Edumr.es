// /futmondo/guiafantasy/mercado: la web de siempre, pero con la imagen "Subidas y bajadas" como miniatura
// en la vista previa del enlace (Telegram, WhatsApp...).
const IMG = "https://edumr.es/img/mercado-subidas-bajadas.jpg";

export async function onRequest(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  let base;
  try { base = await env.ASSETS.fetch(new URL("/futmondo/guiafantasy/", url)); } catch (e) { return context.next(); }
  try {
    const tags = '<meta property="og:site_name" content="Guía Fantasy · Futmondo EduMR"><meta property="og:title" content="Subidas y bajadas">' +
      '<meta property="og:description" content="Las mayores subidas y bajadas de valor de Futmondo Social.">' +
      '<meta property="og:image" content="' + IMG + '"><meta property="og:image:width" content="1027"><meta property="og:image:height" content="574">' +
      '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + IMG + '">';
    const html = (await base.text()).replace("</head>", tags + "</head>");
    const headers = new Headers(base.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.delete("content-length"); headers.delete("etag");
    return new Response(html, { status: 200, headers });
  } catch (e) {
    return base;
  }
}
