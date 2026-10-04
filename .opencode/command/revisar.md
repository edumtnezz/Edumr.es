---
description: Lanza el revisor de calidad (agente qa) para verificar el último cambio con capturas reales, incluida la cuenta de prueba en las zonas con login.
---
Usa el subagente **qa** para revisar el último cambio de la web. Pásale esta información y espera su informe:

1. Qué ha cambiado (fíjate en `git log -1` y `git diff HEAD~1`).
2. La URL o URLs afectadas (por ejemplo: `/`, `/futmondo/`, `/futmondo/mercado/`, `/futmondo/pujas/`, `/futmondo/quiniela/`, `/futmondo/porra/`).
3. Cualquier captura o dato de ejemplo que haya dado el usuario (ruta local).

El agente debe: registrar una cuenta de prueba, entrar a las zonas con login, hacer capturas de escritorio y móvil, comprobar consola/desbordes, y devolver un informe ✅/❌ con la evidencia. No debe editar ni desplegar.
