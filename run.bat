@echo off
title Dave.903 Dashboard System v4.0.0
color 0b

echo #######################################################
echo #                                                     #
echo #          DAVE.903 - AFK BOT & TAKIP PANELI          #
echo #               Surum: v4.0.0 STABLE                  #
echo #                                                     #
echo #######################################################
echo.

:: FFmpeg Check
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] HATA: FFmpeg sisteminizde yuklu degil. Medya yayini calismayacaktir.
    echo [!] Lutfen FFmpeg'i yukleyin ve Path'e ekleyin.
    pause
)

:: Node Modules Check
if not exist "node_modules" (
    echo [!] node_modules bulunamadi. Yukleniyor...
    call npm install
)

if not exist "server\node_modules" (
    echo [!] Server node_modules bulunamadi. Yukleniyor...
    cd server
    call npm install
    cd ..
)

echo.
echo [+] Sistem Hazirlaniyor...
echo [+] Backend Baslatiliyor... (Port: 3001)
echo [+] Frontend Baslatiliyor... (Port: 5173)

:: Start Backend in background
start /b cmd /c "cd server && node server.js"

:: Start Frontend
npm run dev

pause
