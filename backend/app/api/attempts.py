import json
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_student
from app.models.answer import Answer
from app.models.attempt import ExamAttempt
from app.models.course import Course
from app.models.exam import Exam
from app.models.option import Option
from app.models.question import Question
from app.schemas.answer import AnswerResponse, BulkAnswerRequest
from app.schemas.attempt import AttemptResponse, AttemptWithQuestionsResponse, IntegrityEvent
from app.schemas.question import OptionResponse, QuestionResponse

router = APIRouter(prefix="/attempts", tags=["attempts"])


@router.post("/exams/{exam_id}/attempt", response_model=AttemptResponse, status_code=201)
def begin_attempt(exam_id: str, db: Session = Depends(get_db), user=Depends(require_student)):
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.is_published == True).first()
    if not exam:
        raise HTTPException(404, "Exam not found or not published")

    now = datetime.now(timezone.utc)
    if exam.available_from and now < exam.available_from:
        raise HTTPException(403, "Exam has not started yet")
    if exam.available_until and now > exam.available_until:
        raise HTTPException(403, "Exam window has closed")

    existing = db.query(ExamAttempt).filter(
        ExamAttempt.exam_id == exam_id,
        ExamAttempt.student_id == user.id,
    ).first()
    if existing:
        if existing.is_submitted:
            raise HTTPException(409, "Exam already submitted")
        return existing

    # Compute shuffle orders for the new attempt
    questions = db.query(Question).filter(Question.exam_id == exam_id).order_by(Question.order_index).all()
    question_order = None
    option_orders = None

    if exam.shuffle_questions and questions:
        q_ids = [q.id for q in questions]
        random.shuffle(q_ids)
        question_order = json.dumps(q_ids)

    if exam.shuffle_options and questions:
        o_map: dict[str, list[str]] = {}
        for q in questions:
            options = db.query(Option).filter(Option.question_id == q.id).order_by(Option.order_index).all()
            o_ids = [o.id for o in options]
            random.shuffle(o_ids)
            o_map[q.id] = o_ids
        option_orders = json.dumps(o_map)

    attempt = ExamAttempt(
        exam_id=exam_id,
        student_id=user.id,
        question_order=question_order,
        option_orders=option_orders,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


@router.get("/{attempt_id}", response_model=AttemptWithQuestionsResponse)
def get_attempt(attempt_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if user.role == "student" and attempt.student_id != user.id:
        raise HTTPException(403)

    exam = db.query(Exam).filter(Exam.id == attempt.exam_id).first()
    questions = db.query(Question).filter(Question.exam_id == exam.id).order_by(Question.order_index).all()

    # Apply stored question order if present
    if attempt.question_order:
        order_map = {qid: i for i, qid in enumerate(json.loads(attempt.question_order))}
        questions = sorted(questions, key=lambda q: order_map.get(q.id, 999))

    stored_option_orders: dict[str, list[str]] = json.loads(attempt.option_orders) if attempt.option_orders else {}

    question_responses = []
    for q in questions:
        options = db.query(Option).filter(Option.question_id == q.id).order_by(Option.order_index).all()
        # Apply stored option order if present
        if q.id in stored_option_orders:
            opt_order = {oid: i for i, oid in enumerate(stored_option_orders[q.id])}
            options = sorted(options, key=lambda o: opt_order.get(o.id, 999))
        # Hide is_correct from students
        option_resp = [
            OptionResponse(
                id=o.id,
                text=o.text,
                is_correct=o.is_correct if user.role != "student" else False,
                order_index=o.order_index,
            )
            for o in options
        ]
        question_responses.append(
            QuestionResponse(
                id=q.id, exam_id=q.exam_id, text=q.text,
                question_type=q.question_type, order_index=q.order_index,
                points=q.points, options=option_resp,
            )
        )

    return AttemptWithQuestionsResponse(
        id=attempt.id,
        exam_id=attempt.exam_id,
        student_id=attempt.student_id,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        is_submitted=attempt.is_submitted,
        tab_switches=attempt.tab_switches,
        disconnect_events=attempt.disconnect_events,
        exam_title=exam.title,
        duration_minutes=exam.duration_minutes,
        questions=question_responses,
    )


@router.put("/{attempt_id}/answers", response_model=list[AnswerResponse])
def bulk_save_answers(attempt_id: str, body: BulkAnswerRequest, db: Session = Depends(get_db), user=Depends(require_student)):
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id, ExamAttempt.student_id == user.id).first()
    if not attempt:
        raise HTTPException(404)
    if attempt.is_submitted:
        raise HTTPException(409, "Exam already submitted")

    saved = []
    now = datetime.now(timezone.utc)
    for payload in body.answers:
        existing = db.query(Answer).filter(
            Answer.attempt_id == attempt_id,
            Answer.question_id == payload.question_id,
        ).first()
        if existing:
            existing.answer_text = payload.answer_text
            existing.selected_option_id = payload.selected_option_id
            existing.saved_at = now
            saved.append(existing)
        else:
            answer = Answer(
                attempt_id=attempt_id,
                question_id=payload.question_id,
                answer_text=payload.answer_text,
                selected_option_id=payload.selected_option_id,
                saved_at=now,
            )
            db.add(answer)
            saved.append(answer)
    db.commit()
    for a in saved:
        db.refresh(a)
    return saved


@router.post("/{attempt_id}/submit", response_model=AttemptResponse)
def submit_attempt(attempt_id: str, db: Session = Depends(get_db), user=Depends(require_student)):
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id, ExamAttempt.student_id == user.id).first()
    if not attempt:
        raise HTTPException(404)
    if attempt.is_submitted:
        return attempt

    attempt.is_submitted = True
    attempt.submitted_at = datetime.now(timezone.utc)
    db.commit()

    # Generate PDF async-style (inline for MVP)
    try:
        from app.services.pdf import generate_submission_pdf
        from app.services.storage import save_pdf

        answers = db.query(Answer).filter(Answer.attempt_id == attempt_id).all()
        questions = db.query(Question).filter(
            Question.exam_id == attempt.exam_id
        ).order_by(Question.order_index).all()
        exam = db.query(Exam).filter(Exam.id == attempt.exam_id).first()
        course = db.query(Course).filter(Course.id == exam.course_id).first()
        lecturer_id = course.lecturer_id if course else None
        lecturer = db.query(User).filter(User.id == lecturer_id).first() if lecturer_id else None

        answer_map = {a.question_id: a for a in answers}
        option_map = {}
        for q in questions:
            for o in db.query(Option).filter(Option.question_id == q.id).all():
                option_map[o.id] = o.text

        pdf_bytes = generate_submission_pdf(
            student_name=user.name,
            student_email=user.email,
            exam=exam,
            course=course,
            lecturer=lecturer,
            attempt=attempt,
            questions=questions,
            answer_map=answer_map,
            option_map=option_map,
        )
        path = save_pdf(attempt.id, pdf_bytes)
        attempt.pdf_path = path
        db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("PDF generation failed for attempt %s: %s", attempt_id, e)

    db.refresh(attempt)
    return attempt


@router.post("/{attempt_id}/integrity")
def log_integrity(attempt_id: str, body: IntegrityEvent, db: Session = Depends(get_db), user=Depends(require_student)):
    attempt = db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id, ExamAttempt.student_id == user.id).first()
    if not attempt:
        raise HTTPException(404)
    if body.event_type == "tab_switch":
        attempt.tab_switches += 1
    elif body.event_type == "disconnect":
        attempt.disconnect_events += 1
    db.commit()
    return {"ok": True}
