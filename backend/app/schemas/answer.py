from datetime import datetime
from pydantic import BaseModel


class AnswerPayload(BaseModel):
    question_id: str
    answer_text: str | None = None
    selected_option_id: str | None = None


class BulkAnswerRequest(BaseModel):
    answers: list[AnswerPayload]


class AnswerResponse(BaseModel):
    id: str
    question_id: str
    answer_text: str | None
    selected_option_id: str | None
    saved_at: datetime

    model_config = {"from_attributes": True}
