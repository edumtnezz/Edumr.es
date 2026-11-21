// edumr-cron: agente 24h que mantiene frescas las noticias (y demás cachés).
// Cada 15 min llama al endpoint que aplica nuestras reglas de limpieza y deja
// el resultado cacheado en KV, para que la web lo sirva al instante.
import { avisar, colaPuntos, avisarPuntos } from "./avisos.js";
import { vigilarEstados } from "./estados.js";
import { publicarPartes } from "./partes.js";
import { vigilarFotmob } from "./fotmob-estados.js";
import { apuntarDiario } from "./diario.js";
import { apuntarSustituciones } from "./sustituciones.js";
import { publicarArticulos, publicarOnces, publicarPuntos } from "./articulos.js";

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
        if (j && j.result && Array.isArray(j.result.savedInfo) && j.result.savedInfo.length) { let its = j.result.savedInfo; try { its = await publicarPuntos(env, its); } catch (e) {} await colaPuntos(env, its); } // artículo con los puntos + aviso
      } catch (e) {}
      // Mantiene al día la copia global (KV) de lo más visto, para que nadie espere en la primera visita.
      // Casi siempre es una respuesta ya guardada (barata); el servidor escribe en KV como mucho cada 2 min por ruta.
      try {
        await Promise.all(["mercado", "jornada", "rachas", "portada", "noticias", "ultimos-cambios", "equipos"].map((p) =>
          fetch("https://edumr.es/api/laquiniela/" + p, { headers: { "user-agent": "edumr-cron" } }).then((r) => r.text()).catch(() => {})));
      } catch (e) {}
      // Análisis propios (dificultad de calendario, once propio): una tanda de jugadores por minuto hasta completar la vuelta; luego descansa 6 h.
      try { await fetch("https://edumr.es/api/laquiniela/analitica?run=1", { headers: { "user-agent": "edumr-cron" } }); } catch (e) {}
      // Estado físico de los jugadores: apunta cada cambio con su hora (cada 3 min).
      try { await vigilarEstados(env, fetch, event.scheduledTime); } catch (e) { console.error("estados", String(e && e.message || e).slice(0, 180)); }
      // Segunda fuente de estado (FotMob): cada 6 min, solo apunta cambios; las noticias lo usan si Biwenger aún no lo tiene.
      try { await vigilarFotmob(env, fetch, event.scheduledTime); } catch (e) { console.error("fotmob-estados", String(e && e.message || e).slice(0, 180)); }
      // Noticias de estado: van justo después de leer los estados (21/11/2026: al final de la cadena no llegaban a ejecutarse).
      try {
        // La hora es la del disparo del cron, no la de cuando llega el turno: si antes se tarda casi un minuto, «cada 3 min» se saltaba el minuto
        const r = await publicarPartes(env, fetch, event.scheduledTime);
        // Diagnóstico: último resultado que no fue «no toca» (se ve en /api/laquiniela/estados → partes)
        if (!(r && r.skipped === "no toca")) await env.PORRA.put("partes:last:v1", JSON.stringify({ at: Date.now(), r }));
      } catch (e) { console.error("partes", String(e && e.message || e).slice(0, 180)); try { await env.PORRA.put("partes:last:v1", JSON.stringify({ at: Date.now(), error: String(e && e.message || e).slice(0, 200) })); } catch (e2) {} }
      // Diario de LaLiga: cambios en la clasificación (arriba y descenso) y en los goleadores (cada 10 min, nunca con un partido en juego).
      try { await apuntarSustituciones(env); } catch (e) { console.error("subs", String(e && e.message || e).slice(0, 180)); }
      try { await apuntarDiario(env); } catch (e) { console.error("diario", String(e && e.message || e).slice(0, 180)); }
      // Artículos propios (a vender, a fichar, clausulazos y parón): una edición por jornada.
      try { await publicarArticulos(env); } catch (e) { console.error("articulos", String(e && e.message || e).slice(0, 180)); }
      try { await publicarOnces(env); } catch (e) { console.error("onces", String(e && e.message || e).slice(0, 180)); }
      try { await avisarPuntos(env); } catch (e) {}
      try { await avisar(env); } catch (e) {}
      // Noticias nuevas (12/11/2026): una noticia corta por cada cambio de estado. El redactor antiguo (ruedas de prensa,
      // notas de otras webs y portadas generadas) queda apagado; su código sigue en redactor.js sin usarse.

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
