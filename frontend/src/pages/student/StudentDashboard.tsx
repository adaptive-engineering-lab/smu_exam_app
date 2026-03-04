import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Button, Card, EmptyState, PageHeader } from "../../components/ui";
import { beginAttempt } from "../../api/attempts";
import { apiFetch } from "../../api/client";
import type { Exam } from "../../api/types";

export function StudentDashboard() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Exam[]>("/student/available-exams")
      .then(setExams)
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
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
          {exams.map((exam) => (
            <li key={exam.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">{exam.title}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                      </svg>
                      {exam.duration_minutes} minutes
                    </span>
                    {exam.available_until && (
                      <span className="text-xs text-red-500 font-medium">
                        Due {new Date(exam.available_until).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {exam.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{exam.description}</p>
                  )}
                </div>
                <Button
                  onClick={() => handleBegin(exam.id)}
                  loading={starting === exam.id}
                  className="shrink-0 ml-4"
                >
                  Begin Exam
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
