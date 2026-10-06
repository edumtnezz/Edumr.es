// edumr-cron: agente 24h que mantiene frescas las noticias (y demás cachés).
// Cada 15 min llama al endpoint que aplica nuestras reglas de limpieza y deja
// el resultado cacheado en KV, para que la web lo sirva al instante.
export default {
  async scheduled(event, env, ctx) {
    const urls = [
      "https://edumr.es/api/laquiniela/noticias?warm=1",
      "https://edumr.es/api/laquiniela/clausulas",
      "https://edumr.es/api/laquiniela/equipos",
      "https://edumr.es/api/laquiniela/temporada",
      "https://edumr.es/api/laquiniela/fichajes",
    ];
    await Promise.all(urls.map(async (u) => {
      try {
        const url = u + (u.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
        const r = await fetch(url, { headers: { "user-agent": "edumr-cron" } });
        await r.text();
      } catch (e) {}
    }));
  },
  async fetch() {
    return new Response("edumr-cron ok", { status: 200, headers: { "content-type": "text/plain" } });
  },
};
