import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, SearchSelect, Select } from "../../components/ui";
import { listSchools } from "../../api/schools";
import { listDegrees } from "../../api/degrees";
import { assignInstructor, createCourse, enrollBulk, enrollStudent, listCourses, listEnrollments, listStudents } from "../../api/courses";
import type { BulkEnrolResult, StudentSummary } from "../../api/courses";
import { listUsers } from "../../api/users";
import { useStickyParam } from "../../hooks/useStickyParam";
import type { Course, Degree, School, User } from "../../api/types";

export function CoursesPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSchool, setSelectedSchool] = useStickyParam("school", { storageKey: "picker.courses.school" });
  const [selectedDegree, setSelectedDegree] = useStickyParam("degree", { storageKey: "picker.courses.degree" });

  function pickSchool(id: string) {
    setSelectedSchool(id);
    if (id !== selectedSchool) setSelectedDegree("");
  }
  const [form, setForm] = useState({ name: "", code: "", lecturer_id: "" });
  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewCourseId, setViewCourseId] = useState("");
  const [enrolled, setEnrolled] = useState<StudentSummary[]>([]);
  const [bulkCourseId, setBulkCourseId] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkEnrolResult | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [lecturers, setLecturers] = useState<User[]>([]);
  const [assignCourseId, setAssignCourseId] = useState<string | null>(null);
  const [assignLecturerId, setAssignLecturerId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => { listSchools().then(setSchools); }, []);
  useEffect(() => { listUsers("lecturer").then(setLecturers).catch(() => {}); }, []);
  useEffect(() => { listStudents().then(setStudents).catch(() => {}); }, []);
  useEffect(() => {
    if (!selectedSchool) { setDegrees([]); return; }
    listDegrees(selectedSchool).then(setDegrees);
  }, [selectedSchool]);
  useEffect(() => {
    if (!selectedDegree) { setCourses([]); return; }
    listCourses(selectedDegree).then(setCourses);
  }, [selectedDegree]);

  // Clear stale stored ids if the underlying lists no longer contain them.
  useEffect(() => {
    if (schools.length === 0) return;
    if (selectedSchool && !schools.some((s) => s.id === selectedSchool)) {
      setSelectedSchool("");
      setSelectedDegree("");
    }
  }, [schools, selectedSchool, setSelectedSchool, setSelectedDegree]);
  useEffect(() => {
    if (!selectedSchool || degrees.length === 0) return;
    if (selectedDegree && !degrees.some((d) => d.id === selectedDegree)) setSelectedDegree("");
  }, [degrees, selectedSchool, selectedDegree, setSelectedDegree]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.code || !selectedDegree) return;
    setLoading(true);
    try {
      const course = await createCourse(selectedDegree, form.name, form.code, form.lecturer_id || undefined);
      setCourses((prev) => [...prev, course]);
      setForm({ name: "", code: "", lecturer_id: "" });
      toast.success("Course created");
    } catch {
      toast.error("Course code may already exist");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollCourseId || !studentId.trim()) return;
    try {
      await enrollStudent(enrollCourseId, studentId.trim());
      setStudentId("");
      setEnrollCourseId("");
      toast.success("Student enrolled successfully");
      if (viewCourseId === enrollCourseId) {
        listEnrollments(viewCourseId).then(setEnrolled);
      }
    } catch {
      toast.error("Failed to enroll student");
    }
  }

  function handleViewCourse(courseId: string) {
    if (viewCourseId === courseId) {
      setViewCourseId("");
      setEnrolled([]);
      return;
    }
    setViewCourseId(courseId);
    listEnrollments(courseId).then(setEnrolled).catch(() => toast.error("Failed to load enrollments"));
  }

  async function handleAssignInstructor(courseId: string) {
    setAssignLoading(true);
    try {
      const updated = await assignInstructor(courseId, assignLecturerId || null);
      setCourses((prev) => prev.map((c) => c.id === courseId ? updated : c));
      toast.success(assignLecturerId ? "Instructor assigned" : "Instructor removed");
      setAssignCourseId(null);
      setAssignLecturerId("");
    } catch {
      toast.error("Failed to assign instructor");
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleBulkEnrol(e: React.FormEvent) {
    e.preventDefault();
    const emails = bulkEmails.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const result = await enrollBulk(bulkCourseId, emails);
      setBulkResult(result);
      setBulkEmails("");
      if (result.enrolled.length > 0) toast.success(`${result.enrolled.length} student(s) enrolled`);
      if (viewCourseId === bulkCourseId) listEnrollments(bulkCourseId).then(setEnrolled);
    } catch {
      toast.error("Bulk enrol failed");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <Layout>
      <PageHeader title="Courses" subtitle="Create courses and enrol students" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left sidebar */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader title="Filter" />
            <div className="space-y-3">
              <SearchSelect
                label="School"
                placeholder="— school —"
                value={selectedSchool}
                onChange={pickSchool}
                items={schools.map((s) => ({ value: s.id, label: s.name }))}
              />
              <SearchSelect
                label="Degree"
                placeholder="— degree —"
                value={selectedDegree}
                onChange={setSelectedDegree}
                disabled={!selectedSchool}
                items={degrees.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
          </Card>

          {selectedDegree && (
            <Card>
              <CardHeader title="Add Course" />
              <form onSubmit={handleCreate} className="space-y-3">
                <Input label="Course name" placeholder="e.g. Anatomy I" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                <Input label="Course code" placeholder="e.g. ANT101" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required />
                <Select
                  label="Lecturer (optional)"
                  value={form.lecturer_id}
                  onChange={(e) => setForm((f) => ({ ...f, lecturer_id: e.target.value }))}
                >
                  <option value="">— none —</option>
                  {lecturers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name ? `${l.name} (${l.email})` : l.email}
                    </option>
                  ))}
                </Select>
                <Button type="submit" loading={loading} className="w-full">Create Course</Button>
              </form>
            </Card>
          )}
        </div>

        {/* Courses list */}
        <div className="lg:col-span-2 space-y-4">
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Courses
                <span className="ml-2 text-sm font-normal text-slate-400">({courses.length})</span>
              </h2>
            </div>

            {!selectedDegree ? (
              <EmptyState icon="📚" title="Select a degree" description="Choose a school and degree to view courses." />
            ) : courses.length === 0 ? (
              <EmptyState icon="📖" title="No courses yet" description="Add the first course for this degree." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {courses.map((c) => {
                  const lecturer = lecturers.find((l) => l.id === c.lecturer_id);
                  return (
                  <li key={c.id}>
                    <div className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge color="indigo">{c.code}</Badge>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-slate-800">{c.name}</span>
                          {lecturer ? (
                            <p className="text-xs text-slate-400">{lecturer.name || lecturer.email}</p>
                          ) : (
                            <p className="text-xs text-slate-300 italic">No lecturer assigned</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => {
                          setAssignCourseId(assignCourseId === c.id ? null : c.id);
                          setAssignLecturerId(c.lecturer_id ?? "");
                        }}>
                          Lecturer
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleViewCourse(c.id)}>
                          {viewCourseId === c.id ? "Hide Students" : "Students"}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEnrollCourseId(c.id)}>
                          Enrol
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setBulkCourseId(c.id); setBulkResult(null); setBulkEmails(""); }}>
                          Bulk Enrol
                        </Button>
                      </div>
                    </div>
                    {assignCourseId === c.id && (
                      <div className="px-5 pb-3 pt-2 bg-slate-50 border-t border-slate-100 flex items-end gap-2">
                        <Select
                          label="Assign lecturer"
                          value={assignLecturerId}
                          onChange={(e) => setAssignLecturerId(e.target.value)}
                          className="flex-1"
                        >
                          <option value="">— none (unassign) —</option>
                          {lecturers.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name ? `${l.name} (${l.email})` : l.email}
                            </option>
                          ))}
                        </Select>
                        <Button size="sm" loading={assignLoading} onClick={() => handleAssignInstructor(c.id)}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => setAssignCourseId(null)}>Cancel</Button>
                      </div>
                    )}
                    {viewCourseId === c.id && (
                      <div className="px-5 pb-3 bg-slate-50 border-t border-slate-100">
                        {enrolled.length === 0 ? (
                          <p className="text-xs text-slate-400 py-2">No students enrolled yet.</p>
                        ) : (
                          <ul className="mt-2 space-y-1">
                            {enrolled.map((s) => (
                              <li key={s.id} className="text-sm text-slate-700 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                                {s.name ? <><span className="font-medium">{s.name}</span> <span className="text-slate-400">({s.email})</span></> : s.email}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Enrol modal */}
          {enrollCourseId && (
            <Card>
              <CardHeader
                title={`Enrol Student in ${courses.find((c) => c.id === enrollCourseId)?.code ?? ""}`}
                action={<button onClick={() => setEnrollCourseId("")} className="text-slate-400 hover:text-slate-600">✕</button>}
              />
              <form onSubmit={handleEnroll} className="flex gap-2">
                <Select
                  placeholder="— select student —"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="flex-1"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.email}</option>
                  ))}
                </Select>
                <Button type="submit" variant="success" disabled={!studentId}>Enrol</Button>
              </form>
            </Card>
          )}

          {/* Bulk enrol */}
          {bulkCourseId && (
            <Card>
              <CardHeader
                title={`Bulk Enrol — ${courses.find((c) => c.id === bulkCourseId)?.code ?? ""}`}
                action={<button onClick={() => { setBulkCourseId(""); setBulkResult(null); }} className="text-slate-400 hover:text-slate-600">✕</button>}
              />
              <form onSubmit={handleBulkEnrol} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Student emails (one per line or comma-separated)</label>
                  <textarea
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={5}
                    placeholder={"student1@university.edu\nstudent2@university.edu"}
                    value={bulkEmails}
                    onChange={(e) => setBulkEmails(e.target.value)}
                  />
                </div>
                <Button type="submit" loading={bulkLoading} disabled={!bulkEmails.trim()}>Enrol All</Button>
              </form>
              {bulkResult && (
                <div className="mt-4 space-y-2 text-sm">
                  {bulkResult.enrolled.length > 0 && (
                    <div className="text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                      <span className="font-medium">Enrolled ({bulkResult.enrolled.length}):</span> {bulkResult.enrolled.join(", ")}
                    </div>
                  )}
                  {bulkResult.already_enrolled.length > 0 && (
                    <div className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                      <span className="font-medium">Already enrolled ({bulkResult.already_enrolled.length}):</span> {bulkResult.already_enrolled.join(", ")}
                    </div>
                  )}
                  {bulkResult.not_found.length > 0 && (
                    <div className="text-red-700 bg-red-50 rounded-lg px-3 py-2">
                      <span className="font-medium">Not found ({bulkResult.not_found.length}):</span> {bulkResult.not_found.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
