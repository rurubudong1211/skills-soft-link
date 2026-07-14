param(
  [string]$TargetRoot = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJson = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json
$tauriConfig = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $ProjectRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
$cargoManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $ProjectRoot "src-tauri\Cargo.toml")

if ([string]::IsNullOrWhiteSpace($TargetRoot)) {
  $TargetRoot = Join-Path $ProjectRoot "src-tauri\target\release"
}

$TargetRoot = Resolve-Path $TargetRoot
$crateName = [regex]::Match($cargoManifest, '(?ms)^\[package\]\s.*?^name\s*=\s*"([^"]+)"').Groups[1].Value
if ([string]::IsNullOrWhiteSpace($crateName)) {
  throw "Portable package failed: could not read the Rust package name from src-tauri\Cargo.toml."
}

$exePath = Join-Path $TargetRoot ("{0}.exe" -f $crateName)
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Portable package failed: executable not found at $exePath. Run npm run tauri:build first."
}

$arch = "x64"
if ($TargetRoot.Path -match "aarch64-pc-windows-msvc") {
  $arch = "arm64"
} elseif ($TargetRoot.Path -match "i686-pc-windows-msvc") {
  $arch = "x86"
}

$productName = $tauriConfig.productName
$packageName = $packageJson.name
$version = $packageJson.version
$bundleDir = Join-Path $TargetRoot "bundle\portable"
$stagingRoot = Join-Path $TargetRoot "portable-staging"
$stagingDir = Join-Path $stagingRoot $packageName
$zipPath = Join-Path $bundleDir ("{0}_{1}_{2}-Portable.zip" -f $packageName, $version, $arch)
$legacyZipPath = Join-Path $bundleDir ("{0}_{1}_{2}-Portable.zip" -f $productName, $version, $arch)

if (Test-Path -LiteralPath $stagingRoot) {
  $resolvedStagingRoot = (Resolve-Path -LiteralPath $stagingRoot).Path
  $targetPrefix = ([System.IO.Path]::GetFullPath($TargetRoot.Path).TrimEnd('\\') + '\\')
  if (-not $resolvedStagingRoot.StartsWith($targetPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Portable package failed: refusing to remove staging directory outside $TargetRoot."
  }
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
Copy-Item -LiteralPath $exePath -Destination (Join-Path $stagingDir (Split-Path $exePath -Leaf)) -Force

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

if (($legacyZipPath -ne $zipPath) -and (Test-Path -LiteralPath $legacyZipPath)) {
  Remove-Item -LiteralPath $legacyZipPath -Force
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Portable bundle created: $zipPath"
