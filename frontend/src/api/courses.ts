import { apiFetch } from "./client";
import type { Course, Enrollment } from "./types";

export type StudentSummary = { id: string; email: string; name: string | null };

export const listStudents = () => apiFetch<StudentSummary[]>("/users/students");

export const listCourses = (degreeId: string) =>
  apiFetch<Course[]>(`/courses/by-degree/${degreeId}`);

export const createCourse = (degree_id: string, name: string, code: string, lecturer_id?: string) =>
  apiFetch<Course>("/courses", {
    method: "POST",
    body: JSON.stringify({ degree_id, name, code, lecturer_id }),
  });

export const enrollStudent = (courseId: string, student_id: string) =>
  apiFetch<Enrollment>(`/courses/${courseId}/enroll`, {
    method: "POST",
    body: JSON.stringify({ student_id }),
  });

export const listEnrollments = (courseId: string) =>
  apiFetch<StudentSummary[]>(`/courses/${courseId}/enrollments`);

export const assignInstructor = (courseId: string, lecturer_id: string | null) =>
  apiFetch<Course>(`/courses/${courseId}/instructor`, {
    method: "PATCH",
    body: JSON.stringify({ lecturer_id }),
  });

export type BulkEnrolResult = { enrolled: string[]; not_found: string[]; already_enrolled: string[] };

export const enrollBulk = (courseId: string, emails: string[]) =>
  apiFetch<BulkEnrolResult>(`/courses/${courseId}/enroll-bulk`, {
    method: "POST",
    body: JSON.stringify({ emails }),
  });
