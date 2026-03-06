"""
Voice endpoints – Whisper transcription & keyword analysis.
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from auth.auth_utils import get_current_user
from integrations.voice_service import transcribe_audio, analyze_transcription, process_voice_input
import tempfile
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voice"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def _save_upload(upload: UploadFile) -> str:
    """Save UploadFile to a temp file and return its path."""
    data = await upload.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
    suffix = os.path.splitext(upload.filename or ".webm")[1] or ".webm"
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        os.write(fd, data)
    finally:
        os.close(fd)
    return path


@router.post("/voice/transcribe")
async def voice_transcribe(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Transcribe audio → text only."""
    tmp_path = await _save_upload(file)
    try:
        text = transcribe_audio(tmp_path)
        return {"transcription": text}
    except Exception as e:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail="Transcription failed")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.post("/voice/process")
async def voice_process(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Transcribe audio → text + keyword tags + urgency."""
    tmp_path = await _save_upload(file)
    try:
        result = process_voice_input(tmp_path)
        return result
    except Exception as e:
        logger.exception("Voice processing failed")
        raise HTTPException(status_code=500, detail="Voice processing failed")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
