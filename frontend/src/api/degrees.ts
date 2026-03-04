import { apiFetch } from "./client";
import type { Degree } from "./types";

export const listDegrees = (schoolId: string) =>
  apiFetch<Degree[]>(`/degrees/by-school/${schoolId}`);

export const createDegree = (school_id: string, name: string) =>
  apiFetch<Degree>("/degrees", { method: "POST", body: JSON.stringify({ school_id, name }) });
