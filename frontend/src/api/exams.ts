import { apiFetch } from "./client";
import type { Exam, Question } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export const listExams = (courseId: string) =>
  apiFetch<Exam[]>(`/exams/by-course/${courseId}`);

export const getExam = (examId: string) =>
  apiFetch<Exam>(`/exams/${examId}`);

export const createExam = (payload: {
  course_id: string;
  title: string;
  description?: string;
  duration_minutes: number;
  available_from?: string | null;
  available_until?: string | null;
  academic_year?: string | null;
}) => apiFetch<Exam>("/exams", { method: "POST", body: JSON.stringify(payload) });

export const updateExam = (examId: string, payload: Partial<Exam>) =>
  apiFetch<Exam>(`/exams/${examId}`, { method: "PATCH", body: JSON.stringify(payload) });

export const togglePublish = (examId: string) =>
  apiFetch<Exam>(`/exams/${examId}/publish`, { method: "POST" });

export const listQuestions = (examId: string) =>
  apiFetch<Question[]>(`/exams/${examId}/questions`);

export const createQuestion = (
  examId: string,
  payload: { text: string; question_type: string; order_index: number; points: number; options: { text: string; is_correct: boolean; order_index: number }[] }
) => apiFetch<Question>(`/exams/${examId}/questions`, { method: "POST", body: JSON.stringify(payload) });

export const updateQuestion = (questionId: string, payload: object) =>
  apiFetch<Question>(`/questions/${questionId}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteQuestion = (questionId: string) =>
  apiFetch<void>(`/questions/${questionId}`, { method: "DELETE" });

export const deleteExam = (examId: string) =>
  apiFetch<void>(`/exams/${examId}`, { method: "DELETE" });

export async function importQuestionsCSV(examId: string, file: File): Promise<Question[]> {
  const token = localStorage.getItem("access_token");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/exams/${examId}/questions/csv`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

