import { apiFetch } from "./client";
import type { AnswerPayload, AttemptWithQuestions, ExamAttempt } from "./types";

export const beginAttempt = (examId: string) =>
  apiFetch<ExamAttempt>(`/attempts/exams/${examId}/attempt`, { method: "POST" });

export const getAttempt = (attemptId: string) =>
  apiFetch<AttemptWithQuestions>(`/attempts/${attemptId}`);

export const bulkSaveAnswers = (attemptId: string, answers: AnswerPayload[]) =>
  apiFetch(`/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: JSON.stringify({ answers }),
  });

export const submitAttempt = (attemptId: string) =>
  apiFetch<ExamAttempt>(`/attempts/${attemptId}/submit`, { method: "POST" });

export const logIntegrity = (attemptId: string, event_type: string) =>
  apiFetch(`/attempts/${attemptId}/integrity`, {
    method: "POST",
    body: JSON.stringify({ event_type }),
  });

export const listSubmissions = (examId: string) =>
  apiFetch<ExamAttempt[]>(`/exams/${examId}/submissions`);
