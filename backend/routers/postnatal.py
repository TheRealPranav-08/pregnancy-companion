from typing import List, Optional
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import aiosqlite

from db.database import DB_PATH
from auth.auth_utils import get_current_user

router = APIRouter(prefix="/postnatal", tags=["Postnatal Care"])

# ─── Standard vaccination schedule (vaccine_name, due_week) ────────
STANDARD_VACCINES = [
    ("Hepatitis B – Dose 1", 0),
    ("BCG", 0),
    ("OPV – Dose 0", 0),
    ("OPV – Dose 1", 6),
    ("Pentavalent – Dose 1", 6),
    ("Rotavirus – Dose 1", 6),
    ("PCV – Dose 1", 6),
    ("IPV – Dose 1", 6),
    ("OPV – Dose 2", 10),
    ("Pentavalent – Dose 2", 10),
    ("Rotavirus – Dose 2", 10),
    ("OPV – Dose 3", 14),
    ("Pentavalent – Dose 3", 14),
    ("Rotavirus – Dose 3", 14),
    ("IPV – Dose 2", 14),
    ("PCV – Booster", 36),
    ("Measles/MR – Dose 1", 39),
    ("Vitamin A – Dose 1", 39),
    ("DPT Booster 1", 72),
    ("Measles/MR – Dose 2", 72),
    ("OPV Booster", 72),
]


# ─── Pydantic Models ──────────────────────────────────────────────

class DailyLogIn(BaseModel):
    log_date: Optional[str] = None  # YYYY-MM-DD, defaults to today
    feed_count: int = Field(default=0, ge=0, le=30)
    diaper_count: int = Field(default=0, ge=0, le=30)
    baby_sleep_hours: float = Field(default=0, ge=0, le=24)
    mom_sleep_hours: float = Field(default=0, ge=0, le=24)
    mom_recovery_mood: int = Field(default=3, ge=1, le=5)
    notes: str = Field(default="")


class GrowthLogIn(BaseModel):
    log_date: Optional[str] = None
    weight_kg: Optional[float] = Field(default=None, ge=0, le=30)
    height_cm: Optional[float] = Field(default=None, ge=0, le=120)
    head_cm: Optional[float] = Field(default=None, ge=0, le=60)


# ─── Helpers ──────────────────────────────────────────────────────

def _calc_baby_weeks(birth_date_str: str | None) -> int:
    if not birth_date_str:
        return 0
    try:
        birth = datetime.strptime(birth_date_str, "%Y-%m-%d")
        diff = datetime.now() - birth
        return max(0, diff.days // 7)
    except Exception:
        return 0


def _calc_baby_days(birth_date_str: str | None) -> int:
    if not birth_date_str:
        return 0
    try:
        birth = datetime.strptime(birth_date_str, "%Y-%m-%d")
        diff = datetime.now() - birth
        return max(0, diff.days)
    except Exception:
        return 0


def _interpret_daily_status(log: dict, baby_weeks: int) -> dict:
    """Rule-based status interpretation from daily log data."""
    alerts = []
    tips = []
    milestones = []

    feed = log.get("feed_count", 0)
    diaper = log.get("diaper_count", 0)
    baby_sleep = log.get("baby_sleep_hours", 0)
    mom_sleep = log.get("mom_sleep_hours", 0)
    mood = log.get("mom_recovery_mood", 3)

    # Feeding assessment
    if baby_weeks <= 4:
        if feed < 8:
            alerts.append("Newborns typically need 8-12 feeds per day. Your count seems low.")
        elif feed >= 8:
            tips.append("Great feeding frequency! Newborns thrive on frequent feeds.")
    elif baby_weeks <= 12:
        if feed < 6:
            alerts.append("Babies at this age usually need 6-10 feeds per day.")
        else:
            tips.append("Feeding on track for baby's age.")
    else:
        if feed < 4:
            alerts.append("Consider whether baby is getting enough feeds. Discuss with your pediatrician.")
        else:
            tips.append("Feeding routine looks good for this stage.")

    # Diaper assessment
    if baby_weeks <= 4:
        if diaper < 6:
            alerts.append("Fewer than 6 wet diapers may indicate dehydration. Monitor closely.")
        else:
            tips.append("Diaper output is healthy — baby is well-hydrated!")
    else:
        if diaper < 4:
            alerts.append("Diaper count seems low. Ensure baby is feeding well.")

    # Baby sleep assessment
    if baby_weeks <= 4:
        if baby_sleep < 14:
            tips.append("Newborns typically sleep 14-17 hours. Consider more nap opportunities.")
        elif baby_sleep > 18:
            alerts.append("Excessive sleeping — ensure baby wakes for feeds.")
    elif baby_weeks <= 12:
        if baby_sleep < 12:
            tips.append("Baby may need more sleep. Try a calming bedtime routine.")
    else:
        if baby_sleep < 10:
            tips.append("Encourage more sleep with consistent nap and bedtime schedules.")

    # Mom sleep assessment
    if mom_sleep < 4:
        alerts.append("You're getting very little sleep. Please ask for help and rest when baby sleeps.")
    elif mom_sleep < 6:
        tips.append("Try to catch up on sleep when baby naps. Your recovery needs rest.")
    else:
        tips.append("Glad you're getting some rest! Keep prioritizing your sleep.")

    # Mom mood assessment
    if mood <= 2:
        alerts.append("Your mood is quite low. It's okay to ask for help. Consider talking to a professional if this persists.")
    elif mood == 3:
        tips.append("Hang in there, mama. Recovery takes time and you're doing amazing.")
    else:
        tips.append("Your positive mood is wonderful! Keep taking care of yourself.")

    # Milestones by age
    if baby_weeks <= 2:
        milestones = ["Baby recognizes your voice", "Focuses on faces 8-12 inches away", "Reflexive grasping"]
    elif baby_weeks <= 6:
        milestones = ["First social smile approaching", "Starts tracking moving objects", "Brief head lifts during tummy time"]
    elif baby_weeks <= 12:
        milestones = ["Social smiling and cooing", "Better head control", "Discovering hands", "May start laughing"]
    elif baby_weeks <= 20:
        milestones = ["Rolling over (tummy to back)", "Reaching for objects", "Babbling sounds", "Recognizes familiar faces"]
    elif baby_weeks <= 26:
        milestones = ["Sitting with support", "Interest in solid foods", "Responding to own name", "Transferring objects between hands"]
    elif baby_weeks <= 40:
        milestones = ["Crawling or scooting", "Pulling to stand", "Babbling with consonants", "Stranger anxiety developing"]
    else:
        milestones = ["First words emerging", "Cruising along furniture", "Pincer grasp developing", "Waving bye-bye"]

    return {
        "alerts": alerts,
        "tips": tips,
        "milestones": milestones,
    }


# Recovery tips organized by delivery type and week range
RECOVERY_TIPS = {
    "normal": {
        (0, 2): {
            "title": "Week 0-2: Early Recovery",
            "tips": [
                "Rest as much as possible — sleep when baby sleeps",
                "Expect lochia (postpartum bleeding) for several weeks",
                "Use ice packs or witch hazel pads for perineal soreness",
                "Stay hydrated — drink at least 8 glasses of water daily",
                "Begin gentle pelvic floor exercises (Kegels) when comfortable",
                "Eat iron-rich foods to replenish blood stores",
            ],
            "warning_signs": [
                "Heavy bleeding soaking a pad in an hour",
                "Fever above 100.4\u00b0F / 38\u00b0C",
                "Foul-smelling discharge",
                "Severe headaches or vision changes",
            ],
        },
        (3, 6): {
            "title": "Week 3-6: Continued Healing",
            "tips": [
                "Gentle walks can help recovery and mood",
                "Pelvic floor exercises daily — 3 sets of 10",
                "Hormonal fluctuations may cause mood swings — this is normal",
                "Nourish yourself with protein-rich meals and healthy fats",
                "Accept help from family and friends",
                "Schedule your 6-week postpartum checkup",
            ],
            "warning_signs": [
                "Increasing pain rather than improving",
                "Signs of infection at any tears",
                "Persistent feelings of sadness or hopelessness (talk to your doctor)",
            ],
        },
        (7, 12): {
            "title": "Week 7-12: Rebuilding Strength",
            "tips": [
                "Start postnatal exercise — walking, swimming, or postnatal yoga",
                "Focus on core rehabilitation, not crunches",
                "If cleared by doctor, you can gradually return to more intense exercise",
                "Continue pelvic floor work — it's a lifelong habit",
                "Practice good posture during feeding and carrying baby",
            ],
            "warning_signs": [
                "Urinary incontinence that isn't improving",
                "Pain during exercise",
                "Persistent low mood or anxiety",
            ],
        },
        (13, 52): {
            "title": "Week 13+: Ongoing Wellness",
            "tips": [
                "You should be feeling significantly stronger",
                "Maintain regular exercise and balanced nutrition",
                "Don't compare your recovery to others — every body is different",
                "If you have lingering concerns, it's never too late to see your doctor",
                "Focus on your mental health as well as physical",
                "Stay connected with other moms for support",
            ],
            "warning_signs": [
                "New or worsening symptoms should always be checked",
                "Persistent back pain may benefit from physiotherapy",
            ],
        },
    },
    "c-section": {
        (0, 2): {
            "title": "Week 0-2: Early C-Section Recovery",
            "tips": [
                "Rest is critical — your body is healing from major surgery",
                "Keep your incision clean and dry",
                "Avoid lifting anything heavier than your baby",
                "Use a pillow to support your abdomen when coughing or laughing",
                "Take prescribed pain medication on schedule",
                "Walk short distances to prevent blood clots",
                "Ask for help with household tasks",
            ],
            "warning_signs": [
                "Redness, swelling, or discharge from incision",
                "Fever above 100.4\u00b0F / 38\u00b0C",
                "Increasing pain at incision site",
                "Heavy bleeding soaking a pad in an hour",
            ],
        },
        (3, 6): {
            "title": "Week 3-6: Incision Healing",
            "tips": [
                "Incision should be healing — scar may feel itchy or numb (normal)",
                "Gentle walks are excellent for recovery",
                "Avoid driving until cleared by your doctor (usually 4-6 weeks)",
                "Wear loose, comfortable clothing over your incision",
                "Begin gentle pelvic floor exercises",
                "Schedule your 6-week postpartum checkup",
            ],
            "warning_signs": [
                "Opening or separation of incision",
                "Fever or signs of infection",
                "Persistent sharp pain at incision site",
            ],
        },
        (7, 12): {
            "title": "Week 7-12: Graduated Return to Activity",
            "tips": [
                "After 6-week clearance, gradually increase activity",
                "Start with gentle core exercises — avoid crunches and planks initially",
                "Scar massage (once fully healed) helps with tissue mobility",
                "Postnatal pilates or yoga are excellent options",
                "Continue to listen to your body — some days will be harder",
            ],
            "warning_signs": [
                "Pain during exercise — stop and consult your doctor",
                "Any new changes to your scar",
                "Difficulty with bladder control",
            ],
        },
        (13, 52): {
            "title": "Week 13+: Long-Term Recovery",
            "tips": [
                "Full internal healing takes 6-12 months — be patient",
                "Scar tissue may feel tight — continue gentle massage",
                "You can return to most exercises when comfortable",
                "Core strength rebuilding is a gradual process",
                "Mental health matters — seek support if you need it",
                "Celebrate how far you've come!",
            ],
            "warning_signs": [
                "Persistent numbness around scar (consult if concerning)",
                "Any new abdominal pain",
            ],
        },
    },
}

BREASTFEEDING_TIPS = [
    "Aim for 8-12 feeds per day in the early weeks",
    "Ensure a deep latch — baby's mouth should cover most of the areola",
    "Alternate breasts each feed to maintain supply",
    "Stay hydrated — drink water every time you nurse",
    "Lanolin cream can help with sore nipples",
    "A lactation consultant can be incredibly helpful — don't hesitate to ask",
    "Skin-to-skin contact boosts milk supply and bonding",
    "It's normal for breastfeeding to take practice for both you and baby",
]

NUTRITION_TIPS = [
    "Eat protein at every meal — eggs, lean meat, beans, lentils",
    "Iron-rich foods: spinach, red meat, fortified cereals",
    "Omega-3s from fish, walnuts, and flaxseed support recovery and mood",
    "Calcium-rich foods: dairy, broccoli, fortified plant milk",
    "Healthy snacks: nuts, fruits, yogurt, whole grain crackers",
    "Continue prenatal vitamins as recommended by your doctor",
    "If breastfeeding, you need about 500 extra calories per day",
]


def _get_recovery_tips(delivery_type: str, baby_weeks: int) -> dict:
    dt = "c-section" if delivery_type == "c-section" else "normal"
    tips_by_range = RECOVERY_TIPS[dt]
    for (start, end), data in tips_by_range.items():
        if start <= baby_weeks <= end:
            return data
    return list(tips_by_range.values())[-1]


# ─── Endpoints ────────────────────────────────────────────────────

# 1. POST /daily-log — Save or update today's daily log
@router.post("/daily-log")
async def save_daily_log(log: DailyLogIn, user: dict = Depends(get_current_user)):
    log_date = log.log_date or date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO baby_daily_logs (user_id, log_date, feed_count, diaper_count,
                baby_sleep_hours, mom_sleep_hours, mom_recovery_mood, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, log_date) DO UPDATE SET
                feed_count=excluded.feed_count,
                diaper_count=excluded.diaper_count,
                baby_sleep_hours=excluded.baby_sleep_hours,
                mom_sleep_hours=excluded.mom_sleep_hours,
                mom_recovery_mood=excluded.mom_recovery_mood,
                notes=excluded.notes
        """, (user["id"], log_date, log.feed_count, log.diaper_count,
              log.baby_sleep_hours, log.mom_sleep_hours, log.mom_recovery_mood, log.notes))
        await db.commit()
    return {"status": "saved", "log_date": log_date}


# 2. GET /daily-log — Get today's log (or by date query param)
@router.get("/daily-log")
async def get_daily_log(log_date: str = None, user: dict = Depends(get_current_user)):
    target_date = log_date or date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM baby_daily_logs WHERE user_id = ? AND log_date = ?",
            (user["id"], target_date)
        )
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return None


# 3. GET /daily-status — Get interpreted status from today's log
@router.get("/daily-status")
async def get_daily_status(user: dict = Depends(get_current_user)):
    baby_weeks = _calc_baby_weeks(user.get("baby_birth_date"))
    target_date = date.today().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM baby_daily_logs WHERE user_id = ? AND log_date = ?",
            (user["id"], target_date)
        )
        row = await cursor.fetchone()

    if not row:
        return {
            "has_log": False,
            "baby_weeks": baby_weeks,
            "baby_days": _calc_baby_days(user.get("baby_birth_date")),
            "alerts": [],
            "tips": ["Log today's data to get personalized insights!"],
            "milestones": [],
        }

    log = dict(row)
    status = _interpret_daily_status(log, baby_weeks)
    return {
        "has_log": True,
        "baby_weeks": baby_weeks,
        "baby_days": _calc_baby_days(user.get("baby_birth_date")),
        "log": log,
        **status,
    }


# 4. POST /growth — Save a growth measurement
@router.post("/growth")
async def save_growth_log(log: GrowthLogIn, user: dict = Depends(get_current_user)):
    log_date = log.log_date or date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO baby_growth_logs (user_id, log_date, weight_kg, height_cm, head_cm)
            VALUES (?, ?, ?, ?, ?)
        """, (user["id"], log_date, log.weight_kg, log.height_cm, log.head_cm))
        await db.commit()
    return {"status": "saved", "log_date": log_date}


# 5. GET /growth — Get all growth logs with insights
@router.get("/growth")
async def get_growth_logs(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM baby_growth_logs WHERE user_id = ? ORDER BY log_date ASC",
            (user["id"],)
        )
        rows = await cursor.fetchall()

    logs = [dict(r) for r in rows]
    insights = []

    if len(logs) >= 2:
        latest = logs[-1]
        prev = logs[-2]
        if latest.get("weight_kg") and prev.get("weight_kg"):
            diff = latest["weight_kg"] - prev["weight_kg"]
            if diff > 0:
                insights.append(f"Weight gain of {diff:.2f} kg since last measurement \u2014 healthy growth!")
            elif diff < 0:
                insights.append(f"Weight decreased by {abs(diff):.2f} kg since last measurement. Monitor closely.")
            else:
                insights.append("Weight unchanged since last measurement.")
        if latest.get("height_cm") and prev.get("height_cm"):
            diff = latest["height_cm"] - prev["height_cm"]
            if diff > 0:
                insights.append(f"Height increased by {diff:.1f} cm \u2014 baby is growing well!")
        if latest.get("head_cm") and prev.get("head_cm"):
            diff = latest["head_cm"] - prev["head_cm"]
            if diff > 0:
                insights.append(f"Head circumference grew by {diff:.1f} cm.")

    return {"logs": logs, "insights": insights}


# 6. GET /vaccinations — Get vaccination schedule (auto-init if empty)
@router.get("/vaccinations")
async def get_vaccinations(user: dict = Depends(get_current_user)):
    birth_date_str = user.get("baby_birth_date")
    baby_weeks = _calc_baby_weeks(birth_date_str)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM vaccination_logs WHERE user_id = ?",
            (user["id"],)
        )
        count_row = await cursor.fetchone()

        if count_row["cnt"] == 0:
            for vname, due_week in STANDARD_VACCINES:
                await db.execute(
                    "INSERT OR IGNORE INTO vaccination_logs (user_id, vaccine_name, due_week) VALUES (?, ?, ?)",
                    (user["id"], vname, due_week)
                )
            await db.commit()

        cursor = await db.execute(
            "SELECT * FROM vaccination_logs WHERE user_id = ? ORDER BY due_week ASC, vaccine_name ASC",
            (user["id"],)
        )
        rows = await cursor.fetchall()

    vaccines = []
    next_due = None
    for r in rows:
        v = dict(r)
        if birth_date_str:
            try:
                birth = datetime.strptime(birth_date_str, "%Y-%m-%d")
                v["due_date"] = (birth + timedelta(weeks=v["due_week"])).strftime("%Y-%m-%d")
            except Exception:
                v["due_date"] = None
        else:
            v["due_date"] = None

        v["is_overdue"] = not v["completed"] and v["due_week"] <= baby_weeks
        v["is_upcoming"] = not v["completed"] and v["due_week"] > baby_weeks and v["due_week"] <= baby_weeks + 4

        if not v["completed"] and next_due is None:
            next_due = v["vaccine_name"]

        vaccines.append(v)

    return {
        "vaccines": vaccines,
        "baby_weeks": baby_weeks,
        "next_due": next_due,
    }


# 7. PUT /vaccinations/{vaccine_name}/complete — Mark a vaccine as completed
@router.put("/vaccinations/{vaccine_name}/complete")
async def complete_vaccination(vaccine_name: str, user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "UPDATE vaccination_logs SET completed = 1, completed_date = ? WHERE user_id = ? AND vaccine_name = ?",
            (today, user["id"], vaccine_name)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vaccine not found")
    return {"status": "completed", "vaccine_name": vaccine_name, "completed_date": today}


# 8. GET /recovery-tips — Get recovery tips based on delivery type and baby age
@router.get("/recovery-tips")
async def get_recovery_tips_endpoint(user: dict = Depends(get_current_user)):
    delivery_type = user.get("delivery_type", "normal") or "normal"
    baby_weeks = _calc_baby_weeks(user.get("baby_birth_date"))
    baby_days = _calc_baby_days(user.get("baby_birth_date"))

    recovery = _get_recovery_tips(delivery_type, baby_weeks)

    return {
        "baby_weeks": baby_weeks,
        "baby_days": baby_days,
        "delivery_type": delivery_type,
        "recovery": recovery,
        "breastfeeding_tips": BREASTFEEDING_TIPS,
        "nutrition_tips": NUTRITION_TIPS,
    }
