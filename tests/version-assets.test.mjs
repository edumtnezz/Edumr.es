import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { versionAssets } from "../scripts/version-assets.mjs";

const sha = (txt) => createHash("sha1").update(txt).digest("hex").slice(0, 10);

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ver-"));
  fs.writeFileSync(path.join(dir, "app.css"), "body{color:red}");
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "index.html"),
    '<link rel="stylesheet" href="app.css?v=1"><script src="https://otra.web/a.js?v=1"></script><img src="/img/x.png?v=9">');
  fs.writeFileSync(path.join(dir, "sub", "p.html"), '<link href="../app.css?v=3">');
  return dir;
}

test("pone el hash del contenido, también en rutas relativas", () => {
  const dir = fixture();
  versionAssets(dir);
  const h = sha("body{color:red}");
  const idx = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(idx.includes("app.css?v=" + h));
  assert.ok(fs.readFileSync(path.join(dir, "sub", "p.html"), "utf8").includes("../app.css?v=" + h));
});

test("no toca las URLs externas ni los archivos que no existen", () => {
  const dir = fixture();
  versionAssets(dir);
  const idx = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(idx.includes("https://otra.web/a.js?v=1"));
  assert.ok(idx.includes("/img/x.png?v=9"));
});

test("si el archivo cambia, cambia la versión; si no, se queda igual", () => {
  const dir = fixture();
  versionAssets(dir);
  const v1 = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  versionAssets(dir);
  assert.equal(fs.readFileSync(path.join(dir, "index.html"), "utf8"), v1);
  fs.writeFileSync(path.join(dir, "app.css"), "body{color:blue}");
  versionAssets(dir);
  const v2 = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.notEqual(v2, v1);
  assert.ok(v2.includes("app.css?v=" + sha("body{color:blue}")));
});
