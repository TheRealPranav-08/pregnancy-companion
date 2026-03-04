import os
import httpx
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

PROVIDER = os.getenv("LLM_PROVIDER", "openai").lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GOOSE_API_KEY = os.getenv("GOOSE_API_KEY", "")

# Goose uses an OpenAI-compatible API endpoint
GOOSE_BASE_URL = "https://api.goose.ai/v1"


def _get_client() -> AsyncOpenAI:
    if PROVIDER == "goose" and GOOSE_API_KEY:
        return AsyncOpenAI(api_key=GOOSE_API_KEY, base_url=GOOSE_BASE_URL)
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


SYSTEM_PROMPT = """You are a compassionate, knowledgeable AI pregnancy health assistant named Aura.
You provide evidence-based, warm, and encouraging guidance to pregnant women and new mothers.
You always remind users to consult their healthcare provider for medical decisions.
Keep responses concise, structured, and easy to read. Use bullet points and emojis sparingly but effectively.
Never provide specific medical diagnoses — always frame guidance as general health information."""

GUIDANCE_PROMPT_TEMPLATE = """
Week of pregnancy: {week}
Trimester: {trimester}
Diet preference: {diet_pref}
Health conditions: {conditions}
Current symptoms: {symptoms}
Activity level: {activity}
Daily water intake: {water} glasses
Current supplements: {supplements}
{vitals_section}
{concern_section}

Based on the above profile, provide a structured weekly pregnancy guide in valid JSON with exactly these 7 fields:

{{
  "this_week": "2-3 sentences about baby development and what the mother may feel at week {week}.",
  "diet_plan": "4-5 specific diet & nutrition recommendations personalized for her diet preference ({diet_pref}), conditions, and trimester.",
  "meal_suggestion": {{
    "breakfast": "one specific meal idea",
    "lunch": "one specific meal idea",
    "snack": "one specific snack idea",
    "dinner": "one specific meal idea"
  }},
  "exercise": "2-3 safe exercise recommendations appropriate for trimester {trimester_num} and her activity level ({activity}).",
  "checkups": "1-2 important medical reminders or appointments relevant to week {week}.",
  "symptom_alerts": [
    {{ "symptom": "symptom name", "severity": "green|yellow|orange|red", "explanation": "brief advice" }}
  ],
  "concern_response": "A warm, helpful response to her concern if provided, otherwise null."
}}

Return ONLY the JSON object, no extra text.
"""

MOOD_EXPLANATION_PROMPT = """
A pregnant woman completed a mood assessment with this result:
Risk level: {risk_level}
Score: {score}/100

Write a gentle, warm, 2-3 sentence message acknowledging her feelings and providing one actionable coping suggestion.
If High risk, gently encourage reaching out to her healthcare provider.
Be compassionate, non-judgmental, and empowering. Do not use clinical language.
"""


async def get_weekly_guidance(
    week: int,
    diet_pref: str,
    conditions: list[str] | None = None,
    symptoms: list[str] | None = None,
    activity: str = "moderate",
    water: str = "6-8",
    supplements: list[str] | None = None,
    weight: float | None = None,
    height: float | None = None,
    bp: str = "Normal",
    hemoglobin: str = "Normal",
    concern: str | None = None,
) -> dict:
    client = _get_client()
    trimester_num = 1 if week <= 13 else 2 if week <= 26 else 3
    trimester_label = "first" if week <= 13 else "second" if week <= 26 else "third"

    cond_str = ", ".join(conditions) if conditions else "None reported"
    sym_str = ", ".join(symptoms) if symptoms else "None reported"
    supp_str = ", ".join(supplements) if supplements else "None"

    vitals_parts = []
    if weight:
        vitals_parts.append(f"Weight: {weight} kg")
    if height:
        vitals_parts.append(f"Height: {height} cm")
    if bp and bp != "Not sure":
        vitals_parts.append(f"Blood pressure: {bp}")
    if hemoglobin and hemoglobin != "Not sure":
        vitals_parts.append(f"Hemoglobin: {hemoglobin}")
    vitals_section = "Vitals: " + ", ".join(vitals_parts) if vitals_parts else ""

    concern_section = f'Her specific concern: "{concern}"' if concern else ""

    prompt = GUIDANCE_PROMPT_TEMPLATE.format(
        week=week,
        trimester=trimester_label,
        trimester_num=trimester_num,
        diet_pref=diet_pref,
        conditions=cond_str,
        symptoms=sym_str,
        activity=activity,
        water=water,
        supplements=supp_str,
        vitals_section=vitals_section,
        concern_section=concern_section,
    )

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini" if PROVIDER != "goose" else "gpt-neo-20b",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        import json
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        # Fallback static response when no API key
        symptom_alerts = []
        if symptoms:
            severity_map = {
                "Nausea": "yellow", "Headache": "yellow", "Fatigue": "green",
                "Swelling": "orange", "Back pain": "yellow", "Cramps": "orange",
                "Spotting": "red", "Dizziness": "yellow", "Heartburn": "green",
                "Insomnia": "yellow",
            }
            for s in symptoms:
                sev = severity_map.get(s, "yellow")
                symptom_alerts.append({
                    "symptom": s,
                    "severity": sev,
                    "explanation": f"{s} is common during the {trimester_label} trimester. Mention it at your next appointment if it persists.",
                })

        return {
            "this_week": f"At week {week} of your pregnancy, your baby is growing rapidly. You may experience typical {trimester_label} trimester changes. Every pregnancy is unique — listen to your body.",
            "diet_plan": f"Focus on iron-rich foods, folate, and calcium. {'Limit refined sugars and monitor carbs given your gestational diabetes.' if 'Gestational Diabetes' in (conditions or []) else 'Include leafy greens, legumes, and dairy.'} {'Plant-based proteins like lentils, tofu, and quinoa are excellent.' if diet_pref == 'vegetarian' else 'Lean proteins like chicken, fish, and eggs are great choices.' if diet_pref == 'non-vegetarian' else 'Focus on fortified plant milk, nuts, and whole grains.'}",
            "meal_suggestion": {
                "breakfast": "Oatmeal with berries and almond butter" if diet_pref != "non-vegetarian" else "Scrambled eggs with spinach and whole-grain toast",
                "lunch": "Quinoa salad with chickpeas and roasted vegetables" if diet_pref != "non-vegetarian" else "Grilled chicken wrap with mixed greens",
                "snack": "Greek yogurt with walnuts and honey" if diet_pref != "vegan" else "Hummus and carrot sticks with whole-grain crackers",
                "dinner": "Lentil curry with brown rice" if diet_pref != "non-vegetarian" else "Baked salmon with sweet potato and steamed broccoli",
            },
            "exercise": f"Gentle 20-minute walks daily are beneficial. Prenatal yoga helps with flexibility and stress. {'Since you have a sedentary lifestyle, start slow with 10-minute walks.' if activity == 'sedentary' else 'Keep up your current activity — just listen to your body.'} Avoid lying flat on your back after week 16.",
            "checkups": f"{'Schedule your 20-week anatomy scan if not yet done.' if 15 <= week <= 22 else 'Continue regular prenatal visits as per your schedule.'} Keep tracking fetal movement patterns.",
            "symptom_alerts": symptom_alerts,
            "concern_response": f"Regarding your concern: we recommend discussing this with your healthcare provider at your next visit for personalized advice." if concern else None,
        }


async def get_mood_explanation(risk_level: str, score: float) -> str:
    client = _get_client()
    prompt = MOOD_EXPLANATION_PROMPT.format(risk_level=risk_level, score=score)

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini" if PROVIDER != "goose" else "gpt-neo-20b",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=150,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        fallback = {
            "Low": "Your mood check looks positive — you're doing wonderfully! Remember, it's normal to have good and difficult days during pregnancy. Keep practicing self-care and lean on your support system when needed. 💚",
            "Moderate": "Thank you for checking in with yourself — that takes courage. It's completely normal to feel overwhelmed during pregnancy. Try a short walk, deep breathing, or talking to someone you trust today. You're not alone in this. 🌸",
            "High": "Your feelings are valid, and sharing them is a brave step. We encourage you to reach out to your healthcare provider or a trusted person in your life soon. You deserve support and care — please don't hesitate to ask for help. 💜",
        }
        return fallback.get(risk_level, fallback["Moderate"])
