// edumr-cron: agente 24h que mantiene frescas las noticias (y demás cachés).
// Cada 15 min llama al endpoint que aplica nuestras reglas de limpieza y deja
// el resultado cacheado en KV, para que la web lo sirva al instante.
import { avisar } from "./avisos.js";

export default {
  async scheduled(event, env, ctx) {
    // "0 8 * * *" = vigilante diario: comprueba que las 20 páginas de
    // equipo de futbolfantasy.com (de donde sacamos fotos tipo
    // Alineaciones probables) siguen cargando jugadores. Si una se rompe
    // (p.ej. un equipo asciende y cambia de slug, como pasó con el
    // Deportivo) queda guardado y se avisa a Edu en la propia web, sin
    // esperar a que falle un jugador concreto.
    if (event.cron === "0 8 * * *") {
      try {
        const r = await fetch("https://edumr.es/api/laquiniela/ff-health?run=1", { headers: { "user-agent": "edumr-cron" } });
        await r.text();
      } catch (e) {}
      return;
    }
    const urls = [
      "https://edumr.es/api/laquiniela/noticias?warm=1",
      "https://edumr.es/api/laquiniela/clausulas",
      "https://edumr.es/api/laquiniela/equipos",
      "https://edumr.es/api/laquiniela/temporada",
      "https://edumr.es/api/laquiniela/fichajes",
      // Guarda los puntos de liga por jornada cuando un equipo acaba un partido (histórico de la temporada).
      "https://edumr.es/api/laquiniela/historial-puntos?run=1",
      // La Porra: pasa al historial los partidos terminados (pasado el lunes 23:59).
      "https://edumr.es/api/laquiniela/porra",
    ];
    await Promise.all(urls.map(async (u) => {
      try {
        const url = u + (u.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
        const r = await fetch(url, { headers: { "user-agent": "edumr-cron" } });
        await r.text();
      } catch (e) {}
    }));
    // Avisos de Telegram (noticias, alineaciones, cambios en tus jugadores).
    // Va DESPUÉS de refrescar las cachés para leer datos frescos. Sin el secreto
    // TELEGRAM_BOT_TOKEN no hace nada, y un fallo aquí nunca rompe lo de arriba.
    try { await avisar(env); } catch (e) {}
  },
  async fetch() {
    return new Response("edumr-cron ok", { status: 200, headers: { "content-type": "text/plain" } });
  },
};
