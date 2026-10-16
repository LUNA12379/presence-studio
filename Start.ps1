param([switch]$Background, [switch]$BridgeOnly)
$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$address = 'http://127.0.0.1:49832'
function Test-Bridge {
    try {
        $result = Invoke-RestMethod -Uri ($address + '/api/health') -TimeoutSec 2
        return $result.app -eq 'youtube-discord-local'
    } catch { return $false }
}
try {
    $desktopApp = Join-Path $appDirectory 'desktop\Presence Studio.exe'
    if (-not $BridgeOnly -and (Test-Path -LiteralPath $desktopApp)) {
        if ($Background) { Start-Process -FilePath $desktopApp -ArgumentList '--background' -WorkingDirectory $appDirectory -WindowStyle Hidden }
        else { Start-Process -FilePath $desktopApp -WorkingDirectory $appDirectory -WindowStyle Normal }
        exit 0
    }
    if (-not (Test-Bridge)) {
        $nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
        if (-not $nodePath) { throw 'Node.js 20 or later is required. Install it from https://nodejs.org/ and run Start.cmd again.' }
        $entryPath = Join-Path $appDirectory 'server.mjs'
        Start-Process -FilePath $nodePath -ArgumentList ('"' + $entryPath + '"') -WorkingDirectory $appDirectory -WindowStyle Hidden
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 200
            if (Test-Bridge) { $ready = $true; break }
        }
        if (-not $ready) { throw 'The local bridge could not start. Port 49832 may be in use. Run node server.mjs in this folder to see the error.' }
    }
    if (-not $Background -and -not $BridgeOnly) {
        $edgePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
        if (Test-Path -LiteralPath $edgePath) { Start-Process -FilePath $edgePath -ArgumentList $address -WindowStyle Hidden }
        else { Start-Process $address }
    }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'YouTube Discord') | Out-Null
    exit 1
}
