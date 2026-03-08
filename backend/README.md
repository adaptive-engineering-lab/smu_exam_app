# Backend (FastAPI)

## Run locally

```bash
cd ..
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --reload
```

## Run tests

```bash
pytest -q
```
