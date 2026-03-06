"""
Voice service – Whisper-based transcription + keyword/urgency analysis.
Reuses keyword rules from routers.journal for consistency.
"""

import whisper
import os
import tempfile
import logging

logger = logging.getLogger(__name__)

# ─── lazy-loaded Whisper model ───
_model = None


def get_model():
    global _model
    if _model is None:
        model_size = os.getenv("WHISPER_MODEL", "base")
        logger.info("Loading Whisper model '%s' …", model_size)
        _model = whisper.load_model(model_size)
        logger.info("Whisper model loaded.")
    return _model


# ─── keyword / urgency rules (mirrors frontend Journal logic) ───
SYMPTOM_KW = [
    "pain", "headache", "swelling", "nausea", "bleeding", "cramps",
    "spotting", "dizziness", "ache", "hurt", "burning", "sharp",
    "vomit", "queasy",
]
EMOTION_KW = [
    "anxiety", "anxious", "sadness", "sad", "fear", "scared", "worry",
    "worried", "frustration", "frustrated", "loneliness", "lonely",
    "nervous", "panic", "depressed",
]
BABY_KW = [
    "movement", "kicks", "kick", "active", "quiet", "baby moved",
    "moving", "flutter",
]
POSITIVE_KW = [
    "happy", "great", "good", "energetic", "walked", "exercise",
    "wonderful", "excited", "joyful", "grateful", "better", "yoga",
]
SEVERE_KW = [
    "heavy bleeding", "severe pain", "no baby movement", "fainting",
    "blurred vision", "no movement", "seizure", "unconscious",
]
MILD_KW = [
    "headache", "nausea", "mild pain", "tired", "exhausted",
    "swelling", "cramps",
]


def detect_tags(text: str) -> list[dict]:
    lower = text.lower()
    tags: list[dict] = []
    seen: set[str] = set()

    def _match(keywords, category):
        for kw in keywords:
            if kw in lower and kw not in seen:
                seen.add(kw)
                tags.append({"word": kw, "category": category})

    _match(SYMPTOM_KW, "symptom")
    _match(EMOTION_KW, "emotion")
    _match(BABY_KW, "baby")
    _match(POSITIVE_KW, "positive")
    return tags


def detect_urgency(text: str) -> str:
    lower = text.lower()
    if any(kw in lower for kw in SEVERE_KW):
        return "red"
    if any(kw in lower for kw in MILD_KW):
        return "yellow"
    return "green"


# ─── public API ───

def transcribe_audio(file_path: str) -> str:
    """Run Whisper on an audio file and return the transcribed text."""
    model = get_model()
    result = model.transcribe(file_path)
    return (result.get("text") or "").strip()


def analyze_transcription(text: str) -> dict:
    """Return tags + urgency for a given text."""
    return {
        "tags": detect_tags(text),
        "urgency": detect_urgency(text),
    }


def process_voice_input(file_path: str) -> dict:
    """Transcribe audio then analyse the transcription (combined pipeline)."""
    text = transcribe_audio(file_path)
    analysis = analyze_transcription(text)
    return {
        "transcription": text,
        **analysis,
    }
