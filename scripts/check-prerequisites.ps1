$ErrorActionPreference = "Continue"

function Check-Command($Name, $InstallHint) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    Write-Host "[OK] $Name -> $($command.Source)" -ForegroundColor Green
  } else {
    Write-Host "[MISSING] $Name" -ForegroundColor Yellow
    Write-Host "          $InstallHint"
  }
}

Check-Command "node" "Install Node.js 20 or later."
Check-Command "npm" "npm is included with Node.js."
Check-Command "rustc" "Install Rust through rustup, then open a new PowerShell window."
Check-Command "cargo" "Cargo is included with Rust."
Check-Command "tectonic" "Optional: install Tectonic for PDF export, or configure its full path inside CareerTracker."

Write-Host ""
Write-Host "Also confirm Visual Studio Build Tools 2022 includes Desktop development with C++."
