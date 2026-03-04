from pydantic import BaseModel


class DegreeCreate(BaseModel):
    school_id: str
    name: str


class DegreeResponse(BaseModel):
    id: str
    school_id: str
    name: str

    model_config = {"from_attributes": True}
