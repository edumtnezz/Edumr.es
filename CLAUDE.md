# CLAUDE.md — edumr.es (Guía Fantasy / Futmondo)

Edu no sabe programar, escribe en español desde el móvil. Léete también AGENTS.md.

## Reglas
- Nunca inventar datos: todo de fuentes reales; si no hay dato, decirlo.
- Comprobar yo mismo la web y las APIs (navegador/API), sin pedirle a Edu que lo haga.
- Poco texto, visuales claros, nada de aspecto "IA" (degradados, textos largos).
- Solo valores de mercado de Futmondo (nada de Liga Fantasy Oficial, Mister, Comunio, Biwenger, Fantasy Marca).
- Sin recargas automáticas visibles ni saltos de pantalla.
- Antes de subir: `node --check` de los JS y subir `?v=` en futmondo/guiafantasy/index.html.
- Si una fuente falla, mostrar el último dato bueno, nunca pantalla vacía.

## Técnico
- JS puro: futmondo/guiafantasy/mercado.js, chrome.js, alineacion.js + CSS.
- Backend: functions/api/laquiniela/[[path]].js (Cloudflare Pages Functions, plan gratis: límites de CPU y KV).
- Fuentes: Futmondo, FutbolFantasy, Comuniate, FotMob, football-data.org.
- Liga "Con Permisoo": Futmondo Social, AS 50 %, Marca 50 %, SofaScore 50 %, capitán sí, multiposición sí. La jornada acaba el lunes; a las 00:00 de ese lunes pasa a la siguiente.

## Ideas pendientes
- Avisos Telegram (noticias y alineación probable)
- Jugadores rentables (SofaScore, calidad-precio)
- Jugadores con 90 % o más de jugar
- Histórico de minutos por jugador
- Web por club (/equipos/alaves) y clasificación en cada club
- Estabilidad: pruebas automáticas y datos de reserva en todas las pantallas
- Plan de pago de Cloudflare solo si los fallos siguen
- Rayo–Athletic (J8) aplazado: aparece solo cuando tenga fecha

## Hecho
- Comparador de jugadores (31/10/2026): pestaña "Comparador" en el menú Más (`/futmondo/guiafantasy/comparador`). Comparaciones guardadas en el dispositivo (localStorage).
