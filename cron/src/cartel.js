// Cartel de la noticia como imagen PNG (1200×675), para Telegram, WhatsApp y la vista previa del enlace.
// Mismo diseño que el cartel de la web: color del club, cara del jugador a la derecha, etiqueta, nombre y club.
import { ImageResponse, loadGoogleFont } from "workers-og";

// Color de cada club (el mismo que usa la web en sus carteles)
const CLUB_COL = [[/barc/, "#a50044"], [/real madrid/, "#1e3a8a"], [/atletico|atleti/, "#c8102e"], [/sevilla/, "#d71920"], [/betis/, "#0a7d3b"], [/valencia/, "#e8731a"], [/athletic|bilbao/, "#d4121a"], [/sociedad/, "#0067b1"], [/villarreal/, "#b58900"], [/celta/, "#2a7fbf"], [/osasuna/, "#c0102e"], [/getafe/, "#004fa3"], [/rayo/, "#d6101f"], [/espanyol/, "#0069b5"], [/alaves/, "#0052a5"], [/levante/, "#9b1030"], [/elche/, "#0c8a3f"], [/depor/, "#1d4ed8"], [/racing|santander/, "#0a7d3b"], [/malaga/, "#0b66c3"]];
export function colorClub(name) {
  const n = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [re, c] of CLUB_COL) if (re.test(n)) return c;
  return "#1b2740";
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

export function cartelHtml({ nombre, club, veredicto, plazo, color, foto, escudo }) {
  const v = TXT[veredicto] ? veredicto : "duda", ac = AC[v];
  const nm = esc(nombre), size = nm.length > 16 ? 86 : nm.length > 11 ? 104 : 128;
  return `<div style="display:flex;position:relative;width:1200px;height:675px;background:${esc(color || "#1b2740")};font-family:'Figtree';color:#fff;overflow:hidden">
  <div style="display:flex;position:absolute;left:0;top:0;width:1200px;height:675px;background:rgba(8,12,22,0.5)"></div>
  <div style="display:flex;position:absolute;left:600px;top:-200px;width:900px;height:1100px;background:rgba(255,255,255,0.07);border-left:12px solid ${ac};transform:skewX(-14deg)"></div>
  ${escudo ? `<img src="${esc(escudo)}" width="520" height="520" style="position:absolute;left:-70px;top:300px;opacity:0.1" />` : ""}
  <div style="display:flex;flex-direction:column;justify-content:center;position:absolute;left:72px;top:0;width:640px;height:675px">
    <div style="display:flex;align-self:flex-start;background:${ac};color:#0b1220;font-size:30px;letter-spacing:4px;padding:10px 26px;border-radius:99px">${TXT[v]}</div>
    <div style="display:flex;font-family:'Bricolage';font-size:${size}px;line-height:1;letter-spacing:-4px;margin-top:22px">${nm}</div>
    <div style="display:flex;width:170px;height:10px;border-radius:99px;background:${ac};margin-top:18px"></div>
    <div style="display:flex;align-items:center;margin-top:26px;font-size:40px">${escudo ? `<img src="${esc(escudo)}" width="64" height="64" style="margin-right:18px" />` : ""}${esc(club)}</div>
    ${plazo ? `<div style="display:flex;margin-top:14px;font-size:32px;color:rgba(255,255,255,0.8)">Vuelta: ${esc(String(plazo).charAt(0).toLowerCase() + String(plazo).slice(1))}</div>` : ""}
  </div>
  ${foto ? `<img src="${esc(foto)}" width="500" height="500" style="position:absolute;left:670px;top:175px" />` : ""}
</div>`;
}

// Las imágenes se descargan aquí y se incrustan: así no depende de cómo las pida el motor de dibujo
async function dataUrl(u, f) {
  if (!u) return "";
  if (/^data:/.test(u)) return u;
  try {
    const r = await f(u, { headers: { accept: "image/png,image/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; edumr)" } });
    if (!r.ok) return "";
    const b = new Uint8Array(await r.arrayBuffer());
    const png = b[0] === 0x89 && b[1] === 0x50, jpg = b[0] === 0xff && b[1] === 0xd8;
    if (!png && !jpg) return "";
    let bin = ""; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return "data:image/" + (png ? "png" : "jpeg") + ";base64," + btoa(bin);
  } catch (e) { return ""; }
}

export async function cartelPng(datos, f = fetch) {
  const [foto, escudo] = await Promise.all([dataUrl(datos.foto, f), dataUrl(datos.escudo, f)]);
  datos = { ...datos, foto, escudo };
  const r = new ImageResponse(cartelHtml(datos), { width: 1200, height: 675, fonts: await fonts() });
  return await r.arrayBuffer();
}
