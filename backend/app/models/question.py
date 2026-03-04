import uuid
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id: Mapped[str] = mapped_column(String, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String, nullable=False)  # mcq | true_false | short_answer
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
