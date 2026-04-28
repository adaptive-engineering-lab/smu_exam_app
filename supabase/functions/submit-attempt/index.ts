// Submit an exam attempt: marks it submitted, renders a PDF of the
// student's answers, uploads to the submissions bucket, and stores the
// relative path on the attempt row. Replaces the FastAPI POST
// /attempts/{id}/submit + services/pdf.py + services/storage.py.
//
// Authorisation: caller must own the attempt (student_id = auth.uid()).
// We verify with a user-scoped read first, then escalate to the service
// role to mutate the submission fields (which the
// exam_attempts_guard_submit_fields trigger blocks for non-service-role
// callers — that's the whole point of the trigger).
//
// PDF parity: we reproduce the layout from pdf.py — institution line,
// exam title, academic-year + lecturer subtitle, ruled metadata table
// (Student/Started/Submitted vs Duration/TabSwitches/Disconnects), then
// per-question heading + answer body. pdf-lib is lower-level than
// reportlab, so spacing, wrapping, and pagination are managed by hand.

import {
  PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";
import { adminClient, getCallerRole, userClient } from "../_shared/auth.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

// ─── PDF writer ───────────────────────────────────────────────────────────

const PAGE_W = 595.276;  // A4 width in points
const PAGE_H = 841.89;   // A4 height in points
const MARGIN = 56;       // ~2 cm

const COLOR_TEXT     = rgb(0x11/255, 0x18/255, 0x27/255); // #111827
const COLOR_MUTED    = rgb(0x6B/255, 0x72/255, 0x80/255); // #6B7280
const COLOR_SUBTLE   = rgb(0x4B/255, 0x55/255, 0x63/255); // #4B5563
const COLOR_HEADING  = rgb(0x1F/255, 0x29/255, 0x37/255); // #1F2937
const COLOR_LABEL    = rgb(0x37/255, 0x41/255, 0x51/255); // #374151
const COLOR_ANSWER   = rgb(0x1D/255, 0x4E/255, 0xD8/255); // #1D4ED8
const COLOR_NO_ANS   = rgb(0x9C/255, 0xA3/255, 0xAF/255); // #9CA3AF
const COLOR_ACCENT   = rgb(0x4F/255, 0x46/255, 0xE5/255); // #4F46E5
const COLOR_THIN     = rgb(0xE5/255, 0xE7/255, 0xEB/255); // #E5E7EB

class Writer {
  doc: PDFDocument;
  page: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y: number;

  private constructor(doc: PDFDocument) {
    this.doc = doc;
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  static async create(): Promise<Writer> {
    const doc = await PDFDocument.create();
    const w = new Writer(doc);
    w.font = await doc.embedFont(StandardFonts.Helvetica);
    w.bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return w;
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN) this.newPage();
  }

  spacer(h: number) {
    this.y -= h;
    if (this.y < MARGIN) this.newPage();
  }

  rule(thickness: number, color = COLOR_THIN) {
    this.ensureSpace(thickness + 6);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 2 },
      end:   { x: PAGE_W - MARGIN, y: this.y - 2 },
      thickness, color,
    });
    this.y -= thickness + 6;
  }

  text(line: string, opts: {
    size: number; bold?: boolean; color?: ReturnType<typeof rgb>;
    indent?: number; spaceAfter?: number;
  }) {
    const font = opts.bold ? this.bold : this.font;
    const lineHeight = opts.size * 1.25;
    this.ensureSpace(lineHeight);
    this.page.drawText(line, {
      x: MARGIN + (opts.indent ?? 0),
      y: this.y - opts.size,
      size: opts.size,
      font,
      color: opts.color ?? COLOR_TEXT,
    });
    this.y -= lineHeight + (opts.spaceAfter ?? 0);
  }

  wrappedText(text: string, opts: Parameters<Writer["text"]>[1]) {
    const font = opts.bold ? this.bold : this.font;
    const maxWidth = PAGE_W - 2 * MARGIN - (opts.indent ?? 0);
    const lines: string[] = [];
    for (const para of text.split(/\r?\n/)) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, opts.size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }
    for (let i = 0; i < lines.length; i++) {
      this.text(lines[i], { ...opts, spaceAfter: i === lines.length - 1 ? opts.spaceAfter : 0 });
    }
  }

  // Two-column key/value metadata block, label bold, value normal.
  metaRow(left: [string, string], right: [string, string]) {
    const lineHeight = 11 * 1.25;
    this.ensureSpace(lineHeight);
    const labelXLeft = MARGIN;
    const valueXLeft = MARGIN + 80;
    const labelXRight = MARGIN + 280;
    const valueXRight = MARGIN + 360;
    this.page.drawText(left[0],  { x: labelXLeft,  y: this.y - 9, size: 9, font: this.bold, color: COLOR_LABEL });
    this.page.drawText(left[1],  { x: valueXLeft,  y: this.y - 9, size: 9, font: this.font, color: COLOR_TEXT });
    this.page.drawText(right[0], { x: labelXRight, y: this.y - 9, size: 9, font: this.bold, color: COLOR_LABEL });
    this.page.drawText(right[1], { x: valueXRight, y: this.y - 9, size: 9, font: this.font, color: COLOR_TEXT });
    this.y -= lineHeight;
  }

  async finish(): Promise<Uint8Array> {
    return await this.doc.save();
  }
}

// ─── domain types ─────────────────────────────────────────────────────────

type Exam = {
  id: string; title: string; description: string | null;
  duration_minutes: number; academic_year: string | null;
  course_id: string; course?: Course;
};
type Course = { id: string; code: string; name: string; lecturer_id: string | null };
type LecturerSummary = { id: string; email: string; name: string | null };
type Question = {
  id: string; text: string; question_type: string;
  order_index: number; points: number;
};
type Option = { id: string; question_id: string; text: string };
type Answer = {
  question_id: string; answer_text: string | null;
  selected_option_id: string | null;
};
type Attempt = {
  id: string; exam_id: string; student_id: string;
  started_at: string; submitted_at: string | null; is_submitted: boolean;
  tab_switches: number; disconnect_events: number; pdf_path: string | null;
};

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

// ─── PDF rendering ────────────────────────────────────────────────────────

async function renderSubmissionPdf(args: {
  studentName: string | null;
  studentEmail: string;
  exam: Exam;
  course: Course | null;
  lecturer: LecturerSummary | null;
  attempt: Attempt;
  questions: Question[];
  answersByQuestion: Map<string, Answer>;
  optionTextById: Map<string, string>;
}): Promise<Uint8Array> {
  const w = await Writer.create();

  if (args.course) {
    w.text(`${args.course.code} — ${args.course.name}`, { size: 9, color: COLOR_MUTED });
  }

  w.text(args.exam.title, { size: 18, bold: true, color: COLOR_TEXT, spaceAfter: 2 });

  const subtitleParts: string[] = [];
  if (args.exam.academic_year) subtitleParts.push(`Academic Year ${args.exam.academic_year}`);
  if (args.lecturer) subtitleParts.push(`Lecturer: ${args.lecturer.name ?? args.lecturer.email}`);
  if (subtitleParts.length) {
    w.text(subtitleParts.join("  ·  "), { size: 10, color: COLOR_SUBTLE });
  }

  w.spacer(4);
  w.rule(1.5, COLOR_ACCENT);
  w.spacer(2);

  const studentLabel = args.studentName
    ? `${args.studentName} (${args.studentEmail})`
    : args.studentEmail;

  w.metaRow(["Student:",   studentLabel],                ["Duration:",     `${args.exam.duration_minutes} min`]);
  w.metaRow(["Started:",   fmtDate(args.attempt.started_at)],   ["Tab Switches:", String(args.attempt.tab_switches)]);
  w.metaRow(["Submitted:", fmtDate(args.attempt.submitted_at)], ["Disconnects:",  String(args.attempt.disconnect_events)]);

  w.spacer(8);
  w.rule(0.5, COLOR_THIN);
  w.spacer(2);

  args.questions.forEach((q, i) => {
    const ptsLabel = `${q.points} pt${q.points === 1 ? "" : "s"}`;
    w.spacer(6);
    w.wrappedText(`Q${i + 1}.  ${q.text}    (${ptsLabel})`, {
      size: 11, bold: true, color: COLOR_HEADING, spaceAfter: 2,
    });

    const a = args.answersByQuestion.get(q.id);
    if (!a) {
      w.text("No answer provided.", { size: 10, color: COLOR_NO_ANS, indent: 14 });
      return;
    }
    if (q.question_type === "short_answer") {
      const text = a.answer_text?.trim();
      if (text) {
        w.wrappedText(text, { size: 10, color: COLOR_ANSWER, indent: 14 });
      } else {
        w.text("No answer provided.", { size: 10, color: COLOR_NO_ANS, indent: 14 });
      }
    } else {
      if (a.selected_option_id) {
        const optText = args.optionTextById.get(a.selected_option_id) ?? "Unknown option";
        w.wrappedText(`> ${optText}`, { size: 10, color: COLOR_ANSWER, indent: 14 });
      } else {
        w.text("No option selected.", { size: 10, color: COLOR_NO_ANS, indent: 14 });
      }
    }
  });

  return w.finish();
}

// ─── handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method not allowed" });

  const caller = await getCallerRole(req);
  if (!caller) return jsonResponse(req, 401, { error: "not authenticated" });

  let body: { attempt_id?: string };
  try { body = await req.json(); } catch {
    return jsonResponse(req, 400, { error: "invalid json body" });
  }
  const attemptId = body.attempt_id;
  if (!attemptId) return jsonResponse(req, 400, { error: "attempt_id is required" });

  // 1) RLS-gated ownership check via the user-scoped client.
  const sb = userClient(req);
  const { data: ownedAttempt, error: lookupErr } = await sb
    .from("exam_attempts")
    .select("id, exam_id, student_id, is_submitted")
    .eq("id", attemptId)
    .maybeSingle();
  if (lookupErr) return jsonResponse(req, 500, { error: lookupErr.message });
  if (!ownedAttempt) return jsonResponse(req, 404, { error: "attempt not found" });
  if (ownedAttempt.student_id !== caller.userId) {
    return jsonResponse(req, 403, { error: "forbidden" });
  }

  // 2) Idempotent submit: if already submitted, return current row.
  if (ownedAttempt.is_submitted) {
    const { data: cur } = await sb.from("exam_attempts").select("*").eq("id", attemptId).single();
    return jsonResponse(req, 200, { attempt: cur, already_submitted: true });
  }

  // 3) Mark submitted via service role (trigger blocks user-role updates of
  // is_submitted/submitted_at).
  const admin = adminClient();
  const submittedAt = new Date().toISOString();
  const { error: submitErr } = await admin.from("exam_attempts")
    .update({ is_submitted: true, submitted_at: submittedAt })
    .eq("id", attemptId);
  if (submitErr) return jsonResponse(req, 500, { error: submitErr.message });

  // 4) Gather data for the PDF. Two phases: fetch everything that doesn't
  // depend on question ids, then fetch options keyed off the question ids.
  const [examRes, qRes, ansRes, attemptRes, studentRes] = await Promise.all([
    admin.from("exams")
      .select("id, title, description, duration_minutes, academic_year, course_id, courses(id, code, name, lecturer_id)")
      .eq("id", ownedAttempt.exam_id).single(),
    admin.from("questions")
      .select("id, text, question_type, order_index, points")
      .eq("exam_id", ownedAttempt.exam_id).order("order_index"),
    admin.from("answers")
      .select("question_id, answer_text, selected_option_id")
      .eq("attempt_id", attemptId),
    admin.from("exam_attempts").select("*").eq("id", attemptId).single(),
    admin.from("users").select("id, email, name").eq("id", ownedAttempt.student_id).single(),
  ]);

  if (examRes.error || !examRes.data) {
    return jsonResponse(req, 500, { error: examRes.error?.message ?? "exam not found" });
  }
  const exam = examRes.data as unknown as Exam & { courses: Course | null };
  const course = exam.courses ?? null;
  const questions = (qRes.data ?? []) as Question[];

  const qIds = questions.map((q) => q.id);
  const { data: rawOptions } = qIds.length
    ? await admin.from("options").select("id, question_id, text").in("question_id", qIds)
    : { data: [] as Option[] };
  const options = (rawOptions ?? []) as Option[];

  const answers = (ansRes.data ?? []) as Answer[];
  const attempt = attemptRes.data as Attempt;
  const student = studentRes.data as { id: string; email: string; name: string | null };

  let lecturer: LecturerSummary | null = null;
  if (course?.lecturer_id) {
    const { data: l } = await admin.from("users")
      .select("id, email, name").eq("id", course.lecturer_id).maybeSingle();
    if (l) lecturer = l as LecturerSummary;
  }

  const answersByQuestion = new Map<string, Answer>(
    answers.map((a) => [a.question_id, a]),
  );
  const optionTextById = new Map<string, string>(
    options.map((o) => [o.id, o.text]),
  );

  // 5) Render and upload.
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderSubmissionPdf({
      studentName: student?.name ?? null,
      studentEmail: student?.email ?? "",
      exam, course, lecturer,
      attempt, questions, answersByQuestion, optionTextById,
    });
  } catch (e) {
    console.error("pdf render failed:", e);
    // submission is durable; PDF can be re-generated later by an admin
    return jsonResponse(req, 200, {
      attempt, pdf_warning: `pdf render failed: ${(e as Error).message}`,
    });
  }

  const objectKey = `${attemptId}.pdf`;
  const { error: uploadErr } = await admin.storage
    .from("submissions")
    .upload(objectKey, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    console.error("pdf upload failed:", uploadErr.message);
    return jsonResponse(req, 200, {
      attempt, pdf_warning: `upload failed: ${uploadErr.message}`,
    });
  }

  const { error: pathErr } = await admin.from("exam_attempts")
    .update({ pdf_path: objectKey }).eq("id", attemptId);
  if (pathErr) console.warn("pdf_path persist failed:", pathErr.message);

  // Re-fetch the final row so the client sees the updated pdf_path.
  const { data: finalAttempt } = await admin
    .from("exam_attempts").select("*").eq("id", attemptId).single();

  return jsonResponse(req, 200, { attempt: finalAttempt });
});
