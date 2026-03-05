import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Button } from "../../components/ui";
import { getAttempt, logIntegrity, submitAttempt } from "../../api/attempts";
import { useAutosave } from "../../hooks/useAutosave";
import { useExamTimer } from "../../hooks/useExamTimer";
import type { AnswerPayload, AttemptWithQuestions, Question } from "../../api/types";

const LS_KEY = (id: string) => `exam_answers_${id}`;

export function ExamPlayerPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<AttemptWithQuestions | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerPayload>>({});
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!attemptId) return;
    getAttempt(attemptId).then((a) => {
      setAttempt(a);
      if (a.is_submitted) { setSubmitted(true); return; }
      const cached = localStorage.getItem(LS_KEY(attemptId));
      if (cached) { try { setAnswers(JSON.parse(cached)); } catch { /* */ } }
    }).catch(() => toast.error("Failed to load exam"));
  }, [attemptId]);

  useEffect(() => {
    if (attemptId) localStorage.setItem(LS_KEY(attemptId), JSON.stringify(answers));
  }, [answers, attemptId]);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden && attemptId && !submitted) {
        setShowWarning(true);
        logIntegrity(attemptId, "tab_switch").catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [attemptId, submitted]);

  useEffect(() => {
    function onOffline() {
      if (attemptId) logIntegrity(attemptId, "disconnect").catch(() => {});
    }
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [attemptId]);

  const getAnswersList = useCallback((): AnswerPayload[] => Object.values(answers), [answers]);
  const { markDirty, flushNow } = useAutosave(attemptId ?? "", getAnswersList);

  async function doSubmit() {
    if (!attemptId || submitLock.current) return;
    submitLock.current = true;
    try {
      await flushNow();
      await submitAttempt(attemptId);
      localStorage.removeItem(LS_KEY(attemptId));
      localStorage.removeItem(`timer_${attemptId}`);
      setSubmitted(true);
      toast.success("Exam submitted!");
    } catch {
      toast.error("Failed to submit. Please try again.");
      submitLock.current = false;
    }
  }

  const { formatted, isWarning } = useExamTimer(
    attemptId ?? "",
    attempt?.started_at ?? new Date().toISOString(),
    attempt?.duration_minutes ?? 60,
    doSubmit,
  );

  function setAnswer(questionId: string, payload: Partial<AnswerPayload>) {
    setAnswers((prev) => ({ ...prev, [questionId]: { question_id: questionId, ...prev[questionId], ...payload } }));
    markDirty();
  }

  // Loading state
  if (!attempt) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Loading exam…</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Submitted state
  if (submitted) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Exam Submitted</h1>
          <p className="text-slate-500 mb-8 max-w-sm">Your answers have been recorded and a submission report has been generated.</p>
          <Button onClick={() => navigate("/student/dashboard")}>Back to Dashboard</Button>
        </div>
      </Layout>
    );
  }

  const q: Question = attempt.questions[current];
  const answeredCount = Object.values(answers).filter((a) => a.selected_option_id || a.answer_text).length;
  const unansweredCount = attempt.questions.length - answeredCount;

  return (
    <Layout>
      {/* Submit confirmation modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Submit Exam?</h2>
            {unansweredCount > 0 ? (
              <p className="text-slate-500 text-sm mb-5">
                You have <span className="font-semibold text-amber-600">{unansweredCount} unanswered question{unansweredCount !== 1 ? "s" : ""}</span> out of {attempt.questions.length}. You cannot change your answers after submitting.
              </p>
            ) : (
              <p className="text-slate-500 text-sm mb-5">
                All {attempt.questions.length} questions answered. You cannot change your answers after submitting.
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowSubmitConfirm(false)} className="flex-1">
                Keep working
              </Button>
              <Button variant="success" onClick={() => { setShowSubmitConfirm(false); doSubmit(); }} className="flex-1">
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Integrity warning modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-red-100">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Tab Switch Detected</h2>
            <p className="text-slate-500 text-sm mb-5">Leaving the exam window has been logged. This incident will be included in your submission report.</p>
            <Button variant="danger" onClick={() => setShowWarning(false)} className="w-full">I understand</Button>
          </div>
        </div>
      )}

      {/* Exam header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{attempt.exam_title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {answeredCount} of {attempt.questions.length} answered
          </p>
        </div>
        <div className={`shrink-0 px-4 py-2 rounded-xl font-mono font-bold text-xl tabular-nums transition-colors
          ${isWarning ? "bg-red-50 text-red-600 ring-1 ring-red-200" : "bg-slate-100 text-slate-700"}`}>
          {formatted}
        </div>
      </div>

      <div className="flex gap-5 items-start">
        {/* Question navigator sidebar */}
        <div className="shrink-0 w-36">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Navigation</p>
          <div className="grid grid-cols-5 gap-1">
            {attempt.questions.map((qItem, i) => {
              const ans = answers[qItem.id];
              const isAnswered = ans?.selected_option_id || ans?.answer_text;
              return (
                <button key={qItem.id} onClick={() => setCurrent(i)}
                  title={`Question ${i + 1}`}
                  className={`w-7 h-7 text-xs rounded-lg font-semibold border transition-colors
                    ${current === i
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : isAnswered
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300"
                    }`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-slate-400">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-600 inline-block" />Current</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" />Answered</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-slate-200 inline-block" />Unanswered</div>
          </div>
        </div>

        {/* Question card */}
        {q && (
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Question header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Question {current + 1} / {attempt.questions.length}
              </span>
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {q.points} pt{q.points !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="px-6 py-5">
              <p className="text-base font-semibold text-slate-900 leading-relaxed mb-5">{q.text}</p>

              {/* Short answer */}
              {q.question_type === "short_answer" && (
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[120px] placeholder:text-slate-400"
                  placeholder="Type your answer here…"
                  value={answers[q.id]?.answer_text ?? ""}
                  onChange={(e) => setAnswer(q.id, { answer_text: e.target.value })}
                />
              )}

              {/* MCQ / True-False */}
              {(q.question_type === "mcq" || q.question_type === "true_false") && (
                <div className="space-y-2.5">
                  {q.options.map((opt) => {
                    const selected = answers[q.id]?.selected_option_id === opt.id;
                    return (
                      <label key={opt.id}
                        className={`flex items-center gap-3.5 border rounded-xl px-4 py-3 cursor-pointer transition-all
                          ${selected
                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                            : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                          }`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                          ${selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"}`}>
                          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <input type="radio" name={`q_${q.id}`} className="sr-only"
                          checked={selected}
                          onChange={() => setAnswer(q.id, { selected_option_id: opt.id, answer_text: undefined })}
                        />
                        <span className="text-sm text-slate-800">{opt.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Navigation footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <Button variant="secondary" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
                ← Previous
              </Button>

              <button onClick={() => setShowSubmitConfirm(true)} className="text-xs text-slate-400 hover:text-red-500 transition-colors underline underline-offset-2">
                Submit early
              </button>

              {current < attempt.questions.length - 1 ? (
                <Button onClick={() => setCurrent((c) => c + 1)}>Next →</Button>
              ) : (
                <Button variant="success" onClick={() => setShowSubmitConfirm(true)}>Submit Exam ✓</Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
