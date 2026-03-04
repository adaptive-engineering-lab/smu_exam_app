from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_lecturer
from app.models.option import Option
from app.models.question import Question
from app.schemas.question import QuestionCreate, QuestionResponse, QuestionUpdate

router = APIRouter(tags=["questions"])


def _attach_options(db: Session, question: Question, option_data: list) -> None:
    db.query(Option).filter(Option.question_id == question.id).delete()
    for o in option_data:
        db.add(Option(question_id=question.id, **o.model_dump()))


@router.post("/exams/{exam_id}/questions", response_model=QuestionResponse, status_code=201)
def create_question(exam_id: str, body: QuestionCreate, db: Session = Depends(get_db), _=Depends(require_lecturer)):
    question = Question(
        exam_id=exam_id,
        text=body.text,
        question_type=body.question_type,
        order_index=body.order_index,
        points=body.points,
    )
    db.add(question)
    db.flush()
    _attach_options(db, question, body.options)
    db.commit()
    db.refresh(question)
    return _load_question(db, question.id)


@router.get("/exams/{exam_id}/questions", response_model=list[QuestionResponse])
def list_questions(exam_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    questions = db.query(Question).filter(Question.exam_id == exam_id).order_by(Question.order_index).all()
    return [_load_question(db, q.id) for q in questions]


@router.patch("/questions/{question_id}", response_model=QuestionResponse)
def update_question(question_id: str, body: QuestionUpdate, db: Session = Depends(get_db), _=Depends(require_lecturer)):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(404, "Question not found")
    for field, value in body.model_dump(exclude_unset=True, exclude={"options"}).items():
        setattr(question, field, value)
    if body.options is not None:
        _attach_options(db, question, body.options)
    db.commit()
    return _load_question(db, question.id)


@router.delete("/questions/{question_id}", status_code=204)
def delete_question(question_id: str, db: Session = Depends(get_db), _=Depends(require_lecturer)):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(404, "Question not found")
    db.delete(question)
    db.commit()


def _load_question(db: Session, question_id: str) -> Question:
    q = db.query(Question).filter(Question.id == question_id).first()
    q.options = db.query(Option).filter(Option.question_id == q.id).order_by(Option.order_index).all()
    return q
