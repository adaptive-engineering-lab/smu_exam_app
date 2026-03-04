from fastapi import FastAPI

from app.api import auth, schools
from app.core.config import settings
from app.core.db import Base, engine
from app.models import School, User

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.include_router(auth.router)
app.include_router(schools.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
