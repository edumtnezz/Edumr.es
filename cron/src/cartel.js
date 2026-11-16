// Cartel de la noticia como imagen PNG (1200×675), para Telegram, WhatsApp y la vista previa del enlace.
// Mismo diseño que el cartel de la web: color del club, cara del jugador a la derecha, etiqueta, nombre y club.
import { ImageResponse, loadGoogleFont } from "workers-og";

// Estilo de cada club: p = color principal, s = segundo color, r = rayas finas (camiseta a rayas).
const CLUB_ST = [
  [/barc/, { p: "#a50044", s: "#004d98", r: 1 }],
  [/real madrid/, { p: "#1e3a8a", s: "#e8e8f0" }],
  [/atletico|atleti/, { p: "#c8102e", s: "#1b3a7a", r: 1 }],
  [/sevilla/, { p: "#d71920", s: "#ffffff" }],
  [/betis/, { p: "#0a7d3b", s: "#ffffff", r: 1 }],
  [/valencia/, { p: "#1c1c1c", s: "#f08a00" }],
  [/athletic|bilbao/, { p: "#d4121a", s: "#ffffff", r: 1 }],
  [/sociedad/, { p: "#0067b1", s: "#ffffff", r: 1 }],
  [/villarreal/, { p: "#0a4a8f", s: "#f2c500" }],
  [/celta/, { p: "#5aa7e0", s: "#ffffff" }],
  [/osasuna/, { p: "#c0102e", s: "#0a1a4a" }],
  [/getafe/, { p: "#0066b8", s: "#0a1f4a" }],
  [/rayo/, { p: "#d6101f", s: "#ffffff" }],
  [/espanyol/, { p: "#0069b5", s: "#ffffff", r: 1 }],
  [/alaves/, { p: "#0052a5", s: "#ffffff", r: 1 }],
  [/levante/, { p: "#9b1030", s: "#0a3b8c", r: 1 }],
  [/elche/, { p: "#0c8a3f", s: "#ffffff" }],
  [/depor/, { p: "#1d4ed8", s: "#ffffff", r: 1 }],
  [/racing|santander/, { p: "#0a7d3b", s: "#ffffff" }],
  [/malaga/, { p: "#0b66c3", s: "#ffffff", r: 1 }],
];
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function estiloClub(name) {
  const n = norm(name);
  for (const [re, st] of CLUB_ST) if (re.test(n)) return st;
  return { p: "#1b2740", s: "#475569" };
}
export function colorClub(name) { return estiloClub(name).p; }
// Mezcla dos colores #rrggbb (t = parte del segundo)
function mezcla(a, b, t) {
  const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const A = h(a), B = h(b);
  return "#" + A.map((v, i) => Math.round(v * (1 - t) + B[i] * t).toString(16).padStart(2, "0")).join("");
}
const lumHex = (x) => { const h = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)); return (0.299 * h[0] + 0.587 * h[1] + 0.114 * h[2]) / 255; };
const rgbaHex = (x, a) => { const h = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)); return `rgba(${h[0]},${h[1]},${h[2]},${a})`; };
const AC = { baja: "#ff4d4d", duda: "#ffb020", alta: "#2dff7a" };
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
  let alto = 560, ancho = Math.round(alto * w / h);
  if (ancho > 520) { ancho = 520; alto = Math.round(ancho * h / w); }
  return { w: ancho, h: alto, left: 935 - Math.round(ancho / 2), top: 675 - alto };
}

export function cartelHtml({ nombre, club, veredicto, plazo, color, foto, fotoW, fotoH, escudo }) {
  const v = TXT[veredicto] ? veredicto : "duda", ac = AC[v];
  const st = club ? { ...estiloClub(club), sash: /rayo|elche/.test(norm(club)) } : { p: color || "#1b2740", s: "#475569" };
  const clara = lumHex(st.s) > 0.85;
  // Lado del texto: color principal del club; lado de la foto: segundo color (o principal más oscuro si el segundo es blanco)
  const izq1 = mezcla(st.p, "#ffffff", 0.06), izq2 = mezcla(st.p, "#0b1220", 0.42);
  const der = clara ? mezcla(st.p, "#0b1220", 0.55) : mezcla(st.s, "#0b1220", 0.15);
  const derLuz = clara ? mezcla(st.p, "#ffffff", 0.05) : mezcla(st.s, "#ffffff", 0.22);
  // Dibujo de la camiseta en el lado del texto: rayas (clubes a rayas), banda diagonal (Rayo, Elche) o rayitas finas
  let det = "";
  if (st.r) for (let i = 0; i < 20; i++) det += `<div style="display:flex;position:absolute;left:${i * 120 + 60}px;top:0;width:60px;height:900px;background-color:${rgbaHex(clara ? "#ffffff" : st.s, clara ? 0.13 : 0.5)}"></div>`;
  else for (let i = 0; i < 70; i++) det += `<div style="display:flex;position:absolute;left:${i * 14}px;top:0;width:2px;height:900px;background-color:rgba(255,255,255,0.035)"></div>`;
  if (st.sash) det += `<div style="display:flex;position:absolute;left:0;top:300px;width:1400px;height:170px;background-color:rgba(255,255,255,0.24);transform:rotate(-24deg)"></div>`;
  const nm = esc(String(nombre || "").toUpperCase()), mw = Math.max(0, ...String(nombre || "").split(/\s+/).map((w) => w.length));
  const size = mw > 9 ? 76 : mw > 8 ? 84 : mw > 7 ? 92 : mw > 6 ? 100 : mw > 5 ? 108 : 118;
  const f = cajaFoto(fotoW, fotoH);
  return `<div style="display:flex;position:relative;width:1200px;height:675px;background-color:${der};font-family:'Figtree';color:#fff;overflow:hidden">
  <div style="display:flex;position:absolute;left:560px;top:0;width:640px;height:675px;background-image:radial-gradient(circle at 50% 55%, ${derLuz} 0%, rgba(0,0,0,0) 70%)"></div>
  <div style="display:flex;position:absolute;left:-600px;top:-112px;width:1200px;height:900px;background-image:linear-gradient(160deg, ${izq1} 0%, ${izq2} 100%);transform:skewX(-14deg);overflow:hidden">${det}</div>
  <div style="display:flex;position:absolute;left:0;top:0;width:700px;height:675px;background-image:radial-gradient(circle at 0% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 62%)"></div>
  ${escudo ? `<img src="${esc(escudo)}" width="540" height="540" style="position:absolute;left:-10px;top:95px;opacity:0.2" />` : ""}
  <div style="display:flex;position:absolute;left:584px;top:-112px;width:30px;height:900px;background-color:${ac};opacity:0.16;transform:skewX(-14deg)"></div>
  <div style="display:flex;position:absolute;left:592px;top:-112px;width:14px;height:900px;background-color:${ac};opacity:0.28;transform:skewX(-14deg)"></div>
  <div style="display:flex;position:absolute;left:608px;top:-112px;width:24px;height:900px;background-color:${st.s};transform:skewX(-14deg)"></div>
  <div style="display:flex;position:absolute;left:596px;top:-112px;width:6px;height:900px;background-color:${ac};transform:skewX(-14deg)"></div>
  <div style="display:flex;position:absolute;left:0;top:0;width:1200px;height:675px;background-image:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.32) 100%)"></div>
  <div style="display:flex;position:absolute;left:0;top:455px;width:1200px;height:220px;background-image:linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)"></div>
  ${foto ? `<div style="display:flex;position:absolute;left:${f.left}px;top:${f.top - 40}px;width:${f.w}px;height:${f.h + 40}px;overflow:hidden"><img src="${esc(foto)}" width="${f.w}" height="${f.h}" style="position:absolute;left:0px;top:40px;filter:drop-shadow(0px 0px 2px #ffffff) drop-shadow(0px 0px 2px #ffffff) drop-shadow(0px 0px 9px #ffffff)" /></div>` : ""}
  <div style="display:flex;flex-direction:column;justify-content:center;position:absolute;left:80px;top:0;width:470px;height:675px">
    <div style="display:flex;align-self:flex-start;background-color:${ac};color:#06101a;font-size:28px;letter-spacing:5px;padding:9px 26px;border-radius:99px">${TXT[v]}</div>
    <div style="display:flex;font-family:'Bricolage';font-size:${size}px;line-height:0.95;letter-spacing:-3px;margin-top:26px">${nm}</div>
    <div style="display:flex;width:150px;height:8px;border-radius:99px;background-color:${ac};margin-top:24px"></div>
    <div style="display:flex;align-items:center;margin-top:28px;font-size:38px">${escudo ? `<img src="${esc(escudo)}" width="64" height="64" style="margin-right:18px" />` : ""}${esc(club)}</div>
    ${plazo ? `<div style="display:flex;margin-top:14px;font-size:30px;color:rgba(255,255,255,0.8)">Vuelta: ${esc(String(plazo).charAt(0).toLowerCase() + String(plazo).slice(1))}</div>` : ""}
  </div>
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
