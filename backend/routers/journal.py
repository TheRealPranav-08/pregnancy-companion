from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
import json, re, aiosqlite
from db.database import DB_PATH
from auth.auth_utils import get_current_user

router = APIRouter(prefix="/journal", tags=["Journal"])

KEYWORD_RULES = {
    "Anxiety":      r"\b(anxious|anxiety|worried|worry|nervous|fear|scared|panic)\b",
    "Pain":         r"\b(pain|ache|hurt|cramp|cramping|sore|burning|sharp)\b",
    "Bleeding":     r"\b(bleed|bleeding|spotting|blood)\b",
    "Fatigue":      r"\b(tired|exhausted|fatigue|weak|no energy|drained|sleepy)\b",
    "Low Movement": r"\b(less movement|no kick|baby.{0,15}not moving|movement.{0,15}less|reduced movement)\b",
    "Nausea":       r"\b(nausea|nauseous|vomit|sick|queasy|morning sickness)\b",
    "Swelling":     r"\b(swell|swollen|swelling|puffy|puffiness|edema)\b",
    "Happy":        r"\b(happy|great|wonderful|excited|joyful|grateful|good|better)\b",
    "Active":       r"\b(walked|exercise|yoga|active|energetic|moved|workout)\b",
}

TAG_SEVERITY = {
    "Anxiety": "red", "Pain": "red", "Bleeding": "red",
    "Fatigue": "orange", "Low Movement": "orange",
    "Nausea": "yellow", "Swelling": "yellow",
    "Happy": "green", "Active": "green",
}

SEVERITY_EMOJI = {"red": "🔴", "orange": "🟠", "yellow": "🟡", "green": "🟢"}


def extract_tags(text: str) -> list[str]:
    text_lower = text.lower()
    tags = []
    for tag, pattern in KEYWORD_RULES.items():
        if re.search(pattern, text_lower):
            emoji = SEVERITY_EMOJI[TAG_SEVERITY[tag]]
            tags.append(f"{emoji} {tag}")
    return tags


class JournalEntry(BaseModel):
    text: str = Field(..., min_length=2, max_length=2000)


@router.post("/entry")
async def add_journal_entry(req: JournalEntry, user: dict = Depends(get_current_user)):
    """Save journal entry and extract keyword tags automatically."""
    tags = extract_tags(req.text)
    tags_json = json.dumps(tags)
    has_concern = any("\U0001f534" in t for t in tags)
    session_id = str(user["id"])

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO journal_entries (session_id, text, tags) VALUES (?,?,?)",
            (session_id, req.text, tags_json),
        )
        await db.commit()
        entry_id = cursor.lastrowid

    return {
        "id": entry_id,
        "text": req.text,
        "tags": tags,
        "has_concern": has_concern,
        "message": (
            "We noticed some concern keywords. Please consult your healthcare provider."
            if has_concern
            else "Journal entry saved. Thank you for checking in!"
        ),
    }


@router.get("/entries")
async def get_journal_entries(user: dict = Depends(get_current_user), limit: int = 10):
    """Retrieve recent journal entries with auto-tags."""
    session_id = str(user["id"])
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, text, tags, created_at FROM journal_entries WHERE session_id=? ORDER BY created_at DESC LIMIT ?",
            (session_id, limit),
        ) as cur:
            rows = await cur.fetchall()

    return [
        {**dict(r), "tags": json.loads(r["tags"])}
        for r in rows
    ]
