import uuid
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id: Mapped[str] = mapped_column(String, ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[str] = mapped_column(String, ForeignKey("questions.id"), nullable=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_option_id: Mapped[str | None] = mapped_column(String, ForeignKey("options.id"), nullable=True)
    saved_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
