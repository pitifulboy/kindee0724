# ═══════════════════════════════════════════════════════════════
# 发布脚本：版本号自动递增 + 打包
# 使用方法：.\build-release.ps1        （补丁版本 +0.0.1）
#           .\build-release.ps1 minor  （次版本 +0.1.0）
#           .\build-release.ps1 major  （主版本 +1.0.0）
#
# 版本号单一来源：package.json。
# 界面显示版本由 Vite 构建期注入 __APP_VERSION__（见 vite.config.ts），
# 因此本脚本不再改写任何源码文本 —— 从根上避免「非 UTF-8 写回导致中文乱码」。
# ═══════════════════════════════════════════════════════════════

param([string]$BumpType = "patch")

$ErrorActionPreference = "Stop"

$pkgPath = "package.json"

# 以 UTF-8 读取（兼容带/不带 BOM）
$raw = Get-Content $pkgPath -Raw -Encoding UTF8
$pkg = $raw | ConvertFrom-Json

# 严格解析版本号，避免产生非法版本（如 ".6.0"）
if ($pkg.version -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
  Write-Host "✗ package.json 版本号非法: $($pkg.version)" -ForegroundColor Red
  exit 1
}
$major = [int]$Matches[1]
$minor = [int]$Matches[2]
$patch = [int]$Matches[3]

switch ($BumpType) {
  "major" { $major++; $minor = 0; $patch = 0 }
  "minor" { $minor++; $patch = 0 }
  default { $patch++ }
}

$newVersion = "$major.$minor.$patch"

Write-Host "当前版本: v$($pkg.version)" -ForegroundColor Cyan
Write-Host "新版本:   v$newVersion" -ForegroundColor Green

# 仅替换 version 字段，保留原文件缩进与顺序（避免 ConvertTo-Json 全文件重排产生噪声 diff）
$regex = [regex]'("version"\s*:\s*")[^"]+(")'
$updated = $regex.Replace($raw, ('${1}' + $newVersion + '${2}'), 1)

# 必须显式以 UTF-8（无 BOM）写回：
# Windows PowerShell 5.1 的 Set-Content 默认使用系统 ANSI（简中为 GBK），会把中文写成乱码
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $pkgPath).Path, $updated, $utf8NoBom)
Write-Host "✓ package.json 版本已更新为 v$newVersion（界面版本由构建期注入，无需改源码）" -ForegroundColor Green

# 构建
Write-Host "`n开始构建..." -ForegroundColor Yellow
npx vite build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx electron-builder --win nsis --config electron-builder.config.js --publish never
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n✓ 构建完成: release\新味智枢-v$newVersion-Setup.exe" -ForegroundColor Green
