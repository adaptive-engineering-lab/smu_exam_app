import { apiFetch } from "./client";
import type { School } from "./types";

export const listSchools = () => apiFetch<School[]>("/schools");

export const createSchool = (name: string) =>
  apiFetch<School>("/schools", { method: "POST", body: JSON.stringify({ name }) });
