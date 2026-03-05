import { apiFetch } from "./client";
import type { TokenResponse, User } from "./types";

export const login = (email: string, password: string) =>
  apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getMe = () => apiFetch<User>("/auth/me");

export const forgotPassword = (email: string) =>
  apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const resetPassword = (token: string, new_password: string) =>
  apiFetch<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password }),
  });

export const changePassword = (current_password: string, new_password: string) =>
  apiFetch<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
