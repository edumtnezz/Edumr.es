$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$dist = Join-Path $root "dist"

if (Test-Path -LiteralPath $dist) {
  Remove-Item -LiteralPath $dist -Recurse -Force
}
New-Item -ItemType Directory -Path $dist | Out-Null

$publicFiles = @("index.html", "404.html", "script.js", "styles.css", "favicon.ico", "favicon.png", "_headers", "_redirects")
foreach ($f in $publicFiles) {
  $src = Join-Path $root $f
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination $dist
  }
}

foreach ($dir in @("img", "futmondo")) {
  $src = Join-Path $root $dir
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination $dist -Recurse
  }
}

Write-Output "dist listo con:"
Get-ChildItem -LiteralPath $dist -Recurse -File | ForEach-Object { $_.FullName.Substring($dist.Length + 1) }

$env:CLOUDFLARE_ACCOUNT_ID = "9d0e362ef9848559e9e7b5ff1416bc6f"
Push-Location $root
try {
  npx wrangler pages deploy dist --project-name=edumr --branch=main --commit-dirty=true
} finally {
  Pop-Location
}