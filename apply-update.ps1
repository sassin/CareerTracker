param(
  [string]$ProjectRoot = "."
)

$ErrorActionPreference = "Stop"
$project = (Resolve-Path $ProjectRoot).Path
$source = Split-Path -Parent $MyInvocation.MyCommand.Path

$files = @(
  "src\App.tsx",
  "src\styles.css",
  "src\lib\types.ts",
  "src\lib\repository.ts",
  "src-tauri\src\lib.rs",
  "src-tauri\Cargo.toml",
  "src-tauri\migrations\0002_document_imports.sql",
  "UPDATE_NOTES.md"
)

foreach ($relative in $files) {
  $from = Join-Path $source $relative
  $to = Join-Path $project $relative
  $parent = Split-Path -Parent $to
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Copy-Item -Force $from $to
}

Write-Host "CareerTracker Update 01 applied to $project"
Write-Host "Your existing src-tauri\icons folder was not changed."
Write-Host "Run: npm run tauri:dev"
