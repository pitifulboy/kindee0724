!macro preInit
  ; 强制终止正在运行的应用进程（避免安装时文件被锁定）
  ExecWait 'taskkill /f /im "${PRODUCT_NAME}.exe"'
  ; 清理旧版本残留的 Electron 单实例锁文件
  Delete "$APPDATA\electron-office\SingletonLock"
  Delete "$APPDATA\electron-office\SingletonSocket"
  Delete "$APPDATA\electron-office\SingletonCookie"
  ; 清理 GPU 缓存（旧版本崩溃残留）
  RMDir /r "$APPDATA\electron-office\GPUCache"
  RMDir /r "$APPDATA\electron-office\DawnCache"
  RMDir /r "$APPDATA\electron-office\ShaderCache"
!macroend

!macro customInstall
  ; 删除旧的桌面快捷方式（强制 Windows 使用新 exe 的图标重建快捷方式）
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
!macroend
