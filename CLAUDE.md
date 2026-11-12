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
- **Noticias (desde 12/11/2026): sistema nuevo por cambio de estado.** `cron/src/estados.js` apunta cada 3 min el estado de cada jugador (Biwenger: ok, duda, lesionado, sancionado, apercibido, con su texto y hora) y `cron/src/partes.js` publica una noticia corta por cada cambio (KV `own:news:v2`): resumen, «Claves fantasy» y «Consejo fantasy». Los hechos salen de `functions/_lib/estados.mjs` (plantilla fija); la IA solo redacta el resumen y se descarta si trae un número o un nombre que no esté en los hechos. De Biwenger SOLO se usa el estado: precios, puntos, minutos e histórico son siempre de Futmondo. Sin fotos de Google ni portadas generadas: foto de Futmondo + escudo. «Últimos cambios» es propio (`getCambiosPropios`), ya no se lee de FutbolFantasy. El estado propio se pone encima del de Futmondo en el mercado (`statusFm` guarda el original) y en el once probable (`ajustarOnce`: el lesionado/sancionado sale y entra su recambio según minutos reales). Diagnóstico: `/api/laquiniela/estados`.
- El redactor antiguo (ruedas de prensa, notas de otras webs, portadas de ChatGPT) está APAGADO desde el 12/11/2026: su código sigue en `cron/src/redactor.js` sin llamarse y sus noticias quedan en KV `own:news:v1` sin mostrarse. Lo que sigue es su documentación, por si se recupera algo.
- Redactor antiguo: lee `docs/redactor.md` antes de tocarlo. Publica directo, sin borradores. No inventar: si no hay dato, «sin datos». Fuentes prohibidas como dato: Marca, AS, Mundo Deportivo, Google News RSS, El Desmarque, Athletic, Alavés, X/Twitter y el RSS de YouTube. X no se usa. FutbolFantasy y Comuniate dan temas; si no hay nota oficial, el Worker lee la noticia (robots.txt) y la reescribe con palabras propias, SIN citar la web ni mostrar «Fuente» (decisión de Edu 09/11/2026). Vale también el análisis/opinión si se queda con datos comprobables; además se publican análisis propios con los datos de Futmondo (`cron/src/analisis.js`). Nunca frases copiadas (se rechaza si repite 9 palabras seguidas), nunca un dato que no esté en su texto. Diagnóstico: `/api/laquiniela/redactor-estado`. El Gol Digital, si se usa, también es solo detección. `robots.txt` obligatorio. OFICIAL solo club, RFEF o LaLiga; si no, «Según [medio]» y enlace. Avisos de Telegram a edumr.es. Coste extra 0 €. No tocar Puja, Quiniela ni Porra. Nada de secretos ni ids de Cloudflare en el repo. Un % nuestro solo con precisión demostrada; con menos de 3 partidos, «sin datos». Descartado: apartado Titulares, escudos grandes, iconos o emojis de pizarra, y un bot de Telegram para editar.
- **Puntos de un partido: nunca los del partido anterior.** Futmondo marca un partido terminado antes de publicar sus puntos y `fitness` aún acaba en el partido anterior. Todo sitio que reparta `fitness` entre partidos concretos debe comprobar antes que Futmondo ya lo publicó (`fitLag` / `fitIndex` en `functions/_lib/fitness.mjs`, o `jLab`). Si no está publicado: "—" o nada, jamás el valor viejo ni un cálculo. `tests/fitness-guard.test.mjs` falla si se añade código sin esa protección.

## Técnico
- JS puro: futmondo/guiafantasy/mercado.js, chrome.js, alineacion.js + CSS.
- Backend: functions/api/laquiniela/[[path]].js (Cloudflare Pages Functions). **Plan de pago de Cloudflare (Workers Paid, 5 $/mes) contratado el 01/11/2026**: 30 s de CPU, miles de llamadas por petición, 1 M de escrituras KV al mes.
- Fuentes: Futmondo (todos los números), Biwenger (solo estado físico), FutbolFantasy (alineaciones probables y % de jugar), Comuniate, FotMob, football-data.org.
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
