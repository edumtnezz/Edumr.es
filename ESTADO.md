# ESTADO.md — edumr.es (Guía Fantasy / Futmondo)

Última actualización: 01/11/2026. Para continuar: lee AGENTS.md y CLAUDE.md (reglas de Edu) y luego este archivo.
Edu no sabe programar y escribe desde el móvil, en español. Respuestas cortas y sencillas.

## Hecho (sacado de AGENTS.md, CLAUDE.md y el historial de git)
- Despliegue automático: push a `main` → GitHub Action publica la web y el Worker `puja-do`.
- Avisos de Telegram (31/10): noticias, once probable y confirmado, precios, cambios en sus jugadores (`cron/src/avisos.js`).
- Jugadores rentables (calidad-precio), histórico de minutos por jugador y comparador de jugadores con comparaciones guardadas.
- Club: calendario completo, escudos que llevan al club. Partido: nota real de FotMob, asistencias en el campo.
- 01/11: puntos de Futmondo en una sola petición (hasta 40 jugadores, medido: 40 de 40 en 2,0 s en frío y 0,15 s con caché), búsqueda cada 15 s cuando el partido ya acabó y faltan puntos, y esperas del servidor más cortas (10–12 s).
- 01/11: respuesta instantánea con la última copia buena (hasta 15 min; mercado 3 min) en 17 pantallas de la API y refresco por detrás (`SWR_OK` en el backend). Quedan fuera las de directo/partido en juego.
- 01/11: arreglado `isGood` del caché del backend: ya no descarta respuestas buenas por una lista vacía anidada (antes `ultimos-cambios` nunca se guardaba). Verificado en producción: miss → hit → swr → hit.
- 31/10: alineaciones probables con fecha y hora de Madrid corregidas; primera carga de `jornada` más rápida (copia guardada + actualización detrás); textos de La Puja y La Quiniela alineados con la regla "cada partido se bloquea al empezar".
- 01/11: **web por club terminada**. Las 20 fichas de club (`/equipos/<club>`) llevan su clasificación de LaLiga; estaba roto solo en Alavés: `teamCanon("Deportivo Alavés")` devolvía `dep` (la regla `/depor/` iba antes que `/alaves/`), así que la sección se borraba sola. Arreglado el orden de las reglas (`/alaves/` antes, `/coruna/` para el Deportivo). Comprobado con datos reales: los 20 clubes tienen fila y página, y Alavés y Deportivo ya no se mezclan.
- 01/11: **Athletic, denominador arreglado** (J8 aplazado). La ficha dividía entre la última jornada con datos en vez de los partidos jugados: Unai Simón salía "9 de 10" (900') cuando había jugado los 9 de 9 (810'). Ahora el denominador son los partidos del EQUIPO, sacados del mercado (máximo de partidos de sus jugadores). Comprobado con datos reales: Athletic 9/9, Barça 11/11, Deportivo 10/10, Málaga 11/11 (sin cambios fuera del Athletic). Test en `tests/played.test.mjs`.
- 01/11: **repaso de la opinión** (lo que faltaba):
  - **Portada con `h1`**: no había ninguno. Ahora "Aplicaciones y automatizaciones con IA" (el efecto de máquina de escribir sigue debajo).
  - **Los clubes en una sola tabla**: `futmondo/teams.js` (`window.EduTeams`). Se borraron las tres copias (teamCanon, CLUB_SLUG y ALI); tests en `tests/teams.test.mjs`.
  - **`?v=` automático**: `scripts/version-assets.mjs` pone la versión según el contenido de cada CSS/JS al preparar `dist`. Ya no hay que acordarse de subirla (y estos archivos se cachean un año). Tests en `tests/version-assets.test.mjs`.
  - **Inicio más ligero**: la foto grande del inicio se queda y las dos siguientes pasan a lista (antes eran tres fotos a todo el ancho). Textos mínimos: se subieron los de 6,7 / 7,4 / 8,6 px (hora del once probable, pastillas de posición, horas del ticker).
  - **Detalles**: el hub aclara que la Guía Fantasy se ve sin cuenta; La Puja enseña el valor en formato corto (131,5 M€) y deja las pujas exactas.
- 01/11: **filtro "Prob. jugar"** en Mercado (`#mxProb`) y en Plantillas (`#pltProb`): Todas / ≥90 % / ≥70 % / En duda. Sale del % de FutbolFantasy que ya trae el mercado; no calcula nada.
- 01/11: **portada reordenada**: Futmondo va primero (es lo que más se usa) y se quita la tarjeta "Web Oficial & VPS" (eso es la casa, no un proyecto). El contador dice 4 proyectos.
- 01/11: **prueba de humo tras publicar** (`scripts/smoke.mjs`, último paso del GitHub Action): 8 páginas + 4 APIs. Si algo se queda en blanco o sin datos, el despliegue sale en rojo.
- 01/11: **contador de visitas propio** (sin cookies, sin datos personales): `futmondo/vista.js` avisa una vez por página y sesión; el backend lo suma en KV (`st:v1:<día>`) y `/futmondo/stats/` enseña los últimos 14 días. Se puede ver en https://edumr.es/futmondo/stats/ (noindex, sin enlaces).

## Pendiente
- Jugadores con ≥ 90 % de probabilidad de jugar (idea de Edu, AGENTS.md; no consta en el historial como hecha).
- Estabilidad: pruebas automáticas y datos de reserva en todas las pantallas.
- Ajuste por rival (pendiente de confirmar con Edu, AGENTS.md).
- Rayo–Athletic (J8) aplazado: aparece solo cuando tenga fecha.
- Verificar con datos reales: formato de nombres de la alineación confirmada de Comuniate y tamaño real de `mios` (AGENTS.md).
- "Analiza tu equipo" no se ha revisado en producción (requiere la sesión de Edu).

## Decisiones
- Solo valores de mercado de Futmondo; nunca inventar datos; si una fuente falla, mostrar el último dato bueno.
- Plan de pago de Cloudflare (Workers Paid, 5 $/mes): contratado por Edu el 01/11/2026. Avisos de Telegram cada minuto.
- Se mantienen los degradados de la cabecera de Equipos y de la tarjeta del próximo partido del club (Edu, 31/10).
- La Quiniela: cada partido se bloquea cuando empieza; los pronósticos de todos se ven desde el principio.
- No eludir bloqueos de bots de FutbolFantasy (denegado).
- Antes de subir: `node --check` de los JS y `node --test tests/*.test.mjs`. El `?v=` lo pone solo el despliegue.

## Errores abiertos
- Cloudflare (plan de pago desde 01/11/2026): ya no aplican los topes del plan gratis (10 ms de CPU, 1.000 escrituras KV/día, 50 llamadas por petición). Se mantienen la caché en el borde y no parsear JSON enormes en rutas calientes, por velocidad. Pendiente de comprobar en producción si los fallos sueltos de horas punta desaparecen.
- football-data.org: ~10 peticiones por minuto.
- Ninguno visual conocido a 390 px (01/11: corregido el borde derecho de la tarjeta del próximo partido del club, que se salía 8 px).

## Siguiente paso
- Jugadores con ≥ 90 % de probabilidad de jugar: comprobarlo en la web real a ~390 px y subirlo.

## 01/11/2026 — Alineaciones con jugadores repetidos (arreglado)
- Causa: FutbolFantasy añadió una 2ª tanda de 11 en el bloque de titulares. Ahora `cleanStarters` deja siempre un once válido (máx. 11, sin repetidos), en el lector, en `/once` y en `alineacion.js`.
- Tests automáticos en `tests/` (los corre el GitHub Action antes de publicar; si fallan no se despliega).

- Inicio (01/11/2026): "Destacados" se quitó y ahora es "Jugadores rentables": los 6 primeros con el mismo diseño de filas que la pestaña (función compartida `rtbRow` en `mercado.js`; `renderRachas` pinta Inicio y `renderRentables` la pestaña). "Ver más jugadores" abre la pestaña. Las tarjetas `dest-*` ya no se usan (el CSS sigue ahí).
