# SMU Exam App

## Project Structure

- `backend/` — FastAPI API scaffold with auth and schools endpoints.
- `frontend/` — React (Vite) scaffold with login and protected dashboard routes.
- `docs/` — planning and architecture documentation.

## Documentation

- [V1 System Specification](docs/V1_SYSTEM_SPEC.md)
- [V1 Implementation Plan](docs/V1_IMPLEMENTATION_PLAN.md)

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
