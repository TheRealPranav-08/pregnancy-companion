# 🤱 Aura AI — Pregnancy & Postnatal Health Companion

> **75HER Hackathon | AI/ML Track | CreateHER Fest 2026**

[![License: MIT](https://img.shields.io/badge/License-MIT-rose.svg)](LICENSE)
[![Track](https://img.shields.io/badge/Track-AI%2FML-purple)](https://createherfest.com/75her)
[![LLM](https://img.shields.io/badge/AI-Goose%20by%20Block-blue)](https://github.com/block/goose)

---

## 📋 4-Line Problem Frame

| | |
|---|---|
| **User** | First-time pregnant women, especially in their first and third trimesters |
| **Problem** | Generic pregnancy apps don't adapt to individual health conditions, causing missed warning signs and unnecessary anxiety |
| **Constraints** | Must work without internet medical records; must be simple enough to use during physical/emotional stress |
| **Success Test** | A pregnant woman can enter her week + condition and receive personalized guidance, plus flag a symptom risk and kick anomaly within 5 minutes of first use |

---

## 💡 3-Line Pitch

**Pregnancy guidance that actually knows you exist.**
Aura AI uses Goose-powered LLM personalization and a trained ML model to give week-specific, condition-aware advice — not a generic article.
**Start free. Stay safe. Feel supported.**

---

## 🎯 What It Does

| Feature | Technology | Impact |
|---|---|---|
| 📅 Weekly Guidance | Goose AI (LLM) | Personalized diet, exercise, and checkup recommendations per pregnancy week, diet, and health condition |
| 💜 Mood Assessment | RandomForest (scikit-learn) | PHQ-7 based depression risk scoring with compassionate LLM explanation |
| 👶 Kick Tracker | Baseline Anomaly Detection | Flags <60% of personal average as a potential concern |
| 📓 Health Journal | Regex NLP keyword extraction | Auto-tags concern symptoms (pain, bleeding, anxiety, reduced movement) |

---

## ⚡ Quickstart (1 command)

```bash
# Windows — double-click or run:
start.bat
```

Manual setup:
```bash
# Terminal 1 — Backend
cd backend
cp .env.example .env          # Add your API key
pip install -r requirements.txt
python ml/train_mood_model.py  # Train ML model once
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** · Swagger docs at **http://localhost:8000/docs**

---

## 🔑 Environment Variables

Copy `backend/.env.example` → `backend/.env` and set:

```env
LLM_PROVIDER=goose          # "goose" for AI/ML track, "openai" as fallback
GOOSE_API_KEY=your_key      # Goose API key (block.xyz/goose)
OPENAI_API_KEY=your_key     # OpenAI fallback key
```

> **Note:** The app works in demo/fallback mode without an API key — all features are visible, and the LLM calls return hardcoded fallback responses.

---

## 🏗️ Architecture

```
User Browser (React + Vite)
        ↕  HTTP/JSON (Axios)
FastAPI Backend (Python 3.11)
  ├── /api/guidance   → Goose LLM → Personalized weekly plan
  ├── /api/mood       → RandomForest ML → Risk score + LLM explanation
  ├── /api/kicks      → Baseline anomaly detection → Alert if <60% avg
  └── /api/journal    → Regex NLP → Auto-tagged symptom log
        ↕
SQLite Database (async via aiosqlite)
```

### Components

| Layer | Technology | Role |
|---|---|---|
| Frontend | React 18 + Vite 7 | SPA with 5 pages |
| Styling | Vanilla CSS | Custom maternal dark theme |
| Backend | FastAPI 0.110 | Async REST API |
| ML Model | scikit-learn RandomForest | Mood risk classification |
| LLM | Goose (Block) / OpenAI fallback | Personalized text generation |
| Database | SQLite + aiosqlite | Kick logs, mood logs, journal |

---

## 🧠 ML Model Details

**Model:** `RandomForestClassifier` (scikit-learn)
**Training data:** 800 synthetic samples, PHQ-7 style
**Features:** 7 Likert-scale mood questions (0–3) + sleep hours + energy level
**Target:** Risk level — Low (0) / Moderate (1) / High (2)
**Accuracy:** ~87% on 20% hold-out test set

```
Risk Score = f(PHQ-7 answers, sleep_hours, energy)
Labeling threshold: PHQ composite < 12 → Low, < 26 → Moderate, ≥ 26 → High
```

---

## 📊 Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| LLM provider | Goose (Block) | Required for AI/ML track eligibility; OpenAI-compatible API makes integration clean |
| ML model | RandomForest | Interpretable, robust on small datasets; no need for neural nets for 3-class classification |
| Database | SQLite | Zero-config for demo; trivially swappable to PostgreSQL for production |
| Frontend | React + Vite | Fast dev loop; no SSR needed for SPA dashboard |
| Styling | Vanilla CSS | Full design control; no utility class overhead or build complexity |
| Fallback mode | Hardcoded smart fallback | Allows judges to demo all features even without API key |

---

## ⚠️ Risk Log

| Risk | Identified | Resolution |
|---|---|---|
| No API key during judging | Yes | Full fallback mode built — all 4 features show realistic demo data without any key |
| ML model on synthetic data | Yes | Documented limitation; clinical validation would require real PHQ-validated dataset |
| SQLite not production-grade | Yes | Acceptable for prototype; `DATABASE_URL` env var allows future PostgreSQL swap |
| LLM hallucinations | Yes | Added medical disclaimer on every LLM output + "Always consult your OB-GYN" footer |

---

## 🌍 SDG Alignment

- **SDG 3 (Good Health & Well-Being):** Direct impact on maternal health outcomes
- **SDG 5 (Gender Equality):** Technology designed specifically for women's health needs
- **SDG 10 (Reduced Inequalities):** Free, accessible tool for first-time mothers without access to consistent prenatal coaching

---

## 📚 Evidence Log

| Source | Used For | License |
|---|---|---|
| [PHQ-9/PHQ-7 (Kroenke & Spitzer, 2002)](https://www.phqscreeners.com/) | Mood question design | Public domain health screening tool |
| [WHO Antenatal Care guidelines](https://www.who.int/publications/i/item/9789241549912) | Checkup reminders by trimester | CC BY-NC-SA 3.0 IGO |
| [Count the Kicks campaign](https://countthekicks.org/research/) | Kick count threshold (60%) | Educational, openly cited |
| [scikit-learn](https://scikit-learn.org/) | RandomForest classifier | BSD License |
| [FastAPI](https://fastapi.tiangolo.com/) | Backend framework | MIT License |
| [Goose by Block](https://github.com/block/goose) | Agentic AI framework | Apache 2.0 |

---

## 🗂️ Project Structure

```
75her/
├── backend/
│   ├── main.py                  # FastAPI app + CORS + lifespan
│   ├── routers/
│   │   ├── guidance.py          # Feature 1: LLM week guidance
│   │   ├── mood.py              # Feature 2: ML mood assessment
│   │   ├── kicks.py             # Feature 3: Kick anomaly tracker
│   │   └── journal.py           # Feature 4: Keyword journal
│   ├── ml/
│   │   ├── train_mood_model.py  # RandomForest training script
│   │   └── mood_model.pkl       # Serialized model (auto-generated)
│   ├── db/database.py           # SQLite async connection
│   ├── services/goose_client.py # Goose/OpenAI LLM wrapper
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Router + layout
│   │   ├── pages/               # Home, Guidance, MoodCheck, KickTracker, Journal
│   │   ├── components/Navbar.jsx
│   │   ├── api/index.js         # Axios client
│   │   └── index.css            # Global design system
│   └── vite.config.js
├── start.bat                    # One-click launcher
├── LICENSE                      # MIT
└── README.md
```

---

## 🏆 Known Issues & Next Steps

**Known Issues:**
- ML model trained on synthetic data — needs clinical validation for real deployment
- No user authentication (single `demo_user` session for prototype)
- Goose API rate limits may slow LLM responses under load

**Next Steps:**
- Add real Supabase auth for multi-user support
- Replace synthetic ML training data with real PHQ-validated dataset
- Add push notification reminders for kick tracking
- Partner with OB-GYN clinics for clinical validation
- Accessibility audit (WCAG 2.1 AA compliance)
