from pydantic import BaseModel


class EnrollmentResponse(BaseModel):
    id: str
    student_id: str
    course_id: str

    model_config = {"from_attributes": True}
