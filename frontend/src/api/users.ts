import { apiFetch } from "./client";
import type { User } from "./types";

export const listUsers = (role?: string) =>
  apiFetch<User[]>(role ? `/users?role=${role}` : "/users");

export const createUser = (email: string, role: string) =>
  apiFetch<User>("/auth/register", { method: "POST", body: JSON.stringify({ email, role }) });

export const deleteUser = (userId: string) =>
  apiFetch<void>(`/users/${userId}`, { method: "DELETE" });
