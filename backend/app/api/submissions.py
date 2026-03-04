import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_lecturer
from app.models.attempt import ExamAttempt
from app.schemas.attempt import AttemptResponse

router = APIRouter(tags=["submissions"])


@router.get("/exams/{exam_id}/submissions", response_model=list[AttemptResponse])
def list_submissions(exam_id: str, db: Session = Depends(get_db), _=Depends(require_lecturer)):
    return db.query(ExamAttempt).filter(
        ExamAttempt.exam_id == exam_id,
        ExamAttempt.is_submitted == True,
    ).order_by(ExamAttempt.submitted_at.desc()).all()


@router.get("/attempts/{attempt_id}/pdf")
def download_pdf(attempt_id: str, db: Session = Depends(get_db), _=Depends(require_lecturer)):
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if not attempt.pdf_path or not os.path.exists(attempt.pdf_path):
        raise HTTPException(404, "PDF not available")
    return FileResponse(attempt.pdf_path, media_type="application/pdf", filename=f"submission_{attempt_id}.pdf")
