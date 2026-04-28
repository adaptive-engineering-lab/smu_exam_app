// Returns a short-lived signed URL for an exam attempt's submission PDF.
// Authorisation: lecturer/admin only — matches the legacy require_lecturer
// gate on GET /attempts/{id}/pdf. The submissions bucket has no public
// access; this function is the sole download path.
//
// pdf_path stores the relative object key in the submissions bucket
// (e.g. "<attempt_id>.pdf"). For backward compatibility with rows that
// hold a full https URL (legacy FastAPI behaviour), we just return the URL
// unchanged — those are unsigned and rely on the bucket having been public
// at the time of upload.

import { adminClient, getCallerRole, isStaff, userClient } from "../_shared/auth.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method not allowed" });
  }

  const caller = await getCallerRole(req);
  if (!caller) return jsonResponse(req, 401, { error: "not authenticated" });
  if (!isStaff(caller.role)) {
    return jsonResponse(req, 403, { error: "forbidden" });
  }

  let body: { attempt_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: "invalid json body" });
  }
  const attemptId = body.attempt_id;
  if (!attemptId) return jsonResponse(req, 400, { error: "attempt_id is required" });

  // RLS gates this read: the lecturer must own the parent exam, or be admin.
  const sb = userClient(req);
  const { data: attempt, error } = await sb
    .from("exam_attempts")
    .select("id, pdf_path, is_submitted")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) return jsonResponse(req, 500, { error: error.message });
  if (!attempt) return jsonResponse(req, 404, { error: "attempt not found" });
  if (!attempt.pdf_path) return jsonResponse(req, 404, { error: "pdf not yet generated" });

  if (attempt.pdf_path.startsWith("http")) {
    // Legacy row written by FastAPI when bucket was public.
    return jsonResponse(req, 200, { url: attempt.pdf_path });
  }

  const admin = adminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("submissions")
    .createSignedUrl(attempt.pdf_path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed) {
    return jsonResponse(req, 500, { error: signErr?.message ?? "could not sign url" });
  }

  return jsonResponse(req, 200, { url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
});
