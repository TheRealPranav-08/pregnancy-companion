from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from services.goose_client import get_chat_response
from auth.auth_utils import get_current_user

router = APIRouter(prefix="/chat", tags=["Aura Chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[ChatMessage] = Field(default=[])


PREGNANT_SUGGESTIONS = [
    "What should I eat this week?",
    "Is this symptom normal?",
    "How is my baby developing?",
    "When is my next checkup due?",
    "Safe exercises for me right now?",
]

POSTNATAL_SUGGESTIONS = [
    "How should I care for my C-section wound?",
    "Is my baby's sleep pattern normal?",
    "When is the next vaccination?",
    "I'm feeling overwhelmed — is this PPD?",
    "Breastfeeding tips for this week?",
]


@router.post("/message")
async def chat_message(req: ChatRequest, user: dict = Depends(get_current_user)):
    """Send a message to Aura and get a response."""
    stage = user.get("stage", "pregnant") or "pregnant"
    pregnancy_week = user.get("pregnancy_week")
    baby_weeks = user.get("baby_weeks")
    delivery_type = user.get("delivery_type", "normal")

    # Build context string
    if stage == "pregnant":
        context = f"User is at week {pregnancy_week or 'unknown'} of pregnancy."
    else:
        context = f"User's baby is {baby_weeks or 'unknown'} weeks old. Delivery type: {delivery_type or 'unknown'}."

    system_prompt = f"""You are Aura, a warm, caring, and knowledgeable AI pregnancy and postnatal health companion.

User's stage: {stage}
{context}

STRICT TOPIC POLICY:
You MUST ONLY answer questions related to the following topics:
- Pregnancy (symptoms, trimesters, fetal development, labor, delivery)
- Maternal health (nutrition, exercise, sleep, mental health, postpartum recovery)
- Newborn and baby care (breastfeeding, feeding, sleep, milestones, vaccinations)
- Women's reproductive health related to pregnancy and postnatal care
- Emotional wellbeing of mothers (postpartum depression, anxiety, stress)

If the user asks ANY question that is NOT related to pregnancy, maternal health, or newborn care — such as politics, technology, coding, entertainment, sports, finance, general knowledge, math, science unrelated to pregnancy, or any other off-topic subject — you MUST respond ONLY with:
"I'm Aura, your pregnancy and baby care companion 💜 I'm specialized in pregnancy, maternal health, and newborn care only. I'm not able to help with that topic, but I'd love to help with any questions about your pregnancy journey, baby care, or your wellbeing as a mother! 🌸"

Do NOT attempt to answer off-topic questions even partially. Do NOT say "I don't know much about this but..." and then answer anyway. Simply decline and redirect.

Rules for on-topic questions:
- Be empathetic, supportive, and encouraging in every response
- Provide evidence-based health information
- NEVER diagnose conditions — always suggest consulting a healthcare provider for medical concerns
- Keep responses concise (2-4 paragraphs max) unless user asks for detailed information
- If user describes an emergency symptom (heavy bleeding, severe pain, baby not breathing, high fever in newborn), immediately advise them to call emergency services or go to the hospital
- Add a relevant emoji occasionally to keep the tone warm"""

    # Build messages for LLM (last 10 from history + new message)
    messages = [{"role": m.role, "content": m.content} for m in req.history[-10:]]
    messages.append({"role": "user", "content": req.message})

    response = await get_chat_response(system_prompt, messages)
    return {"response": response}


@router.get("/suggestions")
async def chat_suggestions(user: dict = Depends(get_current_user)):
    """Get suggested starter questions based on user's stage."""
    stage = user.get("stage", "pregnant") or "pregnant"
    if stage == "postnatal":
        return {"suggestions": POSTNATAL_SUGGESTIONS}
    return {"suggestions": PREGNANT_SUGGESTIONS}
