import { apiFetch } from "./client";
import type { TokenResponse, User } from "./types";

export const login = (email: string, password: string) =>
  apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getMe = () => apiFetch<User>("/auth/me");

export const register = (email: string, role: string) =>
  apiFetch<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });

export const oauthGoogle = (id_token: string) =>
  apiFetch<{ access_token: string }>("/auth/oauth/google", {
    method: "POST",
    body: JSON.stringify({ id_token }),
  });

