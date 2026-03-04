from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_lecturer
from app.models.exam import Exam
from app.schemas.exam import ExamCreate, ExamResponse, ExamUpdate

router = APIRouter(prefix="/exams", tags=["exams"])


@router.post("", response_model=ExamResponse, status_code=201)
def create_exam(body: ExamCreate, db: Session = Depends(get_db), user=Depends(require_lecturer)):
    exam = Exam(**body.model_dump(), created_by=user.id)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@router.get("/by-course/{course_id}", response_model=list[ExamResponse])
def list_exams(course_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Exam).filter(Exam.course_id == course_id).order_by(Exam.created_at.desc()).all()


@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(exam_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    return exam


@router.patch("/{exam_id}", response_model=ExamResponse)
def update_exam(exam_id: str, body: ExamUpdate, db: Session = Depends(get_db), user=Depends(require_lecturer)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exam, field, value)
    db.commit()
    db.refresh(exam)
    return exam


@router.post("/{exam_id}/publish", response_model=ExamResponse)
def toggle_publish(exam_id: str, db: Session = Depends(get_db), user=Depends(require_lecturer)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    exam.is_published = not exam.is_published
    db.commit()
    db.refresh(exam)
    return exam
