!macro preInit
  ; 强制终止正在运行的应用进程（避免安装时文件被锁定）
  ExecWait 'taskkill /f /im "${PRODUCT_NAME}.exe"'
  ; 清理旧版本残留的 Electron 单实例锁文件
  ; 必须在安装前清理，否则新版本启动时 requestSingleInstanceLock() 会失败
  Delete "$APPDATA\electron-office\SingletonLock"
  Delete "$APPDATA\electron-office\SingletonSocket"
  Delete "$APPDATA\electron-office\SingletonCookie"
  ; 清理 GPU 缓存（旧版本崩溃残留，可能阻止新版本启动）
  RMDir /r "$APPDATA\electron-office\GPUCache"
  RMDir /r "$APPDATA\electron-office\DawnCache"
  RMDir /r "$APPDATA\electron-office\ShaderCache"
  ; 删除旧桌面快捷方式（安装前删除，让 NSIS 创建新的快捷方式时使用新 exe 图标）
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
!macroend
