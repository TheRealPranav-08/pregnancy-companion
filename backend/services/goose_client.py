import os
import json as _json
import httpx
from openai import AsyncOpenAI
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

PROVIDER = os.getenv("LLM_PROVIDER", "goose").lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GOOSE_API_KEY = os.getenv("GOOSE_API_KEY", "")
GOOSE_MODEL = os.getenv("GOOSE_MODEL", "gpt-neo-20b")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Configure Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Goose AI uses /v1/engines/{engine}/completions (NOT chat/completions)
GOOSE_BASE_URL = "https://api.goose.ai/v1"


def _get_openai_client() -> AsyncOpenAI:
    """Return an AsyncOpenAI client (only for OpenAI provider)."""
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


def _messages_to_prompt(system: str, messages: list[dict]) -> str:
    """Convert chat-style messages to a few-shot prompt for Goose AI completion model.
    
    gpt-neo-20b is a base completion model, not instruction-tuned.
    We use few-shot examples so the model learns the expected format and tone.
    """
    # Few-shot examples teach the model what Aura's responses should look like
    FEW_SHOT = """The following is a helpful conversation between a pregnant woman and Aura, a caring AI pregnancy health assistant. Aura provides accurate, warm, and supportive health information. Aura keeps answers focused and helpful. Aura never diagnoses conditions and always recommends consulting a healthcare provider for medical concerns.

User: Can I eat sushi during pregnancy?
Aura: Great question! It's best to avoid raw fish during pregnancy due to the risk of parasites and bacteria like listeria. However, you can safely enjoy cooked sushi rolls like California rolls, shrimp tempura rolls, or vegetable rolls. Cooked fish like salmon is actually wonderful for you and baby thanks to omega-3 fatty acids. If you're unsure about a specific food, your healthcare provider can give you personalized guidance.

User: I'm feeling really tired all the time
Aura: Fatigue is one of the most common pregnancy symptoms, especially in the first and third trimesters. Your body is doing incredible work growing a new life! Here are some tips that may help: rest when you can, stay well-hydrated, eat iron-rich foods like spinach and lentils, and don't hesitate to ask for help with daily tasks. If the tiredness feels extreme or comes with dizziness or shortness of breath, please mention it to your doctor at your next visit. You're doing amazing!

User: Is it safe to exercise while pregnant?
Aura: Yes, moderate exercise is generally safe and beneficial during pregnancy! Walking, swimming, and prenatal yoga are excellent choices. Aim for about 30 minutes of activity most days. Avoid contact sports, hot yoga, and exercises that involve lying flat on your back after the first trimester. Always listen to your body and stop if you feel dizzy, short of breath, or have any pain. Check with your healthcare provider before starting any new exercise routine, especially if you have any pregnancy complications.

User: I'm craving sweets but I'm worried about gestational diabetes
Aura: Cravings are completely normal during pregnancy! The key is balance. You can satisfy sweet cravings with healthier options like fresh fruits, yogurt with honey, or dark chocolate in moderation. For gestational diabetes concerns, your doctor will typically screen you between weeks 24-28 with a glucose tolerance test. In the meantime, try eating smaller meals more frequently, pairing carbs with protein, and staying active. If you have specific risk factors, talk to your healthcare provider about earlier screening.

"""
    # Add any context from the system prompt that contains user-specific info
    context_lines = []
    for line in system.split("\n"):
        line = line.strip()
        if line.startswith("User's stage:") or line.startswith("User is at week") or line.startswith("User's baby is"):
            context_lines.append(line)
    
    context = ""
    if context_lines:
        context = "[Context: " + " ".join(context_lines) + "]\n\n"
    
    # Build the conversation
    parts = [FEW_SHOT.strip(), ""]
    if context:
        parts.append(context)
    
    for m in messages:
        role = m.get("role", "user")
        if role == "user":
            parts.append(f"User: {m['content']}")
        elif role == "assistant":
            parts.append(f"Aura: {m['content']}")
    parts.append("Aura:")
    return "\n\n".join(parts)


async def _goose_complete(prompt: str, max_tokens: int = 600, temperature: float = 0.7) -> str:
    """Call Goose AI completions endpoint directly via httpx."""
    import re, logging
    logger = logging.getLogger("aura.goose")
    url = f"{GOOSE_BASE_URL}/engines/{GOOSE_MODEL}/completions"
    async with httpx.AsyncClient(timeout=30) as client:
        logger.info("Calling Goose AI: %s", url)
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {GOOSE_API_KEY}", "Content-Type": "application/json"},
            json={
                "prompt": prompt,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stop": [
                    "\nUser:", "\n\nUser:",
                    "\nHuman:", "\n\nHuman:",
                    "\nMe:", "\n\nMe:",
                    "\nSystem:", "\nInstructions:", "\n[Context:",
                    "<|endoftext|>",
                    "\nThe following is",
                ],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["text"].strip()
        logger.info("Goose AI responded (%d chars)", len(text))

        # Remove leading role labels
        for prefix in ["Aura:", "Assistant:", "A:"]:
            if text.startswith(prefix):
                text = text[len(prefix):].strip()

        # Truncate at any turn-boundary pattern the stop tokens may have missed
        turn_pattern = re.compile(
            r'\n\s*(?:User|Me|Human|System|Instructions|Person|Customer|Questioner|Q)\s*:',
            re.IGNORECASE,
        )
        match = turn_pattern.search(text)
        if match:
            text = text[:match.start()].strip()

        # Remove any trailing role labels
        for suffix in ["User:", "System:", "Aura:", "Assistant:", "Me:", "Human:", "Q:", "[Context:"]:
            if text.rstrip().endswith(suffix):
                text = text.rstrip()[:-len(suffix)].strip()

        # Remove any leaked context/instruction markers
        for marker in ["[Context:", "[Instructions:", "[Note:"]:
            idx = text.find(marker)
            if idx != -1:
                text = text[:idx].strip()

        return text if text else "I'm here to help! Could you tell me a bit more about what you'd like to know? 💜"


async def _gemini_chat(system_prompt: str, messages: list[dict], max_tokens: int = 600, temperature: float = 0.7) -> str:
    """Call Google Gemini API for chat completions."""
    import asyncio
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=system_prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        ),
    )
    # Convert messages to Gemini format
    gemini_history = []
    for m in messages[:-1]:
        role = "user" if m.get("role") == "user" else "model"
        gemini_history.append({"role": role, "parts": [m["content"]]})

    chat = model.start_chat(history=gemini_history)
    user_message = messages[-1]["content"] if messages else ""
    response = await asyncio.to_thread(chat.send_message, user_message)
    return response.text.strip()


async def _gemini_generate(system_prompt: str, prompt: str, max_tokens: int = 1200, temperature: float = 0.7) -> str:
    """Call Google Gemini API for single-turn generation (guidance, mood, etc.)."""
    import asyncio
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=system_prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        ),
    )
    response = await asyncio.to_thread(model.generate_content, prompt)
    return response.text.strip()


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

    import logging
    logger = logging.getLogger("aura.guidance")

    def _parse_json(raw):
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            return _json.loads(raw[start:end])
        return _json.loads(raw)

    # Try Goose first
    if GOOSE_API_KEY:
        try:
            flat_prompt = _messages_to_prompt(SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
            raw = await _goose_complete(flat_prompt, max_tokens=1200, temperature=0.7)
            return _parse_json(raw)
        except Exception as e:
            logger.warning("Goose failed for guidance, falling back to Gemini: %s: %s", type(e).__name__, e)

    # Fallback to Gemini
    if GEMINI_API_KEY:
        try:
            raw = await _gemini_generate(SYSTEM_PROMPT, prompt, max_tokens=1200, temperature=0.7)
            return _parse_json(raw)
        except Exception as e:
            logger.warning("Gemini also failed for guidance: %s: %s", type(e).__name__, e)

    # Static fallback
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
    prompt = MOOD_EXPLANATION_PROMPT.format(risk_level=risk_level, score=score)

    import logging
    logger = logging.getLogger("aura.mood")

    # Try Goose first
    if GOOSE_API_KEY:
        try:
            flat_prompt = _messages_to_prompt(SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
            return await _goose_complete(flat_prompt, max_tokens=150, temperature=0.8)
        except Exception as e:
            logger.warning("Goose failed for mood, falling back to Gemini: %s: %s", type(e).__name__, e)

    # Fallback to Gemini
    if GEMINI_API_KEY:
        try:
            return await _gemini_generate(SYSTEM_PROMPT, prompt, max_tokens=150, temperature=0.8)
        except Exception as e:
            logger.warning("Gemini also failed for mood: %s: %s", type(e).__name__, e)

    # Static fallback
    fallback = {
        "Low": "Your mood check looks positive — you're doing wonderfully! Remember, it's normal to have good and difficult days during pregnancy. Keep practicing self-care and lean on your support system when needed. 💚",
        "Moderate": "Thank you for checking in with yourself — that takes courage. It's completely normal to feel overwhelmed during pregnancy. Try a short walk, deep breathing, or talking to someone you trust today. You're not alone in this. 🌸",
        "High": "Your feelings are valid, and sharing them is a brave step. We encourage you to reach out to your healthcare provider or a trusted person in your life soon. You deserve support and care — please don't hesitate to ask for help. 💜",
    }
    return fallback.get(risk_level, fallback["Moderate"])


POSTNATAL_PROMPT_TEMPLATE = """
You are a caring postnatal health companion. Generate personalized guidance for:
- Baby age: {baby_weeks} weeks old
- Delivery type: {delivery_type}
- Breastfeeding: {breastfeeding}
- Mom's concerns: {mom_concerns}
- Baby's concerns: {baby_concerns}

Generate JSON with these fields:
- momRecovery: advice on physical recovery for this week post-delivery
- babyMilestones: what baby should be doing at this age, developmental milestones
- feedingGuide: breastfeeding/bottle feeding guidance for this week
- sleepGuide: expected sleep patterns for baby + tips for mom to rest
- vaccinations: any vaccines due around this age
- warningSignsMom: red flags for mom to watch for (PPD signs, infection signs, etc)
- warningSignsBaby: red flags for baby (fever, jaundice, feeding issues)

Be warm and supportive. Never diagnose. Always recommend consulting a pediatrician for concerns.
Return ONLY the JSON object, no extra text.
"""


async def get_postnatal_guidance(
    baby_weeks: int,
    delivery_type: str = "normal",
    is_breastfeeding: bool = True,
    mom_concerns: list[str] | None = None,
    baby_concerns: list[str] | None = None,
) -> dict:
    prompt = POSTNATAL_PROMPT_TEMPLATE.format(
        baby_weeks=baby_weeks,
        delivery_type=delivery_type,
        breastfeeding="Yes" if is_breastfeeding else "No",
        mom_concerns=", ".join(mom_concerns) if mom_concerns else "None",
        baby_concerns=", ".join(baby_concerns) if baby_concerns else "None",
    )

    import logging
    logger = logging.getLogger("aura.postnatal")

    def _parse_json(raw):
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            return _json.loads(raw[start:end])
        return _json.loads(raw)

    # Try Goose first
    if GOOSE_API_KEY:
        try:
            flat_prompt = _messages_to_prompt(SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
            raw = await _goose_complete(flat_prompt, max_tokens=1500, temperature=0.7)
            return _parse_json(raw)
        except Exception as e:
            logger.warning("Goose failed for postnatal, falling back to Gemini: %s: %s", type(e).__name__, e)

    # Fallback to Gemini
    if GEMINI_API_KEY:
        try:
            raw = await _gemini_generate(SYSTEM_PROMPT, prompt, max_tokens=1500, temperature=0.7)
            return _parse_json(raw)
        except Exception as e:
            logger.warning("Gemini also failed for postnatal: %s: %s", type(e).__name__, e)

    return _postnatal_fallback(baby_weeks, delivery_type, is_breastfeeding)


def _postnatal_fallback(baby_weeks: int, delivery_type: str, is_breastfeeding: bool) -> dict:
    if baby_weeks <= 2:
        phase = "newborn"
    elif baby_weeks <= 6:
        phase = "early"
    elif baby_weeks <= 12:
        phase = "settling"
    elif baby_weeks <= 26:
        phase = "developing"
    else:
        phase = "active"

    recovery = {
        "newborn": f"Your body is in the earliest stage of recovery. {'Take extra care of your incision site — keep it clean and dry, avoid lifting heavy objects.' if delivery_type == 'c-section' else 'Your body is healing from delivery. Rest as much as possible.'} Expect lochia (postpartum bleeding) for several weeks. Stay hydrated and nourish yourself well.",
        "early": f"{'Your C-section incision should be healing well. Watch for signs of infection like redness, swelling, or fever.' if delivery_type == 'c-section' else 'Your body continues to heal. Pelvic floor exercises can begin gently.'} Hormonal changes may cause mood swings — this is normal. Prioritize sleep when baby sleeps.",
        "settling": "By now, your body has made significant recovery progress. Gentle exercise like walking and postnatal yoga can help. If you're still experiencing pain or heavy bleeding, consult your OB-GYN.",
        "developing": "You should be feeling stronger. This is a good time to focus on rebuilding core strength. Don't rush — every body heals at its own pace. Your 6-week postpartum check should be done by now.",
        "active": "Your body has largely recovered but continue to be kind to yourself. Maintain regular exercise and balanced nutrition. If you have lingering concerns about your recovery, it's never too late to talk to your doctor.",
    }

    milestones = {
        "newborn": "Your baby is adjusting to life outside the womb. They can see about 8-12 inches away and will recognize your voice. Expect lots of sleeping (16-17 hours/day) and feeding. Skin-to-skin contact is wonderful for bonding.",
        "early": "Baby may start showing social smiles! They're becoming more alert during wake windows. Tummy time (a few minutes at a time) helps build neck strength. They may start tracking objects with their eyes.",
        "settling": "Baby is becoming more interactive — cooing, smiling, and recognizing familiar faces. They may start reaching for objects and holding their head more steadily during tummy time. Some babies start laughing around 3-4 months!",
        "developing": "Major milestones ahead! Baby may start rolling over, sitting with support, and showing interest in solid foods (around 6 months). They're babbling more and developing hand-eye coordination.",
        "active": "Baby is becoming mobile — crawling, pulling up to stand, and maybe even first steps! They understand simple words and may say 'mama' or 'dada'. Separation anxiety is normal at this stage.",
    }

    feeding = {
        True: f"{'Continue breastfeeding on demand — newborns feed 8-12 times per day.' if baby_weeks <= 6 else 'Breastfeeding should be well-established now. You can start introducing solid foods around 6 months while continuing to breastfeed.' if baby_weeks <= 26 else 'Continue breastfeeding alongside solid foods. Baby should be eating a variety of foods by now.'} Stay hydrated and eat nutrient-rich foods to support milk production.",
        False: f"{'Formula-fed babies typically eat every 3-4 hours. Keep bottles sterilized and follow preparation instructions carefully.' if baby_weeks <= 6 else 'Your baby may be ready for solid foods around 6 months. Start with single-ingredient purees.' if baby_weeks <= 26 else 'Baby should be eating a variety of solid foods while still having formula. Aim for 3 meals and 2 snacks.'} Always hold baby during feeds — never prop a bottle.",
    }

    sleep = {
        "newborn": "Newborns sleep 16-17 hours but in short bursts. Always place baby on their back to sleep. Room-sharing (not bed-sharing) is recommended. Sleep when baby sleeps — housework can wait!",
        "early": "Baby may start developing a more predictable sleep pattern. Night stretches may get longer (3-5 hours). Start a calming bedtime routine — bath, feed, story, sleep.",
        "settling": "Some babies sleep through the night by 3-4 months, but many don't — that's normal. The 4-month sleep regression is common. Keep the bedtime routine consistent.",
        "developing": "Baby should be sleeping 12-14 hours total per day including naps. Most babies this age take 2-3 naps. Sleep regressions around teething are common.",
        "active": "Baby needs about 12-14 hours of sleep including 1-2 naps. Separation anxiety may cause sleep disruptions. Maintain consistent routines and a dark, quiet sleep environment.",
    }

    vaccinations = {
        "newborn": "Hepatitis B vaccine is typically given at birth. Next vaccines due at 2 months: DTaP, IPV, Hib, PCV13, and Rotavirus.",
        "early": "2-month vaccines are due: DTaP, IPV, Hib, PCV13, Rotavirus, and Hepatitis B (2nd dose). These protect against serious diseases.",
        "settling": "4-month vaccines include the second doses of DTaP, IPV, Hib, PCV13, and Rotavirus. Keep your vaccination record up to date.",
        "developing": "6-month vaccines include third doses of several vaccines plus the flu shot (after 6 months). Hepatitis B 3rd dose is typically due.",
        "active": "12-month vaccines include MMR, Varicella, Hepatitis A, and PCV13 booster. Annual flu shots are recommended. Talk to your pediatrician about the schedule.",
    }

    return {
        "momRecovery": recovery[phase],
        "babyMilestones": milestones[phase],
        "feedingGuide": feeding[is_breastfeeding],
        "sleepGuide": sleep[phase],
        "vaccinations": vaccinations[phase],
        "warningSignsMom": "Watch for: fever over 100.4°F, heavy bleeding (soaking a pad in an hour), foul-smelling discharge, severe headache with vision changes, persistent sadness or thoughts of self-harm (contact your provider immediately), pain or redness at incision site (C-section), difficulty breathing, or chest pain.",
        "warningSignsBaby": "Watch for: fever over 100.4°F (rectal) in babies under 3 months (go to ER immediately), not feeding well or refusing feeds, fewer than 6 wet diapers in 24 hours, excessive crying that can't be soothed, yellowing skin or eyes (jaundice), difficulty breathing, unusual rash, or lethargy/difficulty waking.",
    }


def _chat_fallback(user_message: str, stage: str = "pregnant") -> str:
    """Smart keyword-based fallback when LLM is unavailable."""
    msg = user_message.lower()

    # If message explicitly mentions pregnancy, treat as pregnant context regardless of stage
    explicit_pregnant = any(w in msg for w in ["pregnan", "trimester", "womb", "prenatal", "expecting"])
    effective_stage = "pregnant" if explicit_pregnant else stage

    # Emergency detection — always first
    emergency_words = ["bleeding", "blood", "can't breathe", "not breathing", "unconscious",
                       "seizure", "convulsion", "severe pain", "fainted", "chest pain"]
    if any(w in msg for w in emergency_words):
        return ("🚨 This sounds like it could be urgent. Please contact your healthcare provider or go to the nearest emergency room immediately. "
                "If you're in the US, call 911. Your safety and your baby's safety come first. Don't wait — it's always better to get checked. 💜")

    # Travel during pregnancy
    if any(w in msg for w in ["travel", "fly", "flight", "airplane", "road trip", "drive long", "vacation", "trip"]):
        if effective_stage == "postnatal":
            return ("Traveling with a newborn requires some extra planning! ✈️\n\n"
                    "**Car travel:**\n"
                    "• Always use a rear-facing car seat properly installed\n"
                    "• Stop every 2 hours to feed and change baby\n"
                    "• Never leave baby alone in a car\n\n"
                    "**Air travel:**\n"
                    "• Most airlines allow babies from 2 weeks old, but check with your pediatrician\n"
                    "• Feed during takeoff and landing to help with ear pressure\n"
                    "• Bring extra diapers, wipes, and a change of clothes\n"
                    "• Pack any medications you or baby need in your carry-on\n\n"
                    "**General tips:** Keep baby's routine as close to normal as possible, "
                    "and have your pediatrician's contact info handy. Talk to your doctor before any long trips! 🌍")
        return ("Traveling during pregnancy can be safe with proper planning! ✈️\n\n"
                "**Best time to travel:** Second trimester (weeks 14-28) — morning sickness usually fades and energy returns\n\n"
                "**Air travel:**\n"
                "• Most airlines allow flying up to 36 weeks (28 weeks for international)\n"
                "• Walk the aisle every hour to prevent blood clots\n"
                "• Wear compression stockings on long flights\n"
                "• Stay hydrated and choose an aisle seat\n\n"
                "**Car travel:**\n"
                "• Wear your seatbelt below your belly, across your hips\n"
                "• Stop every 1-2 hours to stretch and walk\n"
                "• Keep snacks and water handy\n\n"
                "**Avoid:** Areas with Zika virus, high altitudes if not accustomed, and destinations far from medical care\n\n"
                "Always discuss travel plans with your healthcare provider, especially if you have a high-risk pregnancy! 🌍")

    # Diet & nutrition — more varied responses based on sub-topic
    if any(w in msg for w in ["eat", "food", "diet", "nutrition", "fruit", "vegetable", "craving", "hungry", "meal",
                               "cook", "recipe", "snack", "protein", "vitamin", "iron", "calcium", "folate", "folic"]):
        # Specific sub-topics
        if any(w in msg for w in ["craving", "crave"]):
            return ("Cravings are super common and totally normal during pregnancy! 🍫\n\n"
                    "**Why they happen:** Hormonal changes, nutritional needs, and emotional factors\n\n"
                    "**Healthy swaps:**\n"
                    "• Craving sweets? → Fresh fruits, yogurt with honey, dark chocolate\n"
                    "• Craving salty? → Lightly salted nuts, popcorn, pickles\n"
                    "• Craving ice cream? → Frozen banana blended smooth, or Greek yogurt\n"
                    "• Craving junk food? → Try a healthier homemade version\n\n"
                    "**When to be concerned:** Craving non-food items (ice, dirt, starch) is called pica and may indicate an iron deficiency — mention it to your doctor.\n\n"
                    "It's okay to indulge occasionally — balance is key! 🌸")
        if any(w in msg for w in ["avoid", "safe", "can i", "should i", "allowed", "harmful", "dangerous"]):
            return ("Here's a guide on food safety during pregnancy! 🍽️\n\n"
                    "**Foods to AVOID:**\n"
                    "❌ Raw or undercooked fish (sushi with raw fish), meat, and eggs\n"
                    "❌ Unpasteurized dairy (soft cheeses like brie, feta from raw milk)\n"
                    "❌ Deli meats and hot dogs (unless heated until steaming)\n"
                    "❌ High-mercury fish (shark, swordfish, king mackerel, tilefish)\n"
                    "❌ Raw sprouts\n"
                    "❌ Excessive caffeine (limit to 200mg/day — about one 12oz coffee)\n"
                    "❌ Alcohol — no safe amount during pregnancy\n\n"
                    "**Safe choices:** Cooked fish (salmon, tilapia — 2-3 servings/week), pasteurized dairy, "
                    "well-cooked meats, fruits, vegetables (wash thoroughly), whole grains\n\n"
                    "When in doubt, ask your healthcare provider! 💚")
        if effective_stage == "postnatal":
            return ("Great question about nutrition! As a new mom, focus on:\n\n"
                    "🥗 **Iron-rich foods** like spinach, lentils, and lean red meat to replenish stores\n"
                    "🐟 **Omega-3 fatty acids** from salmon and walnuts for recovery and milk quality\n"
                    "🥛 **Calcium** from dairy, tofu, or fortified plant milks\n"
                    "💧 **Stay hydrated** — especially if breastfeeding, aim for 10-12 cups of water daily\n"
                    "🍌 **Whole grains and fiber** to support digestion\n\n"
                    "If breastfeeding, you need about 500 extra calories per day. Try to eat regular meals even when life with a newborn gets hectic! "
                    "Please consult your healthcare provider for personalized dietary advice. 💚")
        return ("Great question about nutrition! During pregnancy, focus on:\n\n"
                "🥬 **Folate-rich foods** like leafy greens, beans, and fortified cereals\n"
                "🥩 **Iron** from lean meats, spinach, and lentils\n"
                "🐟 **Omega-3s** from salmon (limit to 2-3 servings/week) and walnuts\n"
                "🥛 **Calcium** from dairy, tofu, or fortified alternatives\n"
                "🍌 **Fiber** from fruits, vegetables, and whole grains\n"
                "💧 **Stay hydrated** — aim for 8-10 glasses of water daily\n\n"
                "Avoid raw fish, unpasteurized cheese, deli meats, and limit caffeine to 200mg/day. "
                "Your healthcare provider can recommend specific prenatal vitamins too! 🌸")

    # Exercise — uses effective_stage for context
    if any(w in msg for w in ["exercise", "workout", "walk", "yoga", "gym", "active", "fitness", "stretch", "sport"]):
        if effective_stage == "postnatal":
            return ("Returning to exercise after birth should be gradual 🧘‍♀️\n\n"
                    "**First 6 weeks:** Gentle pelvic floor exercises and walking\n"
                    "**After 6-week checkup:** Gradually add low-impact activities like postnatal yoga or swimming\n"
                    "**C-section recovery:** Wait for your doctor's clearance before any abdominal exercises\n\n"
                    "Listen to your body — if something hurts, stop. You grew a human! Give yourself grace. "
                    "Always get clearance from your healthcare provider before starting any exercise program. 💪")
        return ("Staying active during pregnancy is wonderful for you and baby! 🧘‍♀️\n\n"
                "**Safe exercises:** Walking, swimming, prenatal yoga, stationary cycling, and light strength training\n"
                "**Benefits:** Reduces back pain, boosts mood, improves sleep, and can help with labor endurance\n"
                "**Aim for:** 30 minutes of moderate activity most days\n\n"
                "**Avoid:** Contact sports, hot yoga, heavy lifting, exercises on your back after the first trimester, "
                "scuba diving, and activities with high fall risk\n\n"
                "**Listen to your body:** Stop if you feel dizzy, short of breath, have chest pain, or any vaginal bleeding\n\n"
                "**Red flags to call your doctor:** Contractions, fluid leaking, calf pain or swelling, headache\n\n"
                "Always discuss your exercise plan with your healthcare provider, especially if you have any complications. 💪")

    # Medication & supplements
    if any(w in msg for w in ["medicine", "medication", "drug", "pill", "tablet", "supplement", "prenatal vitamin",
                               "painkiller", "tylenol", "ibuprofen", "antibiotic", "safe to take"]):
        return ("Medication safety during pregnancy is really important! 💊\n\n"
                "**Generally considered safe (with doctor's approval):**\n"
                "✅ Acetaminophen (Tylenol) for pain/fever\n"
                "✅ Prenatal vitamins with folic acid\n"
                "✅ Some antacids for heartburn\n"
                "✅ Certain antibiotics if prescribed\n\n"
                "**AVOID unless prescribed by your doctor:**\n"
                "❌ Ibuprofen (Advil, Motrin) — especially in 3rd trimester\n"
                "❌ Aspirin (unless prescribed for specific conditions)\n"
                "❌ Certain herbal supplements\n"
                "❌ Retinoids (Accutane and similar)\n\n"
                "**Key prenatal supplements:**\n"
                "• Folic acid (400-800mcg daily) — prevents neural tube defects\n"
                "• Iron — supports increased blood volume\n"
                "• DHA — supports baby's brain development\n"
                "• Calcium & Vitamin D — for bone health\n\n"
                "⚠️ ALWAYS consult your healthcare provider before taking ANY medication during pregnancy. 💜")

    # Water & hydration
    if any(w in msg for w in ["water", "hydrat", "drink", "fluid", "thirsty", "dehydrat"]):
        return ("Staying hydrated is extra important during pregnancy! 💧\n\n"
                "**How much?** Aim for 8-12 cups (64-96 oz) of water daily\n"
                "**If breastfeeding:** You need even more — about 10-13 cups daily\n\n"
                "**Tips to stay hydrated:**\n"
                "• Carry a water bottle everywhere\n"
                "• Add lemon, cucumber, or berries for flavor\n"
                "• Eat water-rich fruits like watermelon, oranges, and cucumbers\n"
                "• Set phone reminders to drink\n\n"
                "**Signs of dehydration:** Dark yellow urine, headaches, dizziness, dry mouth, fatigue\n\n"
                "**Avoid:** Excessive caffeine, sugary sodas, and unpasteurized juices\n\n"
                "Proper hydration helps maintain amniotic fluid, supports nutrient delivery, and prevents constipation! 🌊")

    # Weight & body changes
    if any(w in msg for w in ["weight", "gaining", "gained", "heavy", "body change", "belly", "stretch mark",
                               "skin", "hair", "glow"]):
        return ("Body changes during pregnancy are completely natural! 🤰\n\n"
                "**Healthy weight gain guidelines:**\n"
                "• Underweight (BMI <18.5): 28-40 lbs total\n"
                "• Normal weight (BMI 18.5-24.9): 25-35 lbs total\n"
                "• Overweight (BMI 25-29.9): 15-25 lbs total\n"
                "• First trimester: about 1-4 lbs total\n"
                "• Second/third trimester: about 1 lb per week\n\n"
                "**Common body changes:**\n"
                "• Stretch marks — use moisturizer (cocoa butter, vitamin E oil)\n"
                "• Skin darkening (linea nigra) — fades after delivery\n"
                "• Thicker hair — enjoy it while it lasts!\n"
                "• Swelling in feet and ankles — elevate and stay active\n\n"
                "Every body is different. Focus on eating well and staying active rather than the number on the scale. "
                "Your healthcare provider will track your weight at each visit! 💚")

    # Intimacy & relationships
    if any(w in msg for w in ["sex", "intimacy", "intimate", "partner", "relationship", "intercourse", "safe to have"]):
        return ("This is a common question and totally okay to ask! 💜\n\n"
                "**In most cases:** Intimacy during pregnancy is safe and normal\n"
                "**Benefits:** Emotional bonding, stress relief, and improved mood\n\n"
                "**When to avoid (check with your doctor):**\n"
                "• History of preterm labor\n"
                "• Placenta previa\n"
                "• Cervical insufficiency\n"
                "• Unexplained vaginal bleeding\n"
                "• After your water has broken\n\n"
                "**Tips:** Experiment with comfortable positions as your belly grows. "
                "Communicate openly with your partner about what feels good.\n\n"
                "**After delivery:** Wait until your doctor gives the all-clear (usually 6 weeks postpartum). "
                "Low libido after birth is very normal — hormones, exhaustion, and adjustment all play a role.\n\n"
                "If you have concerns, talk to your healthcare provider openly — they've heard it all! 🌸")

    # Work & maternity leave
    if any(w in msg for w in ["work", "job", "office", "maternity leave", "career", "boss", "colleague",
                               "standing all day", "desk", "commute"]):
        return ("Balancing work and pregnancy can be challenging! 💼\n\n"
                "**Tips for working while pregnant:**\n"
                "• Take regular breaks — stand if sitting, sit if standing\n"
                "• Keep healthy snacks at your desk\n"
                "• Stay hydrated throughout the day\n"
                "• Use cushions for back support\n"
                "• Elevate feet when possible\n"
                "• Wear comfortable shoes\n\n"
                "**Know your rights:**\n"
                "• Many countries protect pregnant workers from discrimination\n"
                "• You may be entitled to maternity leave and workplace accommodations\n"
                "• Talk to HR about any physical demands that are becoming difficult\n\n"
                "**When to stop working:** Discuss with your healthcare provider based on your health, "
                "pregnancy complications, and type of work. Many women work until the last few weeks!\n\n"
                "Don't hesitate to advocate for yourself — your health comes first! 🌟")

    # Sleep
    if any(w in msg for w in ["sleep", "insomnia", "tired", "fatigue", "exhausted", "rest", "nap", "awake"]):
        if effective_stage == "postnatal":
            return ("Sleep deprivation with a newborn is so real, and you're doing amazing 💤\n\n"
                    "**Sleep when baby sleeps** — it really does help\n"
                    "**Accept help** — let others take a feeding or watch baby while you rest\n"
                    "**Take shifts** with your partner if possible\n"
                    "**Keep baby's sleep area** safe: firm mattress, no loose bedding, on their back\n"
                    "**Nap guilt-free** — your recovery matters!\n\n"
                    "If extreme fatigue persists or you feel unable to function, please talk to your doctor. It could be a sign of postpartum depression or thyroid issues. 🌙")
        return ("Sleep challenges are so common during pregnancy! 💤\n\n"
                "**Best position:** Sleep on your left side with a pillow between your knees\n"
                "**Elevate slightly** if heartburn is an issue\n"
                "**Limit fluids** 2 hours before bed to reduce bathroom trips\n"
                "**Create a routine:** Warm bath, relaxation, consistent bedtime\n"
                "**A pregnancy pillow** can be a game-changer!\n\n"
                "If insomnia is severe, talk to your healthcare provider — they can suggest safe options. 🌙")

    # Baby development / milestones
    if any(w in msg for w in ["baby develop", "milestone", "growth", "developing", "moving", "kick", "fetal"]):
        if effective_stage == "postnatal":
            return ("Every baby develops at their own pace — here are general milestones 👶\n\n"
                    "**0-3 months:** Lifts head, social smiles, tracks objects, coos\n"
                    "**3-6 months:** Rolls over, reaches for toys, laughs, babbles\n"
                    "**6-9 months:** Sits without support, starts solids, stranger anxiety\n"
                    "**9-12 months:** Crawls, pulls to stand, says 'mama'/'dada', waves bye\n\n"
                    "Remember — these are ranges, not deadlines! If you have concerns about development, "
                    "your pediatrician is the best person to assess your baby. 🌟")
        return ("Your baby is growing beautifully! Here's a general development overview 🤰\n\n"
                "**First trimester:** Baby's organs form, heartbeat starts around week 6, tiny fingers and toes develop\n"
                "**Second trimester:** Baby can hear your voice, kicks begin, gender can be determined\n"
                "**Third trimester:** Rapid brain growth, baby gains weight, moves into head-down position\n\n"
                "Your prenatal visits and ultrasounds will track your baby's specific development. "
                "Every pregnancy is unique! 🌟")

    # Symptoms
    if any(w in msg for w in ["symptom", "nausea", "morning sickness", "cramp", "headache", "dizzy",
                               "swollen", "swelling", "heartburn", "back pain", "vomit", "constipat",
                               "frequent urinat", "bathroom", "pee"]):
        return ("Many symptoms during this time are completely normal, though I know they can be uncomfortable 🌸\n\n"
                "**Common and usually normal:** Nausea, mild cramps, back pain, heartburn, swollen feet, fatigue, "
                "frequent urination, constipation, and mood changes\n\n"
                "**Tips:**\n"
                "• Nausea → Small frequent meals, ginger tea, crackers before getting up\n"
                "• Back pain → Warm compress, prenatal yoga, supportive shoes\n"
                "• Heartburn → Eat smaller meals, avoid spicy/acidic foods, don't lie down right after eating\n"
                "• Constipation → More fiber, water, and gentle movement\n"
                "• Swelling → Elevate feet, reduce salt intake, stay hydrated\n\n"
                "**See your doctor if you have:** Severe or persistent headache, vision changes, sudden swelling (especially face/hands), "
                "heavy bleeding, severe abdominal pain, or fever over 100.4°F\n\n"
                "Always trust your instincts — if something feels wrong, it's always okay to call your provider! 💜")

    # Mental health
    if any(w in msg for w in ["anxious", "anxiety", "depressed", "depression", "sad", "overwhelmed", "stressed",
                               "ppd", "postpartum depression", "cry", "crying", "mood swing", "lonely", "scared"]):
        return ("Thank you so much for sharing how you're feeling — that takes real courage 💜\n\n"
                "Your feelings are completely valid. Hormonal changes, life transitions, and sleep deprivation can all affect your mood.\n\n"
                "**Things that may help:**\n"
                "• Talk to someone you trust — a partner, friend, or family member\n"
                "• Gentle movement like a short walk can boost mood\n"
                "• Self-care isn't selfish — take even 10 minutes for yourself daily\n"
                "• Consider joining a pregnancy/new mom support group\n\n"
                "**Please reach out to your healthcare provider if:**\n"
                "• You feel persistently sad, empty, or hopeless for more than 2 weeks\n"
                "• You have trouble bonding with your baby\n"
                "• You have thoughts of harming yourself or your baby\n\n"
                "Postpartum depression/anxiety is treatable and you deserve support. You are NOT alone. 🌸\n"
                "**Crisis:** National Maternal Mental Health Hotline: 1-833-943-5746 (24/7)")

    # Breastfeeding
    if any(w in msg for w in ["breastfeed", "nursing", "lactation", "breast milk", "latch", "pump", "pumping",
                               "formula", "bottle feed"]):
        return ("Feeding your baby is one of the most personal decisions, and there's no single right way! 🍼\n\n"
                "**Breastfeeding tips:**\n"
                "• Feed on demand — usually 8-12 times in 24 hours for newborns\n"
                "• A good latch is key — baby's mouth should cover most of the areola\n"
                "• Stay hydrated and eat well\n"
                "• It can take a few weeks to get comfortable — that's normal!\n\n"
                "**If you're pumping:** Pump every 2-3 hours to maintain supply\n"
                "**If using formula:** That's a perfectly good choice too! Fed is best.\n\n"
                "If you're having difficulty, a lactation consultant can be incredibly helpful. "
                "Your pediatrician can also guide you on the best approach for your baby. 💚")

    # Vaccination
    if any(w in msg for w in ["vaccin", "immuniz", "shot", "injection"]):
        return ("Vaccinations protect your little one from serious diseases! 💉\n\n"
                "**Key vaccination schedule:**\n"
                "• **Birth:** Hepatitis B\n"
                "• **2 months:** DTaP, IPV, Hib, PCV13, Rotavirus\n"
                "• **4 months:** Second doses of above vaccines\n"
                "• **6 months:** Third doses + flu shot (if in season)\n"
                "• **12 months:** MMR, Varicella, Hepatitis A\n\n"
                "**For pregnant moms:** Tdap vaccine is recommended between weeks 27-36, and flu shot during flu season.\n\n"
                "Your pediatrician will have the exact schedule. Don't hesitate to ask them any questions! 🌟")

    # Checkup / appointment
    if any(w in msg for w in ["checkup", "check-up", "appointment", "doctor", "visit", "ultrasound", "scan"]):
        return ("Regular checkups are so important! 🏥\n\n"
                "**Typical prenatal visit schedule:**\n"
                "• Weeks 4-28: Once a month\n"
                "• Weeks 28-36: Every 2 weeks\n"
                "• Weeks 36-40: Weekly\n\n"
                "**Key tests/scans:** First trimester screening, anatomy scan (18-22 weeks), glucose test (24-28 weeks), Group B Strep test (36 weeks)\n\n"
                "**For postnatal:** 6-week postpartum checkup for mom, and baby visits at 1 week, 1 month, 2 months, and ongoing\n\n"
                "Write down your questions before each visit so you don't forget anything! 📝")

    # Labor & delivery
    if any(w in msg for w in ["labor", "delivery", "contraction", "birth plan", "due date", "induced", "epidural",
                               "c-section", "cesarean", "water broke"]):
        return ("Thinking about labor and delivery is exciting and totally normal to feel nervous about! 🌟\n\n"
                "**Signs of labor:**\n"
                "• Regular contractions that get closer together and stronger\n"
                "• Water breaking (a gush or trickle of fluid)\n"
                "• Bloody show (mucus plug release)\n\n"
                "**When to go to the hospital:** Contractions 5 minutes apart, lasting 1 minute, for 1 hour (the 5-1-1 rule)\n\n"
                "**Birth plan ideas:** Pain management preferences, who you want present, skin-to-skin after birth, cord cutting\n\n"
                "Discuss your birth preferences with your provider ahead of time. Remember, flexibility is key — "
                "the most important thing is a healthy mom and baby! 💜")

    # Baby names
    if any(w in msg for w in ["name", "names", "baby name", "suggest name"]):
        return ("Choosing a baby name is one of the most fun parts of the journey! 🌟\n\n"
                "While I'm focused on health and wellness, here are some tips:\n\n"
                "• Consider family significance or cultural meaning\n"
                "• Say the full name out loud to see how it flows\n"
                "• Check the initials!\n"
                "• You don't have to decide before birth — many parents wait until they meet their baby\n\n"
                "For health-related questions, I'm always here! 💜")

    # Hospital bag / preparation
    if any(w in msg for w in ["hospital bag", "pack", "prepare", "ready for birth", "what to bring", "nursery"]):
        return ("Getting prepared is such an exciting step! 🎒\n\n"
                "**Hospital bag essentials:**\n"
                "👶 **For baby:** Onesies, swaddle blanket, going-home outfit, car seat (installed!)\n"
                "👩 **For you:** Comfortable robe, nursing bra, toiletries, phone charger, snacks\n"
                "📋 **Documents:** ID, insurance card, birth plan, hospital registration\n"
                "👨 **For partner:** Change of clothes, toiletries, snacks, camera\n\n"
                "**Pack by week 36** — babies don't always wait for their due date!\n\n"
                "Ask your hospital what they provide — many supply diapers, wipes, and pads for your stay. 🏥")

    # Greeting
    if any(w in msg for w in ["hello", "hi", "hey", "good morning", "good evening", "good afternoon", "how are you"]):
        return ("Hello! 💜 I'm Aura, your AI pregnancy and baby care companion! I'm here to help with questions about:\n\n"
                "🤰 Pregnancy symptoms and wellness\n"
                "🍎 Diet and nutrition\n"
                "🧘‍♀️ Safe exercises\n"
                "✈️ Travel during pregnancy\n"
                "💊 Medication safety\n"
                "👶 Baby development and milestones\n"
                "🍼 Breastfeeding and feeding\n"
                "💤 Sleep tips\n"
                "💜 Mental health and emotional support\n"
                "💉 Vaccinations\n"
                "🏥 Checkups and appointments\n\n"
                "What would you like to know about today? 🌸")

    # Thank you
    if any(w in msg for w in ["thank", "thanks", "helpful", "appreciate"]):
        return ("You're so welcome! I'm always here whenever you need me 💜\n\n"
                "Remember, no question is too small — your health and your baby's health matter. "
                "Feel free to ask me anything else, anytime! 🌸")

    # Default fallback — much more helpful
    return ("That's a wonderful question! 💜 Let me share some helpful guidance:\n\n"
            "While I work best with specific topics, here are some things I can help with:\n\n"
            "🤰 **Pregnancy wellness** — symptoms, what's normal, when to worry\n"
            "🍎 **Nutrition** — what to eat, what to avoid, cravings\n"
            "🧘‍♀️ **Exercise** — safe workouts for each trimester\n"
            "✈️ **Travel** — flying and road trips during pregnancy\n"
            "💊 **Medications** — what's safe to take\n"
            "👶 **Baby care** — development, milestones, newborn tips\n"
            "🍼 **Feeding** — breastfeeding, formula, pumping\n"
            "💤 **Sleep** — tips for better rest\n"
            "💼 **Work** — balancing career and pregnancy\n"
            "💉 **Vaccinations** — schedule and safety\n\n"
            "Try asking about any of these topics and I'll give you detailed, helpful information! "
            "For medical concerns, always consult your healthcare provider. 🌸")


async def get_chat_response(system_prompt: str, messages: list[dict]) -> str:
    """Send a conversational chat to the LLM and return the response text."""

    # Extract stage from system prompt for fallback
    stage = "pregnant"
    if "postnatal" in system_prompt.lower():
        stage = "postnatal"

    user_message = ""
    if messages:
        user_message = messages[-1].get("content", "")

    import logging
    logger = logging.getLogger("aura.chat")

    # Try Goose first
    if GOOSE_API_KEY:
        try:
            flat_prompt = _messages_to_prompt(system_prompt, messages)
            return await _goose_complete(flat_prompt, max_tokens=600, temperature=0.8)
        except Exception as e:
            logger.warning("Goose failed, falling back to Gemini: %s: %s", type(e).__name__, e)

    # Fallback to Gemini
    if GEMINI_API_KEY:
        try:
            return await _gemini_chat(system_prompt, messages, max_tokens=600, temperature=0.8)
        except Exception as e:
            logger.warning("Gemini also failed: %s: %s", type(e).__name__, e)

    return _chat_fallback(user_message, stage)
