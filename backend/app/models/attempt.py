import uuid
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"
    __table_args__ = (UniqueConstraint("exam_id", "student_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id: Mapped[str] = mapped_column(String, ForeignKey("exams.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    submitted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_submitted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tab_switches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    disconnect_events: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pdf_path: Mapped[str | None] = mapped_column(String, nullable=True)
    # JSON-encoded list[str] of question IDs in display order (set at attempt creation when shuffle_questions is on)
    question_order: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON-encoded dict[question_id, list[option_id]] (set at attempt creation when shuffle_options is on)
    option_orders: Mapped[str | None] = mapped_column(Text, nullable=True)
