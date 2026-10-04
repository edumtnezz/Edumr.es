#!/usr/bin/env bash
set -e
rm -rf dist
mkdir -p dist
for f in index.html theme.css 404.html script.js theme-init.js styles.css favicon.ico favicon.png _headers _redirects; do
  if [ -f "$f" ]; then cp "$f" dist/; fi
done
[ -d img ] && cp -r img dist/
[ -d guia-fantasy ] && cp -r guia-fantasy dist/
echo "dist listo:"
find dist -type f | sed 's#^dist/##' | sort
