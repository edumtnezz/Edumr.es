// Cartel de la noticia como imagen PNG (1200×675), para Telegram, WhatsApp y la vista previa del enlace.
// Mismo diseño que el cartel de la web: color del club, cara del jugador a la derecha, etiqueta, nombre y club.
import { ImageResponse, loadGoogleFont } from "workers-og";

// Estilo de cada club: fondo izquierdo oscuro (l) y panel de la foto (p, s, modo).
// modo: "stripes" = rayas verticales p/s, "sash" = banda diagonal p sobre s, "solid" = liso p.
const CLUB_ST = [
  [/barc/, { l: "#0b1a3f", p: "#a50044", s: "#004d98", m: "stripes" }],
  [/real madrid/, { l: "#0b1f4d", p: "#f4f4f6", m: "solid" }],
  [/atletico|atleti/, { l: "#7a0d1f", p: "#c8102e", s: "#ffffff", m: "stripes" }],
  [/sevilla/, { l: "#8f1318", p: "#ffffff", m: "solid" }],
  [/betis/, { l: "#064d24", p: "#0a7d3b", s: "#ffffff", m: "stripes" }],
  [/valencia/, { l: "#161616", p: "#f08a00", m: "solid" }],
  [/athletic|bilbao/, { l: "#111111", p: "#d4121a", s: "#ffffff", m: "stripes" }],
  [/sociedad/, { l: "#07335a", p: "#0067b1", s: "#ffffff", m: "stripes" }],
  [/villarreal/, { l: "#0a2a55", p: "#f2c500", m: "solid" }],
  [/celta/, { l: "#1d5a8f", p: "#8ac3ee", m: "solid" }],
  [/osasuna/, { l: "#16203d", p: "#d91e2a", m: "solid" }],
  [/getafe/, { l: "#0a2a5c", p: "#0066b8", m: "solid" }],
  [/rayo/, { l: "#2a0a10", p: "#e30613", s: "#ffffff", m: "sash" }],
  [/espanyol/, { l: "#06284a", p: "#0069b5", s: "#ffffff", m: "stripes" }],
  [/alaves/, { l: "#0a1f4f", p: "#0052a5", s: "#ffffff", m: "stripes" }],
  [/levante/, { l: "#2a0814", p: "#9b1030", s: "#0a3b8c", m: "stripes" }],
  [/elche/, { l: "#0a4a24", p: "#0c8a3f", s: "#ffffff", m: "sash" }],
  [/depor/, { l: "#0b1d5c", p: "#1d4ed8", s: "#ffffff", m: "stripes" }],
  [/racing|santander/, { l: "#06301a", p: "#0a7d3b", m: "solid" }],
  [/malaga/, { l: "#062a55", p: "#0b66c3", s: "#ffffff", m: "stripes" }],
];
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function estiloClub(name) {
  const n = norm(name);
  for (const [re, st] of CLUB_ST) if (re.test(n)) return st;
  return { l: "#1b2740", p: "#475569", m: "solid" };
}
export function colorClub(name) { return estiloClub(name).p; }
// Panel de la foto: devuelve el estilo de fondo y, para las rayas, los hijos (divs de 70 px, sin degradados repetidos)
function panelClub(st) {
  const p = st.p, s = st.s || st.p;
  if (st.m === "stripes") {
    let k = "";
    for (let i = 0; i < 14; i++) k += `<div style="display:flex;width:70px;height:1100px;background-color:${i % 2 ? s : p}"></div>`;
    return { css: "", kids: k };
  }
  if (st.m === "sash") return { css: `background-image:linear-gradient(115deg,${s} 0%,${s} 36%,${p} 36%,${p} 64%,${s} 64%,${s} 100%);`, kids: "" };
  return { css: `background-color:${p};`, kids: "" };
}
const AC = { baja: "#ef4444", duda: "#f59e0b", alta: "#22c55e" };
const TXT = { baja: "BAJA", duda: "DUDA", alta: "ALTA" };
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let _fonts = null;
async function fonts() {
  if (_fonts) return _fonts;
  const [b, f] = await Promise.all([loadGoogleFont({ family: "Bricolage Grotesque", weight: 800 }), loadGoogleFont({ family: "Figtree", weight: 700 })]);
  _fonts = [{ name: "Bricolage", data: b, weight: 800, style: "normal" }, { name: "Figtree", data: f, weight: 700, style: "normal" }];
  return _fonts;
}

// Caja de la foto: se mantiene la proporción real de la imagen (las fotos de Biwenger no son cuadradas)
function cajaFoto(w, h) {
  if (!(w > 0 && h > 0)) { w = 1; h = 1; }
  let alto = 540, ancho = Math.round(alto * w / h);
  if (ancho > 500) { ancho = 500; alto = Math.round(ancho * h / w); }
  return { w: ancho, h: alto, left: 935 - Math.round(ancho / 2), top: 675 - alto };
}

export function cartelHtml({ nombre, club, veredicto, plazo, color, foto, fotoW, fotoH, escudo }) {
  const v = TXT[veredicto] ? veredicto : "duda", ac = AC[v];
  const st = club ? estiloClub(club) : { l: "#1b2740", p: color || "#475569", m: "solid" };
  const nm = esc(nombre), mw = Math.max(0, ...String(nombre || "").split(/\s+/).map((w) => w.length)), size = mw > 9 ? 84 : mw > 7 ? 100 : mw > 6 ? 116 : 128;
  const f = cajaFoto(fotoW, fotoH), pn = panelClub(st);
  return `<div style="display:flex;position:relative;width:1200px;height:675px;background:${st.l};font-family:'Figtree';color:#fff;overflow:hidden">
  <div style="display:flex;position:absolute;left:600px;top:-200px;width:900px;height:1100px;${pn.css}border-left:12px solid ${ac};transform:skewX(-14deg)">${pn.kids}</div>
  ${escudo ? `<img src="${esc(escudo)}" width="520" height="520" style="position:absolute;left:-70px;top:300px;opacity:0.1" />` : ""}
  <div style="display:flex;flex-direction:column;justify-content:center;position:absolute;left:72px;top:0;width:480px;height:675px">
    <div style="display:flex;align-self:flex-start;background:${ac};color:#0b1220;font-size:30px;letter-spacing:4px;padding:10px 26px;border-radius:99px">${TXT[v]}</div>
    <div style="display:flex;font-family:'Bricolage';font-size:${size}px;line-height:1;letter-spacing:-4px;margin-top:22px">${nm}</div>
    <div style="display:flex;width:170px;height:10px;border-radius:99px;background:${ac};margin-top:18px"></div>
    <div style="display:flex;align-items:center;margin-top:26px;font-size:40px">${escudo ? `<img src="${esc(escudo)}" width="64" height="64" style="margin-right:18px" />` : ""}${esc(club)}</div>
    ${plazo ? `<div style="display:flex;margin-top:14px;font-size:32px;color:rgba(255,255,255,0.8)">Vuelta: ${esc(String(plazo).charAt(0).toLowerCase() + String(plazo).slice(1))}</div>` : ""}
  </div>
  ${foto ? `<img src="${esc(foto)}" width="${f.w}" height="${f.h}" style="position:absolute;left:${f.left}px;top:${f.top}px" />` : ""}
</div>`;
}

// Tamaño real de una imagen PNG o JPEG a partir de sus bytes
function tamanoImg(b) {
  if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) return { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return { w: 0, h: 0 };
}

// Las imágenes se descargan aquí y se incrustan: así no depende de cómo las pida el motor de dibujo
async function dataUrl(u, f) {
  if (!u) return { url: "", w: 0, h: 0 };
  if (/^data:/.test(u)) return { url: u, w: 0, h: 0 };
  try {
    const r = await f(u, { headers: { accept: "image/png,image/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    if (!r.ok) return { url: "", w: 0, h: 0 };
    const b = new Uint8Array(await r.arrayBuffer());
    const png = b[0] === 0x89 && b[1] === 0x50, jpg = b[0] === 0xff && b[1] === 0xd8;
    if (!png && !jpg) return { url: "", w: 0, h: 0 };
    let bin = ""; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return { url: "data:image/" + (png ? "png" : "jpeg") + ";base64," + btoa(bin), ...tamanoImg(b) };
  } catch (e) { return { url: "", w: 0, h: 0 }; }
}

export async function cartelPng(datos, f = fetch) {
  const [foto, escudo] = await Promise.all([dataUrl(datos.foto, f), dataUrl(datos.escudo, f)]);
  datos = { ...datos, foto: foto.url, fotoW: foto.w, fotoH: foto.h, escudo: escudo.url };
  const r = new ImageResponse(cartelHtml(datos), { width: 1200, height: 675, fonts: await fonts() });
  return await r.arrayBuffer();
}
