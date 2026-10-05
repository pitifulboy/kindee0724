# ═══════════════════════════════════════════════════════════════
# 发布脚本：版本号自动递增 + 打包
# 使用方法：.\build-release.ps1        （补丁版本 +0.0.1）
#           .\build-release.ps1 minor  （次版本 +0.1.0）
#           .\build-release.ps1 major  （主版本 +1.0.0）
# ═══════════════════════════════════════════════════════════════

param([string]$BumpType = "patch")

# 读取当前版本
$pkg = Get-Content "package.json" | ConvertFrom-Json

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

# 更新 package.json
$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"
Write-Host "✓ package.json 已更新" -ForegroundColor Green

# 更新 appText.ts
$appTextPath = "src-electron/renderer/config/appText.ts"
$content = Get-Content $appTextPath -Raw
$content = $content -replace "version: 'v[\d.]+'", "version: 'v$newVersion'"
Set-Content $appTextPath $content
Write-Host "✓ appText.ts 已更新" -ForegroundColor Green

# 构建
Write-Host "`n开始构建..." -ForegroundColor Yellow
npx vite build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx electron-builder --win nsis --config electron-builder.config.js --publish never
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n✓ 构建完成: release\新味智枢-v$newVersion-Setup.exe" -ForegroundColor Green
