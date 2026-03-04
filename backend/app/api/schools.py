from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.db import get_db
from app.models.school import School
from app.models.user import User
from app.schemas.school import SchoolCreate, SchoolResponse

router = APIRouter(prefix="/schools", tags=["schools"])


@router.post("", response_model=SchoolResponse, status_code=201)
def create_school(
    payload: SchoolCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> School:
    exists = db.query(School).filter(School.name == payload.name).first()
    if exists:
        raise HTTPException(status_code=409, detail="School already exists")

    school = School(name=payload.name)
    db.add(school)
    db.commit()
    db.refresh(school)
    return school


@router.get("", response_model=list[SchoolResponse])
def list_schools(db: Session = Depends(get_db)) -> list[School]:
    return db.query(School).order_by(School.name.asc()).all()
