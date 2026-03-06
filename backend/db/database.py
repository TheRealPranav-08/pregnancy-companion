import aiosqlite
import os
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DATABASE_URL", "./pregnancy_companion.db")

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS kick_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    count INTEGER NOT NULL,
    logged_date TEXT NOT NULL DEFAULT (DATE('now')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mood_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    answers TEXT NOT NULL,
    sleep_hours REAL NOT NULL,
    energy INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    text TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    pregnancy_week INTEGER DEFAULT NULL,
    stage TEXT DEFAULT NULL,
    baby_birth_date TEXT DEFAULT NULL,
    baby_weeks INTEGER DEFAULT NULL,
    delivery_type TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS baby_daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    log_date TEXT NOT NULL DEFAULT (DATE('now')),
    feed_count INTEGER DEFAULT 0,
    diaper_count INTEGER DEFAULT 0,
    baby_sleep_hours REAL DEFAULT 0,
    mom_sleep_hours REAL DEFAULT 0,
    mom_recovery_mood INTEGER DEFAULT 3,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, log_date)
);

CREATE TABLE IF NOT EXISTS baby_growth_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    log_date TEXT NOT NULL DEFAULT (DATE('now')),
    weight_kg REAL DEFAULT NULL,
    height_cm REAL DEFAULT NULL,
    head_cm REAL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vaccination_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    vaccine_name TEXT NOT NULL,
    due_week INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    completed_date TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, vaccine_name)
);
"""


MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN stage TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN baby_birth_date TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN baby_weeks INTEGER DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN delivery_type TEXT DEFAULT NULL",
]


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.executescript(CREATE_TABLES_SQL)
        # Run migrations for existing databases
        for sql in MIGRATIONS:
            try:
                await db.execute(sql)
            except Exception:
                pass  # column already exists
        await db.commit()

