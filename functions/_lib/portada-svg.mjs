// Portada tipo "cromo" dibujada en el servidor (SVG -> PNG con resvg). Mismo diseño que el administrador:
// fondo hecho por la IA (sin personas), escudo real, foto original de Futmondo en círculo, nombre, MEDIA y VALOR reales
// y una frase corta con su color. Todo lo que se escribe sale de datos reales, nada se inventa.
export const W = 1536, H = 1024;

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num1 = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

// Tamaño de un PNG leyendo su cabecera (sin descomprimirlo)
export function pngSize(b64) {
  try {
    const head = atob(String(b64 || "").slice(0, 48));
    if (head.charCodeAt(1) !== 0x50 || head.charCodeAt(2) !== 0x4e) return null;
    const dv = (o) => (head.charCodeAt(o) << 24) | (head.charCodeAt(o + 1) << 16) | (head.charCodeAt(o + 2) << 8) | head.charCodeAt(o + 3);
    return { w: dv(16) >>> 0, h: dv(20) >>> 0 };
  } catch (e) { return null; }
}
const mime = (b64) => (String(b64 || "").startsWith("/9j/") ? "image/jpeg" : "image/png");
const uri = (b64) => "data:" + mime(b64) + ";base64," + b64;

export const ETIQUETAS = {
  rumor: { t: "POSIBLE FICHAJE", c: "#2563eb", i: "swap" },
  lesion: { t: "LESIÓN", c: "#dc2626", i: "cross" },
  recuperado: { t: "RECUPERADO", c: "#16a34a", i: "check" },
  duda: { t: "DUDA", c: "#d97706", i: "q" },
};
const KICK_COL = { fijo: "#16a34a", racha: "#ea580c", rentable: "#2563eb", revelacion: "#9333ea", chollo: "#16a34a", bajon: "#dc2626", regular: "#d97706", duda: "#d97706" };
export function etiquetaDe(cromo, tipoNoticia) {
  if (cromo && cromo.kicker) return { t: cromo.kicker, c: KICK_COL[cromo.kickTipo] || "#16a34a", i: "star" };
  return ETIQUETAS[tipoNoticia] || null;
}

// Etiqueta con icono: devuelve el SVG y su ancho
function etiquetaSvg(et, x, y, h, rot) {
  if (!et) return "";
  const fs = h * 0.5, pad = h * 0.4, ic = h * 0.62, tw = et.t.length * fs * 0.62, w = pad + ic + pad * 0.6 + tw + pad;
  const cx = pad + ic / 2, cy = h / 2, sw = h * 0.11;
  let icon = "";
  if (et.i === "cross") { const r = ic * 0.42; icon = `<path d="M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`; }
  else if (et.i === "check") icon = `<path d="M${cx - ic * 0.34} ${cy + ic * 0.02}L${cx - ic * 0.08} ${cy + ic * 0.28}L${cx + ic * 0.38} ${cy - ic * 0.26}" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  else if (et.i === "star") { const pts = []; for (let q = 0; q < 10; q++) { const a = -Math.PI / 2 + q * Math.PI / 5, rr = (q % 2 ? 0.2 : 0.46) * ic; pts.push((cx + Math.cos(a) * rr).toFixed(1) + "," + (cy + Math.sin(a) * rr).toFixed(1)); } icon = `<polygon points="${pts.join(" ")}" fill="#fff"/>`; }
  else if (et.i === "swap") { const q = ic * 0.4; icon = `<path d="M${cx - q} ${cy - q * 0.4}H${cx + q}M${cx + q * 0.45} ${cy - q * 0.95}L${cx + q} ${cy - q * 0.4}L${cx + q * 0.45} ${cy + q * 0.15}M${cx + q} ${cy + q * 0.5}H${cx - q}M${cx - q * 0.45} ${cy}L${cx - q} ${cy + q * 0.5}L${cx - q * 0.45} ${cy + q * 1.05}" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`; }
  else icon = `<text x="${cx}" y="${cy + ic * 0.36}" text-anchor="middle" font-family="Inter" font-weight="800" font-size="${ic * 1.05}" fill="#fff">?</text>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot || 0})"><rect width="${w}" height="${h}" rx="${h * 0.22}" fill="${et.c}" filter="url(#sh)"/>${icon}` +
    `<text x="${pad + ic + pad * 0.6}" y="${h / 2 + fs * 0.36}" font-family="Inter" font-weight="800" font-size="${fs}" fill="#fff">${esc(et.t)}</text></g>`;
}

// o: { bg, crest, face, nombre, avg, value, etiqueta, marca, tipoNoticia, cromo }; crop = { x, y, side } para la miniatura cuadrada
export function portadaSvg(o, crop) {
  const cro = !!(o.face && o.nombre);
  const parts = [];
  parts.push(`<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="${H * 0.008}" stdDeviation="${H * 0.012}" flood-color="#000" flood-opacity=".4"/></filter>` +
    `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="${H * 0.025}" flood-color="#fff" flood-opacity=".55"/></filter>` +
    `<radialGradient id="rg"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`);
  if (o.bg) parts.push(`<image href="${uri(o.bg)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`);
  else { // sin fondo de la IA: colores del club
    const c = o.color || [24, 90, 60], f = (k) => c.map((v) => Math.round(v * k)).join(",");
    parts.push(`<rect width="${W}" height="${H}" fill="rgb(${f(0.55)})"/><polygon points="0,${H * 0.15} ${W * 0.55},0 ${W * 0.8},0 0,${H * 0.5}" fill="rgb(${c.join(",")})" fill-opacity=".9"/><polygon points="${W},${H * 0.45} ${W},${H} ${W * 0.35},${H}" fill="#fff" fill-opacity=".08"/>`);
  }
  // Escudo real
  const cs = pngSize(o.crest);
  if (o.crest && cs) {
    const ch = H * (cro ? 0.5 : 0.62), cw = ch * cs.w / cs.h;
    const cx0 = cro ? W * 0.06 : (W - cw) / 2, cy0 = (H - ch) / 2 - (cro ? H * 0.04 : 0);
    parts.push(`<image href="${uri(o.crest)}" x="${cx0}" y="${cy0}" width="${cw}" height="${ch}" filter="url(#glow)"/>`);
  }
  let etiq = "";
  if (cro) {
    const d = H * 0.5, cx = W * 0.64, cy = H * 0.42, accent = o.color ? "rgb(" + o.color.join(",") + ")" : ((o.etiqueta && o.etiqueta.c) || "#16a34a");
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${d * 0.95}" fill="url(#rg)"/>`);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${d / 2 + H * 0.018}" fill="#fff" filter="url(#sh)"/><circle cx="${cx}" cy="${cy}" r="${d / 2 + H * 0.008}" fill="${accent}"/>`);
    parts.push(`<clipPath id="cc"><circle cx="${cx}" cy="${cy}" r="${d / 2}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${d / 2}" fill="#fbfbf8"/>`);
    const fw = d * 1.02, fh = fw; // la foto de Futmondo es cuadrada
    parts.push(`<image href="${uri(o.face)}" x="${cx - fw / 2}" y="${cy + d / 2 - fh + d * 0.02}" width="${fw}" height="${fh}" clip-path="url(#cc)"/>`);
    // Nombre
    const nombre = String(o.nombre).toUpperCase(), fs = H * 0.075, ny = cy + d / 2 + H * 0.085;
    const nw = Math.min(W * 0.5, nombre.length * fs * 0.68 + fs * 1.4);
    parts.push(`<rect x="${cx - nw / 2}" y="${ny - fs * 0.72}" width="${nw}" height="${fs * 1.44}" rx="${fs * 0.28}" fill="#0b0f0d" filter="url(#sh)"/>`);
    parts.push(`<text x="${cx}" y="${ny + fs * 0.36}" text-anchor="middle" font-family="Inter" font-weight="900" font-size="${fs}" fill="#fff" textLength="${Math.min(nw - fs * 0.6, nombre.length * fs * 0.66)}" lengthAdjust="spacingAndGlyphs">${esc(nombre)}</text>`);
    // MEDIA y VALOR
    const chips = [];
    if (o.avg) chips.push(["MEDIA", num1(o.avg), "#fde047"]);
    if (o.value) chips.push(["VALOR", num1(o.value / 1e6) + " M", "#ffffff"]);
    const chh = H * 0.09, gap = W * 0.012, fy = ny + fs * 0.72 + H * 0.035;
    const cws = chips.map((c) => c[0].length * chh * 0.3 * 0.62 + c[1].length * chh * 0.56 * 0.62 + chh * 1.2);
    let x0 = cx - (cws.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)) / 2;
    chips.forEach((c, i) => {
      const w1 = c[0].length * chh * 0.3 * 0.62;
      parts.push(`<rect x="${x0}" y="${fy}" width="${cws[i]}" height="${chh}" rx="${chh * 0.3}" fill="${c[2]}" filter="url(#sh)"/>` +
        `<text x="${x0 + chh * 0.3}" y="${fy + chh * 0.62}" font-family="Inter" font-weight="700" font-size="${chh * 0.3}" fill="#111">${c[0]}</text>` +
        `<text x="${x0 + chh * 0.3 + w1 + chh * 0.2}" y="${fy + chh * 0.7}" font-family="Inter" font-weight="900" font-size="${chh * 0.56}" fill="#111">${esc(c[1])}</text>`);
      x0 += cws[i] + gap;
    });
  }
  // Etiqueta: grande arriba a la izquierda (completa) o en la esquina de la miniatura cuadrada
  if (o.etiqueta) etiq = crop ? etiquetaSvg(o.etiqueta, crop.x + crop.side * 0.05, crop.y + crop.side * 0.05, crop.side * 0.12, 0) : etiquetaSvg(o.etiqueta, W * 0.035, H * 0.075, H * 0.135, -2.3);
  parts.push(etiq);
  // Marca de agua NOTICIAS, abajo a la derecha, transparente
  const ms = pngSize(o.marca);
  if (o.marca && ms) { const lw = W * 0.09, lh = lw * ms.h / ms.w; parts.push(`<image href="${uri(o.marca)}" x="${W - lw - W * 0.025}" y="${H - lh - H * 0.035}" width="${lw}" height="${lh}" opacity=".6"/>`); }
  const vb = crop ? `${crop.x} ${crop.y} ${crop.side} ${crop.side}` : `0 0 ${W} ${H}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="${crop ? crop.side : W}" height="${crop ? crop.side : H}">${parts.join("")}</svg>`;
}

// Cuadrado centrado en el jugador (o en el escudo si no hay foto)
export function recorteCuadrado(cro) {
  const side = Math.round(H * 0.88), fx = cro ? 0.64 : 0.5;
  return { x: Math.max(0, Math.min(W - side, W * fx - side / 2)), y: (H - side) * 0.25, side };
}

// Color dominante del escudo (misma regla que el panel) a partir de píxeles RGBA de 40x40
export function colorEscudoPx(d) {
  const cuenta = {};
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    if (mx < 60 || sat < 0.35) continue;
    const k = (r >> 6) + "," + (g >> 6) + "," + (b >> 6), o = cuenta[k] || (cuenta[k] = { n: 0, r: 0, g: 0, b: 0 });
    o.n++; o.r += r; o.g += g; o.b += b;
  }
  let best = null, bs = 0;
  for (const k in cuenta) { const o = cuenta[k], amar = o.r / o.n > 180 && o.g / o.n > 150 && o.b / o.n < 90, sc = o.n * (amar ? 0.5 : 1); if (sc > bs) { bs = sc; best = [Math.round(o.r / o.n), Math.round(o.g / o.n), Math.round(o.b / o.n)]; } }
  return best || [24, 90, 60];
}
