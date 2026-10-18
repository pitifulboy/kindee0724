const path = require('path')

module.exports = {
  appId: 'com.xinweizhixuan.kingdee.template',
  productName: '新味智枢',
  copyright: 'Copyright © 2025 新味智枢',
  directories: {
    output: 'release',
    buildResources: 'build'
  },
  // 只需声明「打包产物」与「入口」；依赖处理交给 electron-builder：
  // - package.json 会自动进入 asar
  // - node_modules 由 electron-builder 依据 package.json 的生产依赖树自动裁剪复制
  //   （devDependencies 永不打入），因此无需手工枚举 exceljs 的 50 余个传递依赖。
  files: [
    'dist/**/*',
    'dist-electron/**/*',
    // tsc 增量编译缓存，无需随包分发
    '!dist-electron/**/*.tsbuildinfo'
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    icon: path.resolve(__dirname, 'build/icon.ico'),
    artifactName: '${productName}-v${version}-Setup.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '新味智枢',
    installerIcon: path.resolve(__dirname, 'build/icon.ico'),
    uninstallerIcon: path.resolve(__dirname, 'build/icon.ico'),
    installerHeaderIcon: path.resolve(__dirname, 'build/icon.ico'),
    include: path.resolve(__dirname, 'build/installer.nsh')
  },
  // 将图标文件复制到 resources/icons/ 目录（不打包进 asar）
  // 这样主进程可以用 nativeImage.createFromPath 直接读取真实文件
  // 确保 Windows 桌面快捷方式图标、任务栏图标、窗口图标都能正确显示
  extraResources: [
    {
      from: path.resolve(__dirname, 'extra-resources/icons/icon.ico'),
      to: 'icons/icon.ico'
    }
  ],
  asar: true
}