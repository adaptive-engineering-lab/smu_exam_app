// Single edge function for all admin-only user-management operations:
// register, update, set-password, delete. Replaces /auth/register and the
// /users mutating endpoints from the FastAPI backend.
//
// Uses an action discriminator in the body: { action, ...payload }. The
// caller's role is verified against public.users (not JWT claims) before
// any privileged operation; afterwards the service-role admin client is
// used to mutate auth.users and public.users in tandem.
//
// Authorisation rules ported from FastAPI:
// - Only admin/super_admin can call this function at all.
// - super_admin role cannot be assigned (PROTECTED_ROLES).
// - Editing or deleting a super_admin user requires the caller to be
//   super_admin.
// - Cannot change your own role or delete your own account.

import { adminClient, getCallerRole, isAdmin } from "../_shared/auth.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

const ASSIGNABLE_ROLES = new Set(["student", "lecturer", "admin"]);
const PROTECTED_ROLES = new Set(["super_admin"]);

type RegisterBody = {
  action: "register";
  email: string;
  password: string;
  role: "student" | "lecturer" | "admin";
  name?: string;
};
type UpdateBody = {
  action: "update";
  user_id: string;
  email?: string;
  name?: string;
  role?: "student" | "lecturer" | "admin";
};
type SetPasswordBody = {
  action: "set_password";
  user_id: string;
  new_password: string;
};
type DeleteBody = {
  action: "delete";
  user_id: string;
};
type Body = RegisterBody | UpdateBody | SetPasswordBody | DeleteBody;

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method not allowed" });

  const caller = await getCallerRole(req);
  if (!caller) return jsonResponse(req, 401, { error: "not authenticated" });
  if (!isAdmin(caller.role)) return jsonResponse(req, 403, { error: "forbidden" });

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return jsonResponse(req, 400, { error: "invalid json body" });
  }

  const admin = adminClient();

  switch (body.action) {
    case "register": {
      const { email, password, role, name } = body;
      if (!email || !password || !role) {
        return jsonResponse(req, 400, { error: "email, password, role required" });
      }
      if (!ASSIGNABLE_ROLES.has(role)) {
        return jsonResponse(req, 400, { error: "invalid role" });
      }

      const { data: existing } = await admin
        .from("users").select("id").eq("email", email).maybeSingle();
      if (existing) return jsonResponse(req, 409, { error: "email already registered" });

      const { data: created, error: authErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        app_metadata: { role },
        user_metadata: name ? { name } : undefined,
      });
      if (authErr || !created.user) {
        return jsonResponse(req, 400, { error: authErr?.message ?? "auth create failed" });
      }

      const { error: insErr } = await admin.from("users").insert({
        id: created.user.id, email, name: name ?? null, role,
      });
      if (insErr) {
        // best-effort rollback of the auth user so we don't leave drift
        await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
        return jsonResponse(req, 500, { error: insErr.message });
      }
      return jsonResponse(req, 201, { id: created.user.id, email, name, role });
    }

    case "update": {
      const { user_id, email, name, role } = body;
      if (!user_id) return jsonResponse(req, 400, { error: "user_id required" });

      const { data: target, error: lookupErr } = await admin
        .from("users").select("id, email, role").eq("id", user_id).maybeSingle();
      if (lookupErr) return jsonResponse(req, 500, { error: lookupErr.message });
      if (!target) return jsonResponse(req, 404, { error: "user not found" });

      if (PROTECTED_ROLES.has(target.role) && caller.role !== "super_admin") {
        return jsonResponse(req, 403, { error: "only super_admin can edit a super_admin account" });
      }
      if (role && PROTECTED_ROLES.has(role)) {
        return jsonResponse(req, 403, { error: "cannot assign super_admin role" });
      }
      if (role && user_id === caller.userId) {
        return jsonResponse(req, 403, { error: "cannot change your own role" });
      }
      if (role && !ASSIGNABLE_ROLES.has(role)) {
        return jsonResponse(req, 400, { error: "invalid role" });
      }
      if (email && email !== target.email) {
        const { data: clash } = await admin
          .from("users").select("id").eq("email", email).maybeSingle();
        if (clash) return jsonResponse(req, 409, { error: "email already in use" });
      }

      const dbPatch: Record<string, unknown> = {};
      if (email !== undefined) dbPatch.email = email;
      if (name !== undefined) dbPatch.name = name;
      if (role !== undefined) dbPatch.role = role;
      if (Object.keys(dbPatch).length > 0) {
        const { error: updErr } = await admin
          .from("users").update(dbPatch).eq("id", user_id);
        if (updErr) return jsonResponse(req, 500, { error: updErr.message });
      }

      const authPatch: Record<string, unknown> = {};
      if (email !== undefined) authPatch.email = email;
      if (role !== undefined) authPatch.app_metadata = { role };
      if (name !== undefined) authPatch.user_metadata = { name };
      if (Object.keys(authPatch).length > 0) {
        // Best-effort: DB row is source of truth; auth metadata sync is
        // logged but not blocking.
        const { error: aErr } = await admin.auth.admin.updateUserById(user_id, authPatch);
        if (aErr) console.warn(`auth sync for ${user_id} failed:`, aErr.message);
      }

      return jsonResponse(req, 200, { id: user_id, email, name, role });
    }

    case "set_password": {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return jsonResponse(req, 400, { error: "user_id and new_password required" });
      }
      const { data: target } = await admin
        .from("users").select("role").eq("id", user_id).maybeSingle();
      if (!target) return jsonResponse(req, 404, { error: "user not found" });
      if (PROTECTED_ROLES.has(target.role) && caller.role !== "super_admin") {
        return jsonResponse(req, 403, { error: "only super_admin can reset a super_admin password" });
      }
      const { error: aErr } = await admin.auth.admin.updateUserById(user_id, {
        password: new_password,
      });
      if (aErr) return jsonResponse(req, 400, { error: aErr.message });
      return jsonResponse(req, 200, { message: "password updated" });
    }

    case "delete": {
      const { user_id } = body;
      if (!user_id) return jsonResponse(req, 400, { error: "user_id required" });
      if (user_id === caller.userId) {
        return jsonResponse(req, 403, { error: "cannot delete your own account" });
      }
      const { data: target } = await admin
        .from("users").select("role").eq("id", user_id).maybeSingle();
      if (!target) return jsonResponse(req, 404, { error: "user not found" });
      if (PROTECTED_ROLES.has(target.role) && caller.role !== "super_admin") {
        return jsonResponse(req, 403, { error: "only super_admin can delete a super_admin account" });
      }

      // public.users has on-delete-cascade from auth.users(id), so deleting
      // the auth row removes the public row automatically. Belt-and-braces:
      // delete the public row too in case the FK ever gets relaxed.
      const { error: pubErr } = await admin
        .from("users").delete().eq("id", user_id);
      if (pubErr) console.warn(`public.users delete for ${user_id} failed:`, pubErr.message);
      const { error: aErr } = await admin.auth.admin.deleteUser(user_id);
      if (aErr) return jsonResponse(req, 500, { error: aErr.message });

      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*" } });
    }

    default:
      return jsonResponse(req, 400, { error: "unknown action" });
  }
});
