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

// Todas las escenas son INCONFUNDIBLEMENTE de fútbol (césped, estadio, focos, portería, red, balón liso). Sin personas ni texto.
export const ESCENAS_POR = {
  fijo: ["césped recién cortado con líneas de cal y un balón liso en primer plano, estadio iluminado desenfocado detrás", "portería con la red en primer plano y estadio vacío iluminado al fondo", "banco de suplentes vacío junto al césped bajo los focos, sin nombres", "círculo central del campo visto desde arriba en diagonal, con focos y bokeh"],
  racha: ["balón liso saliendo disparado sobre el césped con estelas de luz y partículas, estadio iluminado detrás", "red de la portería agitada con destellos y chispas de luz, estadio de noche", "césped en macro con rocío iluminado a contraluz y focos del estadio con bokeh", "estadio lleno de focos potentes con rayos de luz cruzando el cielo y césped brillante"],
  chollo: ["balón liso sobre el punto de penalti bajo un foco cálido ámbar, estadio oscuro desenfocado", "césped con luz dorada de atardecer, porterías al fondo y destellos cálidos", "focos del estadio con halos dorados sobre el césped recién cortado"],
  rentable: ["balón liso sobre el punto de penalti bajo un foco cálido ámbar, estadio oscuro desenfocado", "césped con luz dorada de atardecer, porterías al fondo y destellos cálidos", "focos del estadio con halos dorados sobre el césped recién cortado"],
  revelacion: ["amanecer tras la grada de un estadio, rayos de luz sobre el césped", "foco de estadio que se enciende en la oscuridad iluminando el césped", "túnel de salida al campo con una luz potente al fondo y césped brillante"],
  bajon: ["estadio vacío bajo cielo nublado con el césped húmedo y las porterías al fondo", "lluvia fina sobre el césped bajo los focos, balón liso detenido en primer plano", "banquillo vacío y césped mojado con luz fría"],
  regular: ["césped húmedo con reflejo de los focos y un claro de luz al fondo del estadio", "estadio con nubes y un rayo de sol sobre el césped", "balón liso sobre el césped con luz de tarde que asoma entre nubes"],
  duda: ["túnel de vestuarios con neblina y luz al fondo que da al césped", "balón liso parado sobre la línea de cal con neblina y contraluz del estadio", "estadio con niebla suave y focos difusos sobre el césped"],
  lesion: ["estadio vacío de noche con niebla fría sobre el césped y focos tenues", "banco de suplentes vacío con luz azul-gris suave y césped al fondo", "línea de cal y césped con luz fría difusa, estadio desenfocado"],
  recuperado: ["túnel con luz cálida al final que da al césped iluminado", "amanecer sobre el campo con focos aún encendidos y césped brillante", "balón liso sobre el césped con haces de luz cálida de estadio"],
  rumor: ["túnel de acceso al campo en penumbra con un haz de luz potente al fondo", "estadio lejano iluminado en la noche visto desde fuera con luces desenfocadas", "césped de noche con humo y contraluz de focos, porterías al fondo"],
};
export const NEUTRAS = ["estadio de noche con focos y bokeh sobre un césped perfecto, vacío", "césped de cerca con balón liso y luces del estadio desenfocadas al fondo", "línea de cal en perspectiva con luz lateral y estadio iluminado", "estadio vacío visto desde un córner con luz de cine"];

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

// Tratamientos visuales: se aplican SIEMPRE sobre la escena de fútbol (el estilo cambia el aspecto, no el tema)
export const ESTILOS = [
  "fotografía nocturna cinematográfica con bokeh en los focos y humedad en el aire",
  "duotono de prensa con trama de puntos halftone y grano de papel sobre la escena, contraste alto, colores del club vivos",
  "ilustración vectorial plana de la escena con bloques de color grandes y diagonales tipo camiseta",
  "macro de poca profundidad de campo con luz rasante y reflejos",
  "acabado holográfico: reflejos prismáticos e iridiscentes sobre la escena, como un cromo de edición especial",
  "efecto volumétrico: humo, haces de luz y rayos atravesando la escena, mucha profundidad",
  "gradientes aurora muy suaves con capas translúcidas de luz sobre la escena, moderno y limpio",
  "pintura gruesa expresiva con pinceladas visibles y salpicaduras sobre la escena, energía de póster callejero",
  "3D isométrico de aspecto miniatura (tilt-shift) de la escena con luz de estudio",
  "luz neón y trazos luminosos que dibujan líneas de movimiento sobre la escena nocturna",
];
// Estilos sobrios para lo serio y enérgicos para lo alegre (índices de ESTILOS)
const POR_GRUPO = { serio: [0, 3, 5, 6], alegre: [2, 4, 7, 9, 1, 8], neutro: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };

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
    "- Sin escudos, emblemas, logotipos ni marcas comerciales. El balón, si sale, es liso y blanco, sin marca.",
    "- OBLIGATORIO: tiene que verse inconfundiblemente FÚTBOL (césped, líneas de cal, estadio con focos, portería con red o balón liso). Prohibido un fondo abstracto de formas o degradados sin escenario de fútbol.",
    "- Debe sentirse ANIMADA y llamativa: colores vivos y saturados, luces potentes, destellos, partículas y sensación de movimiento (salvo que el ambiente pida seriedad).",
    "- Sin marcos, bordes ni marcas de agua. Acabado profesional de medio deportivo digital; nítido, con profundidad y poco recargado.",
    "",
    "=== PALETA (obligatoria) ===",
    paleta + "Neutros permitidos: negro profundo, gris carbón y blanco roto. No introducir ningún otro color dominante; NO uses azul si el escudo no es azul. Si el club tiene blanco como color principal, usa blanco roto/perla con sombras profundas para mantener contraste.",
    "",
    "=== COMPOSICIÓN ===",
    "- Un solo punto focal: un foco de luz fuerte y limpio detrás del círculo central.",
    "- Zona izquierda (aprox. 0–30 % del ancho): tono uniforme y tranquilo, algo más oscuro, sin detalles, para el escudo.",
    "- Centro-derecha (círculo centrado en aprox. el 62 % del ancho y el 40 % del alto, diámetro aprox. 58 % del alto): zona limpia de baja textura con halo de luz suave o contraluz, para que destaque la foto. Nada de objetos ni líneas cruzando esa zona.",
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
    "- Colores ajenos al club como dominantes. Objetos o formas que crucen la zona del círculo o la franja inferior. Fondos abstractos sin nada de fútbol.",
  ].join("\n");
}
