from datetime import datetime
from pydantic import BaseModel
from app.schemas.question import QuestionResponse


class AttemptResponse(BaseModel):
    id: str
    exam_id: str
    student_id: str
    started_at: datetime
    submitted_at: datetime | None
    is_submitted: bool
    tab_switches: int
    disconnect_events: int

    model_config = {"from_attributes": True}


class AttemptWithQuestionsResponse(AttemptResponse):
    exam_title: str
    duration_minutes: int
    questions: list[QuestionResponse]


class SubmissionResponse(BaseModel):
    id: str
    exam_id: str
    student_id: str
    student_email: str
    student_name: str | None
    started_at: datetime
    submitted_at: datetime | None
    tab_switches: int
    disconnect_events: int

    model_config = {"from_attributes": True}


class StudentSubmissionResponse(BaseModel):
    id: str
    exam_id: str
    exam_title: str
    submitted_at: datetime | None
    tab_switches: int
    disconnect_events: int

    model_config = {"from_attributes": True}


class IntegrityEvent(BaseModel):
    event_type: str  # tab_switch | disconnect | reconnect
