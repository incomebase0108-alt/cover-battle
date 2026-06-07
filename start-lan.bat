@echo off
chcp 932 >nul
cd /d "%~dp0"
title Cover Battle LAN サーバー
echo ====================================
echo    Cover Battle LAN サーバー
echo ====================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [エラー] Node.js が見つかりません。
  echo https://nodejs.org からインストールしてから、もう一度このファイルを開いてください。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 初回セットアップ中です。少し待ってください...
  call npm install
  echo.
)
echo ■ このPCでは、数秒後にブラウザが自動で開きます。
echo     http://localhost:8080/netclient.html
echo.
echo ■ 同じ Wi-Fi のスマホ／別PC は、次のURLを開いてください:
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0show-ip.ps1"
echo.
echo （複数出たら 192.168 で始まるものが Wi-Fi のことが多いです）
echo ※このウィンドウは開いたままに（閉じるとサーバーが止まります）。終了は Ctrl+C。
echo ====================================
echo.
start "" /min powershell -NoProfile -Command "Start-Sleep 2; Start-Process 'http://localhost:8080/netclient.html'"
node server.js
pause