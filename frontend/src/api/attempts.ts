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

export const listSubmissions = (examId: string) =>
  apiFetch<SubmissionSummary[]>(`/exams/${examId}/submissions`);

export type StudentSubmission = {
  id: string;
  exam_id: string;
  exam_title: string;
  submitted_at: string | null;
  tab_switches: number;
  disconnect_events: number;
};

export const mySubmissions = () =>
  apiFetch<StudentSubmission[]>("/student/submissions");
