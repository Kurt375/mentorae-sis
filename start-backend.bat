@echo off
title Mentorae SIS Backend Server
echo ========================================================
echo        Starting Mentorae SIS Services...
echo ========================================================

rem Ensure local MySQL on port 3306 is running as standby/offline fallback
netstat -ano | findstr :3306 >nul
if %errorlevel% neq 0 (
    echo [INFO] Starting Local MySQL (XAMPP) for offline/firewall fallback...
    if exist "C:\xampp\mysql_start.bat" (
        start "" /min "C:\xampp\mysql_start.bat"
    ) else if exist "C:\xampp\mysql\bin\mysqld.exe" (
        start "" /min "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
    )
    timeout /t 2 >nul
) else (
    echo [OK] Local MySQL is running on port 3306 (Ready as fallback).
)

echo [INFO] Starting Node.js Backend Server on port 5000...
echo [INFO] System will prioritize Cloud Database (TiDB) and auto-fallback to Local MySQL if blocked!
cd /d "%~dp0backend"
node server.js
pause
