@echo off
setlocal
for %%I in ("%~dp0.") do set "SIGHTLINE_ROOT=%%~fI"
cd /d "%SIGHTLINE_ROOT%"

if not exist "api\.venv\Scripts\python.exe" (
  echo Creating the Python environment...
  py -3.12 -m venv api\.venv
  if errorlevel 1 goto failed
  call api\.venv\Scripts\python.exe -m pip install --upgrade pip
  if errorlevel 1 goto failed
  call api\.venv\Scripts\python.exe -m pip install -r api\requirements.txt
  if errorlevel 1 goto failed
)

if not exist "web\node_modules" (
  echo Installing web dependencies...
  call pnpm --dir web install
  if errorlevel 1 goto failed
)

rem Restart an existing Sightline API so it uses this checkout and its current settings.
set "SIGHTLINE_API_PID="
for /f "delims=" %%P in ('powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if ($c) { $p=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $c[0].OwningProcess); if ($p.CommandLine -match 'uvicorn api\.main:app') { $p.ProcessId } }"') do set "SIGHTLINE_API_PID=%%P"
if defined SIGHTLINE_API_PID (
  echo Restarting the existing Sightline API...
  taskkill /PID %SIGHTLINE_API_PID% /T /F >nul 2>&1
  ping -n 2 127.0.0.1 >nul
)

netstat -ano | findstr /C:":8000 " | findstr /C:"LISTENING" >nul
if errorlevel 1 (
  start "Sightline API" /D "%SIGHTLINE_ROOT%" "%SIGHTLINE_ROOT%\api\.venv\Scripts\python.exe" -m uvicorn api.main:app --reload --port 8000
) else (
  echo Port 8000 is already in use by another app. Sightline API was not restarted.
)

netstat -ano | findstr /C:":3000 " | findstr /C:"LISTENING" >nul
if errorlevel 1 start "Sightline Web" /D "%SIGHTLINE_ROOT%\web" cmd.exe /k pnpm dev

ping -n 3 127.0.0.1 >nul
start "" http://localhost:3000
endlocal
exit /b 0

:failed
echo Setup failed. Read the error above, then run run.cmd again.
pause
exit /b 1
