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
- 07/11: **noticias del Inicio rediseñadas** (clases `nw-*`): texto primero, la foto pasa a miniatura (104 px la principal, 52 px las demás), lista sin recuadros y "Últimos cambios" en su propio panel con línea de tiempo (punto de color + tipo + hora + titular). Se mantienen el enlace al editorial (`nw-*`, `renderInicioFeatured`) y el "partido en directo" si lo hay.
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

## 01/11/2026 — Tanda de 25 arreglos de Edu (hecho y subido)
- Onces: un partido final/en vivo no se marca "once confirmado". Telegram: sin imágenes, una sola alerta "ONCE DEL <EQUIPO>", confirmado con posiciones separadas, % sin alertas, mercado con "Sube más / Baja más", parte médico sin confundir nombres (tests en `tests/avisos.test.mjs`).
- Noticias: banners propios (`/img/noticia-ultima-hora.jpg`, `/img/parte-medico.jpg`), todo abre en la propia web, sin "Lo último".
- Comparador a pantalla completa (`openCmpOverlay`), resumen nuevo, sin scroll lateral en todas las hojas.
- Mercado: botones planos e iguales (CSS al final de `mercado.css`). Fichajes y Equipos con el estilo de la web; Equipos sin buscador.
- FotMob en directo: nota verde desde 7, naranja por debajo. Noticia principal "Sigue el partido en directo" (`paintLiveHero`): foto real de un jugador del equipo que gana (al azar si empatan). Sin probar con un partido en vivo real todavía.
- Alerta de fallos del menú: resumen "Fallos de fuentes (N)"; se marca leída al abrir el menú (`seen_fail_sig`).
- Visitas: `vista.js` cuenta páginas y toques por hora (KV `st:v2:<día>:<hora>`, API `vistas-horas`); página `/futmondo/stats/` con barras por hora y detalle al tocar una hora. El histórico por hora empieza el 01/11.

## 08/11/2026 — Puntos de Futmondo ya guardados al abrir un partido terminado
- Problema (Edu): al abrir un partido finalizado salían rayas "–" en cada jugador y los puntos tardaban segundos (se pedían jugador a jugador a Futmondo).
- Ahora: el cron (cada minuto) llama a `/api/laquiniela/puntos-jornada?run=1` (`recordMatchPoints`). Para cada partido terminado (>105 min tras el inicio, hasta 40 h) hace UNA consulta de prueba a Futmondo; en cuanto los puntos están publicados pide toda la plantilla de los dos equipos y, si casi todos tienen puntos finales (≥ 80 %, mín. 14), los guarda en KV `ptj:v2:<jornada>` (v1 descartado el 09/11: 38 valores del J12 desplazados por fichajes tardíos) (`{pts:{id:puntos}, teams:[…]}`, 120 días).
- La página del partido pide `/puntos-jornada?jornada=N` junto al resto (swr, edge 30 s) y pinta los puntos al instante; solo pregunta por los jugadores que falten (método antiguo `/puntos`, sin cambios). Las burbujas "–" ya no se ven: aparecen solo cuando hay puntos (`.pl-pts-wait`, `.mpage-xpts`, `.mpage-subpts`).
- No se puede leer la notificación del móvil de Futmondo; el cron mira cada minuto si ya están publicados.
- Lógica pura en `functions/_lib/matchpoints.mjs` con tests (`tests/matchpoints.test.mjs`).
- Pendiente: comprobar en producción con el primer partido que acabe (Real Sociedad–Rayo J12 ya estaba terminado al hacer el cambio).

## 09/11/2026 — Puntos del partido nuevo = puntos del partido anterior (Atlético–Barça J12)
- Problema (Edu): Hancko salía con 12 y Jonathan David con 4 en el J12 cuando Futmondo aún no había publicado los puntos. Eran los del J11.
- Causa (comprobada con datos reales): Futmondo marca el partido "terminado" antes de publicar los puntos; el array `fitness` del mercado seguía acabando en el J11 y el equipo tenía 11 partidos publicados frente a 12 terminados. (1) La ficha ponía el último valor de `fitness` en el último partido sin ninguna comprobación. (2) `getPlayerJornadaPoints` contaba los partidos terminados solo con la lista del propio jugador; David llegó tarde (su lista empieza en J4), contaba 9 en vez de 12 y daba por publicado el J12.
- Arreglo: `functions/_lib/fitness.mjs` (`fitLagOf`, `fitIndex`, con `tests/fitness.test.mjs`). `teamFinishedCount` cuenta los partidos terminados del EQUIPO con el jugador que más partidos lleva. La ficha recibe `fitLag` y deja "—" en los partidos aún sin publicar (sin calcular nada). Caché de puntos `pjp:v5` → `pjp:v6` (descarta los valores guardados mal).
- Pendiente: otras pantallas que leen `fitness` sin esta comprobación (Analiza, forma, comparador). Y fuera de los últimos 5 partidos `/puntos` aún usa el modo `stats` de Futmondo, que no son los puntos de la liga.
- 09/11 (2.ª parte): mismo fallo cerrado en el comparador y en el histórico de puntos (`recordPointsHistory` salta el equipo si hay partidos sin publicar). Test de guardia `tests/fitness-guard.test.mjs`. Medias, rachas y pronósticos usan solo valores publicados (reales), sin atribuirlos a un partido.
- 09/11 (3.ª parte): partidos de hace más de 5 jornadas: `/puntos` ya no usa el modo `stats` de Futmondo (Hancko J5 salía 12 y eran 7); usa el histórico guardado (`pth:v1`, `pthPoints`) y, sin dato real, no pone puntos. Cachés `pjp:v7` y `ptj:v2` (recalculan solos).

## 09/11/2026 — Redactor: publica solo si la frase es de ese jugador y de ese estado
- Ya no hay modo sombra ni borradores nuevos. Publica en la web y avisa por Telegram con el enlace de edumr.es.
- El RSS de YouTube está prohibido por su robots.txt; la lista va por la API oficial. Si robots.txt no se lee, no se toca esa URL.
- Una frase cierta de otro jugador (ejemplo de prueba: Leo Román / Moleiro) no se publica. La duda y el «no» tampoco se convierten en un estado firme.
- No se reescriben ni se reenvían los borradores y las noticias que ya estaban guardados.
- 09/11 (cobertura): Barcelona entra por su canal oficial y por las noticias del primer equipo en fcbarcelona.es. Además de la disponibilidad, salen citas de cambios, táctica, minutos, gestión física y valoración. La crónica de un partido solo lista goles con nombre si cuadran con el marcador. La rueda de Simeone ya leída vacía (`szC6cvFXHDs`) se vuelve a mirar una sola vez. El vídeo posterior de Flick en YouTube no está localizado; la nota oficial escrita sí (`/noticias/4606585/`).
- 09/11 (cuerpo): el relato ya no sale de una plantilla. Gemini lo escribe solo con los hechos verificados y, si una frase mete un número, un nombre o un estado que no está en esos hechos, o si dos frases seguidas empiezan igual, no se publica. Guía medida en `docs/estilo-noticias.md`.
- 09/11 (minutos y fecha): el minuto del club manda sobre FotMob; si las fuentes no oficiales no coinciden, el minuto queda en «sin datos». La fecha solo entra si la fuente la escribe como día (no se convierte un instante UTC a Madrid ni se usa la fecha de hoy). La entradilla de la crónica no repite el título.
- 09/11 (pistas): `rd:pistas:v1` solo dice de qué tema buscar. Se publica si el hecho está en la web oficial del club. Athletic y Alavés no se consultan. Si no está, no se publica. El contador queda en el estado del redactor.
- 09/11 (fuentes de LaLiga): listados y canales comprobados uno a uno. YouTube solo por la API (el RSS lo prohíbe su robots.txt). Si el robots.txt no se puede leer, ese listado no entra.

| Club | Fuente | Permitido | Motivo |
| --- | --- | --- | --- |
| Barcelona | sitemap de noticias + YouTube UC14UlmYlSNiQCBe9Eookf_A | sí | robots.txt deja el sitemap |
| Atlético | sitemap /sitemaps/noticias.xml + YouTube UCuzKFwdh7z2GHcIOX_tXgxA | sí | robots.txt no tapa ese sitemap |
| Real Madrid | YouTube UCWV3obpZVGgJ3j9FVhEjF2Q | canal sí, web no | realmadrid.com/robots.txt devuelve HTML, no se puede leer |
| Betis | YouTube UCeB7JZwcar2fVoK2w2f9OwA | canal sí, web no | robots.txt deja la web, pero el listado no respondió |
| Real Sociedad | /es/noticias + YouTube UCfeqewEKWQ8CXY8OiXoMxxw | sí | robots.txt solo tapa /cup y /es/hospitality |
| Celta | YouTube UCCJLVZYqRb_85b2Flpg04cg | canal sí, web no | el RSS /feed/ solo trae piezas de 2014 a 2018 |
| Alavés | — | no | prohibido |
| Athletic | — | no | prohibido |
| Deportivo | sitemap /es/sitemap.xml + YouTube UCY2s1XaPzO60Hu6M_YZCTgA | sí | robots.txt solo tapa el perfil |
| Rayo | /noticias + YouTube UCUTkI-vFAO7BjfpqIDFO8rQ | sí | robots.txt tapa /api, /preview y /_next; el listado trae las piezas |
| Espanyol | /es/noticias + YouTube UClywhnD01yUU5kO6OgAeHUQ | sí | robots.txt solo tapa /assets |
| Getafe | /noticias + YouTube UC34fUqq4rxJc0cj5Hart0zQ | sí | mismo robots; la pieza se abre en /noticias/el-slug |
| Elche | /noticias + YouTube UCeY_BssoWHlT-juP90UcZZg | sí | igual que Getafe |
| Osasuna | /noticias-primer-equipo + YouTube UC2JTagDPIChbcEeiLjypuYA | sí | robots.txt no tapa nada |
| Villarreal | YouTube UC0MLWyQ0L7uEZY8wbkDSTkw | canal sí, web no | ni el sitemap ni el HTML traen la pieza, solo secciones |
| Valencia | sitemap-club-2026.xml + YouTube UCgvyo5x49J8ht5H9imKfxMQ | sí | robots.txt no tapa nada |
| Sevilla | YouTube UCLy9lmj_0cqffXUzbGHNmYA | canal sí, web no | /actualidad/noticias no trae enlaces de piezas |
| Levante | /noticias + YouTube UCvOegN2N1FGPPv4xBNN2F9A | sí | igual que Getafe |
| Málaga | /noticias + YouTube UCo_PhWZulZooYfQRo00vU-Q | sí | igual que Getafe |
| Racing | /noticias + YouTube UCPkCdE745MkHLx8YWOwi8ew | sí | robots.txt no tapa nada |
| LaLiga | /noticias | no | la página no trae piezas; el sitemap de noticias está en assets.laliga.com y su robots.txt no se puede leer |
| Oviedo | YouTube UCvpFN8tLnBsjPR2BCJ-FJQA | canal sí | ya estaba; no es uno de los 20 con ficha |
- 09/11 (4.ª parte): aviso automático de Telegram cuando Futmondo publica los puntos de un partido ("✅ PUNTOS DE FUTMONDO · Atlético de Madrid – Barcelona (J12)"). `recordMatchPoints` devuelve `savedInfo` con los nombres; el cron (`colaPuntos` / `avisarPuntos` en `cron/src/avisos.js`) los mete en la cola KV `tg:puntos-cola:v1` y los manda; de 00:00 a 08:00 se retienen hasta las 08:00 (misma regla de silencio que el resto). Tests: `tests/avisos-puntos.test.mjs`. Sin probar con el bot real (el token solo está en Cloudflare): comprobar el primer aviso con el siguiente partido.
