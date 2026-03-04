from pydantic import BaseModel


class CourseCreate(BaseModel):
    degree_id: str
    name: str
    code: str
    lecturer_id: str | None = None


class CourseResponse(BaseModel):
    id: str
    degree_id: str
    lecturer_id: str | None
    name: str
    code: str

    model_config = {"from_attributes": True}


class EnrollRequest(BaseModel):
    student_id: str
