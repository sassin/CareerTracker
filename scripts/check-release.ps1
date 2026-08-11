$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$git = Get-Command git -ErrorAction SilentlyContinue
$tracked = @()
if ($git -and (Test-Path ".git")) {
  $tracked = @(git ls-files)
} else {
  $tracked = @(Get-ChildItem -Path . -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $_.FullName.Substring($root.Length).TrimStart("\\", "/").Replace("\\", "/")
  })
}

$patterns = @(
  '^node_modules/',
  '^dist/',
  '^src-tauri/target/',
  '^target/',
  '(^|/)\.env($|\.)',
  '\.(exe|msi|msix|appx|pdb)$',
  '\.(db|db-shm|db-wal)$',
  '(^|/)backups/',
  '(^|/)generated/'
)

$problems = foreach ($file in $tracked) {
  $normalized = $file.Replace("\\", "/")
  if ($patterns | Where-Object { $normalized -match $_ }) {
    $normalized
  }
}

if ($problems.Count -gt 0) {
  Write-Host "Release source check found tracked/packaged files that should be excluded:" -ForegroundColor Red
  $problems | Sort-Object -Unique | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host "[OK] No installers, build output, local databases, backups, or environment files are included." -ForegroundColor Green
