// Prompt del FONDO de la portada (sin personas ni texto). Basado en la investigación del 11/11/2026 (docs/portada-prompt.md):
// foco único, contraste, paleta corta con los colores reales del escudo, zonas reservadas, ambiente según el tipo de noticia.
const ALEGRE = /^(racha|chollo|revelacion|rentable)$/, SERIO = /^(lesion|bajon|regular|duda)$/;
export const grupoTipo = (t) => (ALEGRE.test(t) ? "alegre" : SERIO.test(t) ? "serio" : "neutro");

export function nombreColor(c) {
  if (!c) return "";
  const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 50) return "negro";
  if (d < 25) return mx > 200 ? "blanco" : "gris";
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const claro = mx > 200 && d < 120;
  if (h < 15 || h >= 345) return mx < 130 ? "granate" : "rojo";
  if (h < 40) return "naranja";
  if (h < 70) return "amarillo";
  if (h < 160) return "verde";
  if (h < 200) return "turquesa";
  if (h < 255) return mx < 120 ? "azul marino" : claro ? "celeste" : "azul";
  if (h < 300) return "morado";
  return "rosa";
}
export const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

export const ESCENAS_POR = {
  fijo: ["césped recién cortado con líneas de cal bajo focos", "estadio vacío desenfocado y simétrico", "banco de suplentes vacío en penumbra, sin nombres", "formas geométricas firmes tipo bloques"],
  racha: ["estelas de luz y partículas en diagonal", "césped en macro con rocío iluminado a contraluz", "formas en movimiento con desenfoque de velocidad"],
  chollo: ["foco puntual sobre fondo oscuro con brillo cálido ámbar", "textura de cromo metalizado holográfico", "destellos de luz cálida sobre superficie mate"],
  rentable: ["foco puntual sobre fondo oscuro con brillo cálido ámbar", "destellos de luz cálida sobre superficie mate", "césped de cerca con luz dorada y estadio desenfocado"],
  revelacion: ["amanecer tras la grada de un estadio desenfocado", "rayos de luz atravesando humo", "brote de luz desde el centro rompiendo la penumbra"],
  bajon: ["estadio vacío bajo cielo nublado", "lluvia fina sobre césped en penumbra", "formas geométricas inclinadas hacia abajo en tonos apagados"],
  regular: ["nubes con un claro de sol", "césped húmedo con reflejo de luz", "degradado que pasa de apagado a algo más vivo"],
  duda: ["túnel de vestuarios con neblina y luz al fondo", "contraluz difuso sobre el césped", "formas semitransparentes superpuestas"],
  lesion: ["superficies limpias azul-gris con luz suave", "vestuario vacío sobrio y desenfocado, sin taquillas con nombres", "niebla fría sobre el campo de noche"],
  recuperado: ["túnel con luz cálida al final", "amanecer sobre el campo", "degradado de frío a cálido con haces de luz"],
  rumor: ["túnel en penumbra con un haz de luz", "luces de un estadio lejano en la noche, desenfocadas", "humo con contraluz y sombras en movimiento"],
};
export const NEUTRAS = ["estadio de noche con focos y bokeh, vacío", "césped de cerca con luces desenfocadas al fondo", "línea de cal en perspectiva con luz lateral", "estadio vacío visto desde un córner con luz de cine"];

export const AMBIENTE = {
  fijo: "estabilidad y confianza; luz cenital limpia y simétrica, colores del club plenos; serena y sólida, sin celebración",
  racha: "energía ascendente; diagonales y estelas de luz hacia arriba a la derecha, destellos cálidos, velocidad controlada",
  chollo: "sensación de hallazgo; fondo sobrio con un foco cálido ámbar sutil detrás del círculo, brillo selectivo",
  rentable: "sensación de hallazgo; fondo sobrio con un foco cálido ámbar sutil detrás del círculo, brillo selectivo",
  revelacion: "irrupción; luz que nace detrás del círculo y rompe una penumbra, rayos que se abren hacia fuera",
  bajon: "colores del club desaturados, luz fría lateral, diagonales suaves descendentes; apagada pero digna, sin dramatismo",
  regular: "tonos algo apagados con un claro de luz que asoma, transmitiendo que es pasajero",
  duda: "incertidumbre; neblina, contraluz parcial, un foco que no termina de iluminar, toque discreto de ámbar de precaución",
  lesion: "seriedad y calma; paleta fría azul-gris, luz tenue y difusa, silencio visual; respetuosa, nada morbosa",
  recuperado: "regreso; transición de frío a cálido de izquierda a derecha, los colores del club recuperan saturación",
  rumor: "expectación sin confirmar; penumbra con un haz de luz, sensación de que algo se mueve; intrigante pero contenido, nada de celebración",
};

export const ESTILOS = [
  "estadio nocturno fotográfico: focos con bokeh, gradas desenfocadas y vacías, humedad en el aire",
  "duotono de prensa con trama de puntos tipo halftone en los dos colores del club, grano de papel y contraste alto",
  "diagonales tipo camiseta: franjas y bloques geométricos limpios en vector plano con sombras suaves",
  "macro de césped: primerísimo plano de hierba con líneas de cal, poca profundidad de campo y luz rasante",
  "cromo holográfico: textura de foil metalizado e iridiscente con reflejos prismáticos",
  "túnel volumétrico: pasillo abstracto con humo, haces de luz y paredes lisas de hormigón",
  "gradiente aurora con capas de vidrio esmerilado translúcido, moderno y muy limpio",
  "pincelada gruesa y grunge de póster: trazos de pintura, salpicaduras y textura de muro",
  "3D low-poly isométrico: campo y grada de aspecto miniatura con iluminación suave de estudio",
  "pizarra táctica abstracta: fondo mate con trazos de luz neón, curvas y flechas de movimiento, sin números ni letras ni fichas",
];
// Estilos sobrios para lo serio y enérgicos para lo alegre (índices de ESTILOS)
const POR_GRUPO = { serio: [0, 3, 5, 6], alegre: [2, 4, 7, 9, 1], neutro: [0, 1, 2, 3, 4, 5, 6, 7, 8] };

export function elegirEscenaEstilo(tipo, sem) {
  const esc = ESCENAS_POR[tipo] || NEUTRAS, pool = POR_GRUPO[grupoTipo(tipo)];
  return { escena: esc[sem % esc.length], estilo: ESTILOS[pool[Math.floor(sem / 3) % pool.length]] };
}

// cols: [[r,g,b] principal, [r,g,b] secundario|null]
export function promptFondo({ club, cols, tipo, sem }) {
  const { escena, estilo } = elegirEscenaEstilo(tipo, sem);
  const [c1, c2] = cols || [];
  const paleta = c1
    ? "Colores del club " + (club || "") + " (sácalos de la Imagen 1, que es SOLO una referencia de color: no la dibujes ni la copies):\n- Principal: " + hex(c1) + " (" + nombreColor(c1) + ") en aprox. 60 % de la imagen, en grandes superficies y luz ambiental.\n" +
      (c2 ? "- Secundario: " + hex(c2) + " (" + nombreColor(c2) + ") en aprox. 30 %, en formas, reflejos o degradados.\n" : "- Secundario: el segundo color más presente del escudo de la Imagen 1, en aprox. 30 %.\n") +
      "- Acento: máximo 10 %, solo en destellos o bordes de luz.\n"
    : "Colores del club " + (club || "") + ": toma los dos colores principales del escudo de la Imagen 1 (solo como referencia de color, no lo dibujes): 60 % el principal, 30 % el secundario, 10 % acento.\n";
  return [
    "=== USO ===",
    "Imagen de FONDO para la portada de una noticia de fútbol fantasy (LaLiga) en una web de noticias. Formato horizontal 3:2. Encima se superpondrán automáticamente: escudo del club, foto circular del jugador, nombre, pastillas de datos, una etiqueta grande y una marca de agua. Esta imagen es SOLO el fondo: un escenario atmosférico, limpio y sin protagonistas.",
    "",
    "=== REGLAS GENERALES ===",
    "- Sin personas, siluetas humanas, manos, caras, jugadores, público reconocible ni mascotas.",
    "- Absolutamente sin letras, números, palabras, glifos, símbolos, dorsales, marcadores, carteles, pancartas, banderas, vallas publicitarias, pantallas ni etiquetas en ningún lugar.",
    "- Sin escudos, emblemas, logotipos, marcas comerciales, balones con marca ni camisetas.",
    "- Sin marcos, bordes ni marcas de agua. Acabado profesional de medio deportivo digital; nítido, con profundidad y poco recargado.",
    "",
    "=== PALETA (obligatoria) ===",
    paleta + "Neutros permitidos: negro profundo, gris carbón y blanco roto. No introducir ningún otro color dominante; NO uses azul si el escudo no es azul. Si el club tiene blanco como color principal, usa blanco roto/perla con sombras profundas para mantener contraste.",
    "",
    "=== COMPOSICIÓN ===",
    "- Un solo punto focal: un foco de luz fuerte y limpio detrás del círculo central.",
    "- Zona izquierda (aprox. 0–30 % del ancho): tono uniforme y tranquilo, algo más oscuro, sin detalles, para el escudo.",
    "- Centro-derecha (círculo centrado en aprox. el 64 % del ancho y el 42 % del alto, diámetro aprox. 50 % del alto): zona limpia de baja textura con halo de luz suave o contraluz, para que destaque la foto. Nada de objetos ni líneas cruzando esa zona.",
    "- Franja inferior (aprox. 25 % del alto): más oscura y lisa, para el nombre, las pastillas y la etiqueta. Esquina inferior derecha tranquila para la marca de agua.",
    "- Toda la energía visual (luz, diagonales, partículas) en los márgenes y detrás del círculo, nunca encima de las zonas reservadas.",
    "- Contraste alto entre la zona luminosa central y los bordes más oscuros; pocas formas grandes, que se entiendan aunque la imagen se vea muy pequeña.",
    "",
    "=== ESTILO VISUAL (aplicar solo este) ===",
    estilo,
    "",
    "=== AMBIENTE SEGÚN LA NOTICIA ===",
    AMBIENTE[tipo] || "expectación y curiosidad; luz de cine y profundidad",
    "",
    "=== ESCENA ===",
    escena + " (siempre vacía de personas y sin texto).",
    "",
    "=== PROHIBIDO ===",
    "- Personas, siluetas, manos, público, árbitros, entrenadores.",
    "- Cualquier texto o glifo, también marcadores, relojes, pizarras con números, dorsales, camisetas, banderas, bufandas, pancartas, vallas LED, entradas, periódicos, móviles, contratos, firmas o paneles.",
    "- Escudos, logotipos, emblemas de LaLiga u otras marcas.",
    "- Fuegos artificiales, confeti, trofeos, copas, medallas o podios.",
    "- Dinero: billetes, monedas, lingotes, fichas de casino o símbolos de moneda.",
    "- Lesión: sangre, camillas, ambulancias, quirófanos, jeringuillas, cruces rojas, radiografías.",
    "- Clima catastrofista: tormentas eléctricas, fuego, explosiones, cristales rotos.",
    "- Colores ajenos al club como dominantes. Objetos o formas que crucen la zona del círculo o la franja inferior.",
  ].join("\n");
}
