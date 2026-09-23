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
- Los ids/credenciales de Futmondo y de la API están como secretos en Cloudflare Pages.
