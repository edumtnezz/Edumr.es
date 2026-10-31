# AGENTS.md — proyecto web edumr.es

## Cómo trabajo aquí
- Se despliega con un push a `main` (GitHub Action, ver "Despliegue automático"). `deploy.ps1` queda solo como plan B manual desde el PC (wrangler fijado a `4.131.1`; no subir esa versión).
- Tras cada cambio visible, subir la versión del CSS/JS afectado (`?v=N`) en el HTML y hacer push.
- Antes de subir: `node --check` de los JS tocados.

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

## Agente en el VPS (edición desde el móvil por Telegram)
- VPS (C2G): `193.36.236.222`, root. Ubuntu 22.04, 2 vCPU, 2 GB.
- Carpeta `/opt/edumr`: `repo` (clon del repo), `venv` (Aider), `bot.py` (bot de Telegram), `config.json` (token Telegram, secret, clave DeepSeek).
- Servicio `edumr-bot` (systemd, `Restart=always`). Reiniciar: `systemctl restart edumr-bot`.
- Bot Telegram: **@eduarIA_bot**. Autoriza el **primer chat** que escribe (queda como dueño; ya no hay `/start <SECRET>`).
- Flujo: mensaje → `git fetch+reset` → Aider (modelo `openai/deepseek-flash`, base `https://api.deepseek.com`) → commit+push → GitHub Action despliega → aviso `🔔 ya publicado`.
- Progreso visible: `🧠 Pensando…` → `⏳ Trabajando… (N min)` → `✅ Hecho y subido` / `🤔 No he cambiado nada` / `❌ Error`.
- Git del VPS usa clave `/root/.ssh/edumr_deploy` (deploy key con escritura en el repo).
- Extra en `config.json`: `github_token` + `github_repo` (para el aviso de despliegue vía API de GitHub Actions).
- ⚠️ **Este bot es SOLO para la web `edumr.es`** (proyecto fijo `web`). Para proyectos nuevos hay otro bot aparte (ver `C:\Users\PC\Desktop\PROMPT-BOT-PROYECTOS.md`).
- Comandos: `/ayuda` `/menu` `/modelo` `/preguntar <duda>` `/revisar` `/captura` `/estado` `/actualizar` `/deshacer` `/web` `/coste` `/tarea`.
- 🎛️ Menú con **botones**: Preguntar, Revisar, Estado, Coste, Web, Deshacer, Ayuda.
- 🎙️ **Notas de voz**: `getFile` → ffmpeg (16k mono) → `faster-whisper` `small` (español).
- 🖼️ **Fotos/capturas**: visión de `deepseek-flash` (OpenAI-compatible, thinking OFF). Responde "ACCIÓN:" + "PISTAS:" → dice **"🖼️ Voy a: …"**. Con texto → ejecuta; sin texto → espera un "hazlo".
- 🧠 **IA rápida (~15 s)**: **plan** por API directa (en español, ~2 s) → **edición con Aider** → **verificación** del diff por API directa (`<SI|NO> | <resumen>`). El resumen alimenta el mensaje final. Si la verificación dice NO, reintenta (hasta 3). Nunca pide "sé más concreto".
- ⚡ **Claves de la velocidad** (¡importante!): DeepSeek V4.1 trae **thinking ACTIVADO por defecto** (¡lentísimo!). Se desactiva con `--model-settings-file /opt/edumr/myset.yml` (`extra_body.thinking.type=disabled`). Además Aider con `--edit-format diff` (no reescribe el archivo entero) y `--map-tokens 0`. Resultado: **~14 s** vs **>10 min**. Guardar `thinking: disabled` también en las llamadas directas (plan/verify/visión).
- ⚠️ **Sin chequeo visual automático**: se quitó porque la visión **lee mal el texto pequeño** de las capturas (falsos NO → reintentos en bucle). La fiabilidad la da la verificación del diff.
- 💶 **Coste en euros**: tokens (entrada/salida) × precio DeepSeek V4.1-Flash (peak/off-peak), mostrado al terminar y acumulado en `/coste`.
- 🛡️ **Guardián anti-destructivo**: si un cambio borra muchísimo (>=100 líneas y añade <20%), se cancela y se restaura.
- 🧵 **Memoria corta** por chat (últimos 4 turnos) para resolver "esto"/"eso" sin disparar el consumo.
- ⏰ **Tareas programadas**: `/tarea`, `/tarea diario 09:00 <petición>`, `/tarea borrar <id>`. Hilo `scheduler` (hora Europe/Madrid).
- 🔔 Siempre responde: sticker/vídeo/archivo reciben contestación, nunca silencio.
- Config en `config.json` (chmod 600): token, clave DeepSeek, token+repo GitHub, model, tareas, offset, usage, memory.



## 🚫 Fallos ya reportados por Edu (NO repetir; comprobar siempre antes de dar algo por hecho)
Antes de tocar partidos/alineaciones/ficha, repasar esta lista y verificar con captura real.
- **Fases del partido** (siempre así): días antes = alineación PROBABLE con % y % de banquillo → rato antes = CONFIRMADA sin % → en juego = "Partido en juego" con la alineación actual (NUNCA "probable 100%") → final = resumen. Si todos los titulares están al 100% o el partido ya empezó, es confirmada/en juego.
- **Directo**: la cabecera "Equipo 0 - 0 Equipo" va centrada y alineada con los números, pegada al VS sin tapar escudos. El refresco automático (60 s) NO debe echar al usuario ni mover el scroll.
- **Formaciones**: nunca 3-6-1 ni raras; el texto de la formación debe coincidir con el dibujo del campo.
- **Eventos del partido**: minutos EXACTOS con descuento (90+2', 90+10'), con el marcador de cada gol; asistencia dentro de la tarjeta del gol; rojas (también doble amarilla / "Expulsión" de la crónica) con su minuto; cambios por minuto y plegados. Un jugador expulsado NO se cambia: no inventar sustituciones. Iconos de evento no pegados a la puntuación.
- **Nombres/fotos**: resolver el goleador contra los jugadores del equipo (ej. "Adri" = Adrián de la Fuente, no Adrián Niño). Alexander-Arnold = "Trent" en Futmondo; usar la foto de cara (no cuerpo entero, ej. Morante). Escudos Alavés y Málaga: PNG de Futmondo, sin fondo blanco.
- **Ficha de jugador**: sin "Precio: más caro…", sin dorsal/Biwenger/LaLiga Fantasy. Próximos partidos con "J9, J10…" (sin la jornada ya empezada). Si el partido de esa jornada está en juego o sin jugar NO poner "No jugó" (poner En juego / Aún no se ha jugado). Pronóstico con % al lado, sin cuadro "Titularidad".
- **Mercado**: botones (no desplegables ni deslizadores), todos iguales; buscador grande y fijo arriba al escribir (el teclado del móvil no debe tapar lo que escribes); tabla estrecha en móvil; cada jugador en su recuadro; sin fondos blancos raros.
- **Cloudflare KV**: máx. 1.000 puts/día → datos cacheados cortos van a Cache API (`withCacheKV`); no meter puts nuevos a KV en rutas calientes.
- **Mobile first**: Edu mira casi todo en el móvil; comprobar ancho ~390 px.
- Si cambia la cache de un endpoint, subir la clave (`cambios:v5`…) para no servir datos viejos.
- **Puntos de Futmondo tras el partido**: si el partido ya terminó y aún no han llegado los puntos (Futmondo Social), la página debe seguir buscándolos cada minuto hasta que lleguen (nunca quedarse sin puntos y sin MVP). Regla pedida por Edu: aplicar SIEMPRE a cualquier sitio donde se muestren puntos de partidos terminados.
- **Tope de llamadas por petición (Cloudflare)**: una Function solo puede hacer ~50 llamadas externas/KV por petición. Endpoints que consultan un jugador cada uno (`/puntos`) se piden desde el cliente en trozos de 8 ids (máx. 12 por petición). Nunca pedir 20-60 jugadores de golpe: la mayoría fallaba y se veían partidos sin puntos.
- Cualquier salvaguarda nueva debe probarse en un partido real con TODOS sus jugadores antes de dar por hecho que funciona (la primera versión de la de puntos escondía los puntos de casi todos).
- **Carga instantánea (swr.js)**: `futmondo/swr.js` envuelve `fetch` de la API (mercado, jugador, jornada, partido…): pinta al instante lo guardado en localStorage y actualiza detrás; si cambia, lanza el evento `cx:swr` y la página se repinta en el sitio (sin mover el scroll). Cualquier página nueva que pida datos de la API debe escuchar `cx:swr` (si no, se queda con lo viejo). No cachear endpoints del usuario (`me`, etc.).
- **Jornadas falsas (mock)**: football-data.org (plan gratis) limita a ~10 peticiones/min. Antes, si fallaba, `getJornadaRaw` devolvía una jornada INVENTADA (Real Madrid–Barcelona "mañana") y se veía como real (J9, J10 y J11 con el mismo partido). Ahora nunca se inventa: se sirve la última copia buena o una jornada vacía. Las jornadas terminadas se cachean 6 h. No abrir muchas jornadas de golpe desde el cliente sin pensar en este límite; si cambia el formato de la caché de `jornada`, subir también el prefijo de `swr.js` (`swr2:`…).

- **Páginas de partido rotas (13/10/2026)**: un trozo de código suelto (`formOf(p)` sin `p`) metido en `buildOtherMatches` hizo que NINGÚN partido cargara («No se pudo cargar el partido»). Tras CUALQUIER cambio en `mercado.js`, abrir una página de partido real (`/futmondo/guiafantasy/partido/<local>-<visitante>?j=N`, jornada abierta y jornada terminada) y mirar la consola; el error se escribe como `partido: …`. Pasar también `eslint no-undef` antes de subir.

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

- **Límite de CPU de Cloudflare (aviso 14/10/2026, "Workers CPU limit exceeded" 1.000+ veces/24 h)**: el plan gratis da ~10 ms de CPU por petición. Causa: `/mercado` leía y parseaba `fmhist` (histórico de varios MB) DOS veces en cada visita. Arreglo: marcador diario `fmhist:day` (no se parsea fmhist salvo 1 vez al día), `fmhist` solo si no hay mapa de temporada, `ffPick` con índice de claves, y caché de respuestas públicas (`EDGE_TTL` + `onRequestGet` → Cache API, cabecera `x-edge: hit`). NUNCA parsear JSON grandes (`fmhist`, `fm:season`, `ff:map5`) en rutas calientes sin caché; al añadir un endpoint público nuevo, ponerlo en `EDGE_TTL`.
