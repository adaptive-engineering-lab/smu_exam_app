import { apiFetch } from "./client";
import type { User } from "./types";

export const listUsers = (role?: string) =>
  apiFetch<User[]>(role ? `/users?role=${role}` : "/users");

export const createUser = (email: string, role: string, name?: string, password?: string) =>
  apiFetch<User>("/auth/register", { method: "POST", body: JSON.stringify({ email, role, ...(name ? { name } : {}), ...(password ? { password } : {}) }) });

export const deleteUser = (userId: string) =>
  apiFetch<void>(`/users/${userId}`, { method: "DELETE" });

export const setUserPassword = (userId: string, new_password: string) =>
  apiFetch<{ message: string }>(`/users/${userId}/password`, { method: "PATCH", body: JSON.stringify({ new_password }) });

export const updateUser = (userId: string, data: { name?: string; email?: string; role?: string }) =>
  apiFetch<User>(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(data) });
