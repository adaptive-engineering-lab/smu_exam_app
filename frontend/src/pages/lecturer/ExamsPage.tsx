import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "../../components/ui";
import { listSchools } from "../../api/schools";
import { listDegrees } from "../../api/degrees";
import { listCourses } from "../../api/courses";
import { createExam, listExams, togglePublish } from "../../api/exams";
import type { Course, Degree, Exam, School } from "../../api/types";

export function ExamsPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedDegree, setSelectedDegree] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [form, setForm] = useState({ title: "", description: "", duration_minutes: 60 });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { listSchools().then(setSchools); }, []);
  useEffect(() => {
    if (!selectedSchool) { setDegrees([]); return; }
    listDegrees(selectedSchool).then(setDegrees);
  }, [selectedSchool]);
  useEffect(() => {
    if (!selectedDegree) { setCourses([]); return; }
    listCourses(selectedDegree).then(setCourses);
  }, [selectedDegree]);
  useEffect(() => {
    if (!selectedCourse) { setExams([]); setShowForm(false); return; }
    listExams(selectedCourse).then(setExams);
  }, [selectedCourse]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !selectedCourse) return;
    setLoading(true);
    try {
      const exam = await createExam({ course_id: selectedCourse, ...form });
      setExams((prev) => [exam, ...prev]);
      setForm({ title: "", description: "", duration_minutes: 60 });
      setShowForm(false);
      toast.success("Exam created");
    } catch {
      toast.error("Failed to create exam");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(exam: Exam) {
    try {
      const updated = await togglePublish(exam.id);
      setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      toast.success(updated.is_published ? "Exam published" : "Unpublished");
    } catch {
      toast.error("Failed to update exam");
    }
  }

  return (
    <Layout>
      <PageHeader title="Exams" subtitle="Create and manage exams for your courses" />

      {/* Filters */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="School" placeholder="— school —" value={selectedSchool}
            onChange={(e) => { setSelectedSchool(e.target.value); setSelectedDegree(""); setSelectedCourse(""); }}>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Degree" placeholder="— degree —" value={selectedDegree}
            onChange={(e) => { setSelectedDegree(e.target.value); setSelectedCourse(""); }} disabled={!selectedSchool}>
            {degrees.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label="Course" placeholder="— course —" value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)} disabled={!selectedDegree}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </Select>
        </div>
      </Card>

      {selectedCourse && (
        <>
          {showForm ? (
            <Card className="mb-6">
              <CardHeader title="New Exam" action={
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              } />
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Exam title" placeholder="e.g. Midterm Examination" value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
                  <Input label="Duration (minutes)" type="number" min={1} value={form.duration_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, duration_minutes: +e.target.value }))} />
                </div>
                <Input label="Description (optional)" placeholder="Brief instructions for students"
                  value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                <div className="flex gap-2">
                  <Button type="submit" loading={loading}>Create Exam</Button>
                  <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          ) : (
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowForm(true)}>+ New Exam</Button>
            </div>
          )}
        </>
      )}

      <Card padding={false}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {selectedCourse ? `Exams (${exams.length})` : "Exams"}
          </h2>
        </div>
        {!selectedCourse ? (
          <EmptyState icon="📝" title="Select a course" description="Choose a school, degree, and course to view its exams." />
        ) : exams.length === 0 ? (
          <EmptyState icon="🗒️" title="No exams yet" description="Create the first exam for this course." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {exams.map((exam) => (
              <li key={exam.id} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">{exam.title}</p>
                    <Badge color={exam.is_published ? "emerald" : "amber"}>
                      {exam.is_published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">{exam.duration_minutes} min</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/lecturer/exams/${exam.id}/build`)}>
                    Edit Questions
                  </Button>
                  <Button size="sm" variant={exam.is_published ? "ghost" : "success"} onClick={() => handleToggle(exam)}>
                    {exam.is_published ? "Unpublish" : "Publish"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Layout>
  );
}
