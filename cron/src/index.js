// edumr-cron: agente 24h que mantiene frescas las noticias (y demás cachés).
// Cada 15 min llama al endpoint que aplica nuestras reglas de limpieza y deja
// el resultado cacheado en KV, para que la web lo sirva al instante.
import { avisar, colaPuntos, avisarPuntos } from "./avisos.js";
import { redactorSombra } from "./redactor.js";

export default {
  async scheduled(event, env, ctx) {
    // "* * * * *" = avisos (cada minuto) de Telegram (noticias, alineaciones, cambios en tus
    // jugadores). Lee las fuentes directamente; sin el secreto TELEGRAM_BOT_TOKEN
    // no hace nada, y un fallo aquí nunca afecta a lo demás.
    if (event.cron === "* * * * *") {
      // Puntos de Futmondo: en cuanto los publica tras el final de un partido, se guardan en KV para que
      // la página del partido ya los traiga al abrirla. Si no hay partidos pendientes casi no cuesta nada.
      try {
        const r = await fetch("https://edumr.es/api/laquiniela/puntos-jornada?run=1&t=" + Date.now(), { headers: { "user-agent": "edumr-cron" } });
        const j = await r.json().catch(() => null);
        // Partidos cuyos puntos acaba de guardar el servidor: aviso por Telegram (de noche se retiene hasta las 08:00)
        if (j && j.result && Array.isArray(j.result.savedInfo)) await colaPuntos(env, j.result.savedInfo);
      } catch (e) {}
      // Mantiene al día la copia global (KV) de lo más visto, para que nadie espere en la primera visita.
      // Casi siempre es una respuesta ya guardada (barata); el servidor escribe en KV como mucho cada 2 min por ruta.
      try {
        await Promise.all(["mercado", "jornada", "rachas", "portada", "noticias", "ultimos-cambios", "equipos"].map((p) =>
          fetch("https://edumr.es/api/laquiniela/" + p, { headers: { "user-agent": "edumr-cron" } }).then((r) => r.text()).catch(() => {})));
      } catch (e) {}
      try { await avisarPuntos(env); } catch (e) {}
      try { await avisar(env); } catch (e) {}
      // Redactor: publica noticias verificadas y avisa por Telegram. Sin GEMINI_API_KEY no hace nada.
      // Un fallo aquí no corta los avisos; el motivo queda en el log del Worker.
      try { await redactorSombra(env); } catch (e) { console.error("redactor", String(e && e.message || e).slice(0, 180)); }
      return;
    }
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
      // Guarda los puntos de liga por jornada cuando un equipo acaba un partido (histórico de la temporada).
      "https://edumr.es/api/laquiniela/historial-puntos?run=1",
      // Histórico de minutos por jugador (30 por pasada hasta tenerlos todos; luego una pasada por hora).
      "https://edumr.es/api/laquiniela/minutos?run=1",
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
  },
  async fetch() {
    return new Response("edumr-cron ok", { status: 200, headers: { "content-type": "text/plain" } });
  },
};
