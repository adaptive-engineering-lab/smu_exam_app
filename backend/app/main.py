from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from app.api import auth, schools
from app.core.config import settings
from app.core.db import Base, engine
from app.models import School, User

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.include_router(auth.router)
app.include_router(schools.router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return RedirectResponse(url="https://fastapi.tiangolo.com/img/favicon.png")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
