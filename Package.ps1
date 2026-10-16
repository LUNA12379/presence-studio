$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'desktop\Build.ps1')
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
$stagingDirectory = Join-Path $PSScriptRoot ('.build\package-' + [Guid]::NewGuid().ToString('N'))
& node (Join-Path $PSScriptRoot 'scripts\package.mjs') $stagingDirectory
if ($LASTEXITCODE -ne 0) { throw 'Package preparation failed.' }
$distributionDirectory = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $distributionDirectory | Out-Null
$archive = Join-Path $distributionDirectory ('Presence-Studio-' + $version + '-win-x64.zip')
Compress-Archive -Path (Join-Path $stagingDirectory '*') -DestinationPath $archive -Force
Write-Host ('Created: ' + $archive)
