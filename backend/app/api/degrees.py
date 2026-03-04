from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.degree import Degree
from app.schemas.degree import DegreeCreate, DegreeResponse

router = APIRouter(prefix="/degrees", tags=["degrees"])


@router.post("", response_model=DegreeResponse, status_code=201)
def create_degree(body: DegreeCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    degree = Degree(school_id=body.school_id, name=body.name)
    db.add(degree)
    db.commit()
    db.refresh(degree)
    return degree


@router.get("/by-school/{school_id}", response_model=list[DegreeResponse])
def list_degrees(school_id: str, db: Session = Depends(get_db)):
    return db.query(Degree).filter(Degree.school_id == school_id).order_by(Degree.name).all()
