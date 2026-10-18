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

netstat -ano | findstr /C:":8000 " | findstr /C:"LISTENING" >nul
if errorlevel 1 start "Sightline API" /D "%SIGHTLINE_ROOT%" "%SIGHTLINE_ROOT%\api\.venv\Scripts\python.exe" -m uvicorn api.main:app --reload --port 8000

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
