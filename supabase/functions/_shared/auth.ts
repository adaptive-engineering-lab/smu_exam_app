// Helpers for edge functions: build a user-scoped supabase-js client (RLS
// applies via the caller's JWT) and a service-role client (for operations
// that intentionally bypass RLS, like signed URL minting and admin user
// management). Also provides a role lookup against public.users.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AppRole = "super_admin" | "admin" | "lecturer" | "student";

export async function getCallerRole(
  req: Request,
): Promise<{ userId: string; role: AppRole } | null> {
  const sb = userClient(req);
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return null;

  const { data, error } = await sb
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return { userId, role: data.role as AppRole };
}

export function isStaff(role: AppRole): boolean {
  return role === "admin" || role === "super_admin" || role === "lecturer";
}

export function isAdmin(role: AppRole): boolean {
  return role === "admin" || role === "super_admin";
}
