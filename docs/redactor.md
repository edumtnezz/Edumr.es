# Redactor de noticias — guía para continuar

Última revisión: 9 de noviembre de 2026. Léelo antes de tocar `cron/src/redactor.js`. Edu no programa y escribe en español desde el móvil. Respuestas cortas. No fusiones a `main` si no te lo pide.

## Objetivo

Simular el tipo de noticia de FutbolFantasy (título, entradilla, cuerpo, miniatura) y publicarla en edumr.es, más un aviso de Telegram. Publicación directa. No hay borradores nuevos ni modo sombra. El texto es nuestro. No se copia el de otras webs.

## Reglas que no se negocian

- No inventar datos, cifras, minutos, fechas, plazos ni porcentajes. Si no hay dato: «sin datos» o no se muestra.
- Solo valores de mercado de Futmondo. Nada de Liga Fantasy Oficial, Mister, Comunio, Biwenger ni Fantasy Marca.
- Nunca secretos ni ids de Cloudflare en el repo ni en el chat. En el código solo nombres de binding (`PORRA`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `TELEGRAM_BOT_TOKEN`). Los secretos viven en el Worker, no aquí.
- Fuentes prohibidas como dato: Marca, AS, Mundo Deportivo, Google News RSS, El Desmarque, Athletic, Alavés, X/Twitter, y el RSS de YouTube (`/feeds/videos.xml`).
- X no se usa. La rutina que leía @futbol_fantasy está parada. El Gol Digital sigue siendo solo detección, si algún día se mira, y no se cita.
- FutbolFantasy y Comuniate solo detectan temas (titular y tipo). No se copia su texto, no se citan y su URL no sale en la noticia ni en Telegram.
- Edu autorizó (09/11/2026) leer sus noticias enteras, solo para aprender estructura e ideas de estilo (robots.txt obligatorio). Nunca se copian frases ni se publica nada suyo.
- `robots.txt` obligatorio. Si no se puede leer, esa URL no se toca.
- La etiqueta OFICIAL solo si la fuente es el club, la RFEF o LaLiga. Si es otro medio: «Según [medio]» y el enlace a ese medio. Los avisos de Telegram enlazan a edumr.es, no a la fuente externa.
- Coste extra 0 €. No se contratan APIs de pago. Leer X por su API de pago no va dentro del Worker.
- Antes de subir: `node --check` de los JS tocados y `node --test tests/*.test.mjs`. El `?v=` de CSS/JS de la web lo pone el despliegue; si tocas un HTML que lleva `?v=` a mano, súbelo.
- No tocar Puja, Quiniela ni Porra.
- Móvil primero (ancho ~390 px). Poco texto. Sin aspecto de plantilla de IA.
- Descartado: apartado «Titulares», escudos grandes de fondo, iconos y emojis de pizarra, y un bot de Telegram para editar noticias.
- Un porcentaje nuestro solo si la precisión está demostrada. Con menos de 3 partidos: «sin datos». El % de jugar que ya trae FutbolFantasy se puede mostrar como dato suyo, no como cálculo nuestro.

## Arquitectura

| Pieza | Dónde |
| --- | --- |
| Redactor | `cron/src/redactor.js`, función `redactorSombra` |
| Avisos de alineaciones, mercado y puntos | `cron/src/avisos.js` |
| Cron | `cron/src/index.js`, cada minuto. El redactor actúa en los minutos impares |
| API y panel | `functions/api/laquiniela/[[path]].js`, ruta `admin-noticias` |
| Panel | `/futmondo/admin-noticias/` |
| Estilo de las noticias | `docs/estilo-noticias.md` |
| Worker | `edumr-cron`. Binding KV: `PORRA` |
| Despliegue | push a `main` → `.github/workflows/deploy.yml` (tests, Pages, Worker del cron). No hace falta el PC |

### Fuentes (`FUENTES` en `cron/src/redactor.js`)

Tabla completa en ESTADO.md (9 de noviembre de 2026). Resumen: hay listado de noticias legible en Barcelona, Atlético, Real Sociedad, Deportivo, Rayo, Espanyol, Getafe, Elche, Osasuna, Valencia, Levante, Málaga y Racing. YouTube oficial en casi todos, leído por la API (1 unidad por canal, como mucho cada 15 min). Sin listado usable: Real Madrid (su robots.txt no se lee), Betis (el listado no respondió), Celta (RSS viejo), Villarreal y Sevilla (la página no trae las piezas). Athletic y Alavés prohibidos. LaLiga.com no tiene un listado usable.

### Flujo

1. YouTube: la API lista vídeos de rueda de prensa. Gemini transcribe. Solo se publica si la cita está en un solo tramo, la persona es la de ese tramo y el estado se sostiene. Un «no» médico o una duda tiran la noticia. En valoración o táctica, un «no» puede ser el dato.
2. Web del club: sitemap, RSS o HTML del listado (`enlacesDeFuente`). Citas literales o, en una crónica, goles cuyo marcador cuadra.
3. Minuto: si el club escribe el minuto, manda sobre FotMob. Si dos fuentes que no son oficiales no coinciden, el minuto es «sin datos».
4. Fecha: solo si la fuente la escribe como día de calendario. No se convierte un instante UTC a Madrid ni se usa la fecha de hoy. Una frase con otra fecha se tira.
5. Cuerpo: lo redacta Gemini solo con esos hechos. Si repite el sujeto, se queda corto o mete un dato que no está, no se publica. La entradilla no repite el título.
6. Tope: 450.000 tokens al día. Al llegar, no hay más llamadas a Gemini ese día.
7. Pistas: el Worker lee cada 30 minutos los sitemaps de titulares de FutbolFantasy y Comuniate (después de su robots.txt) y escribe `rd:pistas:v1`. En cada ciclo mira hasta 5 pistas, dentro del tope de tokens. Elige la nota oficial del club cuyo título encaja con el tema, aunque no lleve una cita ni un marcador. Una noticia vieja del mismo apellido y de otro tema no cuenta como duplicada: hace falta el mismo tipo y menos de 48 horas, o la misma URL oficial. Si el dato no está en esa nota, no se publica.

### Claves KV (binding `PORRA`)

| Clave | Qué es |
| --- | --- |
| `rd:sombra:v1` | Estado: vídeos vistos, tokens del día, fuentes, ids de pistas ya miradas, contador `pistasN` |
| `rd:res:v1:<videoId>` | Resultado de una rueda (14 días) |
| `own:news:v1` | Noticias propias. `status: published` sale en la web |
| `rd:ext:v1` | Titulares de otras webs, solo para comparar (máx. 400) |
| `rd:cmp:v1` | Comparación con FutbolFantasy, Comuniate y Jornada Perfecta. Solo el panel |
| `tg:avisos:v1` | Chat de Telegram. No es el registro de envíos |
| `rd:sombra:v1` → `tgPend`, `tgHecho`, `tgUltimo` | Cola, ids ya aceptados por Telegram, y el último intento |
| `rd:pistas:v1` | Pistas de tema. Máximo 200, las más nuevas. Campo `origen`: `futbolfantasy`, `comuniate` o vacío si es manual |
| `rd:sombra:v1` → `deteccion` | Última lectura de cada web de detección: ok, error y cuántas pistas |

### Formato de `rd:pistas:v1`

```json
{
  "v": 1,
  "items": [
    {
      "id": "abc123",
      "at": "2026-11-09T12:00:00.000Z",
      "tipo": "lesion",
      "equipo": "Getafe",
      "jugadores": ["Nombre Apellido"],
      "entrenador": "",
      "tema": "frase corta, con palabras nuestras"
    }
  ]
}
```

`tipo` es uno de: `lesion`, `rueda`, `cronica`, `once`, `convocatoria`, `mercado`, `otro`. Sin URL. Sin texto copiado de X. Athletic y Alavés se rechazan.

### Corregir una noticia ya publicada

No crees otra y no borres la vieja: un id nuevo es otra URL y puede salir otro Telegram.

En `/futmondo/admin-noticias/`, pestaña Publicadas, abre la noticia, cambia título, entradilla y cuerpo, y pulsa **Guardar**. Es el mismo id. Guardar no llama a Telegram. No vacíes `tgHecho`.

### Pistas: quién las escribe

X no se usa. La rutina del asistente que leía @futbol_fantasy está parada. Leer X por API cuesta dinero y no entra en el Worker.

El propio Worker, cada 30 minutos, lee los sitemaps de titulares de FutbolFantasy y Comuniate (solo si su robots.txt lo permite). De cada titular saca equipo, jugador, entrenador y tipo si esas palabras están escritas. No guarda la URL ni el titular. Si no se puede leer el robots.txt, esa web se salta en ese ciclo. Si el detector falla, el redactor sigue con YouTube y las webs oficiales.

Añadir una pista a mano:

- Panel, pestaña Estado, formulario «Añadir pista». Escribe en `rd:pistas:v1`. El redactor la mira en el siguiente ciclo de 15 minutos. No publica sola desde el formulario.
- O, desde la carpeta `cron`, con Wrangler ya autenticado: `npx wrangler kv key put rd:pistas:v1 --binding PORRA --path pista.json`. El JSON tiene que ser el de arriba, completo (Wrangler sustituye la clave). No pongas el id del namespace en el comando ni en el repo.

## Historial de PRs del redactor

1. Publica solo si la frase es de ese jugador y de ese estado.
2. Citas oficiales del Barça y crónica solo con goles que cuadran con el marcador.
3. El enlace corto abre la noticia y Telegram solo cuenta si la API responde ok.
4. Fichas y resumen en la tarjeta. Lo absorbió el #5. No está en `main` como PR propio.
5. Noticias al estilo fantasy: crónica de una persona y el marcador en otra ficha.
6. El minuto oficial manda. La fecha sale de la fuente. La entradilla no repite el título.
7. Las pistas solo indican el tema. Sin fuente permitida no se publica.
8. Listados oficiales del resto de LaLiga, sin Athletic ni Alavés.

## Pendientes conocidos

- Sin listado de noticias usable: Real Madrid, Betis, Celta, Villarreal y Sevilla.
- LaLiga.com no aporta lesionados ni convocatorias: su sitemap de noticias no tiene robots.txt legible.
- No hay rueda oficial de Simeone del Atlético–Barcelona del 8 de noviembre de 2026. No se inventa.
- Las tres noticias ya publicadas de ese partido, si siguen mal, se corrigen con Guardar en el mismo id: https://edumr.es/n/4692781164 , https://edumr.es/n/d8d221f271 , https://edumr.es/n/e7818dc445

## Cómo empezar (para una IA nueva)

1. Lee este archivo, `docs/estilo-noticias.md`, `AGENTS.md` y `ESTADO.md`.
2. No leas ni imprimas secretos. No llames a Gemini, Telegram ni a la API de YouTube desde aquí salvo que Edu lo pida: gastan cupo.
3. Tests: `node --check cron/src/redactor.js` y `node --test tests/*.test.mjs`.
4. Rama nueva desde `main`, con el prefijo que pida el entorno. PR nuevo. No fusiones si no te lo piden.
5. Para ver producción: la web es https://edumr.es . Una noticia propia es `https://edumr.es/n/<id>`. El panel es https://edumr.es/futmondo/admin-noticias/ (hace falta la sesión de Edu). Desde esta máquina la web a veces responde 403 por el reto de Cloudflare: no lo tomes como «no existe».
6. Después de un cambio gordo, añade una línea en ESTADO.md.


## Tema de otra web reescrito (09/11/2026)
Decisión de Edu: para no quedarnos con 2 noticias cuando FutbolFantasy saca 20, si la nota oficial del club no aparece, `tratarExterna` (cron/src/redactor.js) abre la noticia de FutbolFantasy o Comuniate (tras su robots.txt), Gemini separa hecho de opinión y la reescribe. Se publica solo si: es un hecho (no opinión), tiene menos de 36 h, toda cifra, nombre y palabra de riesgo (plazos, lesión, posición…) está en el texto original, y no repite 7 palabras seguidas. Sale como «Según FutbolFantasy» con enlace a la fuente; el Telegram enlaza a edumr.es. Pistas por ciclo: 8. Tests: `tests/tema-externo.test.mjs`.
