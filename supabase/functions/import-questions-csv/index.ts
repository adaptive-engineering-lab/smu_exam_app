// Bulk-imports questions from a CSV blob. The frontend reads the user's
// uploaded file as text and POSTs JSON: { exam_id, csv_text }. Each row
// becomes a question via the create_question_with_options DB function,
// which itself enforces "admin or owning lecturer" authorisation.
//
// Expected CSV columns (header row required):
//   text, question_type, points, options, correct
//
// - question_type: mcq | true_false | short_answer
// - options: semicolon-separated option texts. Blank for true_false (auto
//   "True"/"False") and short_answer (no options).
// - correct: semicolon-separated correct option text(s). For true_false
//   pass "True" or "False"; for short_answer leave blank.

import { parse } from "https://deno.land/std@0.224.0/csv/parse.ts";
import { adminClient, getCallerRole, isStaff, userClient } from "../_shared/auth.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

type Row = Record<string, string>;

function normalizeRow(row: Row, lineNumber: number): {
  text: string;
  question_type: "mcq" | "true_false" | "short_answer";
  points: number;
  options: { text: string; is_correct: boolean; order_index: number }[];
} | null {
  const text = (row.text ?? "").trim();
  if (!text) return null;

  const qType = (row.question_type ?? "").trim().toLowerCase();
  if (!["mcq", "true_false", "short_answer"].includes(qType)) {
    throw new Error(`row ${lineNumber}: invalid question_type '${qType}'`);
  }

  const points = Number.parseInt(row.points ?? "1", 10);
  const safePoints = Number.isFinite(points) && points >= 0 ? points : 1;

  const rawOptions = (row.options ?? "").trim();
  const rawCorrect = (row.correct ?? "").trim();

  let optionTexts: string[];
  let correctSet: Set<string>;

  if (qType === "true_false") {
    optionTexts = ["True", "False"];
    correctSet = rawCorrect ? new Set([rawCorrect]) : new Set();
  } else if (qType === "short_answer") {
    optionTexts = [];
    correctSet = new Set();
  } else {
    optionTexts = rawOptions
      .split(";")
      .map((o) => o.trim())
      .filter(Boolean);
    correctSet = new Set(
      rawCorrect.split(";").map((c) => c.trim()).filter(Boolean),
    );
    if (optionTexts.length < 2) {
      throw new Error(`row ${lineNumber}: MCQ questions need at least 2 options`);
    }
  }

  return {
    text,
    question_type: qType as "mcq" | "true_false" | "short_answer",
    points: safePoints,
    options: optionTexts.map((t, i) => ({
      text: t,
      is_correct: correctSet.has(t),
      order_index: i,
    })),
  };
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method not allowed" });

  const caller = await getCallerRole(req);
  if (!caller) return jsonResponse(req, 401, { error: "not authenticated" });
  if (!isStaff(caller.role)) return jsonResponse(req, 403, { error: "forbidden" });

  let body: { exam_id?: string; csv_text?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: "invalid json body" });
  }
  const examId = body.exam_id;
  const csvText = body.csv_text;
  if (!examId || !csvText) {
    return jsonResponse(req, 400, { error: "exam_id and csv_text are required" });
  }

  // Look up the existing question count so order_index continues from the end.
  // RLS gates this read — admins/owning lecturers only.
  const sb = userClient(req);
  const { count: existingCount, error: countErr } = await sb
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (countErr) return jsonResponse(req, 500, { error: countErr.message });

  let rows: Row[];
  try {
    rows = parse(csvText, {
      skipFirstRow: true,
      columns: ["text", "question_type", "points", "options", "correct"],
    }) as Row[];
  } catch (e) {
    return jsonResponse(req, 400, { error: `csv parse error: ${(e as Error).message}` });
  }

  const admin = adminClient();
  const created: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    let normalized;
    try {
      normalized = normalizeRow(rows[i], i + 2); // +2: header row + 1-indexed
    } catch (e) {
      return jsonResponse(req, 400, { error: (e as Error).message });
    }
    if (!normalized) continue;

    const orderIndex = (existingCount ?? 0) + created.length;
    // The DB function authorises against the caller via auth.uid(), so we
    // call it through the user-scoped client, not admin. The user-scoped
    // RLS check on questions runs inside the function (security definer
    // bypass for the inserts themselves).
    const { data, error } = await sb.rpc("create_question_with_options", {
      p_exam_id: examId,
      p_text: normalized.text,
      p_question_type: normalized.question_type,
      p_points: normalized.points,
      p_order_index: orderIndex,
      p_options: normalized.options,
    });
    if (error) {
      // partial state — caller should re-import after fixing the row;
      // we log but don't roll back, matching the FastAPI behaviour
      console.error(`row ${i + 2} failed:`, error.message);
      return jsonResponse(req, 400, {
        error: `row ${i + 2}: ${error.message}`,
        created_so_far: created,
      });
    }
    if (typeof data === "string") created.push(data);
  }

  return jsonResponse(req, 201, { created_question_ids: created, count: created.length });
});
