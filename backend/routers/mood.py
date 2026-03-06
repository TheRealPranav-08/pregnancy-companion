from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import List
import joblib, json, os, aiosqlite
from pathlib import Path
from db.database import DB_PATH
from services.goose_client import get_mood_explanation
from auth.auth_utils import get_current_user

router = APIRouter(prefix="/mood", tags=["Mood"])

MODEL_PATH = Path(__file__).parent.parent / "ml" / "mood_model.pkl"
_model = None


def load_model():
    global _model
    if _model is None and MODEL_PATH.exists():
        _model = joblib.load(MODEL_PATH)
    return _model


class MoodRequest(BaseModel):
    q1: int = Field(..., ge=0, le=3)
    q2: int = Field(..., ge=0, le=3)
    q3: int = Field(..., ge=0, le=3)
    q4: int = Field(..., ge=0, le=3)
    q5: int = Field(..., ge=0, le=3)
    q6: int = Field(..., ge=0, le=3)
    q7: int = Field(..., ge=0, le=3)
    sleep_hours: float = Field(..., ge=0, le=14)
    energy: int = Field(..., ge=0, le=10)


def predict_risk(req: MoodRequest) -> tuple[str, float]:
    answers = [req.q1, req.q2, req.q3, req.q4, req.q5, req.q6, req.q7]
    phq_score = sum(answers)

    model = load_model()
    if model:
        features = answers + [req.sleep_hours, req.energy]
        pred = model.predict([features])[0]
        proba = model.predict_proba([features])[0]
        score = round(float(max(proba)) * 100, 1)
        level_map = {0: "Low", 1: "Moderate", 2: "High"}
        return level_map[pred], score
    else:
        sleep_penalty = max(0, (7 - req.sleep_hours) * 3)
        energy_penalty = max(0, (5 - req.energy) * 2)
        total = min(phq_score * 4.5 + sleep_penalty + energy_penalty, 100)
        if total < 30:
            return "Low", round(100 - total, 1)
        elif total < 60:
            return "Moderate", round(100 - total, 1)
        else:
            return "High", round(total, 1)


@router.post("/assess")
async def assess_mood(req: MoodRequest, user: dict = Depends(get_current_user)):
    """Assess mood risk using trained ML model + get gentle LLM explanation."""
    risk_level, score = predict_risk(req)
    explanation = await get_mood_explanation(risk_level, score)

    session_id = str(user["id"])
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO mood_logs (session_id, answers, sleep_hours, energy, risk_level, score) VALUES (?,?,?,?,?,?)",
            (session_id,
             json.dumps([req.q1, req.q2, req.q3, req.q4, req.q5, req.q6, req.q7]),
             req.sleep_hours, req.energy, risk_level, score),
        )
        await db.commit()

    return {
        "risk_level": risk_level,
        "score": score,
        "explanation": explanation,
        "recommendations": _get_recommendations(risk_level),
    }


@router.get("/history")
async def get_mood_history(user: dict = Depends(get_current_user)):
    """Retrieve last 7 mood logs for the authenticated user."""
    session_id = str(user["id"])
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT risk_level, score, created_at FROM mood_logs WHERE session_id=? ORDER BY created_at DESC LIMIT 7",
            (session_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


def _get_recommendations(risk_level: str) -> list:
    if risk_level == "High":
        return [
            {"icon": "hospital", "text": "Please reach out to your healthcare provider soon"},
            {"icon": "phone", "text": "Call a support helpline or trusted person today"},
            {"icon": "heart", "text": "You are not alone — postpartum support is available"},
        ]
    base = [
        {"icon": "yoga", "text": "5 minutes of mindful breathing or meditation"},
        {"icon": "walk", "text": "A gentle 10-15 minute walk in fresh air"},
    ]
    if risk_level == "Moderate":
        base += [
            {"icon": "chat", "text": "Talk to a trusted friend or family member today"},
            {"icon": "journal", "text": "Write down 3 things you're grateful for"},
        ]
    return base
