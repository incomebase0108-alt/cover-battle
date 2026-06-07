@echo off
chcp 932 >nul
setlocal enabledelayedexpansion
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
echo 同じ Wi-Fi のスマホ／PC のブラウザで、下のURLのどれかを開いてください:
echo （192.168 で始まるものが Wi-Fi のことが多いです）
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "ip=%%a"
  set "ip=!ip: =!"
  echo     http://!ip!:8080/netclient.html
)
echo.
echo ※このウィンドウは開いたままにしてください（閉じるとサーバーが止まります）。
echo   終了するときはウィンドウを閉じるか Ctrl+C を押します。
echo ====================================
echo.
node server.js
pause