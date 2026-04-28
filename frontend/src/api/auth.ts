import { supabase } from "../lib/supabase";
import type { User } from "./types";

// Login is now a direct Supabase Auth call from page code (LoginPage uses
// supabase.auth.signInWithPassword). This wrapper survives only because
// the existing page imports it; the returned shape mimics the old
// TokenResponse for back-compat.
export const login = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return {
    access_token: data.session?.access_token ?? "",
    token_type: "bearer" as const,
  };
};

export const getMe = async (): Promise<User> => {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) throw new Error("not authenticated");
  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, role")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data as User;
};

export const forgotPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
  return { message: "Reset email sent" };
};

export const resetPassword = async (_token: string, new_password: string) => {
  // Supabase delivers the recovery session via the URL fragment; by the time
  // ResetPasswordPage calls this, supabase.auth has already restored a session
  // from the PASSWORD_RECOVERY event. updateUser uses that session.
  const { error } = await supabase.auth.updateUser({ password: new_password });
  if (error) throw new Error(error.message);
  return { message: "Password reset" };
};

export const changePassword = async (_current: string, new_password: string) => {
  // Supabase does not require the current password for an authenticated
  // updateUser call; the JWT proves possession. We keep the parameter for
  // signature compatibility with the existing SettingsPage form.
  const { error } = await supabase.auth.updateUser({ password: new_password });
  if (error) throw new Error(error.message);
  return { message: "Password changed" };
};
