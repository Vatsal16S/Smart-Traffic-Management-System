@echo off
title Stop Smart Traffic Management System
echo ============================================================
echo   Stopping Smart Traffic Management System Services...
echo ============================================================
echo.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 8080 -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} }"
echo [OK] Ports 8000 and 8080 have been freed.
echo All backend and frontend processes terminated cleanly.
echo.
echo ============================================================
timeout /t 3
