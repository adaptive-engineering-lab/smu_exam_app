from pydantic import BaseModel


class SchoolCreate(BaseModel):
    name: str


class SchoolResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True
