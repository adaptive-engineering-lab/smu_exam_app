from pydantic import BaseModel


class OptionCreate(BaseModel):
    text: str
    is_correct: bool = False
    order_index: int = 0


class OptionResponse(BaseModel):
    id: str
    text: str
    is_correct: bool
    order_index: int

    model_config = {"from_attributes": True}


class QuestionCreate(BaseModel):
    text: str
    question_type: str  # mcq | true_false | short_answer
    order_index: int = 0
    points: int = 1
    options: list[OptionCreate] = []


class QuestionUpdate(BaseModel):
    text: str | None = None
    question_type: str | None = None
    order_index: int | None = None
    points: int | None = None
    options: list[OptionCreate] | None = None


class QuestionResponse(BaseModel):
    id: str
    exam_id: str
    text: str
    question_type: str
    order_index: int
    points: int
    options: list[OptionResponse] = []

    model_config = {"from_attributes": True}
