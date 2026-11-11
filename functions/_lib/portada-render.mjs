// SVG -> PNG en el servidor con resvg (WebAssembly). Sin coste: corre dentro del propio Pages Function.
import { initWasm, Resvg } from "./resvg.mjs";
import wasmModule from "./resvg.wasm";
import { INTER_B64 } from "./inter-font.mjs";
import { portadaSvg, colorEscudoPx, W } from "./portada-svg.mjs";

let listo = null, fuente = null;
async function iniciar() {
  if (!listo) listo = initWasm(wasmModule).catch((e) => { listo = null; throw e; });
  await listo;
  if (!fuente) fuente = Uint8Array.from(atob(INTER_B64), (c) => c.charCodeAt(0));
}
const OPC = () => ({ font: { fontBuffers: [fuente], defaultFontFamily: "Inter", loadSystemFonts: false } });

export async function colorDelEscudo(crestB64) {
  try {
    await iniciar();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="40" viewBox="0 0 40 40"><image href="data:image/png;base64,${crestB64}" width="40" height="40" preserveAspectRatio="none"/></svg>`;
    return colorEscudoPx(new Resvg(svg, OPC()).render().pixels);
  } catch (e) { return null; }
}

// o: { bg, crest, face, nombre, avg, value, etiqueta, marca, color } -> Uint8Array PNG de 1000 px de ancho
export async function renderPortada(o) {
  await iniciar();
  const r = new Resvg(portadaSvg(o, null), { ...OPC(), fitTo: { mode: "width", value: Math.min(W, 1000) } });
  return r.render().asPng();
}
