param(
  [string]$TargetRoot = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJson = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json
$tauriConfig = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $ProjectRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($TargetRoot)) {
  $TargetRoot = Join-Path $ProjectRoot "src-tauri\target\release"
}

$TargetRoot = Resolve-Path $TargetRoot
$msiDir = Join-Path $TargetRoot "bundle\msi"
if (-not (Test-Path -LiteralPath $msiDir)) {
  throw "MSI normalize failed: bundle directory not found at $msiDir. Run tauri build --bundles msi first."
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
$targetName = "{0}_{1}_{2}.msi" -f $packageName, $version, $arch
$targetPath = Join-Path $msiDir $targetName
$legacyPath = Join-Path $msiDir ("{0}_{1}_{2}.msi" -f $productName, $version, $arch)
$source = Get-ChildItem -LiteralPath $msiDir -Filter ("{0}_{1}_{2}_*.msi" -f $productName, $version, $arch) |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $source) {
  if (Test-Path -LiteralPath $targetPath) {
    if ((Test-Path -LiteralPath $legacyPath) -and ($legacyPath -ne $targetPath)) {
      Remove-Item -LiteralPath $legacyPath -Force
    }
    Write-Host "MSI already normalized: $targetPath"
    return
  }

  if (Test-Path -LiteralPath $legacyPath) {
    $source = Get-Item -LiteralPath $legacyPath
  }
}

if ($null -eq $source) {
  throw "MSI normalize failed: no MSI package found in $msiDir."
}

if ((Test-Path -LiteralPath $targetPath) -and ((Resolve-Path $targetPath).Path -ne $source.FullName)) {
  Remove-Item -LiteralPath $targetPath -Force
}

if ((Split-Path -Leaf $source.FullName) -ne $targetName) {
  Move-Item -LiteralPath $source.FullName -Destination $targetPath -Force
}

Write-Host "MSI renamed: $targetPath"
