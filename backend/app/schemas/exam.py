from datetime import datetime
from pydantic import BaseModel


class ExamCreate(BaseModel):
    course_id: str
    title: str
    description: str | None = None
    duration_minutes: int
    available_from: datetime | None = None
    available_until: datetime | None = None


class ExamUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    available_from: datetime | None = None
    available_until: datetime | None = None


class ExamResponse(BaseModel):
    id: str
    course_id: str
    created_by: str
    title: str
    description: str | None
    duration_minutes: int
    available_from: datetime | None
    available_until: datetime | None
    is_published: bool
    created_at: datetime

    model_config = {"from_attributes": True}
