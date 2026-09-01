# SIH 26132

## Project name
SIH 2026 - Strengthening market linkages and price discovery for farmers

## Problem statement ID
SIH Problem Statement 26132

## Purpose
This project aims to strengthen market linkages and improve price discovery for farmers by creating a digital ecosystem that helps them access better market information, reduce information asymmetry, and make more informed selling decisions.

## Tech stack
- Frontend: React + Vite
- Backend: FastAPI + Uvicorn
- ML: Python-based experimentation and model workflows
- IVR: Planned telephony integration
- Database: Environment-based configuration

## Monorepo structure
- `frontend/` - React application
- `backend/` - FastAPI backend API
- `ml/` - machine learning workspace
- `ivr/` - IVR integration workspace
- `docs/` - project documentation

## Local setup

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Root-level environment
```bash
cp .env.example .env
```
