$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$desktopDirectory = Join-Path $projectDirectory 'desktop'
$version = '1.0.3537.50'
$expectedHash = '5EA526BBD728ADDA0DA4D31219267E96460494A427E4894C4E09D9F320F4B9AA'
$requiredFiles = @('Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll')

$cacheDirectory = Join-Path $projectDirectory '.cache'
New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null
$archive = Join-Path $cacheDirectory ('webview2-' + $version + '.zip')
if (-not (Test-Path -LiteralPath $archive)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $url = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/' + $version + '/microsoft.web.webview2.' + $version + '.nupkg'
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) { throw 'WebView2 SDK checksum mismatch. Remove the cached archive and retry.' }
$sdkDirectory = Join-Path $cacheDirectory ('webview2-' + $version)
Expand-Archive -LiteralPath $archive -DestinationPath $sdkDirectory -Force
$sources = @('lib\net462\Microsoft.Web.WebView2.Core.dll', 'lib\net462\Microsoft.Web.WebView2.WinForms.dll', 'runtimes\win-x64\native\WebView2Loader.dll')
for ($i = 0; $i -lt $requiredFiles.Count; $i++) {
    $source = Join-Path $sdkDirectory $sources[$i]
    $target = Join-Path $desktopDirectory $requiredFiles[$i]
    # Existing DLLs must match the verified SDK too. Skip identical files so a
    # running desktop app does not prevent an otherwise unchanged restore.
    if (!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $source).Hash) {
        Copy-Item -LiteralPath $source -Destination $target -Force
    }
}
Write-Host ('Restored WebView2 SDK ' + $version)
