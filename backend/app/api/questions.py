import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_lecturer
from app.models.answer import Answer
from app.models.option import Option
from app.models.question import Question
from app.schemas.question import QuestionCreate, QuestionResponse, QuestionUpdate

router = APIRouter(tags=["questions"])


def _attach_options(db: Session, question: Question, option_data: list) -> None:
    # Null out any existing answer references to these options before deleting them,
    # to avoid FK constraint violations when a question has already been answered.
    old_option_ids = [
        o.id for o in db.query(Option.id).filter(Option.question_id == question.id)
    ]
    if old_option_ids:
        db.query(Answer).filter(Answer.selected_option_id.in_(old_option_ids)).update(
            {"selected_option_id": None}, synchronize_session=False
        )
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


@router.post("/exams/{exam_id}/questions/csv", response_model=list[QuestionResponse], status_code=201)
def import_questions_csv(exam_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(require_lecturer)):
    """
    Bulk import questions from a CSV file.

    Expected columns: text, question_type, points, options, correct
    - question_type: mcq | true_false | short_answer
    - options: semicolon-separated option texts (e.g. "Paris;London;Berlin;Rome")
      For true_false, leave blank — True/False are added automatically.
      For short_answer, leave blank.
    - correct: semicolon-separated correct option text(s).
      For true_false: "True" or "False".
      For short_answer: leave blank.
    """
    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    required = {"text", "question_type", "points"}
    if reader.fieldnames is None or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(400, f"CSV must have columns: {', '.join(required)}, options, correct")

    existing_count = db.query(Question).filter(Question.exam_id == exam_id).count()
    created: list[Question] = []

    for i, row in enumerate(reader):
        text = (row.get("text") or "").strip()
        q_type = (row.get("question_type") or "").strip().lower()
        if not text:
            continue
        if q_type not in ("mcq", "true_false", "short_answer"):
            raise HTTPException(400, f"Row {i + 2}: invalid question_type '{q_type}'")

        try:
            points = int(row.get("points") or 1)
        except ValueError:
            points = 1

        raw_options = (row.get("options") or "").strip()
        raw_correct = (row.get("correct") or "").strip()

        if q_type == "true_false":
            option_texts = ["True", "False"]
            correct_set = {raw_correct} if raw_correct else set()
        elif q_type == "short_answer":
            option_texts = []
            correct_set = set()
        else:
            option_texts = [o.strip() for o in raw_options.split(";") if o.strip()]
            correct_set = {c.strip() for c in raw_correct.split(";") if c.strip()}
            if len(option_texts) < 2:
                raise HTTPException(400, f"Row {i + 2}: MCQ questions need at least 2 options")

        question = Question(
            exam_id=exam_id,
            text=text,
            question_type=q_type,
            order_index=existing_count + len(created),
            points=points,
        )
        db.add(question)
        db.flush()

        for j, opt_text in enumerate(option_texts):
            db.add(Option(
                question_id=question.id,
                text=opt_text,
                is_correct=opt_text in correct_set,
                order_index=j,
            ))

        db.flush()
        created.append(question)

    db.commit()
    return [_load_question(db, q.id) for q in created]


def _load_question(db: Session, question_id: str) -> Question:
    q = db.query(Question).filter(Question.id == question_id).first()
    q.options = db.query(Option).filter(Option.question_id == q.id).order_by(Option.order_index).all()
    return q
