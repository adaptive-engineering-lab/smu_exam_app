from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.api import auth, schools
from app.api import degrees, courses, exams, questions, attempts, submissions, student, users
from app.core.config import settings

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(schools.router)
app.include_router(degrees.router)
app.include_router(courses.router)
app.include_router(exams.router)
app.include_router(questions.router)
app.include_router(attempts.router)
app.include_router(submissions.router)
app.include_router(student.router)
app.include_router(users.router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return RedirectResponse(url="https://fastapi.tiangolo.com/img/favicon.png")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
