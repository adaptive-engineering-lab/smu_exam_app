import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Layout } from "../components/Layout";
import { Button, Card, CardHeader, Input, PageHeader } from "../components/ui";
import { getMe } from "../api/auth";
import { supabase } from "../lib/supabase";
import type { User } from "../api/types";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  lecturer: "Lecturer",
  student: "Student",
};

export function SettingsPage() {
  const [profile, setProfile] = useState<User | null>(null);
  const [form, setForm] = useState({ next: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMe().then(setProfile).catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.next !== form.confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: form.next });
      if (error) throw error;
      toast.success("Password changed successfully.");
      setForm({ next: "", confirm: "" });
    } catch {
      toast.error("Failed to change password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <PageHeader title="Settings" subtitle="Manage your account" />
      <div className="max-w-md space-y-5">
        {/* Profile card */}
        <Card>
          <CardHeader title="My Profile" />
          {profile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-indigo-700 font-bold text-base">
                    {(profile.name ?? profile.email)[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{profile.name ?? "—"}</p>
                  <p className="text-xs text-slate-500">{profile.email}</p>
                </div>
                <span className="ml-auto text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          )}
        </Card>

        <Card>
          <CardHeader title="Change Password" />
          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              label="New password"
              type="password"
              placeholder="••••••••"
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              Change Password
            </Button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
