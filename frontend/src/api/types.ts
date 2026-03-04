export interface User {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "lecturer" | "student";
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface School {
  id: string;
  name: string;
}

export interface Degree {
  id: string;
  school_id: string;
  name: string;
}

export interface Course {
  id: string;
  degree_id: string;
  lecturer_id: string | null;
  name: string;
  code: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
}

export interface Exam {
  id: string;
  course_id: string;
  created_by: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  available_from: string | null;
  available_until: string | null;
  is_published: boolean;
  created_at: string;
}

export interface Option {
  id: string;
  text: string;
  is_correct: boolean;
  order_index: number;
}

export interface Question {
  id: string;
  exam_id: string;
  text: string;
  question_type: "mcq" | "true_false" | "short_answer";
  order_index: number;
  points: number;
  options: Option[];
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  is_submitted: boolean;
  tab_switches: number;
  disconnect_events: number;
}

export interface AttemptWithQuestions extends ExamAttempt {
  exam_title: string;
  duration_minutes: number;
  questions: Question[];
}

export interface AnswerPayload {
  question_id: string;
  answer_text?: string;
  selected_option_id?: string;
}

export interface BulkAnswerRequest {
  answers: AnswerPayload[];
}
