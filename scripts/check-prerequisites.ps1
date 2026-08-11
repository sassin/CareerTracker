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

Write-Host ""
Write-Host "Windows builds also require Visual Studio Build Tools 2022 with Desktop development with C++ and Microsoft Edge WebView2 Runtime."
