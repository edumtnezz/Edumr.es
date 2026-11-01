# ESTADO.md — edumr.es (Guía Fantasy / Futmondo)

Última actualización: 01/11/2026. Para continuar: lee AGENTS.md y CLAUDE.md (reglas de Edu) y luego este archivo.
Edu no sabe programar y escribe desde el móvil, en español. Respuestas cortas y sencillas.

## Hecho (sacado de AGENTS.md, CLAUDE.md y el historial de git)
- Despliegue automático: push a `main` → GitHub Action publica la web y el Worker `puja-do`.
- Avisos de Telegram (31/10): noticias, once probable y confirmado, precios, cambios en sus jugadores (`cron/src/avisos.js`).
- Jugadores rentables (calidad-precio), histórico de minutos por jugador y comparador de jugadores con comparaciones guardadas.
- Club: calendario completo, escudos que llevan al club. Partido: nota real de FotMob, asistencias en el campo.
- 31/10: alineaciones probables con fecha y hora de Madrid corregidas; primera carga de `jornada` más rápida (copia guardada + actualización detrás); textos de La Puja y La Quiniela alineados con la regla "cada partido se bloquea al empezar".

## Pendiente
- Web por club (`/equipos/alaves`) y clasificación en cada club (según CLAUDE.md).
- Jugadores con ≥ 90 % de probabilidad de jugar (idea de Edu, AGENTS.md; no consta en el historial como hecha).
- Estabilidad: pruebas automáticas y datos de reserva en todas las pantallas.
- Ajuste por rival (pendiente de confirmar con Edu, AGENTS.md).
- Rayo–Athletic (J8) aplazado: aparece solo cuando tenga fecha.
- Verificar con datos reales: formato de nombres de la alineación confirmada de Comuniate y tamaño real de `mios` (AGENTS.md).
- "Analiza tu equipo" no se ha revisado en producción (requiere la sesión de Edu).

## Decisiones
- Solo valores de mercado de Futmondo; nunca inventar datos; si una fuente falla, mostrar el último dato bueno.
- Plan de pago de Cloudflare (5 $/mes): solo si los fallos siguen; de momento no.
- Se mantienen los degradados de la cabecera de Equipos y de la tarjeta del próximo partido del club (Edu, 31/10).
- La Quiniela: cada partido se bloquea cuando empieza; los pronósticos de todos se ven desde el principio.
- No eludir bloqueos de bots de FutbolFantasy (denegado).
- Antes de subir: `node --check` de los JS, ESLint `no-undef` en `mercado.js` y subir `?v=` en `futmondo/guiafantasy/index.html`.

## Errores abiertos
- Athletic: el denominador de partidos jugados sale una jornada más alto por el J8 aplazado (caso conocido, sin arreglar).
- Plan gratis de Cloudflare: ~10 ms de CPU, 1.000 escrituras KV al día, ~50 llamadas por petición; fallos sueltos en horas punta.
- football-data.org: ~10 peticiones por minuto.

## Siguiente paso
- Elegir con Edu la siguiente idea pendiente (web por club o jugadores con ≥ 90 %), comprobarla en la web real a ~390 px y subirla.
