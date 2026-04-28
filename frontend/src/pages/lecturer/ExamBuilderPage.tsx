import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader } from "../../components/ui";
import { cloneQuestionsToExam, createQuestion, deleteQuestion, getExam, importQuestionsCSV, listBankQuestions, listQuestions, updateQuestion } from "../../api/exams";
import type { BankQuestion } from "../../api/exams";
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
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft());
  const [csvImporting, setCsvImporting] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [bankItems, setBankItems] = useState<BankQuestion[] | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankSelected, setBankSelected] = useState<Set<string>>(new Set());
  const [bankLoading, setBankLoading] = useState(false);
  const [bankAdding, setBankAdding] = useState(false);

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

  function startEdit(q: Question) {
    setEditingQuestion(q);
    setEditDraft({
      text: q.text,
      question_type: q.question_type as QType,
      points: q.points,
      options: q.options.map((o) => ({ text: o.text, is_correct: o.is_correct })),
    });
  }

  function setEditType(t: QType) {
    if (t === "true_false") {
      setEditDraft((d) => ({ ...d, question_type: t, options: [{ text: "True", is_correct: false }, { text: "False", is_correct: false }] }));
    } else if (t === "short_answer") {
      setEditDraft((d) => ({ ...d, question_type: t, options: [] }));
    } else {
      setEditDraft((d) => ({ ...d, question_type: t, options: d.options.length >= 2 ? d.options : [{ text: "", is_correct: false }, { text: "", is_correct: false }] }));
    }
  }

  async function openBank() {
    setShowBank(true);
    setBankSelected(new Set());
    setBankSearch("");
    if (bankItems !== null) return; // already loaded this session
    setBankLoading(true);
    try {
      const rows = await listBankQuestions(examId ?? undefined);
      setBankItems(rows);
    } catch {
      toast.error("Failed to load question bank");
      setBankItems([]);
    } finally {
      setBankLoading(false);
    }
  }

  function toggleBankPick(id: string) {
    setBankSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function addFromBank() {
    if (!examId || bankSelected.size === 0) return;
    const ids = Array.from(bankSelected);
    setBankAdding(true);
    try {
      await cloneQuestionsToExam(examId, ids);
      // Refetch the exam's questions so we get fresh options + correct order.
      const fresh = await listQuestions(examId);
      setQuestions(fresh);
      setShowBank(false);
      toast.success(`Added ${ids.length} question${ids.length !== 1 ? "s" : ""} from bank`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clone");
    } finally {
      setBankAdding(false);
    }
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !examId) return;
    e.target.value = "";
    setCsvImporting(true);
    try {
      const imported = await importQuestionsCSV(examId, file);
      setQuestions((prev) => [...prev, ...imported]);
      toast.success(`Imported ${imported.length} question${imported.length !== 1 ? "s" : ""}`);
    } catch {
      toast.error("CSV import failed — check file format");
    } finally {
      setCsvImporting(false);
    }
  }

  function downloadTemplate() {
    const rows = [
      "text,question_type,points,options,correct",
      '"What is the capital of France?",mcq,1,"Paris;London;Berlin;Rome","Paris"',
      '"The sun is a star.",true_false,1,,True',
      '"Explain photosynthesis in your own words.",short_answer,2,,',
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQuestion || !editDraft.text.trim()) return;
    setSaving(true);
    try {
      const updated = await updateQuestion(editingQuestion.id, {
        text: editDraft.text,
        question_type: editDraft.question_type,
        points: editDraft.points,
        options: editDraft.options.map((o, i) => ({ ...o, order_index: i })),
      });
      setQuestions((prev) => prev.map((q) => q.id === updated.id ? updated : q));
      setEditingQuestion(null);
      toast.success("Question updated");
    } catch {
      toast.error("Failed to update question");
    } finally {
      setSaving(false);
    }
  }

  const filteredBank = (() => {
    const items = bankItems ?? [];
    const q = bankSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      it.text.toLowerCase().includes(q)
      || it.exam_title.toLowerCase().includes(q)
      || (it.course_code ?? "").toLowerCase().includes(q),
    );
  })();

  return (
    <Layout>
      {/* Bank picker modal */}
      {showBank && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Add from Question Bank</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick from your existing questions across all exams. Each pick is copied into this exam.
                </p>
              </div>
              <button onClick={() => setShowBank(false)} className="text-slate-400 hover:text-slate-600 text-lg" aria-label="Close">✕</button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <input
                type="text"
                placeholder="Search by question text, exam title, or course code…"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {bankLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!bankLoading && filteredBank.length === 0 && (
                <div className="py-12 text-center text-sm text-slate-500">
                  {bankItems && bankItems.length === 0
                    ? "No reusable questions in your bank yet. Create some questions in another exam first."
                    : "No questions match your search."}
                </div>
              )}
              {!bankLoading && filteredBank.length > 0 && (
                <ul className="space-y-1">
                  {filteredBank.map((q) => {
                    const checked = bankSelected.has(q.id);
                    return (
                      <li key={q.id}>
                        <label className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${checked ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBankPick(q.id)}
                            className="mt-1 accent-indigo-600 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-800 leading-snug">{q.text}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <Badge color="slate">{TYPE_LABELS[q.question_type]}</Badge>
                              <Badge color="indigo">{q.points}pt</Badge>
                              <span className="text-xs text-slate-400">
                                {q.course_code ? `${q.course_code} · ` : ""}{q.exam_title}
                              </span>
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {bankSelected.size === 0 ? "No questions selected" : `${bankSelected.size} selected`}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowBank(false)}>Cancel</Button>
                <Button onClick={addFromBank} loading={bankAdding} disabled={bankSelected.size === 0}>
                  Add {bankSelected.size > 0 ? `${bankSelected.size} ` : ""}to exam
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div className="space-y-2">
              <Button onClick={() => setShowForm(true)} className="w-full">+ Add Question</Button>
              <Button variant="secondary" onClick={openBank} className="w-full">+ From Bank</Button>
              <div className="flex gap-2">
                <label className={`flex-1 cursor-pointer text-center px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors ${csvImporting ? "opacity-50 pointer-events-none" : ""}`}>
                  {csvImporting ? "Importing…" : "Import CSV"}
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSVImport} disabled={csvImporting} />
                </label>
                <button onClick={downloadTemplate} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-500 hover:bg-slate-50 transition-colors" title="Download CSV template">
                  Template
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Questions list */}
        <div className="lg:col-span-2 space-y-4">
          {editingQuestion && (
            <Card>
              <CardHeader title={`Edit Question`} action={
                <button onClick={() => setEditingQuestion(null)} className="text-slate-400 hover:text-slate-600">✕</button>
              } />
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Type</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["mcq", "true_false", "short_answer"] as QType[]).map((t) => (
                      <button key={t} type="button" onClick={() => setEditType(t)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                          ${editDraft.question_type === t
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}>
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <Input label="Points" type="number" min={1} value={editDraft.points}
                  onChange={(e) => setEditDraft((d) => ({ ...d, points: +e.target.value }))} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Question text</label>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={3} value={editDraft.text}
                    onChange={(e) => setEditDraft((d) => ({ ...d, text: e.target.value }))} required
                  />
                </div>
                {editDraft.question_type !== "short_answer" && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Options {editDraft.question_type === "mcq" ? "(check correct)" : "(select correct)"}
                    </p>
                    <div className="space-y-2">
                      {editDraft.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type={editDraft.question_type === "mcq" ? "checkbox" : "radio"} name="edit-correct"
                            checked={opt.is_correct} className="accent-indigo-600 shrink-0"
                            onChange={() => setEditDraft((d) => ({
                              ...d,
                              options: d.options.map((o, j) =>
                                editDraft.question_type === "true_false"
                                  ? { ...o, is_correct: j === i }
                                  : j === i ? { ...o, is_correct: !o.is_correct } : o
                              ),
                            }))}
                          />
                          <input
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder={`Option ${i + 1}`} value={opt.text}
                            disabled={editDraft.question_type === "true_false"}
                            onChange={(e) => setEditDraft((d) => ({ ...d, options: d.options.map((o, j) => j === i ? { ...o, text: e.target.value } : o) }))}
                          />
                          {editDraft.question_type === "mcq" && editDraft.options.length > 2 && (
                            <button type="button" onClick={() => setEditDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}
                              className="text-red-400 hover:text-red-600 text-sm">✕</button>
                          )}
                        </div>
                      ))}
                      {editDraft.question_type === "mcq" && (
                        <button type="button" onClick={() => setEditDraft((d) => ({ ...d, options: [...d.options, { text: "", is_correct: false }] }))}
                          className="text-xs text-indigo-600 hover:underline font-medium">+ Add option</button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" loading={saving} className="flex-1">Save Changes</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingQuestion(null)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}
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
                        <button onClick={() => startEdit(q)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Edit</button>
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
