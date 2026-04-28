import { supabase } from "../lib/supabase";
import type {
  AnswerPayload, AttemptWithQuestions, ExamAttempt, Option, Question,
} from "./types";

export const beginAttempt = async (examId: string): Promise<ExamAttempt> => {
  const { data, error } = await supabase.rpc("begin_or_resume_attempt", {
    p_exam_id: examId,
  });
  if (error) throw new Error(error.message);
  return data as ExamAttempt;
};

// AttemptWithQuestions is assembled client-side from four parallel queries
// (attempt, exam, questions, options). The shuffle orders stored on the
// attempt are applied here; is_correct is masked client-side for student
// callers (RLS prevents them seeing other exams' options entirely, but
// within their own attempt they need ordering without correctness leakage).
export const getAttempt = async (attemptId: string): Promise<AttemptWithQuestions> => {
  const { data: attempt, error: attErr } = await supabase
    .from("exam_attempts")
    .select("id, exam_id, student_id, started_at, submitted_at, is_submitted, tab_switches, disconnect_events, question_order, option_orders")
    .eq("id", attemptId)
    .single();
  if (attErr) throw new Error(attErr.message);
  const a = attempt as ExamAttempt & { question_order: string | null; option_orders: string | null };

  const [examRes, questionsRes, sessRes] = await Promise.all([
    supabase.from("exams").select("title, duration_minutes").eq("id", a.exam_id).single(),
    supabase.from("questions").select(`
      id, exam_id, text, question_type, order_index, points,
      options (id, text, is_correct, order_index)
    `).eq("exam_id", a.exam_id),
    supabase.auth.getSession(),
  ]);
  if (examRes.error) throw new Error(examRes.error.message);
  if (questionsRes.error) throw new Error(questionsRes.error.message);

  const userId = sessRes.data.session?.user?.id;
  let isStudent = false;
  if (userId) {
    const { data: meRow } = await supabase
      .from("users").select("role").eq("id", userId).single();
    isStudent = (meRow as { role: string } | null)?.role === "student";
  }

  const questions = (questionsRes.data ?? []) as (Question & { options: Option[] })[];

  // Apply stored question_order if present.
  const questionOrder = a.question_order ? (JSON.parse(a.question_order) as string[]) : null;
  if (questionOrder) {
    const idx = new Map(questionOrder.map((id, i) => [id, i]));
    questions.sort((q1, q2) => (idx.get(q1.id) ?? 999) - (idx.get(q2.id) ?? 999));
  } else {
    questions.sort((q1, q2) => q1.order_index - q2.order_index);
  }

  // Apply stored option_orders per question, mask is_correct for students.
  const optionOrders: Record<string, string[]> = a.option_orders ? JSON.parse(a.option_orders) : {};
  for (const q of questions) {
    const order = optionOrders[q.id];
    if (order) {
      const idx = new Map(order.map((id, i) => [id, i]));
      q.options.sort((o1, o2) => (idx.get(o1.id) ?? 999) - (idx.get(o2.id) ?? 999));
    } else {
      q.options.sort((o1, o2) => o1.order_index - o2.order_index);
    }
    if (isStudent) {
      q.options = q.options.map((o) => ({ ...o, is_correct: false }));
    }
  }

  const exam = examRes.data as { title: string; duration_minutes: number };
  return {
    id: a.id,
    exam_id: a.exam_id,
    student_id: a.student_id,
    started_at: a.started_at,
    submitted_at: a.submitted_at,
    is_submitted: a.is_submitted,
    tab_switches: a.tab_switches,
    disconnect_events: a.disconnect_events,
    exam_title: exam.title,
    duration_minutes: exam.duration_minutes,
    questions,
  };
};

export const bulkSaveAnswers = async (
  attemptId: string,
  answers: AnswerPayload[],
): Promise<void> => {
  if (answers.length === 0) return;
  const rows = answers.map((a) => ({
    attempt_id: attemptId,
    question_id: a.question_id,
    answer_text: a.answer_text ?? null,
    selected_option_id: a.selected_option_id ?? null,
    saved_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("answers")
    .upsert(rows, { onConflict: "attempt_id,question_id" });
  if (error) throw new Error(error.message);
};

export const submitAttempt = async (attemptId: string): Promise<ExamAttempt> => {
  const { data, error } = await supabase.functions.invoke("submit-attempt", {
    body: { attempt_id: attemptId },
  });
  if (error) throw new Error(error.message);
  return (data as { attempt: ExamAttempt }).attempt;
};

export const logIntegrity = async (attemptId: string, event_type: string): Promise<void> => {
  const { error } = await supabase.rpc("log_integrity_event", {
    p_attempt_id: attemptId,
    p_event_type: event_type,
  });
  if (error) throw new Error(error.message);
};

export type SubmissionSummary = {
  id: string;
  exam_id: string;
  student_id: string;
  student_email: string;
  student_name: string | null;
  started_at: string;
  submitted_at: string | null;
  tab_switches: number;
  disconnect_events: number;
};

export const listSubmissions = async (examId: string): Promise<SubmissionSummary[]> => {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select(`
      id, exam_id, student_id, started_at, submitted_at, tab_switches, disconnect_events,
      users:student_id (email, name)
    `)
    .eq("exam_id", examId)
    .eq("is_submitted", true)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);

  // PostgREST returns the embedded relation as either an object or a
  // single-element array depending on schema introspection; normalise.
  type JoinedUser = { email: string; name: string | null };
  type Row = {
    id: string; exam_id: string; student_id: string;
    started_at: string; submitted_at: string | null;
    tab_switches: number; disconnect_events: number;
    users: JoinedUser | JoinedUser[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] ?? null : r.users;
    return {
      id: r.id,
      exam_id: r.exam_id,
      student_id: r.student_id,
      student_email: u?.email ?? "",
      student_name: u?.name ?? null,
      started_at: r.started_at,
      submitted_at: r.submitted_at,
      tab_switches: r.tab_switches,
      disconnect_events: r.disconnect_events,
    };
  });
};

export type StudentSubmission = {
  id: string;
  exam_id: string;
  exam_title: string;
  submitted_at: string | null;
  tab_switches: number;
  disconnect_events: number;
};

export const mySubmissions = async (): Promise<StudentSubmission[]> => {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) throw new Error("not authenticated");

  const { data, error } = await supabase
    .from("exam_attempts")
    .select(`
      id, exam_id, submitted_at, tab_switches, disconnect_events,
      exams:exam_id (title)
    `)
    .eq("student_id", userId)
    .eq("is_submitted", true)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);

  type JoinedExam = { title: string };
  type Row = {
    id: string; exam_id: string; submitted_at: string | null;
    tab_switches: number; disconnect_events: number;
    exams: JoinedExam | JoinedExam[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const e = Array.isArray(r.exams) ? r.exams[0] ?? null : r.exams;
    return {
      id: r.id,
      exam_id: r.exam_id,
      exam_title: e?.title ?? "—",
      submitted_at: r.submitted_at,
      tab_switches: r.tab_switches,
      disconnect_events: r.disconnect_events,
    };
  });
};

// Used by SubmissionsPage to download a PDF. Uses get-attempt-pdf edge
// function which mints a 1-hour signed URL; legacy public URLs (stored
// when bucket was public under FastAPI) are returned unchanged.
export const getAttemptPdfUrl = async (attemptId: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke("get-attempt-pdf", {
    body: { attempt_id: attemptId },
  });
  if (error) throw new Error(error.message);
  return (data as { url: string }).url;
};

// Convenience: lists exams a student can take. Replaces /student/available-exams.
// RLS ensures only published exams in enrolled courses + window are returned.
export const listAvailableExams = async () => {
  const { data, error } = await supabase
    .from("exams")
    .select(`
      id, title, description, duration_minutes, available_from, available_until,
      academic_year, course_id,
      courses:course_id (code, name)
    `)
    .order("available_from", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
};
