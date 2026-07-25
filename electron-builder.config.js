const path = require('path')

module.exports = {
  appId: 'com.xinweizhixuan.kingdee.template',
  productName: '金蝶模板生成（新味智选）',
  copyright: 'Copyright © 2024 新味智选',
  directories: {
    output: 'release',
    buildResources: 'build'
  },
  files: [
    'dist/**/*',
    'dist-electron/**/*',
    // ─── exceljs 及其运行时依赖 ───
    'node_modules/exceljs/**/*',
    'node_modules/archiver/**/*',
    'node_modules/archiver-utils/**/*',
    'node_modules/compress-commons/**/*',
    'node_modules/zip-stream/**/*',
    'node_modules/glob/**/*',
    'node_modules/dayjs/**/*',
    'node_modules/fast-csv/**/*',
    'node_modules/@fast-csv/**/*',
    'node_modules/jszip/**/*',
    'node_modules/lie/**/*',
    'node_modules/setimmediate/**/*',
    'node_modules/readable-stream/**/*',
    'node_modules/string_decoder/**/*',
    'node_modules/safe-buffer/**/*',
    'node_modules/util-deprecate/**/*',
    'node_modules/inherits/**/*',
    'node_modules/process-nextick-args/**/*',
    'node_modules/core-util-is/**/*',
    'node_modules/isarray/**/*',
    'node_modules/saxes/**/*',
    'node_modules/xmlchars/**/*',
    'node_modules/tmp/**/*',
    'node_modules/unzipper/**/*',
    'node_modules/binary/**/*',
    'node_modules/bluebird/**/*',
    'node_modules/buffer-alloc/**/*',
    'node_modules/buffer-fill/**/*',
    'node_modules/uuid/**/*',
    'node_modules/graceful-fs/**/*',
    'node_modules/fs.realpath/**/*',
    'node_modules/inflight/**/*',
    'node_modules/minimatch/**/*',
    'node_modules/once/**/*',
    'node_modules/wrappy/**/*',
    'node_modules/lazystream/**/*',
    'node_modules/normalize-path/**/*',
    'node_modules/micromatch/**/*',
    'node_modules/merge2/**/*',
    'node_modules/fast-glob/**/*',
    'node_modules/picomatch/**/*',
    'node_modules/is-glob/**/*',
    'node_modules/glob-parent/**/*',
    'node_modules/is-extglob/**/*',
    'node_modules/braces/**/*',
    'node_modules/fill-range/**/*',
    'node_modules/to-regex-range/**/*',
    'node_modules/is-number/**/*',
    'node_modules/base64-js/**/*',
    'node_modules/ieee754/**/*',
    'node_modules/buffer-from/**/*',
    'node_modules/immediate/**/*'
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    artifactName: '${productName}-v${version}-Setup.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '金蝶模板生成（新味智选）',
    installerIcon: path.resolve(__dirname, 'build/icon.ico'),
    uninstallerIcon: path.resolve(__dirname, 'build/icon.ico'),
    installerHeaderIcon: path.resolve(__dirname, 'build/icon.ico')
  },
  asar: true
}