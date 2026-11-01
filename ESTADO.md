# ESTADO.md — edumr.es (Guía Fantasy / Futmondo)

Última actualización: 01/11/2026. Para continuar: lee AGENTS.md y CLAUDE.md (reglas de Edu) y luego este archivo.
Edu no sabe programar y escribe desde el móvil, en español. Respuestas cortas y sencillas.

## Hecho (sacado de AGENTS.md, CLAUDE.md y el historial de git)
- Despliegue automático: push a `main` → GitHub Action publica la web y el Worker `puja-do`.
- Avisos de Telegram (31/10): noticias, once probable y confirmado, precios, cambios en sus jugadores (`cron/src/avisos.js`).
- Jugadores rentables (calidad-precio), histórico de minutos por jugador y comparador de jugadores con comparaciones guardadas.
- Club: calendario completo, escudos que llevan al club. Partido: nota real de FotMob, asistencias en el campo.
- 31/10: alineaciones probables con fecha y hora de Madrid corregidas; primera carga de `jornada` más rápida (copia guardada + actualización detrás); textos de La Puja y La Quiniela alineados con la regla "cada partido se bloquea al empezar".
- 01/11: **web por club terminada**. Las 20 fichas de club (`/equipos/<club>`) llevan su clasificación de LaLiga; estaba roto solo en Alavés: `teamCanon("Deportivo Alavés")` devolvía `dep` (la regla `/depor/` iba antes que `/alaves/`), así que la sección se borraba sola. Arreglado el orden de las reglas (`/alaves/` antes, `/coruna/` para el Deportivo). Comprobado con datos reales: los 20 clubes tienen fila y página, y Alavés y Deportivo ya no se mezclan.
- 01/11: **Athletic, denominador arreglado** (J8 aplazado). La ficha dividía entre la última jornada con datos en vez de los partidos jugados: Unai Simón salía "9 de 10" (900') cuando había jugado los 9 de 9 (810'). Ahora el denominador son los partidos del EQUIPO, sacados del mercado (máximo de partidos de sus jugadores). Comprobado con datos reales: Athletic 9/9, Barça 11/11, Deportivo 10/10, Málaga 11/11 (sin cambios fuera del Athletic). Test en `tests/played.test.mjs`.

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
- Antes de subir: `node --check` de los JS, ESLint `no-undef` en `mercado.js` y subir `?v=` en `futmondo/guiafantasy/index.html`.

## Errores abiertos
- Cloudflare (plan de pago desde 01/11/2026): ya no aplican los topes del plan gratis (10 ms de CPU, 1.000 escrituras KV/día, 50 llamadas por petición). Se mantienen la caché en el borde y no parsear JSON enormes en rutas calientes, por velocidad. Pendiente de comprobar en producción si los fallos sueltos de horas punta desaparecen.
- football-data.org: ~10 peticiones por minuto.
- Ninguno visual conocido a 390 px (01/11: corregido el borde derecho de la tarjeta del próximo partido del club, que se salía 8 px).

## Siguiente paso
- Jugadores con ≥ 90 % de probabilidad de jugar: comprobarlo en la web real a ~390 px y subirlo.

## 01/11/2026 — Alineaciones con jugadores repetidos (arreglado)
- Causa: FutbolFantasy añadió una 2ª tanda de 11 en el bloque de titulares. Ahora `cleanStarters` deja siempre un once válido (máx. 11, sin repetidos), en el lector, en `/once` y en `alineacion.js`.
- Tests automáticos en `tests/` (los corre el GitHub Action antes de publicar; si fallan no se despliega).
