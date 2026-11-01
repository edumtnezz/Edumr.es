# AGENTS.md — proyecto web edumr.es

## Cómo trabajo aquí
- Se despliega con un push a `main` (GitHub Action, ver "Despliegue automático"). `deploy.ps1` queda solo como plan B manual desde el PC (wrangler fijado a `4.131.1`; no subir esa versión).
- Ya **no** hay que subir el `?v=N` a mano: en el despliegue, `scripts/version-assets.mjs` pone la versión de cada CSS/JS según el contenido del archivo (si el archivo cambia, cambia la URL; si no, se queda igual). Puedes seguir editando el HTML sin tocar los números.
- Antes de subir: `node --check` de los JS tocados y `node --test tests/*.test.mjs`.

## REGLA IMPORTANTE: fallos visuales → captura real
Siempre que el usuario reporte un error/fallo, ANTES de tocar nada, hacer una **captura real de la web con Chrome headless** y mirarla, y volver a capturar despues del arreglo para confirmar.

Desde una sesión en la nube (sin el PC de Edu) hacer la captura con el navegador disponible (Chrome o el integrado), a ~390 px de ancho; el script de abajo es solo para el PC de Edu.

Script de captura (PC de Edu, Windows):
```
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --hide-scrollbars --window-size=1400,900 --virtual-time-budget=7000 `
  --screenshot="C:\Users\PC\AppData\Local\Temp\opencode\porra\shot.png" "<URL>"
```
Luego leer el PNG con la herramienta Read.

Para ver estilos/posiciones calculadas (depurar huecos, etc.) usar el CDP:
`node C:\Users\PC\AppData\Local\Temp\opencode\porra\cdp.js "<URL>"` (imprime padding/index del appbar, etc.).

## Mapa rápido
- Web principal: `index.html`, `styles.css`, `script.js`, `theme-init.js`.
- Juegos (hub): `futmondo/` (hub), `futmondo/quiniela/`, `futmondo/porra/`, `futmondo/lapuja/`.
- CSS compartido de los juegos: `futmondo/quiniela/quiniela.css`.
- Tema claro/oscuro compartido: `futmondo/theme.js` (clave `theme` en localStorage; por defecto CLARO).
- Backend: `functions/api/laquiniela/[[path]].js` (KV namespace PORRA `4f99553a34954704b9786bbb14ca74c5`).
- Pujas: estado en un **Durable Object** (Worker aparte `puja-do/` → `edumr-puja`), enlazado desde el `wrangler.toml` de Pages con binding `PUJA` (clase `PujaRoom`, `script_name="edumr-puja"`). El estado atómico evita perder pujas.
  - Para redesplegar el DO: `cd puja-do; $env:CLOUDFLARE_ACCOUNT_ID="9d0e362ef9848559e9e7b5ff1416bc6f"; npx wrangler@4.131.1 deploy`.
  - Si el binding no existe, la Function cae al KV antiguo (`puja:current`, `puja:history`).
- Los ids/credenciales de Futmondo y de la API están como secretos en Cloudflare Pages.

## Despliegue automático (NUEVO)
- Al hacer push a `main`, un **GitHub Action** (`.github/workflows/deploy.yml`) publica sola la web (Pages) y el Worker (`puja-do`). Usa `build.sh` para armar `dist`.
- Secretos del repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Ya NO hace falta `deploy.ps1` (ni el PC). Cualquier push despliega.
- **Después de publicar**, el Action corre `scripts/smoke.mjs` (8 páginas + 4 APIs). Si la web se queda en blanco, sin datos o una API cae, el despliegue sale en rojo. Antes de dar algo por bueno, mira además con captura real a 390 px.
- **Visitas**: `futmondo/vista.js` (sin cookies) → `/api/laquiniela/vista` → KV `st:v1:<día>` → `/futmondo/stats/` (noindex). Una visita por página y sesión.



## 🔔 Avisos de Telegram (31/10/2026) — `cron/src/avisos.js`
- Cron propio **cada minuto** (`* * * * *` en `cron/wrangler.toml`, rama en `cron/src/index.js`; posible porque Edu contrató el plan de pago de Cloudflare el 01/11/2026). Bot de Telegram solo para avisos.
- Secreto en Cloudflare (Worker `edumr-cron` → Settings → Variables y secretos, tipo *Secret*): `TELEGRAM_BOT_TOKEN`. El token NUNCA va en el chat ni en el repo. El chat de Edu se descubre solo: el primer chat privado que escribe `/start` al bot queda guardado (opcional: secreto `TELEGRAM_CHAT_ID`). Sin token no hace nada.
- Estado en KV `PORRA`, clave `tg:avisos:v1` (solo escribe cuando manda o cambia algo, para no gastar escrituras de KV).
- Qué avisa (solo lo NUEVO): 📰/🔔/⭐ TODAS las noticias nuevas (⭐ nombran a un jugador de Con Permisoo, 🔔 lesión/sanción/duda/titularidad, regex `KW`); ✅ alineación confirmada de TODOS los partidos con los dos onces (⭐ marca a sus jugadores y lista los suyos que no están); 🔄 once probable actualizado (quién entra y sale en cada equipo, de `/api/laquiniela/alineaciones-estado` + `/api/laquiniela/probables`, comparando el once guardado en `st.pr`); 🔄 cambios en sus jugadores (% de jugar de FutbolFantasy y estado de Futmondo).
- Cadencia rápida sin gastar KV: lee directo de la fuente (noticias y once confirmado cada minuto; once probable cada minuto si el partido es en menos de 3 h, cada 5 min si es en menos de 24 h, cada 15 min hasta 72 h; plantilla cada 15 min; precios cada 10 min) (`noticias-rapido`, `probables?home&away`, `alineaciones-confirmadas?run=1&fresh=1`, que no usan caché ni escriben KV). Once probable: partidos de las próximas 72 h. Once confirmado: solo si un partido empieza en [−20 min, +2 h 30]. Plantilla (`mios`) cada 15 min; lista de partidos (`ko`) cada hora. Solo de día (08:00–24:00 Madrid).
- Su plantilla sale de `/api/laquiniela/mios` (`getMios`): Futmondo solo da el dueño en la ficha de cada jugador (1 llamada c/u) y la Function aguanta ~50, así que se resuelven 34 por pasada rotando y el dueño se guarda en KV `fm:owners:v1`. Devuelve `cover {total, known}` para saber si la plantilla está completa (31/10: 91 jugadores con dueño humano; `clausulas` solo resolvía 43).
- Formato avisos: precios en una línea por jugador (🟢▲ +X / 🔻🔴 −X, como Comuniate); once probable con 🟢 ENTRA / 🔴 SALE / 🟡 % (≥15 pts) + posición (POR/DEF/MED/DEL), hora del partido y de actualización; escudos de football-data (200 px) en un mensaje con fotos + detalle en otro (si Telegram rechaza las fotos, todo como texto). La miniatura del aviso de mercado es la imagen fija `img/mercado-subidas-bajadas.jpg` (og:image puesto por `functions/futmondo/guiafantasy/mercado.js`). Noticias: título + resumen breve (entradilla) + "Más información:" + enlace a la web.
- Precios: cuando cambian los valores de Futmondo (`mercado`, campo `change`) manda top 5 subidas y top 5 bajadas (mín. 6 h entre avisos; de noche espera a las 08:00).
- Fotos: la función `functions/futmondo/guiafantasy/noticias/[[slug]].js` pone foto/título/resumen de la noticia en la vista previa del enlace a la web (og:*, leídos de FutbolFantasy; si falla sirve la web normal).
- Estilo: titulares en mayúsculas con emoji al principio (BAJA / SANCIÓN / DUDA / TITULAR / ÚLTIMA HORA, ONCE CONFIRMADO, ONCE PROBABLE ACTUALIZADO, MERCADO EN MOVIMIENTO, TUS JUGADORES CAMBIAN); la primera línea es la que se ve en la lista de chats. Todo dato sale de la fuente, nada inventado.
- Noticias de varias fuentes (01/11/2026): FutbolFantasy + Comuniate (`/noticias/comunio`, "HACE X MINUTOS") + Jornada Perfecta (home, solo trae el día) en `getNoticiasMulti` (`noticias` y `noticias-rapido`). Sin historias repetidas: `sameStory`/`sameTok` (≥2 palabras clave compartidas y el 40 % de las del título más corto, sin contar equipos ni palabras genéricas; solo entre fuentes DISTINTAS); gana la que sale antes. Probado con 13 pares reales de titulares. En los avisos el historial de 12 h está en el estado (`st.nt`). Se filtran las de otros juegos (Comunio, Biwenger, Mister, LaLiga Fantasy), portadas, roscos y alineaciones confirmadas de Comuniate (ya las avisamos nosotros). Slugs de tu web: `cm-<id>-<slug>` y `jp-<slug>`; la web enseña titular, foto y resumen y manda a leer la noticia completa en su fuente (no se copia el texto). Marca.com: bloqueado para mis herramientas (no se accede ni se eludió).
- Enlaces: todo aviso enlaza a LA WEB (noticia → /noticias/<slug>, onces → /partido/<slug>, plantilla → inicio), nunca a la fuente externa.
- Reglas: silencio 00:00–08:00 Madrid (se guarda como visto, no se manda), máx. 10 mensajes por pasada, noticias de más de 4 h no se avisan, primera pasada solo guarda y manda "Avisos activados". Si falla una fuente, no se avisa (nunca se inventa).
- Pendiente de verificar con datos reales: formato de nombres de la alineación confirmada de Comuniate (cuando haya partidos con once confirmado) y tamaño real de `mios`.

## 🚫 Fallos ya reportados por Edu (NO repetir; comprobar siempre antes de dar algo por hecho)
Antes de tocar partidos/alineaciones/ficha, repasar esta lista y verificar con captura real.
- **Fases del partido** (siempre así): días antes = alineación PROBABLE con % y % de banquillo → rato antes = CONFIRMADA sin % → en juego = "Partido en juego" con la alineación actual (NUNCA "probable 100%") → final = resumen. Si todos los titulares están al 100% o el partido ya empezó, es confirmada/en juego.
- **Directo**: la cabecera "Equipo 0 - 0 Equipo" va centrada y alineada con los números, pegada al VS sin tapar escudos. El refresco automático (60 s) NO debe echar al usuario ni mover el scroll.
- **Formaciones**: nunca 3-6-1 ni raras; el texto de la formación debe coincidir con el dibujo del campo.
- **Eventos del partido**: minutos EXACTOS con descuento (90+2', 90+10'), con el marcador de cada gol; asistencia dentro de la tarjeta del gol; rojas (también doble amarilla / "Expulsión" de la crónica) con su minuto; cambios por minuto y plegados. Un jugador expulsado NO se cambia: no inventar sustituciones. Iconos de evento no pegados a la puntuación.
- **Nombres/fotos**: resolver el goleador contra los jugadores del equipo (ej. "Adri" = Adrián de la Fuente, no Adrián Niño). Alexander-Arnold = "Trent" en Futmondo; usar la foto de cara (no cuerpo entero, ej. Morante). Escudos Alavés y Málaga: PNG de Futmondo, sin fondo blanco.
- **Ficha de jugador**: sin "Precio: más caro…", sin dorsal/Biwenger/LaLiga Fantasy. Próximos partidos con "J9, J10…" (sin la jornada ya empezada). Si el partido de esa jornada está en juego o sin jugar NO poner "No jugó" (poner En juego / Aún no se ha jugado). Pronóstico con % al lado, sin cuadro "Titularidad".
- **Mercado**: botones (no desplegables ni deslizadores), todos iguales; buscador grande y fijo arriba al escribir (el teclado del móvil no debe tapar lo que escribes); tabla estrecha en móvil; cada jugador en su recuadro; sin fondos blancos raros.
- **Cloudflare KV**: desde el 01/11/2026 hay plan de pago (1 M de escrituras/mes incluidas, luego 5 $ por millón; antes 1.000/día). Aun así, datos cacheados cortos van a Cache API (`withCacheKV`) y no se meten puts nuevos a KV en rutas calientes.
- **Mobile first**: Edu mira casi todo en el móvil; comprobar ancho ~390 px.
- Si cambia la cache de un endpoint, subir la clave (`cambios:v5`…) para no servir datos viejos.
- **Puntos de Futmondo tras el partido**: si el partido ya terminó y aún no han llegado los puntos (Futmondo Social), la página debe seguir buscándolos cada minuto hasta que lleguen (nunca quedarse sin puntos y sin MVP). Regla pedida por Edu: aplicar SIEMPRE a cualquier sitio donde se muestren puntos de partidos terminados.
- **Tope de llamadas por petición (Cloudflare)**: con el plan gratis una Function solo podía hacer ~50 llamadas externas/KV por petición (con el plan de pago, desde el 01/11/2026, son miles, pero se mantiene el reparto en trozos por rapidez y fiabilidad). Endpoints que consultan un jugador cada uno (`/puntos`) se piden desde el cliente en trozos de 8 ids (máx. 12 por petición). Nunca pedir 20-60 jugadores de golpe: la mayoría fallaba y se veían partidos sin puntos.
- Cualquier salvaguarda nueva debe probarse en un partido real con TODOS sus jugadores antes de dar por hecho que funciona (la primera versión de la de puntos escondía los puntos de casi todos).
- **Carga instantánea (swr.js)**: `futmondo/swr.js` envuelve `fetch` de la API (mercado, jugador, jornada, partido…): pinta al instante lo guardado en localStorage y actualiza detrás; si cambia, lanza el evento `cx:swr` y la página se repinta en el sitio (sin mover el scroll). Cualquier página nueva que pida datos de la API debe escuchar `cx:swr` (si no, se queda con lo viejo). No cachear endpoints del usuario (`me`, etc.).
- **Jornadas falsas (mock)**: football-data.org (plan gratis) limita a ~10 peticiones/min. Antes, si fallaba, `getJornadaRaw` devolvía una jornada INVENTADA (Real Madrid–Barcelona "mañana") y se veía como real (J9, J10 y J11 con el mismo partido). Ahora nunca se inventa: se sirve la última copia buena o una jornada vacía. Las jornadas terminadas se cachean 6 h. No abrir muchas jornadas de golpe desde el cliente sin pensar en este límite; si cambia el formato de la caché de `jornada`, subir también el prefijo de `swr.js` (`swr2:`…).

- **Los clubes están en UN solo sitio: `futmondo/teams.js`** (`window.EduTeams`: `canon`, `href`, `alias`). Antes había tres listas con los mismos 20 equipos (teamCanon, CLUB_SLUG y ALI) y de ahí salió el fallo del Alavés (quedaba como `dep` porque la regla del Deportivo iba antes que la suya). Para añadir/cambiar un club, se toca SOLO esa tabla y se pasan los tests (`tests/teams.test.mjs`). Regla: las reglas más concretas van primero (`/alaves/` antes de `/coruna|depor/`).
- **Páginas de partido rotas (13/10/2026)**: un trozo de código suelto (`formOf(p)` sin `p`) metido en `buildOtherMatches` hizo que NINGÚN partido cargara («No se pudo cargar el partido»). Tras CUALQUIER cambio en `mercado.js`, abrir una página de partido real (`/futmondo/guiafantasy/partido/<local>-<visitante>?j=N`, jornada abierta y jornada terminada) y mirar la consola; el error se escribe como `partido: …`. Pasar también `eslint no-undef` antes de subir.

- **Jugadores repetidos en el campo (01/11/2026)**: FutbolFantasy metió una 2ª tanda de 11 (sin posición ni %) en el bloque de titulares y salían 22 por equipo. Defensa en 3 capas: `cleanStarters` (`functions/_lib/starters.mjs`: solo con posición, sin repetidos, máx. 11) en `getFFTeam` y de nuevo en `/once`; `alineacion.js` también quita repetidos y corta en 11; tests en `tests/` que corre el GitHub Action ANTES de publicar (si fallan, no se despliega). Si se toca el lector de FutbolFantasy, añadir/ajustar el test.

- **Partidos jugados ≠ número de jornada (arreglado 01/11/2026)**: con una jornada aplazada (Rayo–Athletic, J8) el equipo lleva un partido menos que la jornada en curso. El denominador de la ficha (partidos y minutos máximos) tienen que ser los partidos REALES del equipo: `playedDenominator`/`teamPlayedMatches` en `functions/_lib/played.mjs` (los saca del mercado: máximo de partidos de los jugadores de ese equipo). Unai Simón salía "9 de 10" y 900' cuando había jugado los 9 de 9 (810'). Si se añade otra pantalla con "X de Y partidos", usar ese mismo cálculo y su test.

## 🚫 REGLA GRAVE: NO INVENTAR NADA (pedida por Edu)
- Nunca inventar datos, cifras, pesos, rangos ni explicaciones. Todo dato sale de una fuente real (Futmondo, FutbolFantasy, football-data…). Si no hay dato, NO se muestra o se dice "sin datos".
- Si una fórmula necesita parámetros arbitrarios (pesos, bonus, rangos), no usarlos; si no hay más remedio, decirlo claramente al usuario, nunca presentarlos como si fueran datos.
- Al explicar algo, decir honestamente qué se verificó y qué no.

## Liga de Edu (verificado con captura de ajustes, 13/10/2026) — "Con Permisoo"
- Futmondo Social, puntuación CONFIGURABLE: Diario AS 50%, Marca 50%, SofaScore 50%, Tiempo de juego 0%, estadísticas básicas. Capitán sí, multiposición sí, estrategias extra sí, entrenador manual, se puede cambiar un jugador ya puntuado, alineaciones bloqueadas en partidos aplazados.
- Primas: 70.000€/punto, 1.000.000€ por jugador en el equipo ideal, 2.000.000€ por MVP de jornada.
- Puntuación verificada con la ayuda oficial de Futmondo (https://help.futmondo.com/article/269-modo-configurable-futmondo-liga-ea-sports) y con 4 jugadores reales: puntos de cada medio (tabla) × su % y se suman (con 50% cada uno aporta la mitad). Estadísticas básicas: 60+ min +1, asistencia +1, gol portero 8 / defensa 6 / centrocampista 4 / delantero 3, portería a cero +1 solo POR/DEF, -1 por cada 2 goles encajados solo POR/DEF, propia -1, penalti fallado -2, doble amarilla -3, roja -5. AS/Marca: 4=14, 3=10, 2=6, 1=2, guion=-2. SofaScore: 10=15 … 6=0, 5,6-5,9=-1, 5-5,5=-2, 3,1-4,9=-3, 0-3=-4 (faltan filas intermedias). Esto vive en `LIGA_CONTEXTO` del backend.

## Ideas pendientes de Edu (hacer cuando acabe lo de "Analiza tu equipo")
1. **Jugadores rentables**: qué jugadores puntúan más en SofaScore, ordenables por calidad-precio (con fuente verificada, nada inventado).
2. **Jugadores con ≥90% de probabilidad de jugar** (datos de FutbolFantasy).
3. **Minutos jugados y rotaciones** (Edu, 13/10/2026): guardar el histórico de minutos de cada jugador (dato real de Futmondo: `mins` por partido en `/jugador`) para saber cuánto tiempo está en el campo. Poder filtrar/ordenar por los que juegan más minutos y por los que casi nunca sustituyen (más tiempo en campo = más opciones de gol y de puntos). Va junto a la idea 2 (apartado de jugadores con más posibilidades de jugar). Solo con datos reales; nada inventado.
4. **Ajuste por rival** (pendiente de confirmar con Edu): medido el 13/10/2026 con 200 jugadores y 849 partidos (J4–J8): contra rival de los 10 primeros −1,6 pts (±0,4) frente a rival de los 10 últimos; casa/fuera casi no cambia (+0,35 ±0,35). Si se aplica, calcularlo en backend y cachearlo, y decir que es medición real de esta liga.

## Hallazgos verificados para Analiza (13/10/2026)
- Puntos de un jugador en la jornada = suma de lo que aporta cada medio (ya × %) + estadísticas básicas; confirmado con la ayuda oficial de Futmondo (ver arriba).
- Lanzadores de penaltis: constante `PENALTY_TAKERS` en el backend (Jornada Perfecta, 06/08/2026; revisar si cambian).
- Dificultad del rival: ESTIMACIÓN propia (aprobada por Edu) con `getTableStats`/`rivalDifficulty` en el backend: clasificación y goles a favor/en contra reales (football-data, partidos terminados, split casa/fuera). Atacantes: goles que encaja el rival; defensas/portero: goles que marca. Con muestra corta se avisa. No hay fuente directa de "puntos concedidos por posición".
- SofaScore por posición: solo hay guías cualitativas (Comuniate, Jornada Perfecta); el artículo oficial de SofaScore no da pesos por posición.

- **Límite de CPU de Cloudflare (aviso 14/10/2026, "Workers CPU limit exceeded" 1.000+ veces/24 h)**: el plan gratis daba ~10 ms de CPU por petición (desde el 01/11/2026 hay plan de pago con hasta 30 s, pero no hay que abusar: la web debe seguir siendo rápida). Causa: `/mercado` leía y parseaba `fmhist` (histórico de varios MB) DOS veces en cada visita. Arreglo: marcador diario `fmhist:day` (no se parsea fmhist salvo 1 vez al día), `fmhist` solo si no hay mapa de temporada, `ffPick` con índice de claves, y caché de respuestas públicas (`EDGE_TTL` + `onRequestGet` → Cache API, cabecera `x-edge: hit`). NUNCA parsear JSON grandes (`fmhist`, `fm:season`, `ff:map5`) en rutas calientes sin caché; al añadir un endpoint público nuevo, ponerlo en `EDGE_TTL`.

## Comparador de jugadores (31/10/2026) — `mercado.js` (bloque `cmp*`), `jugador.css` (`.cmpx-*`)
- Pestaña `comparador` (menú Más). Dos jugadores del mercado de Futmondo; lo básico sale de `all` (mercado) y el detalle de `/jugador?id=` (goles/asistencias, % titular y minutos, valor 5 días/30 días/temporada). `Prob. jugar` = % de FutbolFantasy del mercado.
- Nada se calcula ni se inventa: lo que falta sale como "—". Si `/jugador` falla se usa el último detalle bueno guardado (`gf:cmp:data:v1`, aviso con fecha) y botón "Reintentar".
- Comparaciones guardadas: localStorage del dispositivo (`gf:cmp:saved:v1`, máx. 30), sin gastar escrituras de KV. No se sincronizan entre dispositivos.
- Se pidió las dos fichas a la vez: releer el almacén DESPUÉS de esperar la respuesta (una versión anterior se pisaba y solo guardaba una).
- Se eliminó el comparador antiguo huérfano (sin HTML) que calculaba una "Prob. jugar" con una fórmula inventada.

## Reglas para continuar el trabajo (plan B con otro asistente)
- Después de cada tarea importante, actualiza ESTADO.md.
- Nunca inventes datos: todo dato debe salir de una fuente real (webs, APIs); si no hay dato, no lo inventes.
- Comprueba y revisa las cosas tú mismo (entrar en la web, usar las APIs, comparar datos) en vez de pedirme datos que ya puedes consultar.
