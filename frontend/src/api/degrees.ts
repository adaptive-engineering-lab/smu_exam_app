import { supabase } from "../lib/supabase";
import type { Degree } from "./types";

export const listDegrees = async (schoolId: string): Promise<Degree[]> => {
  const { data, error } = await supabase
    .from("degrees")
    .select("id, school_id, name")
    .eq("school_id", schoolId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Degree[];
};

export const createDegree = async (school_id: string, name: string): Promise<Degree> => {
  const { data, error } = await supabase
    .from("degrees")
    .insert({ school_id, name })
    .select("id, school_id, name")
    .single();
  if (error) throw new Error(error.message);
  return data as Degree;
};
