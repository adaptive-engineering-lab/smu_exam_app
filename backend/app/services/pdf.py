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
    student_name: str | None = None,
    course=None,
    lecturer=None,
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
    institution_style = ParagraphStyle(
        "institution", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#6B7280"), spaceAfter=2,
    )
    title_style = ParagraphStyle(
        "title", parent=styles["Heading1"],
        fontSize=18, spaceBefore=4, spaceAfter=2, textColor=colors.HexColor("#111827"),
    )
    subtitle_style = ParagraphStyle(
        "subtitle", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#4B5563"), spaceAfter=0,
    )
    heading_style = ParagraphStyle(
        "heading", parent=styles["Heading2"],
        fontSize=11, spaceBefore=10, spaceAfter=3, textColor=colors.HexColor("#1F2937"),
    )
    answer_style = ParagraphStyle(
        "answer", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#1D4ED8"), leftIndent=14,
    )
    no_answer_style = ParagraphStyle(
        "no_answer", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#9CA3AF"), leftIndent=14,
    )

    story = []

    # ── Institution / course line ─────────────────────────────────────────────
    course_line = ""
    if course:
        course_line = f"{course.code} — {course.name}"
    if course_line:
        story.append(Paragraph(course_line, institution_style))

    # ── Exam title ────────────────────────────────────────────────────────────
    story.append(Paragraph(exam.title, title_style))

    # ── Subtitle: academic year + lecturer ────────────────────────────────────
    subtitle_parts = []
    if exam.academic_year:
        subtitle_parts.append(f"Academic Year {exam.academic_year}")
    if lecturer:
        lect_label = lecturer.name or lecturer.email
        subtitle_parts.append(f"Lecturer: {lect_label}")
    if subtitle_parts:
        story.append(Paragraph("  ·  ".join(subtitle_parts), subtitle_style))

    story.append(Spacer(1, 0.35 * cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#4F46E5")))
    story.append(Spacer(1, 0.3 * cm))

    # ── Metadata table (two-column layout) ───────────────────────────────────
    student_label = student_name or student_email
    if student_name:
        student_label = f"{student_name} ({student_email})"

    started = _fmt(attempt.started_at)
    submitted = _fmt(attempt.submitted_at)

    left_col = [
        ["Student:", student_label],
        ["Started:", started],
        ["Submitted:", submitted],
    ]
    right_col = [
        ["Duration:", f"{exam.duration_minutes} min"],
        ["Tab Switches:", str(attempt.tab_switches)],
        ["Disconnects:", str(attempt.disconnect_events)],
    ]

    # Interleave into a 4-column table: label | value | label | value
    rows = []
    for (lk, lv), (rk, rv) in zip(left_col, right_col):
        rows.append([lk, lv, rk, rv])

    meta_table = Table(rows, colWidths=[3 * cm, 8 * cm, 3 * cm, 3.5 * cm])
    meta_table.setStyle(TableStyle([
        ("FONT",        (0, 0), (-1, -1), "Helvetica",      9),
        ("FONT",        (0, 0), (0, -1), "Helvetica-Bold",  9),
        ("FONT",        (2, 0), (2, -1), "Helvetica-Bold",  9),
        ("TEXTCOLOR",   (0, 0), (0, -1), colors.HexColor("#374151")),
        ("TEXTCOLOR",   (2, 0), (2, -1), colors.HexColor("#374151")),
        ("TEXTCOLOR",   (1, 0), (1, -1), colors.HexColor("#111827")),
        ("TEXTCOLOR",   (3, 0), (3, -1), colors.HexColor("#111827")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.4 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E5E7EB")))
    story.append(Spacer(1, 0.2 * cm))

    # ── Questions + Answers ───────────────────────────────────────────────────
    for i, q in enumerate(questions, start=1):
        pts = f"{q.points} pt{'s' if q.points != 1 else ''}"
        story.append(Paragraph(f"<b>Q{i}.</b> {q.text} <font color='#6B7280' size='9'>({pts})</font>", heading_style))

        answer = answer_map.get(q.id)
        if answer is None:
            story.append(Paragraph("No answer provided.", no_answer_style))
        elif q.question_type == "short_answer":
            text = answer.answer_text or "No answer provided."
            style = answer_style if answer.answer_text else no_answer_style
            story.append(Paragraph(text, style))
        else:
            if answer.selected_option_id:
                opt_text = option_map.get(answer.selected_option_id, "Unknown option")
                story.append(Paragraph(f"▸ {opt_text}", answer_style))
            else:
                story.append(Paragraph("No option selected.", no_answer_style))

        story.append(Spacer(1, 0.15 * cm))

    doc.build(story)
    return buffer.getvalue()


def _fmt(dt: datetime | None) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%Y-%m-%d %H:%M UTC")
