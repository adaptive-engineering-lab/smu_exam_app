"""Student-specific convenience endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_student
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.exam import Exam
from app.schemas.exam import ExamResponse

router = APIRouter(prefix="/student", tags=["student"])


@router.get("/available-exams", response_model=list[ExamResponse])
def available_exams(db: Session = Depends(get_db), user=Depends(require_student)):
    """Return all published exams for courses the student is enrolled in."""
    enrolled_course_ids = (
        db.query(Enrollment.course_id)
        .filter(Enrollment.student_id == user.id)
        .subquery()
    )
    exams = (
        db.query(Exam)
        .filter(Exam.course_id.in_(enrolled_course_ids), Exam.is_published == True)
        .order_by(Exam.created_at.desc())
        .all()
    )
    return exams
