from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_lecturer
from app.models.exam import Exam
from app.schemas.exam import ExamCreate, ExamResponse, ExamUpdate

router = APIRouter(prefix="/exams", tags=["exams"])


def _check_ownership(exam: Exam, user) -> None:
    """Raise 403 if a pure lecturer doesn't own the exam."""
    if user.role == "lecturer" and exam.created_by != user.id:
        raise HTTPException(403, "You do not have permission to modify this exam")


@router.post("", response_model=ExamResponse, status_code=201)
def create_exam(body: ExamCreate, db: Session = Depends(get_db), user=Depends(require_lecturer)):
    exam = Exam(**body.model_dump(), created_by=user.id)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@router.get("/by-course/{course_id}", response_model=list[ExamResponse])
def list_exams(course_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Exam).filter(Exam.course_id == course_id)
    if user.role == "lecturer":
        q = q.filter(Exam.created_by == user.id)
    return q.order_by(Exam.created_at.desc()).all()


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
    _check_ownership(exam, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exam, field, value)
    db.commit()
    db.refresh(exam)
    return exam


@router.delete("/{exam_id}", status_code=204)
def delete_exam(exam_id: str, db: Session = Depends(get_db), user=Depends(require_lecturer)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    _check_ownership(exam, user)
    if exam.is_published:
        raise HTTPException(409, "Unpublish the exam before deleting")
    db.delete(exam)
    db.commit()


@router.post("/{exam_id}/publish", response_model=ExamResponse)
def toggle_publish(exam_id: str, db: Session = Depends(get_db), user=Depends(require_lecturer)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    _check_ownership(exam, user)
    exam.is_published = not exam.is_published
    db.commit()
    db.refresh(exam)
    return exam
