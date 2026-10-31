$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'extension/manifest.json') -Raw | ConvertFrom-Json).version
$stage = Join-Path $root ('.build/store-' + [Guid]::NewGuid().ToString('N'))
$output = Join-Path $root ('dist/Presence-Studio-Extension-' + $version + '-webstore.zip')
node (Join-Path $root 'scripts/store-package.mjs') $stage
if ($LASTEXITCODE -ne 0) { throw 'Store extension validation failed' }
New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
if (Test-Path -LiteralPath $output) { throw 'Output already exists. Keep submitted archives immutable; use a new version or archive the previous build.' }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $output -CompressionLevel Optimal
Get-FileHash -LiteralPath $output -Algorithm SHA256 | Select-Object Hash,Path
