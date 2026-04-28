import { supabase } from "../lib/supabase";
import type { School } from "./types";

export const listSchools = async (): Promise<School[]> => {
  const { data, error } = await supabase
    .from("schools")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as School[];
};

export const createSchool = async (name: string): Promise<School> => {
  const { data, error } = await supabase
    .from("schools")
    .insert({ name })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data as School;
};
