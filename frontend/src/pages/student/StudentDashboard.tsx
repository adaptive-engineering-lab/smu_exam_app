import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Button, Card, EmptyState, PageHeader } from "../../components/ui";
import { beginAttempt, mySubmissions } from "../../api/attempts";
import type { StudentSubmission } from "../../api/attempts";
import { apiFetch } from "../../api/client";
import type { Exam } from "../../api/types";

export function StudentDashboard() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);

  useEffect(() => {
    apiFetch<Exam[]>("/student/available-exams")
      .then(setExams)
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
    mySubmissions().then(setSubmissions).catch(() => {});
  }, []);

  async function handleBegin(examId: string) {
    setStarting(examId);
    try {
      const attempt = await beginAttempt(examId);
      navigate(`/student/attempt/${attempt.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start exam");
      setStarting(null);
    }
  }

  const submittedExamIds = new Set(submissions.map((s) => s.exam_id));

  return (
    <Layout>
      <PageHeader title="My Exams" subtitle="Available examinations for your enrolled courses" />

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white border border-slate-200 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && exams.length === 0 && (
        <Card>
          <EmptyState
            icon="📚"
            title="No exams available"
            description="You are not enrolled in any courses with published exams. Contact your administrator."
          />
        </Card>
      )}

      {!loading && exams.length > 0 && (
        <ul className="space-y-3">
          {exams.map((exam) => {
            const isSubmitted = submittedExamIds.has(exam.id);
            return (
              <li key={exam.id}>
                <Card className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{exam.title}</p>
                      {isSubmitted && (
                        <span className="text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                          Submitted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        {exam.duration_minutes} min
                      </span>
                      {exam.academic_year && (
                        <span className="text-xs text-slate-500">{exam.academic_year}</span>
                      )}
                      {exam.available_until && (
                        <span className={`text-xs font-medium ${isSubmitted ? "text-slate-400" : "text-red-500"}`}>
                          Due {new Date(exam.available_until).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {exam.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{exam.description}</p>
                    )}
                  </div>
                  {isSubmitted ? (
                    <div className="shrink-0 ml-4 flex items-center gap-1.5 text-emerald-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm font-medium">Done</span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleBegin(exam.id)}
                      loading={starting === exam.id}
                      className="shrink-0 ml-4"
                    >
                      Begin Exam
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Past Submissions</h2>
        {submissions.length === 0 ? (
          <Card>
            <EmptyState icon="🗒️" title="No submissions yet" description="Your submitted exams will appear here." />
          </Card>
        ) : (
          <ul className="space-y-2">
            {submissions.map((s) => (
              <li key={s.id}>
                <Card className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.exam_title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Submitted {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {s.tab_switches > 0 && (
                      <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {s.tab_switches} tab switch{s.tab_switches !== 1 ? "es" : ""}
                      </span>
                    )}
                    {s.disconnect_events > 0 && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        {s.disconnect_events} disconnect{s.disconnect_events !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
