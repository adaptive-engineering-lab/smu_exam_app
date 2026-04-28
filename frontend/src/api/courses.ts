import { supabase } from "../lib/supabase";
import type { Course, Enrollment } from "./types";

export type StudentSummary = { id: string; email: string; name: string | null };

export const listStudents = async (): Promise<StudentSummary[]> => {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, name")
    .eq("role", "student")
    .order("email");
  if (error) throw new Error(error.message);
  return (data ?? []) as StudentSummary[];
};

// Flat list of every course the caller can read, joined to its degree +
// school for display context. Powers the course-code jump shortcut on
// /lecturer/exams (type "CA-101", get the school + degree + course in
// one shot). PostgREST caps responses at 1000 rows by default — bumped
// here so big institutions don't get silently truncated.
export type CourseWithContext = {
  id: string;
  code: string;
  name: string;
  degree_id: string;
  degree_name: string;
  school_id: string;
  school_name: string;
};

export const listAllCoursesWithContext = async (): Promise<CourseWithContext[]> => {
  const { data, error } = await supabase
    .from("courses")
    .select(`
      id, code, name, degree_id,
      degrees:degree_id (
        name,
        school_id,
        schools:school_id (name)
      )
    `)
    .order("code")
    .limit(10000);
  if (error) throw new Error(error.message);

  type JoinedSchool = { name: string };
  type JoinedDegree = {
    name: string;
    school_id: string;
    schools: JoinedSchool | JoinedSchool[] | null;
  };
  type Row = {
    id: string; code: string; name: string; degree_id: string;
    degrees: JoinedDegree | JoinedDegree[] | null;
  };
  return ((data ?? []) as unknown as Row[]).flatMap((r) => {
    const deg = Array.isArray(r.degrees) ? r.degrees[0] ?? null : r.degrees;
    if (!deg) return [];
    const sch = Array.isArray(deg.schools) ? deg.schools[0] ?? null : deg.schools;
    return [{
      id: r.id,
      code: r.code,
      name: r.name,
      degree_id: r.degree_id,
      degree_name: deg.name,
      school_id: deg.school_id,
      school_name: sch?.name ?? "",
    }];
  });
};

export const listCourses = async (degreeId: string): Promise<Course[]> => {
  const { data, error } = await supabase
    .from("courses")
    .select("id, degree_id, lecturer_id, name, code")
    .eq("degree_id", degreeId)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as Course[];
};

export const createCourse = async (
  degree_id: string,
  name: string,
  code: string,
  lecturer_id?: string,
): Promise<Course> => {
  const { data, error } = await supabase
    .from("courses")
    .insert({ degree_id, name, code, lecturer_id: lecturer_id ?? null })
    .select("id, degree_id, lecturer_id, name, code")
    .single();
  if (error) throw new Error(error.message);
  return data as Course;
};

export const enrollStudent = async (
  courseId: string,
  student_id: string,
): Promise<Enrollment> => {
  const { data, error } = await supabase
    .from("enrollments")
    .insert({ course_id: courseId, student_id })
    .select("id, student_id, course_id")
    .single();
  if (error) throw new Error(error.message);
  return data as Enrollment;
};

export const listEnrollments = async (courseId: string): Promise<StudentSummary[]> => {
  const { data, error } = await supabase
    .from("enrollments")
    .select("users:student_id (id, email, name)")
    .eq("course_id", courseId);
  if (error) throw new Error(error.message);
  // PostgREST may return the embed as an object or a 1-element array
  // depending on schema introspection of the FK; handle both.
  type Joined = { users: StudentSummary | StudentSummary[] | null };
  return ((data ?? []) as unknown as Joined[])
    .map((r) => (Array.isArray(r.users) ? r.users[0] ?? null : r.users))
    .filter((u): u is StudentSummary => u !== null)
    .sort((a, b) => a.email.localeCompare(b.email));
};

export const assignInstructor = async (
  courseId: string,
  lecturer_id: string | null,
): Promise<Course> => {
  const { data, error } = await supabase
    .from("courses")
    .update({ lecturer_id })
    .eq("id", courseId)
    .select("id, degree_id, lecturer_id, name, code")
    .single();
  if (error) throw new Error(error.message);
  return data as Course;
};

export type BulkEnrolResult = {
  enrolled: string[];
  not_found: string[];
  already_enrolled: string[];
};

// Bulk enrol by email. We resolve emails to user ids via PostgREST, then
// upsert enrollments with on-conflict-ignore. Race-free atomicity isn't
// guaranteed across the two queries, but conflicts are detected and
// returned as already_enrolled.
export const enrollBulk = async (
  courseId: string,
  emails: string[],
): Promise<BulkEnrolResult> => {
  const cleaned = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (cleaned.length === 0) {
    return { enrolled: [], not_found: [], already_enrolled: [] };
  }

  const { data: matched, error: lookupErr } = await supabase
    .from("users")
    .select("id, email")
    .in("email", cleaned)
    .eq("role", "student");
  if (lookupErr) throw new Error(lookupErr.message);

  const matchedRows = (matched ?? []) as { id: string; email: string }[];
  const matchedEmails = new Set(matchedRows.map((u) => u.email.toLowerCase()));
  const notFound = cleaned.filter((e) => !matchedEmails.has(e));

  if (matchedRows.length === 0) {
    return { enrolled: [], not_found: notFound, already_enrolled: [] };
  }

  // Find which of the matched users are already enrolled.
  const { data: existing, error: exErr } = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("course_id", courseId)
    .in("student_id", matchedRows.map((u) => u.id));
  if (exErr) throw new Error(exErr.message);
  const alreadyIds = new Set(((existing ?? []) as { student_id: string }[]).map((r) => r.student_id));
  const toEnrol = matchedRows.filter((u) => !alreadyIds.has(u.id));
  const alreadyEnrolledEmails = matchedRows
    .filter((u) => alreadyIds.has(u.id))
    .map((u) => u.email);

  if (toEnrol.length > 0) {
    const { error: insErr } = await supabase
      .from("enrollments")
      .insert(toEnrol.map((u) => ({ course_id: courseId, student_id: u.id })));
    if (insErr) throw new Error(insErr.message);
  }

  return {
    enrolled: toEnrol.map((u) => u.email),
    not_found: notFound,
    already_enrolled: alreadyEnrolledEmails,
  };
};
