@echo off
title Smart Traffic Management System — Capstone Simulation Launcher
echo ============================================================
echo   Smart Traffic Management System
echo   MIT-WPU Dept. of Electrical & Electronics Engineering
echo ============================================================
echo.
cd /d "%~dp0"
python launch.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Launch encountered an issue.
    echo Trying fallback port cleanup...
    powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 8080 -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} }"
    pause
)
