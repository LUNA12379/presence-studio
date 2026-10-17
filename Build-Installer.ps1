param([string]$Repository = '')
$ErrorActionPreference = 'Stop'
if ($Repository -and $Repository -notmatch '^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$') { throw 'Repository must be owner/repository.' }
# Package.ps1 is the only app-file allowlist. Personal files are never copied recursively.
& (Join-Path $PSScriptRoot 'Package.ps1')
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$build = Join-Path $PSScriptRoot ('.build\installer-' + [Guid]::NewGuid().ToString('N'))
$stage = Join-Path $build 'payload'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Expand-Archive -LiteralPath (Join-Path $PSScriptRoot "dist\Presence-Studio-$version-win-x64.zip") -DestinationPath $stage
$cache = Join-Path $PSScriptRoot '.cache\installer'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$runtime = Join-Path $cache 'node-v22.23.3.exe'
if (!(Test-Path -LiteralPath $runtime)) { Invoke-WebRequest 'https://nodejs.org/dist/v22.23.3/win-x64/node.exe' -OutFile $runtime }
if ((Get-FileHash -LiteralPath $runtime -Algorithm SHA256).Hash -ne '9C9245166B4A8E182E0B797DA9C20136117FF24368EAFF1FEC8343A123C8DB0E') { throw 'Bundled Node.js checksum does not match its pinned release.' }
$runtimeFolder = Join-Path $stage 'runtime'
New-Item -ItemType Directory -Path $runtimeFolder | Out-Null
Copy-Item -LiteralPath $runtime -Destination (Join-Path $runtimeFolder 'node.exe')
$license = Join-Path $cache 'node-v22.23.3-LICENSE.txt'
if (!(Test-Path -LiteralPath $license)) { Invoke-WebRequest 'https://raw.githubusercontent.com/nodejs/node/v22.23.3/LICENSE' -OutFile $license }
Copy-Item -LiteralPath $license -Destination (Join-Path $runtimeFolder 'LICENSE.txt')
$webview = Join-Path $cache 'MicrosoftEdgeWebview2Setup.exe'
if (!(Test-Path -LiteralPath $webview)) { Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $webview }
$signature = Get-AuthenticodeSignature -LiteralPath $webview
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') { throw 'WebView2 bootstrapper must have a valid Microsoft signature.' }
if ($Repository) { [System.IO.File]::WriteAllText((Join-Path $stage 'update-channel.json'), (@{repository=$Repository} | ConvertTo-Json)) }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $PSScriptRoot 'installer\Installer.cs'
$versionFile = Join-Path $build 'version.txt'
[System.IO.File]::WriteAllText($versionFile,$version)
$common = @('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',('/win32manifest:'+(Join-Path $PSScriptRoot 'desktop\Studio.manifest')),('/win32icon:'+(Join-Path $PSScriptRoot 'desktop\studio.ico')),('/resource:'+$versionFile+',version.txt'),'/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Net.Http.dll','/reference:System.Web.Extensions.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll','/reference:Microsoft.CSharp.dll')
& $compiler @common ('/out:'+(Join-Path $stage 'PresenceStudio-Uninstall.exe')) $source
if ($LASTEXITCODE -ne 0) { throw 'Uninstaller build failed.' }
$payload = Join-Path $build 'payload.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $payload -CompressionLevel Optimal
$output = Join-Path $PSScriptRoot "dist\Presence-Studio-$version-Setup.exe"
& $compiler @common ('/resource:'+$payload+',payload.zip') ('/resource:'+$webview+',webview.exe') ('/out:'+$output) $source
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }
$checksum = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText($output+'.sha256',($checksum+'  '+[System.IO.Path]::GetFileName($output)+[Environment]::NewLine))
Write-Output ('Installer: '+$output)
Write-Output ('SHA256: '+$checksum)
