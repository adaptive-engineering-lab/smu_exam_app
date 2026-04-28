import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, SearchSelect, Select } from "../../components/ui";
import { listSchools } from "../../api/schools";
import { listDegrees } from "../../api/degrees";
import { listAllCoursesWithContext, listCourses } from "../../api/courses";
import type { CourseWithContext } from "../../api/courses";
import { createExam, deleteExam, listExams, togglePublish, updateExam } from "../../api/exams";
import { useStickyParam } from "../../hooks/useStickyParam";
import type { Course, Degree, Exam, School } from "../../api/types";

const CURRENT_YEAR = new Date().getFullYear();
const ACADEMIC_YEARS = Array.from({ length: 6 }, (_, i) => {
  const y = CURRENT_YEAR - 2 + i;
  return `${y}/${y + 1}`;
});

export function ExamsPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedSchool, setSelectedSchool] = useStickyParam("school", { storageKey: "picker.exams.school" });
  const [selectedDegree, setSelectedDegree] = useStickyParam("degree", { storageKey: "picker.exams.degree" });
  const [selectedCourse, setSelectedCourse] = useStickyParam("course", { storageKey: "picker.exams.course" });
  const [allCourses, setAllCourses] = useState<CourseWithContext[]>([]);

  function pickSchool(id: string) {
    setSelectedSchool(id);
    if (id !== selectedSchool) { setSelectedDegree(""); setSelectedCourse(""); }
  }
  function pickDegree(id: string) {
    setSelectedDegree(id);
    if (id !== selectedDegree) setSelectedCourse("");
  }

  // Course-code jump: pick all three cascade slots in one shot from a
  // CourseWithContext entry. The cascading effects below will fire and
  // load the matching degrees/courses lists.
  function jumpToCourse(c: CourseWithContext) {
    setSelectedSchool(c.school_id);
    setSelectedDegree(c.degree_id);
    setSelectedCourse(c.id);
  }
  const [form, setForm] = useState({ title: "", description: "", duration_minutes: 60, academic_year: "", available_from: "", available_until: "", shuffle_questions: false, shuffle_options: false });
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", duration_minutes: 60, academic_year: "", available_from: "", available_until: "", shuffle_questions: false, shuffle_options: false });

  useEffect(() => { listSchools().then(setSchools); }, []);
  useEffect(() => { listAllCoursesWithContext().then(setAllCourses).catch(() => {}); }, []);
  useEffect(() => {
    if (!selectedSchool) { setDegrees([]); return; }
    listDegrees(selectedSchool).then(setDegrees);
  }, [selectedSchool]);
  useEffect(() => {
    if (!selectedDegree) { setCourses([]); return; }
    listCourses(selectedDegree).then(setCourses);
  }, [selectedDegree]);
  useEffect(() => {
    if (!selectedCourse) { setExams([]); setShowForm(false); setYearFilter("all"); setStatusFilter("all"); return; }
    listExams(selectedCourse).then(setExams);
  }, [selectedCourse]);

  // Clear stale stored ids if the underlying lists no longer contain them.
  // The order matters: a stale school invalidates the dependent degree/course.
  useEffect(() => {
    if (schools.length === 0) return;
    if (selectedSchool && !schools.some((s) => s.id === selectedSchool)) {
      setSelectedSchool(""); setSelectedDegree(""); setSelectedCourse("");
    }
  }, [schools, selectedSchool, setSelectedSchool, setSelectedDegree, setSelectedCourse]);
  useEffect(() => {
    if (!selectedSchool || degrees.length === 0) return;
    if (selectedDegree && !degrees.some((d) => d.id === selectedDegree)) {
      setSelectedDegree(""); setSelectedCourse("");
    }
  }, [degrees, selectedSchool, selectedDegree, setSelectedDegree, setSelectedCourse]);
  useEffect(() => {
    if (!selectedDegree || courses.length === 0) return;
    if (selectedCourse && !courses.some((c) => c.id === selectedCourse)) setSelectedCourse("");
  }, [courses, selectedDegree, selectedCourse, setSelectedCourse]);

  const courseJumpItems = useMemo(
    () => allCourses.map((c) => ({
      value: c.id,
      label: `${c.code} — ${c.name}`,
      meta: c.school_name,
    })),
    [allCourses],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !selectedCourse) return;
    setLoading(true);
    try {
      const exam = await createExam({
        course_id: selectedCourse,
        ...form,
        academic_year: form.academic_year || null,
        available_from: form.available_from || null,
        available_until: form.available_until || null,
      });
      setExams((prev) => [exam, ...prev]);
      setForm({ title: "", description: "", duration_minutes: 60, academic_year: "", available_from: "", available_until: "", shuffle_questions: false, shuffle_options: false });
      setShowForm(false);
      toast.success("Exam created");
    } catch {
      toast.error("Failed to create exam");
    } finally {
      setLoading(false);
    }
  }

  function toDatetimeLocal(iso: string | null): string {
    if (!iso) return "";
    // Convert ISO string to datetime-local input format (YYYY-MM-DDTHH:MM)
    return iso.slice(0, 16);
  }

  function startEdit(exam: Exam) {
    setEditingId(exam.id);
    setEditForm({
      title: exam.title,
      description: exam.description ?? "",
      duration_minutes: exam.duration_minutes,
      academic_year: exam.academic_year ?? "",
      available_from: toDatetimeLocal(exam.available_from),
      available_until: toDatetimeLocal(exam.available_until),
      shuffle_questions: exam.shuffle_questions,
      shuffle_options: exam.shuffle_options,
    });
  }

  async function handleSaveEdit(e: React.FormEvent, examId: string) {
    e.preventDefault();
    try {
      const updated = await updateExam(examId, {
        ...editForm,
        academic_year: editForm.academic_year || null,
        available_from: editForm.available_from || null,
        available_until: editForm.available_until || null,
      });
      setExams((prev) => prev.map((ex) => (ex.id === examId ? updated : ex)));
      setEditingId(null);
      toast.success("Exam updated");
    } catch {
      toast.error("Failed to update exam");
    }
  }

  async function handleDelete(exam: Exam) {
    if (!window.confirm(`Delete "${exam.title}"? This cannot be undone.`)) return;
    try {
      await deleteExam(exam.id);
      setExams((prev) => prev.filter((e) => e.id !== exam.id));
      toast.success("Exam deleted");
    } catch {
      toast.error("Failed to delete exam");
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

  const academicYears = [...new Set(exams.map((e) => e.academic_year).filter(Boolean) as string[])].sort().reverse();
  const publishedCount = exams.filter((e) => e.is_published).length;
  const draftCount = exams.length - publishedCount;
  const visibleExams = exams.filter((e) => {
    if (yearFilter !== "all" && e.academic_year !== yearFilter) return false;
    if (statusFilter === "published" && !e.is_published) return false;
    if (statusFilter === "draft" && e.is_published) return false;
    return true;
  });

  return (
    <Layout>
      <PageHeader title="Exams" subtitle="Create and manage exams for your courses" />

      {/* Filters */}
      <Card className="mb-6">
        {courseJumpItems.length > 0 && (
          <div className="mb-4 pb-4 border-b border-slate-100">
            <SearchSelect
              label="Jump to course"
              placeholder="Type a course code (e.g. CA-101) or name…"
              items={courseJumpItems}
              value={selectedCourse}
              onChange={(id) => {
                if (!id) { setSelectedCourse(""); return; }
                const c = allCourses.find((x) => x.id === id);
                if (c) jumpToCourse(c);
              }}
            />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            onChange={pickDegree}
            disabled={!selectedSchool}
            items={degrees.map((d) => ({ value: d.id, label: d.name }))}
          />
          <SearchSelect
            label="Course"
            placeholder="— course —"
            value={selectedCourse}
            onChange={setSelectedCourse}
            disabled={!selectedDegree}
            items={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
          />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="Academic year" placeholder="— select year —" value={form.academic_year}
                    onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))}>
                    {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </Select>
                  <Input label="Description (optional)" placeholder="Brief instructions for students"
                    value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Available from (optional)" type="datetime-local" value={form.available_from}
                    onChange={(e) => setForm((f) => ({ ...f, available_from: e.target.value }))} />
                  <Input label="Available until (optional)" type="datetime-local" value={form.available_until}
                    onChange={(e) => setForm((f) => ({ ...f, available_until: e.target.value }))} />
                </div>
                <div className="flex flex-wrap gap-5">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                    <input type="checkbox" checked={form.shuffle_questions} className="accent-indigo-600"
                      onChange={(e) => setForm((f) => ({ ...f, shuffle_questions: e.target.checked }))} />
                    Shuffle question order
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                    <input type="checkbox" checked={form.shuffle_options} className="accent-indigo-600"
                      onChange={(e) => setForm((f) => ({ ...f, shuffle_options: e.target.checked }))} />
                    Shuffle answer options
                  </label>
                </div>
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
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 shrink-0">
            {selectedCourse ? `Exams (${visibleExams.length})` : "Exams"}
          </h2>
          {selectedCourse && exams.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex gap-1">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === "all" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                >All ({exams.length})</button>
                <button
                  onClick={() => setStatusFilter("published")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === "published" ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                >Published ({publishedCount})</button>
                <button
                  onClick={() => setStatusFilter("draft")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statusFilter === "draft" ? "bg-amber-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                >Drafts ({draftCount})</button>
              </div>
              {academicYears.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setYearFilter("all")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${yearFilter === "all" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                  >All years</button>
                  {academicYears.map((y) => (
                    <button
                      key={y}
                      onClick={() => setYearFilter(y)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${yearFilter === y ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >{y}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {!selectedCourse ? (
          <EmptyState icon="📝" title="Select a course" description="Choose a school, degree, and course to view its exams." />
        ) : visibleExams.length === 0 ? (
          <EmptyState icon="🗒️" title="No exams yet" description="Create the first exam for this course." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleExams.map((exam) => (
              <li key={exam.id}>
                <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-900">{exam.title}</p>
                      <Badge color={exam.is_published ? "emerald" : "amber"}>
                        {exam.is_published ? "Published" : "Draft"}
                      </Badge>
                      {exam.academic_year && (
                        <Badge color="sky">{exam.academic_year}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {exam.duration_minutes} min
                      {exam.available_from && <> · Opens {new Date(exam.available_from).toLocaleString()}</>}
                      {exam.available_until && <> · Closes {new Date(exam.available_until).toLocaleString()}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!exam.is_published && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => editingId === exam.id ? setEditingId(null) : startEdit(exam)}>
                          {editingId === exam.id ? "Cancel" : "Edit"}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(exam)}>
                          Delete
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/lecturer/exams/${exam.id}/build`)}>
                      Edit Questions
                    </Button>
                    {exam.is_published && (
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/lecturer/exams/${exam.id}/submissions`)}>
                        Submissions
                      </Button>
                    )}
                    <Button size="sm" variant={exam.is_published ? "ghost" : "success"} onClick={() => handleToggle(exam)}>
                      {exam.is_published ? "Unpublish" : "Publish"}
                    </Button>
                  </div>
                </div>
                {editingId === exam.id && (
                  <div className="px-5 pb-4 bg-slate-50 border-t border-slate-100">
                    <form onSubmit={(e) => handleSaveEdit(e, exam.id)} className="pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input label="Title" value={editForm.title}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} required />
                        <Input label="Duration (minutes)" type="number" min={1} value={editForm.duration_minutes}
                          onChange={(e) => setEditForm((f) => ({ ...f, duration_minutes: +e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Select label="Academic year" placeholder="— select year —" value={editForm.academic_year}
                          onChange={(e) => setEditForm((f) => ({ ...f, academic_year: e.target.value }))}>
                          {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </Select>
                        <Input label="Description (optional)" value={editForm.description}
                          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input label="Available from (optional)" type="datetime-local" value={editForm.available_from}
                          onChange={(e) => setEditForm((f) => ({ ...f, available_from: e.target.value }))} />
                        <Input label="Available until (optional)" type="datetime-local" value={editForm.available_until}
                          onChange={(e) => setEditForm((f) => ({ ...f, available_until: e.target.value }))} />
                      </div>
                      <div className="flex flex-wrap gap-5">
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                          <input type="checkbox" checked={editForm.shuffle_questions} className="accent-indigo-600"
                            onChange={(e) => setEditForm((f) => ({ ...f, shuffle_questions: e.target.checked }))} />
                          Shuffle question order
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                          <input type="checkbox" checked={editForm.shuffle_options} className="accent-indigo-600"
                            onChange={(e) => setEditForm((f) => ({ ...f, shuffle_options: e.target.checked }))} />
                          Shuffle answer options
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">Save</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Layout>
  );
}
