from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from db.database import init_db
from routers import guidance, mood, kicks, journal

load_dotenv()

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("Database initialized OK")
    yield


app = FastAPI(
    title="AI Pregnancy & Postnatal Health Companion",
    description="""
## 🤱 AI Pregnancy Companion API

Personalized pregnancy guidance powered by **Goose AI** and **Machine Learning**.

### Features
- **📅 Weekly Guidance** — Personalized LLM-driven advice per pregnancy week
- **💜 Mood Assessment** — ML-based depression risk scoring (RandomForest)
- **👶 Kick Tracker** — Baseline anomaly detection for reduced fetal movement
- **📓 Journal** — Keyword-aware health journal with auto-tagging

### 75HER Hackathon — AI/ML Track
Built for the CreateHER Fest #75HER Challenge, targeting women's health.
    """,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(guidance.router, prefix="/api")
app.include_router(mood.router, prefix="/api")
app.include_router(kicks.router, prefix="/api")
app.include_router(journal.router, prefix="/api")


@app.get("/", tags=["Health"])
async def root():
    return {
        "name": "AI Pregnancy & Postnatal Health Companion",
        "status": "running",
        "docs": "/docs",
        "track": "AI/ML - 75HER Hackathon",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
