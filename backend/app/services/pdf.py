"""PDF generation for exam submissions using reportlab."""

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, HRFlowable,
)


def generate_submission_pdf(
    student_email: str,
    exam,
    attempt,
    questions: list,
    answer_map: dict,
    option_map: dict,
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=16, spaceAfter=6)
    heading_style = ParagraphStyle("heading", parent=styles["Heading2"], fontSize=12, spaceAfter=4)
    normal_style = styles["Normal"]
    answer_style = ParagraphStyle("answer", parent=styles["Normal"], textColor=colors.darkblue, leftIndent=12)

    story = []

    # Header
    story.append(Paragraph("SMU Examination Submission", title_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.3 * cm))

    # Metadata table
    started = _fmt(attempt.started_at)
    submitted = _fmt(attempt.submitted_at)
    meta = [
        ["Exam:", exam.title],
        ["Student:", student_email],
        ["Started:", started],
        ["Submitted:", submitted],
        ["Duration (min):", str(exam.duration_minutes)],
        ["Tab Switches:", str(attempt.tab_switches)],
        ["Disconnects:", str(attempt.disconnect_events)],
    ]
    meta_table = Table(meta, colWidths=[4 * cm, 12 * cm])
    meta_table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    story.append(Spacer(1, 0.3 * cm))

    # Questions + Answers
    for i, q in enumerate(questions, start=1):
        story.append(Paragraph(f"Q{i}. {q.text} ({q.points} pt{'s' if q.points != 1 else ''})", heading_style))

        answer = answer_map.get(q.id)
        if answer is None:
            story.append(Paragraph("No answer provided.", answer_style))
        elif q.question_type == "short_answer":
            text = answer.answer_text or "No answer provided."
            story.append(Paragraph(text, answer_style))
        else:
            if answer.selected_option_id:
                opt_text = option_map.get(answer.selected_option_id, "Unknown option")
                story.append(Paragraph(f"Selected: {opt_text}", answer_style))
            else:
                story.append(Paragraph("No option selected.", answer_style))

        story.append(Spacer(1, 0.3 * cm))

    doc.build(story)
    return buffer.getvalue()


def _fmt(dt: datetime | None) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
