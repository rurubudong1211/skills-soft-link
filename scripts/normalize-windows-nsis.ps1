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
$nsisDir = Join-Path $TargetRoot "bundle\nsis"
if (-not (Test-Path -LiteralPath $nsisDir)) {
  throw "NSIS normalize failed: bundle directory not found at $nsisDir. Run tauri build --bundles nsis first."
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
$targetName = "{0}_{1}_{2}-setup.exe" -f $packageName, $version, $arch
$targetPath = Join-Path $nsisDir $targetName
$source = Get-ChildItem -LiteralPath $nsisDir -Filter ("{0}_{1}_{2}-setup.exe" -f $productName, $version, $arch) |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $source) {
  $source = Get-ChildItem -LiteralPath $nsisDir -Filter $targetName |
    Select-Object -First 1
}

if ($null -eq $source) {
  throw "NSIS normalize failed: no installer found in $nsisDir."
}

if ((Test-Path -LiteralPath $targetPath) -and ((Resolve-Path $targetPath).Path -ne $source.FullName)) {
  Remove-Item -LiteralPath $targetPath -Force
}

if ((Split-Path -Leaf $source.FullName) -ne $targetName) {
  Move-Item -LiteralPath $source.FullName -Destination $targetPath -Force
}

Write-Host "NSIS installer renamed: $targetPath"
