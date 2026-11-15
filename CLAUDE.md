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

## Análisis propios (13/11/2026)
- `functions/_lib/analitica.mjs` + ruta `analitica`: calendario de dificultad (pestaña Calendario), once probable propio (aún sin enseñar; se compara con FutbolFantasy y se mide su acierto) y previsión de valor (mañana ≈ cambio de hoy, solo con 50.000 € o más). Detalle y cifras de acierto en ESTADO.md. Cualquier cifra de acierto que se enseñe debe salir de una comprobación real contra jornadas o días pasados.

## Decisiones del 14/11/2026
- **Subidas y bajadas de valor no son noticia**: fuera de «Últimos cambios» y de la ficha de la noticia. Telegram manda el mercado UNA vez al día, cuando Futmondo cambia los valores (sobre las 04:30, en silencio), sin repetir por la tarde.
- **Estado y titularidad van separados** en el perfil: el estado sale de nuestro registro (el mismo de la noticia, con enlace a ella) y la titularidad aparte. Nunca «Pronóstico: Lesionado».
- **Previsión de valor** (`previsionValor`): solo si hoy se mueve 100.000 € o más y ayer fue en el mismo sentido; se enseña «Previsión 3 días: más de X» con X = cambio de hoy. Comprobado con 507 jugadores (20/08–13/11): se cumple el 84 % en subidas y el 89 % en bajadas. No cambiar la regla sin volver a comprobarla.
- **Minutos de FotMob** (`functions/_lib/fotmob-min.mjs`): solo para partidos sin detalle en Futmondo y solo si el nombre del jugador se encuentra en FotMob en un partido que Futmondo sí tiene. Nunca puntos.
- **Onces propios**: el historial solo da ~71 % (7,8 de 11) con cualquier variante probada. Se guarda una probabilidad interna por jugador (`probInterna`) y un duelo con FutbolFantasy (`an:duelo:v1`): la previsión de cada uno 90 min antes del partido contra los titulares reales. Resultado en `/api/laquiniela/analitica` → `duelo`. No se enseña el once propio hasta que el duelo diga que iguala al de fuera. En el once probable se ven los dos % por jugador: E (nuestro, `probE`) y F (FutbolFantasy). La E sale de la frecuencia real de su «situación» (`situacion`: portero fijo 95 %, fijo de campo ~82 %, habitual que vuelve tras no jugar 47 % / 18 %, rotado 60 %) o, si no encaja en ninguna, de su tramo de peso. Medido el 14/11/2026: afina los % (Brier 0,1688 → 0,1669) pero NO sube el acierto del once (sigue en 7,8 de 11).
- Botones de vuelta: uno solo y con el nombre del sitio («Noticias», «Todos los equipos», «Mercado»), nunca «Volver». Sin «actualizado hace…».

## Decisiones del 15/11/2026
- **Botón de vuelta**: flecha dentro de un círculo + el nombre del sitio, separado del borde (`.bk`, en `mercado.css` y `edumr.css`). Edu lo veía «muy pegado» a la izquierda. No volver al texto con flecha suelta ni a la pastilla con borde.
- **Quiniela y Porra → club**: tocar escudo o nombre abre `/equipos/<club>` (`futmondo/clubgo.js` + `teams.js`). El botón de vuelta del club dice «La Quiniela»/«La Porra» y devuelve al mismo punto (pestaña y altura).
- **Últimos enfrentamientos** en la Quiniela (dentro del desplegable de cada partido): ruta `h2h` (FotMob, solo partidos terminados, 5 últimos, caché 6 h). Sin dato: «Sin datos ahora mismo», nunca inventado.
- **Cara a cara**: enlace bajo el próximo partido en la ficha del club y botón «Cara a cara» en la página del partido (antes «Datos del partido»). Antes del partido la pestaña Alineación no pinta un campo vacío: «Aquí solo se muestran datos cuando el partido está en directo».
- **Mercado 7/14/30 días**: `ffPickEst` debe llamar a `ffPick` (se llamaba a sí misma y el mercado se quedó sin esos datos; `tests/ffpick-guard.test.mjs`). La foto diaria de `vh:v1` guarda el valor YA actualizado del día.

- **Diario de LaLiga en «Últimos cambios»** (`functions/_lib/diario.mjs`, `cron/src/diario.js`, KV `diario:v1` y `diario:foto:v1`): una fila al día cuando Futmondo actualiza los valores (hora real, de `mkchg:v2`), cambios de clasificación (líder, tres primeros, descenso) y de goleadores (cinco primeros). Son filas sin jugador: van en Inicio y en Últimos cambios, nunca en Noticias. Solo se apunta lo que cambia entre dos fotos reales; con un partido en juego no se compara.
- **Líderes de LaLiga** en Inicio (ruta `lideres`, FotMob): goles, penaltis marcados, amarillas y faltas por 90 min. FotMob no da faltas totales: el total se calcula (por 90 × minutos / 90) y en la web se dice que es calculado (lo pidió Edu). No da «penaltis lanzados»: no inventarlos.
- **Aviso de mercado en Telegram**: uno por cada actualización real de Futmondo, a la hora en que ocurre (6 min después de que los valores se queden quietos). Si un día hay dos actualizaciones reales (50 jugadores o más con otro valor respecto al último aviso), dos avisos. Un retoque suelto por la tarde no avisa.

- **Ajustes pedidos por Edu (15/11, noche)**: del mercado solo sale la ÚLTIMA actualización en Últimos cambios, con las 5 que más suben y las 5 que más bajan debajo (`top5Mercado`, campo `change`). En Líderes: amarillas = solo los que están a una de la sanción (4, 9…; los de 5 no), y faltas solo de quien ya lleva 3 amarillas o más. Quiniela: enfrentamientos con escudo y fecha dd/mm/aaaa; pronósticos: el tuyo en verde, los demás en azul.

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
