# AGENTS.md — proyecto web edumr.es

## Cómo trabajo aquí
- Al desplegar, usar SIEMPRE `deploy.ps1` (wrangler fijado a `4.131.1`). Nunca subir la versión.
- Tras cada cambio visible, subir la versión del CSS/JS afectado (`?v=N`) en el HTML y desplegar.

## REGLA IMPORTANTE: fallos visuales → captura real
Siempre que el usuario reporte un error/fallo, ANTES de tocar nada, hacer una **captura real de la web con Chrome headless** y mirarla, y volver a capturar despues del arreglo para confirmar.

Script de captura:
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
- Juegos (hub): `futmondo/` (hub), `futmondo/quiniela/`, `futmondo/porra/`, `futmondo/pujas/`.
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
- Comandos: `/ayuda` `/menu` `/modelo` `/preguntar <duda>` `/revisar` `/captura` `/estado` `/actualizar` `/deshacer` `/web` `/coste` `/tarea` `/log` `/ping`.
- 🎛️ Menú con **botones**: Estado, Captura web, Preguntar, Revisar, Coste, Deshacer, Web, Ayuda.
- 🎙️ **Notas de voz**: `getFile` → ffmpeg (16k mono) → `faster-whisper` `small` (español).
- 🖼️ **Fotos/capturas**: visión de `deepseek-flash` (OpenAI-compatible). Con texto → actúa; sin texto → describe y propone.
- 🧠 **IA en 3 fases**: 1) *interpreta* (plan máx. 4 pasos) → 2) *ejecuta* con Aider → 3) *verifica* el diff y **reintenta** (hasta 3). Nunca pide "sé más concreto".
- 💶 **Coste en euros**: tokens (entrada/salida) × precio DeepSeek V4.1-Flash (peack/off-peak), mostrado al terminar y acumulado en `/coste`.
- 📸 **Auto-comprobación visual**: tras desplegar, captura la web (Playwright/Chromium, con cache-bust) y la envía; si el cambio no se ve, **reintenta una vez**.
- 🛡️ **Guardián anti-destructivo**: si un cambio borra mucho contenido (>40 líneas y <5 añadidas), se cancela y se restaura.
- 🧵 **Memoria corta** por chat (últimos 4 turnos) para resolver "esto"/"eso" sin disparar el consumo.
- ⏰ **Tareas programadas**: `/tarea`, `/tarea diario 09:00 <petición>`, `/tarea borrar <id>`. Hilo `scheduler` (hora Europe/Madrid).
- 🔔 Siempre responde: sticker/vídeo/archivo reciben contestación, nunca silencio.
- Config en `config.json` (chmod 600): token, clave DeepSeek, token+repo GitHub, model, tareas, offset, usage, memory.


