#!/usr/bin/env bash
set -e
rm -rf dist
mkdir -p dist
for f in index.html aureum.html aureum.css aureum.js flutedeck.html flutedeck.css flutedeck.js 404.html script.js theme-init.js styles.css favicon.ico favicon.png _headers _redirects; do
  if [ -f "$f" ]; then cp "$f" dist/; fi
done
[ -d img ] && cp -r img dist/
[ -d futmondo ] && cp -r futmondo dist/
echo "dist listo:"
find dist -type f | sed 's#^dist/##' | sort
