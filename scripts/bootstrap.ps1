# Install or repair Grok30m from the single public source:
#   https://github.com/thirtym/grok30m/releases/latest
#
# Anyone's machine (Windows):
#   irm https://raw.githubusercontent.com/thirtym/grok30m/grok30m/scripts/bootstrap.ps1 | iex
#
# From a clone:
#   pwsh scripts\bootstrap.ps1 [-VsixPath path\to.vsix]

param(
    [string]$VsixPath
)

$ErrorActionPreference = "Stop"
$Repo = "thirtym/grok30m"
$Api = "https://api.github.com/repos/$Repo/releases/latest"
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

function Get-LatestVsix([string]$dest) {
    $headers = @{ "User-Agent" = "Grok30m-bootstrap (+https://github.com/$Repo)" }
    $release = Invoke-RestMethod -Uri $Api -Headers $headers
    if ($release.draft -or $release.prerelease) {
        throw "latest GitHub release is draft/prerelease; refusing"
    }
    $asset = $release.assets | Where-Object {
        $_.name -match '^grok30m-.*\.vsix$' -and $_.browser_download_url
    } | Select-Object -First 1
    if (-not $asset) { throw "no grok30m-*.vsix on the latest GitHub release" }
    Write-Host "Fetching $($asset.name)"
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $dest
}

$tmp = $null
if (-not $VsixPath) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("grok30m-bootstrap-" + [guid]::NewGuid().ToString("n"))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $VsixPath = Join-Path $tmp "grok30m.vsix"
    Get-LatestVsix $VsixPath
}
if (-not (Test-Path $VsixPath)) { throw "vsix not found: $VsixPath" }

$clis = Find-EditorClis
if ($clis.Count -eq 0) {
    Write-Host "Downloaded $VsixPath but found no Cursor/VS Code CLI."
    Write-Host "Install Cursor or VS Code, then re-run, or:"
    Write-Host "  cursor --install-extension $VsixPath --force"
    exit 1
}

foreach ($cli in $clis) {
    Write-Host "→ $cli"
    foreach ($ext in @($Id) + $Conflicts) {
        & $cli --uninstall-extension $ext 2>$null | Out-Null
    }
    & $cli --install-extension $VsixPath --force
}

if ($tmp) { Remove-Item -Recurse -Force $tmp }

Write-Host ""
Write-Host "Grok30m is installed from GitHub Releases on this host."
Write-Host "In every already-open window: Command Palette → Developer: Reload Window"
Write-Host "After that, Grok30m keeps itself current from https://github.com/$Repo/releases"
