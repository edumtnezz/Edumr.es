// Prueba de humo: se ejecuta DESPUÉS de publicar y avisa si algo se ha quedado roto.
// No sustituye a mirar la web con capturas; caza lo gordo: página que no carga,
// datos vacíos, API caída o recursos que faltan.
// Uso: node scripts/smoke.mjs   (BASE=https://otra.url para probar contra otro sitio)
const BASE = (process.env.BASE || "https://edumr.es").replace(/\/$/, "");
const intentos = Number(process.env.SMOKE_TRIES || 6);

const paginas = [
  { ruta: "/", debe: ["Aplicaciones y automatizaciones"] },
  { ruta: "/futmondo/", debe: ["Futmondo"] },
  { ruta: "/futmondo/guiafantasy/", debe: ["Guía Fantasy", "teams.js"] },
  { ruta: "/futmondo/quiniela/", debe: ["Quiniela"] },
  { ruta: "/futmondo/porra/", debe: ["Porra"] },
  { ruta: "/futmondo/lapuja/", debe: ["Puja"] },
  { ruta: "/equipos", debe: ["Equipos"] },
  { ruta: "/equipos/alaves", debe: ["Alavés"] },
];

const apis = [
  { ruta: "/api/laquiniela/mercado", comprobar: (d) => (d.players || []).length > 50, nota: "más de 50 jugadores" },
  { ruta: "/api/laquiniela/equipos", comprobar: (d) => (d.teams || []).length === 20, nota: "20 equipos" },
  { ruta: "/api/laquiniela/tabla", comprobar: (d) => (d.teams || []).length === 20, nota: "20 en la clasificación" },
  { ruta: "/api/laquiniela/jornada", comprobar: (d) => (d.matches || []).length > 0, nota: "partidos de la jornada" },
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const fallos = [];

async function get(ruta, tipo) {
  const r = await fetch(BASE + ruta, { headers: { "user-agent": "edumr-smoke" }, signal: AbortSignal.timeout(30000) });
  const texto = await r.text();
  return { ok: r.ok, status: r.status, texto, tipo };
}

async function revisarPagina(p) {
  const r = await get(p.ruta);
  if (!r.ok) return "HTTP " + r.status;
  for (const t of p.debe) if (!r.texto.includes(t)) return 'no aparece "' + t + '"';
  return "";
}

async function revisarApi(a) {
  const r = await get(a.ruta);
  if (!r.ok) return "HTTP " + r.status;
  let d = null;
  try { d = JSON.parse(r.texto); } catch (e) { return "no devuelve JSON"; }
  if (d && d.error) return "error: " + String(d.error).slice(0, 80);
  try { if (!a.comprobar(d)) return "datos insuficientes (" + a.nota + ")"; } catch (e) { return "datos raros"; }
  return "";
}

(async () => {
  let listo = false;
  for (let i = 1; i <= intentos && !listo; i++) {
    fallos.length = 0;
    for (const p of paginas) { const e = await revisarPagina(p); if (e) fallos.push("PÁGINA " + p.ruta + " → " + e); }
    for (const a of apis) { const e = await revisarApi(a); if (e) fallos.push("API " + a.ruta + " → " + e); }
    if (!fallos.length) { listo = true; break; }
    // Puede ser el despliegue aún en marcha: se reintenta un poco antes de dar la alarma.
    if (i < intentos) { console.log("intento " + i + ": " + fallos.length + " fallo(s), reintento en 15 s…"); await esperar(15000); }
  }

  console.log("");
  console.log("Páginas comprobadas: " + paginas.map((p) => p.ruta).join(", "));
  console.log("APIs comprobadas: " + apis.map((a) => a.ruta.split("/").pop()).join(", "));
  if (listo) { console.log("\n✅ TODO EN PIE"); process.exit(0); }
  console.log("\n❌ FALLOS (" + fallos.length + "):");
  fallos.forEach((f) => console.log("  - " + f));
  process.exit(1);
})();
