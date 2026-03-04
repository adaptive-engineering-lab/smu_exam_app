import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader } from "../../components/ui";
import { createQuestion, deleteQuestion, getExam, listQuestions } from "../../api/exams";
import type { Exam, Question } from "../../api/types";

type QType = "mcq" | "true_false" | "short_answer";
type OptionDraft = { text: string; is_correct: boolean };

const emptyDraft = () => ({
  text: "",
  question_type: "mcq" as QType,
  points: 1,
  options: [{ text: "", is_correct: false }, { text: "", is_correct: false }] as OptionDraft[],
});

const TYPE_LABELS: Record<QType, string> = { mcq: "MCQ", true_false: "True / False", short_answer: "Short Answer" };

export function ExamBuilderPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!examId) return;
    getExam(examId).then(setExam).catch(() => toast.error("Failed to load exam"));
    listQuestions(examId).then(setQuestions).catch(() => toast.error("Failed to load questions"));
  }, [examId]);

  function setType(t: QType) {
    if (t === "true_false") {
      setDraft((d) => ({ ...d, question_type: t, options: [{ text: "True", is_correct: false }, { text: "False", is_correct: false }] }));
    } else if (t === "short_answer") {
      setDraft((d) => ({ ...d, question_type: t, options: [] }));
    } else {
      setDraft((d) => ({ ...d, question_type: t, options: d.options.length >= 2 ? d.options : [{ text: "", is_correct: false }, { text: "", is_correct: false }] }));
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!examId || !draft.text.trim()) return;
    setSaving(true);
    try {
      const q = await createQuestion(examId, {
        text: draft.text,
        question_type: draft.question_type,
        order_index: questions.length,
        points: draft.points,
        options: draft.options.map((o, i) => ({ ...o, order_index: i })),
      });
      setQuestions((prev) => [...prev, q]);
      setDraft(emptyDraft());
      setShowForm(false);
      toast.success("Question added");
    } catch {
      toast.error("Failed to add question");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(qId: string) {
    try {
      await deleteQuestion(qId);
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      toast.success("Question deleted");
    } catch {
      toast.error("Failed to delete question");
    }
  }

  return (
    <Layout>
      <PageHeader
        title={exam?.title ?? "Exam Builder"}
        subtitle={exam ? `${exam.duration_minutes} min · ${questions.length} question${questions.length !== 1 ? "s" : ""}` : undefined}
        action={<Button variant="secondary" onClick={() => navigate(-1)}>← Back to Exams</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add question panel */}
        <div className="lg:col-span-1">
          {showForm ? (
            <Card>
              <CardHeader title="New Question" action={
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              } />
              <form onSubmit={handleAdd} className="space-y-4">
                {/* Type selector */}
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Type</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["mcq", "true_false", "short_answer"] as QType[]).map((t) => (
                      <button key={t} type="button" onClick={() => setType(t)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                          ${draft.question_type === t
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}>
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <Input label="Points" type="number" min={1} value={draft.points}
                  onChange={(e) => setDraft((d) => ({ ...d, points: +e.target.value }))} />

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Question text</label>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={3} placeholder="Enter the question…"
                    value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} required
                  />
                </div>

                {draft.question_type !== "short_answer" && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Options {draft.question_type === "mcq" ? "(check correct)" : "(select correct)"}
                    </p>
                    <div className="space-y-2">
                      {draft.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type={draft.question_type === "mcq" ? "checkbox" : "radio"} name="correct"
                            checked={opt.is_correct} className="accent-indigo-600 shrink-0"
                            onChange={() => setDraft((d) => ({
                              ...d,
                              options: d.options.map((o, j) =>
                                draft.question_type === "true_false"
                                  ? { ...o, is_correct: j === i }
                                  : j === i ? { ...o, is_correct: !o.is_correct } : o
                              ),
                            }))}
                          />
                          <input
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder={`Option ${i + 1}`} value={opt.text}
                            disabled={draft.question_type === "true_false"}
                            onChange={(e) => setDraft((d) => ({ ...d, options: d.options.map((o, j) => j === i ? { ...o, text: e.target.value } : o) }))}
                          />
                          {draft.question_type === "mcq" && draft.options.length > 2 && (
                            <button type="button" onClick={() => setDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}
                              className="text-red-400 hover:text-red-600 text-sm">✕</button>
                          )}
                        </div>
                      ))}
                      {draft.question_type === "mcq" && (
                        <button type="button" onClick={() => setDraft((d) => ({ ...d, options: [...d.options, { text: "", is_correct: false }] }))}
                          className="text-xs text-indigo-600 hover:underline font-medium">+ Add option</button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button type="submit" loading={saving} className="flex-1">Add Question</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          ) : (
            <Button onClick={() => setShowForm(true)} className="w-full">+ Add Question</Button>
          )}
        </div>

        {/* Questions list */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Questions ({questions.length})</h2>
            </div>
            {questions.length === 0 ? (
              <EmptyState icon="❓" title="No questions yet" description="Add your first question using the panel on the left." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {questions.map((q, i) => (
                  <li key={q.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="text-xs font-bold text-slate-400 shrink-0 mt-0.5">Q{i + 1}</span>
                        <p className="text-sm font-medium text-slate-800 leading-snug">{q.text}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge color="slate">{TYPE_LABELS[q.question_type as QType]}</Badge>
                        <Badge color="indigo">{q.points}pt</Badge>
                        <button onClick={() => handleDelete(q.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">Delete</button>
                      </div>
                    </div>
                    {q.options.length > 0 && (
                      <ul className="ml-5 space-y-1">
                        {q.options.map((o) => (
                          <li key={o.id} className={`flex items-center gap-1.5 text-xs ${o.is_correct ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>
                            <span>{o.is_correct ? "✓" : "○"}</span> {o.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
