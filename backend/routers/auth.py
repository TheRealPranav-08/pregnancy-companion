from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal
import aiosqlite
from db.database import DB_PATH
from auth.auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=200)
    password: str = Field(..., min_length=6, max_length=200)
    pregnancy_week: Optional[int] = Field(default=None, ge=1, le=42)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class StageUpdateRequest(BaseModel):
    stage: Literal["pregnant", "postnatal"]
    baby_birth_date: Optional[str] = None
    pregnancy_week: Optional[int] = Field(default=None, ge=1, le=42)
    delivery_type: Optional[str] = None


def _user_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "pregnancy_week": row["pregnancy_week"],
        "stage": row["stage"],
        "baby_birth_date": row["baby_birth_date"],
        "baby_weeks": row["baby_weeks"],
        "delivery_type": row["delivery_type"],
    }


@router.post("/signup")
async def signup(req: SignupRequest):
    """Create a new user account and return JWT token."""
    email = req.email.strip().lower()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id FROM users WHERE email=?", (email,)) as cur:
            if await cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered")

        hashed = hash_password(req.password)
        cursor = await db.execute(
            "INSERT INTO users (name, email, password_hash, pregnancy_week) VALUES (?,?,?,?)",
            (req.name.strip(), email, hashed, req.pregnancy_week),
        )
        await db.commit()
        user_id = cursor.lastrowid

        async with db.execute(
            "SELECT id, name, email, pregnancy_week, stage, baby_birth_date, baby_weeks, delivery_type FROM users WHERE id=?",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()

    token = create_access_token({"user_id": user_id})
    return {"token": token, "user": _user_dict(row)}


@router.post("/login")
async def login(req: LoginRequest):
    """Authenticate user and return JWT token."""
    email = req.email.strip().lower()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, name, email, password_hash, pregnancy_week, stage, baby_birth_date, baby_weeks, delivery_type FROM users WHERE email=?",
            (email,),
        ) as cur:
            row = await cur.fetchone()

    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"user_id": row["id"]})
    return {"token": token, "user": _user_dict(row)}


@router.put("/stage")
async def update_stage(req: StageUpdateRequest, user: dict = Depends(get_current_user)):
    """Update user's journey stage (pregnant or postnatal)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        baby_weeks = None
        if req.stage == "postnatal" and req.baby_birth_date:
            from datetime import date, datetime
            try:
                birth = datetime.strptime(req.baby_birth_date, "%Y-%m-%d").date()
                delta = (date.today() - birth).days
                baby_weeks = max(0, delta // 7)
            except ValueError:
                pass

        await db.execute(
            "UPDATE users SET stage=?, pregnancy_week=?, baby_birth_date=?, baby_weeks=?, delivery_type=? WHERE id=?",
            (req.stage, req.pregnancy_week, req.baby_birth_date, baby_weeks, req.delivery_type, user["id"]),
        )
        await db.commit()

        async with db.execute(
            "SELECT id, name, email, pregnancy_week, stage, baby_birth_date, baby_weeks, delivery_type FROM users WHERE id=?",
            (user["id"],),
        ) as cur:
            row = await cur.fetchone()

    return _user_dict(row)


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return user
