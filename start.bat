@echo off
echo Оби Ватан запускается...
cd /d "%~dp0"
start http://localhost:3000
node server.js
pause
