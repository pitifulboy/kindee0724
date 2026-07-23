@echo off
cd /d D:\111111vc
echo 正在安装项目依赖...
npm install
echo 安装完成！
echo.
echo 现在可以运行以下命令：
echo npm run dev   - 启动开发环境
echo npm run build - 构建生产版本
pause