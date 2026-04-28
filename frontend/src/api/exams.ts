import { supabase } from "../lib/supabase";
import type { Exam, Option, Question } from "./types";

export const listExams = async (courseId: string): Promise<Exam[]> => {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Exam[];
};

export const getExam = async (examId: string): Promise<Exam> => {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();
  if (error) throw new Error(error.message);
  return data as Exam;
};

type CreateExamPayload = {
  course_id: string;
  title: string;
  description?: string;
  duration_minutes: number;
  available_from?: string | null;
  available_until?: string | null;
  academic_year?: string | null;
};

export const createExam = async (payload: CreateExamPayload): Promise<Exam> => {
  // RLS policy requires created_by = auth.uid(); look up the current user.
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) throw new Error("not authenticated");

  const { data, error } = await supabase
    .from("exams")
    .insert({ ...payload, created_by: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Exam;
};

export const updateExam = async (examId: string, patch: Partial<Exam>): Promise<Exam> => {
  // RLS guarantees only admin/owning lecturer can land this update.
  const { data, error } = await supabase
    .from("exams")
    .update(patch)
    .eq("id", examId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Exam;
};

export const togglePublish = async (examId: string): Promise<Exam> => {
  // Read-then-write; race tolerant because is_published is a single boolean
  // and only the lecturer/admin staff update it.
  const current = await getExam(examId);
  return await updateExam(examId, { is_published: !current.is_published });
};

export const listQuestions = async (examId: string): Promise<Question[]> => {
  const { data, error } = await supabase
    .from("questions")
    .select(`
      id, exam_id, text, question_type, order_index, points,
      options (id, text, is_correct, order_index)
    `)
    .eq("exam_id", examId)
    .order("order_index");
  if (error) throw new Error(error.message);
  return ((data ?? []) as (Question & { options: Option[] })[]).map((q) => ({
    ...q,
    options: (q.options ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  }));
};

type CreateQuestionPayload = {
  text: string;
  question_type: string;
  order_index: number;
  points: number;
  options: { text: string; is_correct: boolean; order_index: number }[];
};

export const createQuestion = async (
  examId: string,
  payload: CreateQuestionPayload,
): Promise<Question> => {
  const { data: idData, error } = await supabase.rpc("create_question_with_options", {
    p_exam_id: examId,
    p_text: payload.text,
    p_question_type: payload.question_type,
    p_points: payload.points,
    p_order_index: payload.order_index,
    p_options: payload.options,
  });
  if (error) throw new Error(error.message);
  const newId = idData as unknown as string;

  // Re-fetch with options to match the old response shape.
  const { data, error: fErr } = await supabase
    .from("questions")
    .select(`id, exam_id, text, question_type, order_index, points, options (id, text, is_correct, order_index)`)
    .eq("id", newId)
    .single();
  if (fErr) throw new Error(fErr.message);
  const q = data as Question & { options: Option[] };
  return {
    ...q,
    options: (q.options ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  };
};

type UpdateQuestionPayload = {
  text?: string;
  question_type?: string;
  points?: number;
  order_index?: number;
  options?: { text: string; is_correct: boolean; order_index: number }[];
};

export const updateQuestion = async (
  questionId: string,
  payload: UpdateQuestionPayload,
): Promise<Question> => {
  const { error } = await supabase.rpc("update_question_with_options", {
    p_question_id: questionId,
    p_text: payload.text ?? null,
    p_question_type: payload.question_type ?? null,
    p_points: payload.points ?? null,
    p_order_index: payload.order_index ?? null,
    p_options: payload.options ?? null,
  });
  if (error) throw new Error(error.message);

  const { data, error: fErr } = await supabase
    .from("questions")
    .select(`id, exam_id, text, question_type, order_index, points, options (id, text, is_correct, order_index)`)
    .eq("id", questionId)
    .single();
  if (fErr) throw new Error(fErr.message);
  const q = data as Question & { options: Option[] };
  return {
    ...q,
    options: (q.options ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  };
};

export const deleteQuestion = async (questionId: string): Promise<void> => {
  const { error } = await supabase.from("questions").delete().eq("id", questionId);
  if (error) throw new Error(error.message);
};

export const deleteExam = async (examId: string): Promise<void> => {
  const { error } = await supabase.from("exams").delete().eq("id", examId);
  if (error) throw new Error(error.message);
};

// ─── Question bank ───────────────────────────────────────────────────────
// The "bank" is every question the lecturer has authored across all their
// exams (RLS already scopes the questions table to admin / owning lecturer
// / student-with-attempt). Optionally exclude the current exam so the
// picker doesn't show questions already in this exam.

export type BankQuestion = {
  id: string;
  text: string;
  question_type: "mcq" | "true_false" | "short_answer";
  points: number;
  exam_id: string;
  exam_title: string;
  course_code: string | null;
};

export const listBankQuestions = async (
  excludeExamId?: string,
): Promise<BankQuestion[]> => {
  let q = supabase
    .from("questions")
    .select(`
      id, text, question_type, points, exam_id,
      exams:exam_id (
        title,
        courses:course_id (code)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(500);
  if (excludeExamId) q = q.neq("exam_id", excludeExamId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type JoinedCourse = { code: string };
  type JoinedExam = { title: string; courses: JoinedCourse | JoinedCourse[] | null };
  type Row = {
    id: string; text: string; points: number; exam_id: string;
    question_type: BankQuestion["question_type"];
    exams: JoinedExam | JoinedExam[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const exam = Array.isArray(r.exams) ? r.exams[0] ?? null : r.exams;
    const course = exam ? (Array.isArray(exam.courses) ? exam.courses[0] ?? null : exam.courses) : null;
    return {
      id: r.id,
      text: r.text,
      question_type: r.question_type,
      points: r.points,
      exam_id: r.exam_id,
      exam_title: exam?.title ?? "—",
      course_code: course?.code ?? null,
    };
  });
};

// Returns the new question ids (in the same order as the input).
export const cloneQuestionsToExam = async (
  examId: string,
  sourceQuestionIds: string[],
): Promise<string[]> => {
  const { data, error } = await supabase.rpc("clone_questions_to_exam", {
    p_target_exam_id: examId,
    p_source_question_ids: sourceQuestionIds,
  });
  if (error) throw new Error(error.message);
  return (data as string[]) ?? [];
};

export const importQuestionsCSV = async (
  examId: string,
  file: File,
): Promise<Question[]> => {
  const csv_text = await file.text();
  const { data, error } = await supabase.functions.invoke("import-questions-csv", {
    body: { exam_id: examId, csv_text },
  });
  if (error) throw new Error(error.message);

  const ids = ((data as { created_question_ids?: string[] })?.created_question_ids) ?? [];
  if (ids.length === 0) return [];

  const { data: rows, error: fErr } = await supabase
    .from("questions")
    .select(`id, exam_id, text, question_type, order_index, points, options (id, text, is_correct, order_index)`)
    .in("id", ids);
  if (fErr) throw new Error(fErr.message);
  return ((rows ?? []) as (Question & { options: Option[] })[]).map((q) => ({
    ...q,
    options: (q.options ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  }));
};
