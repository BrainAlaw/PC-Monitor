[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Project,
    [string]$Tools = 'codex,copilot,cursor,opencode',
    [string]$OpenCodeModel,
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
try {
    foreach ($dependency in @('node', 'npm', 'git', 'bash')) {
        if (-not (Get-Command $dependency -ErrorAction SilentlyContinue)) {
            throw "Missing $dependency. Follow the prerequisite commands in README.md, reopen PowerShell, then retry."
        }
    }
    [string[]]$setupArguments = @((Join-Path $PSScriptRoot 'setup.mjs'), '--project', $Project, '--tools', $Tools, '--profile', 'full-control')
    if ($Install) { $setupArguments += '--install' }
    if ($OpenCodeModel) { $setupArguments += @('--opencode-model', $OpenCodeModel) }
    & node @setupArguments
    if ($LASTEXITCODE -ne 0) { throw "Bootstrap failed with exit code $LASTEXITCODE" }
    [PSCustomObject]@{ Project = [System.IO.Path]::GetFullPath($Project); Profile = 'full-control'; Initialized = $true }
} catch {
    Write-Error $_
    exit 1
} finally {
    $setupArguments = @()
}
