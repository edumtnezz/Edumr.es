// Pone la versión de cada CSS/JS del HTML según el CONTENIDO del archivo, al preparar dist.
// Así nunca se sirve una hoja vieja por olvidar subir "?v=N" (y estos archivos se cachean un año):
// si el archivo no cambia, la URL tampoco; si cambia, la URL cambia sola.
// Uso: node scripts/version-assets.mjs dist
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const hashOf = (file) => {
  try {
    if (!fs.statSync(file).isFile()) return null;
    return createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
  } catch (e) {
    return null;
  }
};

function htmlFilesIn(root) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.html$/i.test(e.name)) out.push(p);
    }
  })(root);
  return out;
}

export function versionAssets(root) {
  let versiones = 0, archivos = 0;
  for (const html of htmlFilesIn(root)) {
    const dir = path.dirname(html);
    let src = fs.readFileSync(html, "utf8");
    let n = 0;
    src = src.replace(/(["'])([^"']+?)\?v=([^"']*)\1/g, (todo, q, url) => {
      if (/^(https?:)?\/\//.test(url)) return todo; // externo: no se toca
      const target = url.startsWith("/") ? path.join(root, url) : path.join(dir, url);
      const h = hashOf(target);
      if (!h) return todo; // no es un archivo servido: se deja tal cual
      n++;
      return q + url + "?v=" + h + q;
    });
    if (n) { fs.writeFileSync(html, src); archivos++; versiones += n; }
  }
  return { versiones, archivos };
}

const called = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (called) {
  const r = versionAssets(process.argv[2] || "dist");
  console.log("versiones puestas: " + r.versiones + " en " + r.archivos + " HTML");
}
