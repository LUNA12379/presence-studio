param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$commit = (& git -C $PSScriptRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'A committed Git checkout is required.' }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot ('dist\release-' + $version + '-' + $commit.Substring(0,12)) }
$output = [IO.Path]::GetFullPath($OutputDirectory)
if ((Test-Path -LiteralPath $output) -and (Get-ChildItem -LiteralPath $output -Force | Select-Object -First 1)) { throw 'Use a new empty release directory.' }
# No upload, tag, visibility change or publication is performed by this script.
$result = & node (Join-Path $PSScriptRoot 'scripts/source-package.mjs') $output
if ($LASTEXITCODE -ne 0) { throw 'Source preparation failed.' }
$source = ($result -join [Environment]::NewLine) | ConvertFrom-Json
$version = $source.version
$workspace = Join-Path $PSScriptRoot ('.build\release-' + [Guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $source.archive -DestinationPath $workspace
# Build the installer from the exact archive, with fresh restored dependencies.
# Ignored DLLs/configuration in the developer checkout cannot enter this build.
& (Join-Path $workspace 'Build-Installer.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Release installer build failed.' }
$setup = "Presence-Studio-$version-Setup.exe"
Copy-Item -LiteralPath (Join-Path $workspace "dist\$setup") -Destination $output
Copy-Item -LiteralPath (Join-Path $workspace "dist\$setup.sha256") -Destination $output
$channel = Get-Content -LiteralPath (Join-Path $workspace 'update-channel.json') -Raw | ConvertFrom-Json
$manifest = [ordered]@{
    version = $version
    sourceCommit = $source.commit
    license = $source.license
    updateRepository = $channel.repository
    source = @{file = [IO.Path]::GetFileName($source.archive); sha256 = $source.sha256}
    installer = @{file = $setup; sha256 = (Get-FileHash -LiteralPath (Join-Path $output $setup) -Algorithm SHA256).Hash.ToLowerInvariant()}
    buildEnvironment = @{os = [Environment]::OSVersion.VersionString; node = (& node --version); powershell = $PSVersionTable.PSVersion.ToString()}
    builtAt = [DateTime]::UtcNow.ToString('o')
}
[IO.File]::WriteAllText((Join-Path $output 'release-manifest.json'), ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
Write-Output ('Release files prepared locally: ' + $output)
Write-Output ('Source commit: ' + $source.commit)
Write-Output 'Review and test these files before publishing both installer and source together.'
