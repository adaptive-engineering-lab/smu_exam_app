import { apiFetch } from "./client";
import type { Course, Enrollment } from "./types";

export type StudentSummary = { id: string; email: string };

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
