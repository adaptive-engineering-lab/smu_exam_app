"""Student-specific convenience endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_student
from app.models.attempt import ExamAttempt
from app.models.enrollment import Enrollment
from app.models.exam import Exam
from app.models.user import User
from app.schemas.attempt import StudentSubmissionResponse
from app.schemas.exam import ExamResponse

router = APIRouter(prefix="/student", tags=["student"])


@router.get("/available-exams", response_model=list[ExamResponse])
def available_exams(db: Session = Depends(get_db), user=Depends(require_student)):
    """Return published exams within the active window for courses the student is enrolled in."""
    now = datetime.now(timezone.utc)
    enrolled_course_ids = (
        db.query(Enrollment.course_id)
        .filter(Enrollment.student_id == user.id)
        .subquery()
    )
    exams = (
        db.query(Exam)
        .filter(
            Exam.course_id.in_(enrolled_course_ids),
            Exam.is_published == True,
            or_(Exam.available_from == None, Exam.available_from <= now),
            or_(Exam.available_until == None, Exam.available_until >= now),
        )
        .order_by(Exam.created_at.desc())
        .all()
    )
    return exams


@router.get("/submissions", response_model=list[StudentSubmissionResponse])
def my_submissions(db: Session = Depends(get_db), user: User = Depends(require_student)):
    """Return submitted attempts for the current student."""
    rows = (
        db.query(ExamAttempt, Exam.title)
        .join(Exam, Exam.id == ExamAttempt.exam_id)
        .filter(ExamAttempt.student_id == user.id, ExamAttempt.is_submitted == True)
        .order_by(ExamAttempt.submitted_at.desc())
        .all()
    )
    result = []
    for attempt, title in rows:
        attempt.exam_title = title
        result.append(attempt)
    return result
