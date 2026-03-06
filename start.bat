@echo off
title Aura AI — Pregnancy Companion
color 0D

echo.
echo  ================================================================
echo   Aura AI - Pregnancy ^& Postnatal Health Companion
echo   75HER Hackathon ^| AI/ML Track ^| Powered by Goose AI
echo  ================================================================
echo.

:: === Backend Setup ===
echo [1/4] Activating Python environment...
cd /d "%~dp0backend"

if not exist ".env" (
    echo       WARNING: .env not found — copying .env.example
    copy .env.example .env
)

echo [2/4] Checking Python dependencies...
if not exist ".deps_installed" (
    echo       Installing Python dependencies...
    pip install -r requirements.txt -q
    echo done > .deps_installed
) else (
    echo       Dependencies already installed, skipping.
)

echo [3/4] Training mood ML model...
if not exist "ml\mood_model.pkl" (
    python ml/train_mood_model.py
) else (
    echo       ML model already trained, skipping.
)

echo [4/4] Starting servers...
echo.

:: Start FastAPI backend
start "Aura Backend (FastAPI)" cmd /k "cd /d "%~dp0backend" && uvicorn main:app --reload --port 8000"

:: Start React frontend
cd /d "%~dp0frontend"
start "Aura Frontend (React)" cmd /k "npm run dev"

echo.
echo  ================================================================
echo   Backend API:   http://localhost:8000
echo   Swagger Docs:  http://localhost:8000/docs
echo   Frontend App:  http://localhost:5173
echo  ================================================================
echo.
echo  Waiting 3 seconds then opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo  Servers are running! Press any key to exit this window.
pause >nul
