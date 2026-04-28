import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Layout } from "../../components/Layout";
import { Button, Card, EmptyState, PageHeader } from "../../components/ui";
import { getAttemptPdfUrl, listAttemptEvents, listSubmissions } from "../../api/attempts";
import type { AttemptEvent, SubmissionSummary } from "../../api/attempts";

function buildFilename(s: SubmissionSummary): string {
  const name = (s.student_name || s.student_email.split("@")[0])
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "");
  const date = s.submitted_at
    ? new Date(s.submitted_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `submission_${name}_${date}.pdf`;
}

// Fetches a 1-hour signed URL from get-attempt-pdf, then streams the PDF
// into a blob so we can drive a download with the desired filename. A
// straight <a href={signedUrl} download> would inherit Supabase's
// Content-Disposition and produce a UUID filename instead.
async function downloadPdf(s: SubmissionSummary) {
  const url = await getAttemptPdfUrl(s.id);
  const res = await fetch(url);
  if (!res.ok) throw new Error("PDF not available");
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = buildFilename(s);
  a.click();
  URL.revokeObjectURL(blobUrl);
}

function SubmissionRow({
  submission, onDownload, downloading,
}: {
  submission: SubmissionSummary;
  onDownload: (s: SubmissionSummary) => void;
  downloading: boolean;
}) {
  const s = submission;
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<AttemptEvent[] | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const eventCount = s.tab_switches + s.disconnect_events;

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && events === null) {
      try {
        const rows = await listAttemptEvents(s.id);
        setEvents(rows);
      } catch {
        setEventsError(true);
      }
    }
  }

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-5 py-3.5">
          <button
            type="button"
            onClick={toggle}
            disabled={eventCount === 0}
            className={`mr-2 inline-flex w-4 h-4 items-center justify-center text-slate-400 transition-transform ${eventCount === 0 ? "invisible" : "hover:text-slate-700"} ${expanded ? "rotate-90" : ""}`}
            aria-label={expanded ? "Hide events" : "Show events"}
          >▶</button>
          {s.student_name && (
            <span className="font-medium text-slate-900">{s.student_name}</span>
          )}
          <p className="text-slate-500">{s.student_email}</p>
        </td>
        <td className="px-5 py-3.5 text-slate-600">
          {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}
        </td>
        <td className="px-5 py-3.5 text-center">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${s.tab_switches > 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
            {s.tab_switches}
          </span>
        </td>
        <td className="px-5 py-3.5 text-center">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${s.disconnect_events > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
            {s.disconnect_events}
          </span>
        </td>
        <td className="px-5 py-3.5 text-right">
          <Button size="sm" variant="secondary" loading={downloading} onClick={() => onDownload(s)}>
            Download
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/40">
          <td colSpan={5} className="px-5 py-3 border-t border-slate-100">
            {events === null && !eventsError && (
              <p className="text-xs text-slate-400">Loading events…</p>
            )}
            {eventsError && (
              <p className="text-xs text-red-600">Failed to load events.</p>
            )}
            {events && events.length === 0 && (
              <p className="text-xs text-slate-400">No events recorded.</p>
            )}
            {events && events.length > 0 && (
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 text-xs">
                    <span className={`inline-block px-2 py-0.5 rounded-full font-semibold w-24 text-center ${e.event_type === "tab_switch" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                      {e.event_type === "tab_switch" ? "Tab switch" : "Disconnect"}
                    </span>
                    <span className="text-slate-600 tabular-nums">
                      {new Date(e.occurred_at).toLocaleTimeString()}
                    </span>
                    <span className="text-slate-400">
                      {new Date(e.occurred_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function SubmissionsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!examId) return;
    listSubmissions(examId)
      .then(setSubmissions)
      .catch(() => toast.error("Failed to load submissions"))
      .finally(() => setLoading(false));
  }, [examId]);

  async function handleDownload(s: SubmissionSummary) {
    setDownloading(s.id);
    try {
      await downloadPdf(s);
    } catch {
      toast.error("PDF not available for this submission");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/lecturer/exams")}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Back
        </button>
        <PageHeader title="Submissions" subtitle={`${submissions.length} submitted`} />
      </div>

      <Card padding={false}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <EmptyState icon="📋" title="No submissions yet" description="No students have submitted this exam." />
        ) : (() => {
          const visible = submissions.filter((s) => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (s.student_name ?? "").toLowerCase().includes(q) || s.student_email.toLowerCase().includes(q);
          });
          return (
          <>
          <div className="px-5 py-3 border-b border-slate-100">
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-72 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {visible.length === 0 ? (
            <EmptyState icon="🔍" title="No results" description="No submissions match your search." />
          ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Tab Switches</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Disconnects</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((s) => (
                <SubmissionRow
                  key={s.id}
                  submission={s}
                  onDownload={handleDownload}
                  downloading={downloading === s.id}
                />
              ))}
            </tbody>
          </table>
          </div>
          )}
          </>
          );
        })()}
      </Card>
    </Layout>
  );
}
