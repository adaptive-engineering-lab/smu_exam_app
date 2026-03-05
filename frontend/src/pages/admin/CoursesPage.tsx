import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "../../components/ui";
import { listSchools } from "../../api/schools";
import { listDegrees } from "../../api/degrees";
import { createCourse, enrollStudent, listCourses, listStudents } from "../../api/courses";
import type { StudentSummary } from "../../api/courses";
import type { Course, Degree, School } from "../../api/types";

export function CoursesPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedDegree, setSelectedDegree] = useState("");
  const [form, setForm] = useState({ name: "", code: "", lecturer_id: "" });
  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listSchools().then(setSchools); }, []);
  useEffect(() => { listStudents().then(setStudents).catch(() => {}); }, []);
  useEffect(() => {
    if (!selectedSchool) { setDegrees([]); setSelectedDegree(""); return; }
    listDegrees(selectedSchool).then(setDegrees);
  }, [selectedSchool]);
  useEffect(() => {
    if (!selectedDegree) { setCourses([]); return; }
    listCourses(selectedDegree).then(setCourses);
  }, [selectedDegree]);

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
    } catch {
      toast.error("Failed to enroll student");
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
              <Select
                label="School"
                placeholder="— school —"
                value={selectedSchool}
                onChange={(e) => { setSelectedSchool(e.target.value); setSelectedDegree(""); }}
              >
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select
                label="Degree"
                placeholder="— degree —"
                value={selectedDegree}
                onChange={(e) => setSelectedDegree(e.target.value)}
                disabled={!selectedSchool}
              >
                {degrees.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
          </Card>

          {selectedDegree && (
            <Card>
              <CardHeader title="Add Course" />
              <form onSubmit={handleCreate} className="space-y-3">
                <Input label="Course name" placeholder="e.g. Anatomy I" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                <Input label="Course code" placeholder="e.g. ANT101" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required />
                <Input label="Lecturer ID (optional)" placeholder="UUID" value={form.lecturer_id} onChange={(e) => setForm((f) => ({ ...f, lecturer_id: e.target.value }))} />
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
                {courses.map((c) => (
                  <li key={c.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Badge color="indigo">{c.code}</Badge>
                      <span className="text-sm font-medium text-slate-800">{c.name}</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setEnrollCourseId(c.id)}>
                      Enrol Student
                    </Button>
                  </li>
                ))}
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
        </div>
      </div>
    </Layout>
  );
}
