# CLAUDE.md — edumr.es (Guía Fantasy / Futmondo)

Edu no sabe programar, escribe en español desde el móvil. Léete también AGENTS.md.

## Reglas
- Nunca inventar datos: todo de fuentes reales; si no hay dato, decirlo.
- Comprobar yo mismo la web y las APIs (navegador/API), sin pedirle a Edu que lo haga.
- Poco texto, visuales claros, nada de aspecto "IA" (degradados, textos largos).
- Solo valores de mercado de Futmondo (nada de Liga Fantasy Oficial, Mister, Comunio, Biwenger, Fantasy Marca).
- Sin recargas automáticas visibles ni saltos de pantalla.
- Antes de subir: `node --check` de los JS y `node --test tests/*.test.mjs`. El `?v=` lo pone solo el despliegue (`scripts/version-assets.mjs`).
- Si una fuente falla, mostrar el último dato bueno, nunca pantalla vacía.
- Redactor de noticias: lee `docs/redactor.md` antes de tocarlo. Publica directo, sin borradores. No inventar: si no hay dato, «sin datos». Fuentes prohibidas: Marca, AS, Mundo Deportivo, Google News RSS, El Desmarque, Athletic, Alavés, X/Twitter y el RSS de YouTube. El Gol Digital y @futbol_fantasy solo detectan temas. `robots.txt` obligatorio. OFICIAL solo club, RFEF o LaLiga; si no, «Según [medio]» y enlace. Avisos de Telegram a edumr.es. Coste extra 0 €. No tocar Puja, Quiniela ni Porra. Nada de secretos ni ids de Cloudflare en el repo. Un % nuestro solo con precisión demostrada; con menos de 3 partidos, «sin datos». Descartado: apartado Titulares, escudos grandes, iconos o emojis de pizarra, y un bot de Telegram para editar.
- **Puntos de un partido: nunca los del partido anterior.** Futmondo marca un partido terminado antes de publicar sus puntos y `fitness` aún acaba en el partido anterior. Todo sitio que reparta `fitness` entre partidos concretos debe comprobar antes que Futmondo ya lo publicó (`fitLag` / `fitIndex` en `functions/_lib/fitness.mjs`, o `jLab`). Si no está publicado: "—" o nada, jamás el valor viejo ni un cálculo. `tests/fitness-guard.test.mjs` falla si se añade código sin esa protección.

## Técnico
- JS puro: futmondo/guiafantasy/mercado.js, chrome.js, alineacion.js + CSS.
- Backend: functions/api/laquiniela/[[path]].js (Cloudflare Pages Functions). **Plan de pago de Cloudflare (Workers Paid, 5 $/mes) contratado el 01/11/2026**: 30 s de CPU, miles de llamadas por petición, 1 M de escrituras KV al mes.
- Fuentes: Futmondo, FutbolFantasy, Comuniate, FotMob, football-data.org.
- Liga "Con Permisoo": Futmondo Social, AS 50 %, Marca 50 %, SofaScore 50 %, capitán sí, multiposición sí. La jornada acaba el lunes; a las 00:00 de ese lunes pasa a la siguiente.

## Ideas pendientes
- Avisos Telegram (noticias y alineación probable)
- Jugadores rentables (SofaScore, calidad-precio)
- Jugadores con 90 % o más de jugar
- Histórico de minutos por jugador
- Web por club (/equipos/alaves) y clasificación en cada club
- Estabilidad: pruebas automáticas y datos de reserva en todas las pantallas
- Rayo–Athletic (J8) aplazado: aparece solo cuando tenga fecha

## Hecho
- Comparador de jugadores (31/10/2026): pestaña "Comparador" en el menú Más (`/futmondo/guiafantasy/comparador`). Comparaciones guardadas en el dispositivo (localStorage).
