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
