"""add_shuffle_flags_and_order_fields

Revision ID: ccecb07db26d
Revises: c3d4e5f6a7b8
Create Date: 2026-03-05 16:05:24.172596

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ccecb07db26d'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("shuffle_questions", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("exams", sa.Column("shuffle_options", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("exam_attempts", sa.Column("question_order", sa.Text(), nullable=True))
    op.add_column("exam_attempts", sa.Column("option_orders", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("exam_attempts", "option_orders")
    op.drop_column("exam_attempts", "question_order")
    op.drop_column("exams", "shuffle_options")
    op.drop_column("exams", "shuffle_questions")
