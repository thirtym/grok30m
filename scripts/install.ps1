# Build this clone and install it into every Cursor/VS Code CLI on this host.
# For "just give me the current release" use bootstrap.ps1 instead.
param(
    [string]$VsixPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$Id = "grok30m.grok30m"
$Conflicts = @("PawelHuryn.grok-vscode-phuryn", "paul-local.grok-tabs")

function Find-EditorClis {
    $found = New-Object System.Collections.Generic.List[string]
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    function Add-Cli([string]$path) {
        if (-not $path) { return }
        if (-not (Test-Path $path)) { return }
        if ($seen.Add($path)) { [void]$found.Add($path) }
    }
    foreach ($name in @("cursor", "cursor-insiders", "code", "code-insiders")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { Add-Cli $cmd.Source }
    }
    $la = $env:LOCALAPPDATA
    Add-Cli "$la\Programs\cursor\resources\app\bin\cursor.cmd"
    Add-Cli "$la\Programs\Cursor\resources\app\bin\cursor.cmd"
    Add-Cli "$la\Programs\Microsoft VS Code\bin\code.cmd"
    Add-Cli "$la\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd"
    Get-ChildItem -Path "$env:USERPROFILE\.cursor-server\bin" -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Add-Cli (Join-Path $_.FullName "bin\remote-cli\cursor.cmd") }
    Get-ChildItem -Path "$env:USERPROFILE\.vscode-server\bin" -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Add-Cli (Join-Path $_.FullName "bin\remote-cli\code.cmd") }
    return $found
}

if (-not $VsixPath) {
    Write-Host "Building a fresh .vsix from current source..."
    Push-Location $repoRoot
    try {
        if (-not (Test-Path "node_modules")) { npm install }
        npm run package
        $vsix = Get-ChildItem -Path $repoRoot -Filter "grok30m-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    } finally { Pop-Location }
    if (-not $vsix) { throw "Build did not produce a grok30m-*.vsix." }
    $VsixPath = $vsix.FullName
}

$clis = Find-EditorClis
if ($clis.Count -eq 0) { throw "Could not find Cursor or VS Code CLI." }

foreach ($cli in $clis) {
    Write-Host "Installing $VsixPath via $cli"
    foreach ($ext in @($Id) + $Conflicts) {
        & $cli --uninstall-extension $ext 2>$null | Out-Null
    }
    & $cli --install-extension $VsixPath --force
}

Write-Host ""
Write-Host "Done. Reload every open window (Developer: Reload Window)."
Write-Host "Grok30m will then keep itself current from GitHub Releases."
