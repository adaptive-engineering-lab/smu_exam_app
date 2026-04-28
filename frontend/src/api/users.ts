import { supabase } from "../lib/supabase";
import type { User } from "./types";

export const listUsers = async (role?: string): Promise<User[]> => {
  let q = supabase
    .from("users")
    .select("id, email, name, role")
    .order("email");
  if (role) q = q.eq("role", role);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as User[];
};

// All write operations go through the admin-user-management edge function so
// auth.users + public.users stay in sync under the service role.

export const createUser = async (
  email: string,
  role: string,
  name?: string,
  password?: string,
): Promise<User> => {
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: {
      action: "register",
      email,
      role,
      ...(name ? { name } : {}),
      // edge function requires password — frontend should always pass one.
      password: password ?? "",
    },
  });
  if (error) throw new Error(error.message);
  return data as User;
};

export const deleteUser = async (userId: string): Promise<void> => {
  const { error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "delete", user_id: userId },
  });
  if (error) throw new Error(error.message);
};

export const setUserPassword = async (userId: string, new_password: string) => {
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "set_password", user_id: userId, new_password },
  });
  if (error) throw new Error(error.message);
  return data as { message: string };
};

export const updateUser = async (
  userId: string,
  patch: { name?: string; email?: string; role?: string },
): Promise<User> => {
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { action: "update", user_id: userId, ...patch },
  });
  if (error) throw new Error(error.message);
  return data as User;
};
