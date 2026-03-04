from fastapi import APIRouter
from pydantic import BaseModel, Field
import aiosqlite
from datetime import date
from db.database import DB_PATH

router = APIRouter(prefix="/kicks", tags=["Kick Tracker"])


class KickLogRequest(BaseModel):
    session_id: str = Field(default="demo_user")
    count: int = Field(..., ge=0)


@router.post("/log")
async def log_kicks(req: KickLogRequest):
    """Log today's kick count for the session."""
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id FROM kick_logs WHERE session_id=? AND logged_date=?",
            (req.session_id, today)
        ) as cur:
            existing = await cur.fetchone()

        if existing:
            await db.execute(
                "UPDATE kick_logs SET count=? WHERE session_id=? AND logged_date=?",
                (req.count, req.session_id, today)
            )
        else:
            await db.execute(
                "INSERT INTO kick_logs (session_id, count, logged_date) VALUES (?,?,?)",
                (req.session_id, req.count, today)
            )
        await db.commit()

    return {"message": "Kick count logged", "date": today, "count": req.count}


@router.get("/status/{session_id}")
async def get_kick_status(session_id: str):
    """Get today's kick count vs baseline average. Flags low activity."""
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT count, logged_date FROM kick_logs WHERE session_id=? ORDER BY logged_date DESC LIMIT 14",
            (session_id,)
        ) as cur:
            rows = await cur.fetchall()

    if not rows:
        return {
            "today": 0, "average": 0, "is_alert": False,
            "pct_of_baseline": 100, "history": [],
            "message": "No data yet. Start counting kicks today!"
        }

    history = [dict(r) for r in rows]
    today_entry = next((r for r in history if r["logged_date"] == today), None)
    today_count = today_entry["count"] if today_entry else 0

    past_entries = [r["count"] for r in history if r["logged_date"] != today]
    average = round(sum(past_entries) / len(past_entries), 1) if past_entries else 10.0
    pct = round((today_count / average) * 100, 1) if average > 0 else 100.0
    is_alert = today_count > 0 and pct < 60

    return {
        "today": today_count,
        "average": average,
        "is_alert": is_alert,
        "pct_of_baseline": pct,
        "history": history[:7],
        "message": (
            "Baby's kick count is lower than usual. Please contact your healthcare provider."
            if is_alert else
            "Baby's kick activity looks normal. Keep tracking!"
        ),
    }
