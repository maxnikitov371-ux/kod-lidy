@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT="

for /L %%P in (8000,1,8100) do (
  set "IN_USE="
  for /f "tokens=1" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    set "IN_USE=1"
  )
  if not defined IN_USE (
    set "PORT=%%P"
    goto :port_found
  )
)

:port_found
if not defined PORT (
  echo.
  echo No free port found in range 8000-8100.
  pause
  exit /b 1
)

echo Starting local server on http://%HOST%:%PORT%/

python -c "import sys" >nul 2>&1
if %errorlevel%==0 (
  python -m http.server %PORT% --bind %HOST%
  goto :eof
)

py -3 -c "import sys" >nul 2>&1
if %errorlevel%==0 (
  py -3 -m http.server %PORT% --bind %HOST%
  goto :eof
)

echo.
echo Python was not found. Install Python 3 and ensure "python" or "py" is available in PATH.
pause