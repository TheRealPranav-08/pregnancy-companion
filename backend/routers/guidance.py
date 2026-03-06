from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from services.goose_client import get_weekly_guidance
from auth.auth_utils import get_current_user

router = APIRouter(prefix="/guidance", tags=["Guidance"])


class GuidanceRequest(BaseModel):
    week: int = Field(..., ge=1, le=42, description="Current pregnancy week")
    diet_pref: str = Field(..., description="vegetarian | non-vegetarian | vegan")
    conditions: List[str] = Field(default=[], description="Health conditions e.g. Gestational Diabetes, Anemia")
    symptoms: List[str] = Field(default=[], description="Current symptoms e.g. Nausea, Fatigue")
    activity: str = Field(default="moderate", description="Activity level: sedentary | light | moderate | active")
    water: str = Field(default="6-8", description="Daily water intake: <4 | 4-6 | 6-8 | 8+")
    supplements: List[str] = Field(default=[], description="Current supplements e.g. Iron, Folic Acid")
    weight: Optional[float] = Field(default=None, description="Current weight in kg")
    height: Optional[float] = Field(default=None, description="Height in cm")
    bp: str = Field(default="Normal", description="Blood pressure: Low | Normal | High | Not sure")
    hemoglobin: str = Field(default="Normal", description="Hemoglobin level: Low | Normal | High | Not sure")
    concern: Optional[str] = Field(default=None, max_length=500, description="Free-text concern")


@router.post("")
async def get_guidance(req: GuidanceRequest, user: dict = Depends(get_current_user)):
    """Get personalized weekly pregnancy guidance powered by Goose LLM."""
    guidance = await get_weekly_guidance(
        week=req.week,
        diet_pref=req.diet_pref,
        conditions=req.conditions,
        symptoms=req.symptoms,
        activity=req.activity,
        water=req.water,
        supplements=req.supplements,
        weight=req.weight,
        height=req.height,
        bp=req.bp,
        hemoglobin=req.hemoglobin,
        concern=req.concern,
    )
    trimester = 1 if req.week <= 13 else 2 if req.week <= 26 else 3
    return {
        "week": req.week,
        "trimester": trimester,
        "diet_pref": req.diet_pref,
        "conditions": req.conditions,
        "symptoms": req.symptoms,
        "guidance": guidance,
    }
