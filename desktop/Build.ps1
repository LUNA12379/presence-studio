$ErrorActionPreference = 'Stop'
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\Restore-WebView2.ps1')
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$references = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Net.Http.dll','System.Web.Extensions.dll',(Join-Path $PSScriptRoot 'Microsoft.Web.WebView2.Core.dll'),(Join-Path $PSScriptRoot 'Microsoft.Web.WebView2.WinForms.dll'))
$arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',('/win32manifest:' + (Join-Path $PSScriptRoot 'Studio.manifest')),('/out:' + (Join-Path $PSScriptRoot 'Presence Studio.exe')))
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'studio.ico')) { $arguments += '/win32icon:' + (Join-Path $PSScriptRoot 'studio.ico') }
foreach ($reference in $references) { $arguments += '/reference:' + $reference }
$arguments += Join-Path $PSScriptRoot 'Studio.cs'
$arguments += Join-Path $PSScriptRoot 'Locale.cs'
$arguments += '/resource:' + (Join-Path (Split-Path -Parent $PSScriptRoot) 'ui/en.json') + ',en.json'
& $compilerPath $arguments
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
